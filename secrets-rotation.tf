# IAM Role for Secrets Manager rotation
resource "aws_iam_role" "secrets_rotation" {
  name = "turo-ezpass-secrets-rotation-role"

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
    Name        = "turo-ezpass-secrets-rotation"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# IAM Policy for Secrets Manager rotation
resource "aws_iam_role_policy" "secrets_rotation" {
  name = "turo-ezpass-secrets-rotation-policy"
  role = aws_iam_role.secrets_rotation.id

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
        Resource = [
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda/turo-ezpass-rotate-secrets",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda/turo-ezpass-rotate-secrets:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecretVersionStage"
        ]
        Resource = [
          "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:turo-ezpass/ezpass/credentials*",
          "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:turo-ezpass/turo/credentials*"
        ]
      }
    ]
  })
}

# Lambda function for secret rotation (placeholder - would need actual rotation logic)
resource "aws_lambda_function" "rotate_secrets" {
  filename      = "rotate-secrets.zip"
  function_name = "turo-ezpass-rotate-secrets"
  role          = aws_iam_role.secrets_rotation.arn
  handler       = "index.handler"
  runtime       = "python3.9"
  timeout       = 300

  source_code_hash = data.archive_file.rotate_secrets_zip.output_base64sha256

  tracing_config {
    mode = "Active"
  }

  reserved_concurrent_executions = 1

  dead_letter_config {
    target_arn = aws_sqs_queue.dlq.arn
  }

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  code_signing_config_arn = aws_lambda_code_signing_config.sign.arn

  environment {
    variables = var.lambda_env_vars
  }

  tags = {
    Name        = "turo-ezpass-rotate-secrets"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Create the Lambda deployment package
data "archive_file" "rotate_secrets_zip" {
  type        = "zip"
  output_path = "rotate-secrets.zip"

  source {
    content  = <<EOF
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Placeholder for secrets rotation logic.
    In production, this would:
    1. Generate new credentials
    2. Test the new credentials
    3. Update the secret
    4. Clean up old credentials
    """
    
    logger.info(f"Rotation event: {json.dumps(event)}")
    
    # TODO: Implement actual rotation logic for Turo/EZPass credentials
    # This is a complex process that would involve:
    # - Understanding each service's credential rotation mechanism
    # - Implementing secure credential generation
    # - Testing new credentials before switching
    
    return {
        'statusCode': 200,
        'body': json.dumps('Rotation completed successfully')
    }
EOF
    filename = "index.py"
  }
}

# Lambda permission for Secrets Manager
resource "aws_lambda_permission" "secrets_rotation" {
  statement_id  = "AllowSecretsManagerInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rotate_secrets.function_name
  principal     = "secretsmanager.amazonaws.com"
}

# CloudWatch alarm for rotation failures
resource "aws_cloudwatch_metric_alarm" "rotation_failures" {
  alarm_name          = "turo-ezpass-rotation-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "Secrets rotation function failures"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = aws_lambda_function.rotate_secrets.function_name
  }

  tags = {
    Name        = "turo-ezpass-rotation-failures"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Schedule for periodic security reviews (EventBridge rule)
resource "aws_cloudwatch_event_rule" "security_review" {
  name                = "turo-ezpass-security-review"
  description         = "Trigger monthly security review"
  schedule_expression = "cron(0 9 1 * ? *)" # First day of month at 9 AM

  tags = {
    Name        = "turo-ezpass-security-review"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# SNS target for security review notifications
resource "aws_cloudwatch_event_target" "security_review_notification" {
  rule      = aws_cloudwatch_event_rule.security_review.name
  target_id = "SecurityReviewNotification"
  arn       = aws_sns_topic.alerts.arn

  input_transformer {
    input_paths = {
      time = "$.time"
    }
    input_template = jsonencode({
      "alert_type" = "security_review"
      "message"    = "Monthly security review reminder for Turo-EZPass infrastructure"
      "timestamp"  = "<time>"
      "action_items" = [
        "Review IAM policies for any overly broad permissions",
        "Check for unused resources and cleanup",
        "Verify secrets rotation is functioning",
        "Review CloudWatch logs for security anomalies",
        "Update dependencies and security patches"
      ]
    })
  }
}