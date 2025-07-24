# Terraform module for turo-ezpass secrets management
# Creates AWS Secrets Manager secrets and ECS task permissions

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Data source for current AWS account and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# KMS key for Secrets Manager encryption
resource "aws_kms_key" "secrets_key" {
  description             = "KMS key for ${var.project_name} Secrets Manager"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-secrets-key"
  })
}

resource "aws_kms_alias" "secrets_key_alias" {
  name          = "alias/${var.project_name}-secrets"
  target_key_id = aws_kms_key.secrets_key.key_id
}

# E-ZPass credentials secret - create only if it doesn't exist
resource "aws_secretsmanager_secret" "ezpass_credentials" {
  name                    = var.ezpass_secret_name
  description             = "E-ZPass NY portal login credentials for automated scraping"
  recovery_window_in_days = var.recovery_window_days
  kms_key_id              = aws_kms_key.secrets_key.arn

  tags = merge(var.common_tags, {
    Name       = "E-ZPass Credentials"
    Service    = "turo-ezpass-scrapers"
    SecretType = "credentials"
  })

  lifecycle {
    ignore_changes = [description, recovery_window_in_days]
  }
}

# E-ZPass secret version (placeholder - will be updated via CLI or console)
resource "aws_secretsmanager_secret_version" "ezpass_credentials" {
  secret_id = aws_secretsmanager_secret.ezpass_credentials.id
  secret_string = jsonencode({
    username = "PLACEHOLDER_USERNAME"
    password = "PLACEHOLDER_PASSWORD"
    state    = "ny"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Turo credentials secret - create only if it doesn't exist
resource "aws_secretsmanager_secret" "turo_credentials" {
  name                    = var.turo_secret_name
  description             = "Turo host dashboard login credentials for automated scraping"
  recovery_window_in_days = var.recovery_window_days
  kms_key_id              = aws_kms_key.secrets_key.arn

  tags = merge(var.common_tags, {
    Name       = "Turo Credentials"
    Service    = "turo-ezpass-scrapers"
    SecretType = "credentials"
  })

  lifecycle {
    ignore_changes = [description, recovery_window_in_days]
  }
}

# Turo secret version (placeholder - will be updated via CLI or console)
resource "aws_secretsmanager_secret_version" "turo_credentials" {
  secret_id = aws_secretsmanager_secret.turo_credentials.id
  secret_string = jsonencode({
    email    = "PLACEHOLDER_EMAIL"
    password = "PLACEHOLDER_PASSWORD"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ECS Task Execution Role (for pulling container images and logging)
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.project_name}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-ecs-task-execution-role"
    Role = "ECS Task Execution"
  })
}

# Attach AWS managed ECS task execution policy
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Role (for application permissions during runtime)
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.project_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-ecs-task-role"
    Role = "ECS Task Runtime"
  })
}

# IAM policy for secrets access
resource "aws_iam_policy" "secrets_access_policy" {
  name        = "${var.project_name}-secrets-access"
  description = "Policy granting access to turo-ezpass secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.ezpass_credentials.arn,
          aws_secretsmanager_secret.turo_credentials.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:ListSecrets"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "secretsmanager:ResourceTag/Service" = "turo-ezpass-scrapers"
          }
        }
      }
    ]
  })

  tags = var.common_tags
}

# Attach secrets policy to ECS task role
resource "aws_iam_role_policy_attachment" "ecs_task_secrets_policy" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.secrets_access_policy.arn
}

# Optional: CloudWatch Logs policy for custom logging
resource "aws_iam_policy" "cloudwatch_logs_policy" {
  count       = var.enable_cloudwatch_logs ? 1 : 0
  name        = "${var.project_name}-cloudwatch-logs"
  description = "Policy for CloudWatch Logs access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${var.project_name}*"
      }
    ]
  })

  tags = var.common_tags
}

# Attach CloudWatch Logs policy to ECS task role
resource "aws_iam_role_policy_attachment" "ecs_task_cloudwatch_policy" {
  count      = var.enable_cloudwatch_logs ? 1 : 0
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.cloudwatch_logs_policy[0].arn
}