# SNS Topic for alerts
resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.environment}-alerts"

  tags = {
    Name        = "${var.project_name}-alerts"
    Project     = var.project_name
    Environment = var.environment
  }
}

# SNS Topic subscription for email alerts
resource "aws_sns_topic_subscription" "email_alerts" {
  count = var.alert_email != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Variable for alert email
variable "alert_email" {
  description = "Email address for alert notifications"
  type        = string
  default     = ""
}

# IAM role for analytics Lambda
resource "aws_iam_role" "analytics_lambda_role" {
  name = "${var.project_name}-${var.environment}-analytics-lambda-role"

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
    Name        = "${var.project_name}-analytics-lambda-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

# IAM policy for analytics Lambda
resource "aws_iam_policy" "analytics_lambda_policy" {
  name        = "${var.project_name}-${var.environment}-analytics-lambda-policy"
  description = "Policy for analytics Lambda function"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Scan"
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:*:table/${var.dynamodb_table_name}"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.alerts.arn
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-analytics-lambda-policy"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Attach policies to analytics Lambda role
resource "aws_iam_role_policy_attachment" "analytics_lambda_policy_attachment" {
  role       = aws_iam_role.analytics_lambda_role.name
  policy_arn = aws_iam_policy.analytics_lambda_policy.arn
}

resource "aws_iam_role_policy_attachment" "analytics_lambda_basic_policy" {
  role       = aws_iam_role.analytics_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# CloudWatch Log Group for analytics Lambda
resource "aws_cloudwatch_log_group" "analytics_lambda_logs" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-analytics"
  retention_in_days = 14

  tags = {
    Name        = "${var.project_name}-analytics-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Build analytics Lambda function
resource "null_resource" "build_analytics_lambda" {
  provisioner "local-exec" {
    command = "cd ../lambdas/analytics && npm install && npm run build"
  }

  triggers = {
    handler_hash = filemd5("../lambdas/analytics/src/handler.ts")
    package_hash = filemd5("../lambdas/analytics/package.json")
  }
}

# Archive analytics Lambda function code
data "archive_file" "analytics_lambda_zip" {
  type        = "zip"
  source_dir  = "../lambdas/analytics/dist"
  output_path = "../lambdas/analytics/function.zip"
  depends_on  = [null_resource.build_analytics_lambda]
}

# Analytics Lambda function
resource "aws_lambda_function" "analytics" {
  filename         = data.archive_file.analytics_lambda_zip.output_path
  function_name    = "${var.project_name}-${var.environment}-analytics"
  role            = aws_iam_role.analytics_lambda_role.arn
  handler         = "handler.handler"
  runtime         = "nodejs18.x"
  timeout         = 60
  memory_size     = 256

  source_code_hash = data.archive_file.analytics_lambda_zip.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = var.dynamodb_table_name
      SNS_TOPIC_ARN      = aws_sns_topic.alerts.arn
      METRIC_NAMESPACE   = "TuroEZPass"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.analytics_lambda_logs,
    aws_iam_role_policy_attachment.analytics_lambda_basic_policy,
    aws_iam_role_policy_attachment.analytics_lambda_policy_attachment
  ]

  tags = {
    Name        = "${var.project_name}-analytics"
    Project     = var.project_name
    Environment = var.environment
  }
}

# EventBridge rule for analytics Lambda (runs every hour)
resource "aws_cloudwatch_event_rule" "analytics_schedule" {
  name                = "${var.project_name}-${var.environment}-analytics-schedule"
  description         = "Trigger analytics Lambda function hourly"
  schedule_expression = "rate(1 hour)"

  tags = {
    Name        = "${var.project_name}-analytics-schedule"
    Project     = var.project_name
    Environment = var.environment
  }
}

# EventBridge target for analytics Lambda
resource "aws_cloudwatch_event_target" "analytics_lambda_target" {
  rule      = aws_cloudwatch_event_rule.analytics_schedule.name
  target_id = "AnalyticsLambdaTarget"
  arn       = aws_lambda_function.analytics.arn
}

# Lambda permission for EventBridge
resource "aws_lambda_permission" "allow_eventbridge_analytics" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.analytics.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.analytics_schedule.arn
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "no_recent_scrapes" {
  alarm_name          = "${var.project_name}-${var.environment}-no-recent-scrapes"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "RecentScrapes24h"
  namespace           = "TuroEZPass"
  period              = "3600" # 1 hour
  statistic           = "Maximum"
  threshold           = "1"
  alarm_description   = "No scrapes detected in the last 24 hours"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"

  tags = {
    Name        = "${var.project_name}-no-recent-scrapes"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "low_success_rate" {
  alarm_name          = "${var.project_name}-${var.environment}-low-success-rate"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "RecentSuccessRate24h"
  namespace           = "TuroEZPass"
  period              = "3600" # 1 hour
  statistic           = "Average"
  threshold           = "50"
  alarm_description   = "Success rate below 50% in the last 24 hours"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  tags = {
    Name        = "${var.project_name}-low-success-rate"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.project_name}-${var.environment}-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300" # 5 minutes
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "Lambda function errors detected"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    FunctionName = aws_lambda_function.trips_api.function_name
  }

  tags = {
    Name        = "${var.project_name}-lambda-errors"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "api_gateway_errors" {
  alarm_name          = "${var.project_name}-${var.environment}-api-gateway-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = "300" # 5 minutes
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "High number of API Gateway 5XX errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    ApiName = aws_api_gateway_rest_api.trips_api.name
  }

  tags = {
    Name        = "${var.project_name}-api-gateway-errors"
    Project     = var.project_name
    Environment = var.environment
  }
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "turo_ezpass" {
  dashboard_name = "${var.project_name}-${var.environment}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["TuroEZPass", "RecentScrapes24h"],
            [".", "SuccessfulScrapes"],
            [".", "FailedScrapes"]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Scrape Activity"
          period  = 3600
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["TuroEZPass", "SuccessRate"],
            [".", "RecentSuccessRate24h"]
          ]
          view   = "timeSeries"
          region = var.aws_region
          title  = "Success Rate"
          period = 3600
          yAxis = {
            left = {
              min = 0
              max = 100
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["TuroEZPass", "TotalRecords"],
            [".", "AvgRecordsPerScrape"]
          ]
          view   = "timeSeries"
          region = var.aws_region
          title  = "Records Processed"
          period = 3600
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.trips_api.function_name],
            [".", "Invocations", ".", "."],
            [".", "Errors", ".", "."]
          ]
          view   = "timeSeries"
          region = var.aws_region
          title  = "Lambda Performance"
          period = 300
        }
      }
    ]
  })
}

# Outputs for monitoring
output "sns_topic_arn" {
  description = "ARN of the SNS topic for alerts"
  value       = aws_sns_topic.alerts.arn
}

output "analytics_lambda_name" {
  description = "Name of the analytics Lambda function"
  value       = aws_lambda_function.analytics.function_name
}

output "cloudwatch_dashboard_url" {
  description = "URL of the CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.turo_ezpass.dashboard_name}"
}