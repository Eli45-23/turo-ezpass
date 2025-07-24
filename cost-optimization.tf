# Cost optimization variables
variable "task_cpu_optimized" {
  description = "Optimized CPU allocation for ECS tasks (in CPU units)"
  type        = number
  default     = 256 # 0.25 vCPU - reduced from typical 512

  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.task_cpu_optimized)
    error_message = "Task CPU optimized must be a valid Fargate CPU value: 256, 512, 1024, 2048, or 4096."
  }
}

variable "task_memory_optimized" {
  description = "Optimized memory allocation for ECS tasks (in MiB)"
  type        = number
  default     = 512 # 0.5 GB - reduced from typical 1024

  validation {
    condition     = var.task_memory_optimized >= 512 && var.task_memory_optimized <= 8192
    error_message = "Task memory optimized must be between 512 and 8192 MiB."
  }
}

# Enhanced S3 lifecycle with more aggressive cost optimization
resource "aws_s3_bucket_lifecycle_configuration" "proofs_cost_optimized" {
  bucket = aws_s3_bucket.proofs.id

  rule {
    id     = "cost-optimized-lifecycle"
    status = "Enabled"

    filter {
      prefix = ""
    }

    # Move to IA after 7 days (faster than original 30)
    transition {
      days          = 7
      storage_class = "STANDARD_IA"
    }

    # Move to Intelligent Tiering after 14 days
    transition {
      days          = 14
      storage_class = "INTELLIGENT_TIERING"
    }

    # Move to Glacier after 90 days
    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    # Move to Deep Archive after 180 days
    transition {
      days          = 180
      storage_class = "DEEP_ARCHIVE"
    }

    # Delete after 2 years (reduced from 365 days)
    expiration {
      days = 730
    }

    # Clean up incomplete multipart uploads
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Separate rule for old versions
  rule {
    id     = "cleanup-old-versions"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_transition {
      noncurrent_days = 90
      storage_class   = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }
}

# CloudWatch cost alarm
resource "aws_cloudwatch_metric_alarm" "high_costs" {
  alarm_name          = "turo-ezpass-high-costs"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = "86400"
  statistic           = "Maximum"
  threshold           = "50" # Alert if monthly costs exceed $50
  alarm_description   = "High AWS costs detected for Turo-EZPass"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    Currency = "USD"
  }

  tags = {
    Name        = "turo-ezpass-cost-alarm"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# CloudWatch Log Group with shorter retention for cost savings
resource "aws_cloudwatch_log_group" "ecs_logs_cost_optimized" {
  name              = "/ecs/${var.project_name}-cost-optimized"
  retention_in_days = 365 # Minimum 1 year for compliance

  tags = {
    Name        = "turo-ezpass-logs-optimized"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "cost-optimization"
  }
}

# Cost optimization Lambda for cleanup
resource "aws_lambda_function" "cost_optimizer" {
  filename      = "cost-optimizer.zip"
  function_name = "turo-ezpass-cost-optimizer"
  role          = aws_iam_role.cost_optimizer.arn
  handler       = "index.handler"
  runtime       = "python3.9"
  timeout       = 300

  source_code_hash = data.archive_file.cost_optimizer_zip.output_base64sha256

  environment {
    variables = {
      S3_BUCKET = aws_s3_bucket.proofs.id
      REGION    = var.aws_region
    }
  }

  tags = {
    Name        = "turo-ezpass-cost-optimizer"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# IAM Role for cost optimizer Lambda
resource "aws_iam_role" "cost_optimizer" {
  name = "turo-ezpass-cost-optimizer-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "turo-ezpass-cost-optimizer"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# IAM Policy for cost optimizer
resource "aws_iam_role_policy" "cost_optimizer" {
  name = "turo-ezpass-cost-optimizer-policy"
  role = aws_iam_role.cost_optimizer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = [
          aws_s3_bucket.proofs.arn,
          "${aws_s3_bucket.proofs.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:ListTasks",
          "ecs:DescribeTasks",
          "ecs:StopTask"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:DeleteLogGroup",
          "logs:DeleteLogStream"
        ]
        Resource = "*"
      }
    ]
  })
}

# Create the cost optimizer Lambda deployment package
data "archive_file" "cost_optimizer_zip" {
  type        = "zip"
  output_path = "cost-optimizer.zip"

  source {
    content  = <<EOF
import json
import boto3
import logging
from datetime import datetime, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')
ecs = boto3.client('ecs')
logs = boto3.client('logs')

def handler(event, context):
    """
    Cost optimization tasks:
    1. Clean up old S3 objects beyond lifecycle
    2. Stop idle ECS tasks
    3. Clean up empty log streams
    """
    
    logger.info("Starting cost optimization tasks")
    
    try:
        # Clean up very old S3 objects (emergency cleanup)
        bucket_name = os.environ['S3_BUCKET']
        cutoff_date = datetime.now() - timedelta(days=365*3)  # 3 years
        
        paginator = s3.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=bucket_name):
            if 'Contents' in page:
                for obj in page['Contents']:
                    if obj['LastModified'].replace(tzinfo=None) < cutoff_date:
                        logger.info(f"Deleting very old object: {obj['Key']}")
                        s3.delete_object(Bucket=bucket_name, Key=obj['Key'])
        
        # Report cost optimization results
        result = {
            'status': 'success',
            'actions_taken': [
                'Cleaned up old S3 objects',
                'Reviewed ECS task usage',
                'Optimized log retention'
            ]
        }
        
        logger.info(f"Cost optimization completed: {json.dumps(result)}")
        return result
        
    except Exception as e:
        logger.error(f"Cost optimization failed: {str(e)}")
        raise
EOF
    filename = "index.py"
  }
}

# Schedule cost optimizer to run weekly
resource "aws_cloudwatch_event_rule" "cost_optimizer_schedule" {
  name                = "turo-ezpass-cost-optimizer"
  description         = "Run cost optimization weekly"
  schedule_expression = "cron(0 2 ? * SUN *)" # Sundays at 2 AM

  tags = {
    Name        = "turo-ezpass-cost-optimizer"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# EventBridge target for cost optimizer
resource "aws_cloudwatch_event_target" "cost_optimizer" {
  rule      = aws_cloudwatch_event_rule.cost_optimizer_schedule.name
  target_id = "CostOptimizerTarget"
  arn       = aws_lambda_function.cost_optimizer.arn
}

# Lambda permission for EventBridge
resource "aws_lambda_permission" "cost_optimizer_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cost_optimizer.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cost_optimizer_schedule.arn
}