# Customer-managed IAM policy for Turo-EZPass automation
resource "aws_iam_policy" "turo_ezpass_automation_policy" {
  name        = "turo-ezpass-automation-policy"
  path        = "/"
  description = "Comprehensive policy for Turo-EZPass automation tasks"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ECR permissions for container registry operations
      {
        Sid    = "ECRRepositoryAccess"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage"
        ]
        Resource = "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/turo-ezpass*"
      },
      {
        Sid    = "ECRAuthToken"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:DescribeRepositories"
        ]
        Resource = "*"
      },

      # S3 permissions for proof storage
      {
        Sid    = "S3ProofsBucketAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "arn:aws:s3:::turo-ezpass-proofs-${var.aws_account_id}/*"
      },
      {
        Sid    = "S3ProofsBucketList"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = "arn:aws:s3:::turo-ezpass-proofs-${var.aws_account_id}"
      },

      # ECS permissions for task management
      {
        Sid    = "ECSClusterManagement"
        Effect = "Allow"
        Action = [
          "ecs:CreateCluster",
          "ecs:DescribeClusters"
        ]
        Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:cluster/turo-ezpass*"
      },
      {
        Sid    = "ECSTaskManagement"
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition",
          "ecs:DescribeTaskDefinition"
        ]
        Resource = "*"
      },
      {
        Sid    = "ECSTaskOperations"
        Effect = "Allow"
        Action = [
          "ecs:RunTask",
          "ecs:StopTask",
          "ecs:DescribeTasks"
        ]
        Resource = [
          "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task/turo-ezpass*/*",
          "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/turo-ezpass*:*"
        ]
      },

      # CloudWatch Logs permissions
      {
        Sid    = "CloudWatchLogsAccess"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/turo-ezpass*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/turo-ezpass*:*"
        ]
      },

      # EventBridge permissions
      {
        Sid    = "EventBridgeAccess"
        Effect = "Allow"
        Action = [
          "events:PutRule",
          "events:PutTargets",
          "events:RemoveTargets",
          "events:DescribeRule",
          "events:DeleteRule",
          "events:DisableRule",
          "events:EnableRule"
        ]
        Resource = "arn:aws:events:${var.aws_region}:${var.aws_account_id}:rule/turo-ezpass*"
      },

      # SNS permissions for notifications
      {
        Sid    = "SNSPublishAccess"
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = "arn:aws:sns:${var.aws_region}:${var.aws_account_id}:turo-ezpass*"
      },

      # IAM PassRole permission for ECS task execution
      {
        Sid    = "IAMPassRoleForECS"
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          "arn:aws:iam::${var.aws_account_id}:role/turo-ezpass-ecs-task-execution-role",
          "arn:aws:iam::${var.aws_account_id}:role/turo-ezpass-ecs-task-role"
        ]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "turo-ezpass-automation-policy"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Tightened IAM policy for ECS tasks to access only specific secrets
resource "aws_iam_policy" "ecs_task_secrets" {
  name        = "turo-ezpass-ecs-task-secrets"
  description = "Allow ECS tasks to read only the two scraper secrets"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = [
          "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:turo-ezpass/ezpass/credentials*",
          "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:turo-ezpass/turo/credentials*"
        ]
      }
    ]
  })

  tags = {
    Name        = "turo-ezpass-ecs-task-secrets"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# S3 bucket for proof images and reports
resource "aws_s3_bucket" "proofs" {
  bucket = "turo-ezpass-proofs-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "turo-ezpass-proofs"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "proof-storage"
  }
}

# S3 bucket lifecycle configuration
resource "aws_s3_bucket_lifecycle_configuration" "proofs" {
  bucket = aws_s3_bucket.proofs.id

  rule {
    id     = "tier-and-expire"
    status = "Enabled"

    filter {
      prefix = ""
    }

    transition {
      days          = 30
      storage_class = "INTELLIGENT_TIERING"
    }

    expiration {
      days = 365
    }
  }
}

# S3 bucket versioning
resource "aws_s3_bucket_versioning" "proofs" {
  bucket = aws_s3_bucket.proofs.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 bucket server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "proofs" {
  bucket = aws_s3_bucket.proofs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 bucket public access block
resource "aws_s3_bucket_public_access_block" "proofs" {
  bucket = aws_s3_bucket.proofs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}