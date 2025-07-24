# GitHub OIDC Provider and IAM Role for ECR Push
# This file sets up the OIDC integration between GitHub Actions and AWS

data "aws_caller_identity" "current" {}

# OIDC Provider for GitHub Actions
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com"
  ]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1"
  ]

  tags = {
    Name        = "github-actions-oidc-provider"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "github-actions-integration"
  }
}

# IAM Role for GitHub Actions to push to ECR
resource "aws_iam_role" "github_actions" {
  name = "turo-ezpass-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:Eli45-23/turo-ezpass:*"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "github-actions-ecr-push-role"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "github-actions-ecr-access"
  }
}

# IAM Policy for ECR operations
resource "aws_iam_policy" "github_actions_ecr_policy" {
  name        = "github-actions-ecr-policy"
  description = "Policy for GitHub Actions to push images to ECR"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRGetAuthorizationToken"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Sid    = "ECRRepositoryOperations"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:DescribeRepositories",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:StartImageScan",
          "ecr:DescribeImageScanFindings"
        ]
        Resource = [
          "arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/turo-ezpass"
        ]
      },
      {
        Sid    = "ECRLifecyclePolicy"
        Effect = "Allow"
        Action = [
          "ecr:GetLifecyclePolicy",
          "ecr:PutLifecyclePolicy"
        ]
        Resource = [
          "arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/turo-ezpass"
        ]
      }
    ]
  })

  tags = {
    Name        = "github-actions-ecr-policy"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Attach the policy to the role
resource "aws_iam_role_policy_attachment" "github_actions_ecr_policy_attachment" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions_ecr_policy.arn
}

# ECR Repository (if it doesn't exist)
resource "aws_ecr_repository" "turo_ezpass" {
  name                 = "turo-ezpass"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name        = "turo-ezpass"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "container-registry"
  }
}

# ECR Lifecycle Policy to manage image retention
resource "aws_ecr_lifecycle_policy" "turo_ezpass_lifecycle" {
  repository = aws_ecr_repository.turo_ezpass.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 latest images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["latest"]
          countType     = "imageCountMoreThan"
          countNumber   = 1
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep last 20 SHA-tagged images"
        selection = {
          tagStatus   = "tagged"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 3
        description  = "Delete untagged images older than 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}


# Outputs
output "github_actions_role_arn" {
  description = "ARN of the IAM role for GitHub Actions"
  value       = aws_iam_role.github_actions.arn
}

output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = aws_ecr_repository.turo_ezpass.repository_url
}

output "oidc_provider_arn" {
  description = "ARN of the GitHub OIDC provider"
  value       = aws_iam_openid_connect_provider.github.arn
}