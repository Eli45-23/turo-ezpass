# CloudWatch Dashboard for Turo-EZPass monitoring
resource "aws_cloudwatch_dashboard" "turo_ezpass" {
  dashboard_name = "turo-ezpass-monitoring"

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
            ["AWS/ECS", "TaskCount", "ServiceName", "${var.project_name}-scraper", "ClusterName", "${var.project_name}-cluster"],
            [".", "RunningTaskCount", ".", ".", ".", "."],
            [".", "DesiredCount", ".", ".", ".", "."]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "ECS Task Metrics"
          view   = "timeSeries"
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
            ["AWS/S3", "NumberOfObjects", "BucketName", aws_s3_bucket.proofs.id, "StorageType", "AllStorageTypes"],
            [".", "BucketSizeBytes", ".", ".", ".", "."]
          ]
          period = 86400
          stat   = "Average"
          region = var.aws_region
          title  = "S3 Proof Storage Metrics"
          view   = "timeSeries"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 6
        width  = 24
        height = 6

        properties = {
          query   = "SOURCE '/ecs/${var.project_name}'\n| fields @timestamp, @message\n| filter @message like /ERROR/\n| sort @timestamp desc\n| limit 100"
          region  = var.aws_region
          title   = "Recent Error Logs"
          view    = "table"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["TuroEZPass", "ScraperSuccess", "ScraperType", "ezpass"],
            [".", ".", ".", "turo"],
            [".", "ScraperFailure", ".", "ezpass"],
            [".", ".", ".", "turo"]
          ]
          period = 3600
          stat   = "Sum"
          region = var.aws_region
          title  = "Scraper Success/Failure Counts"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/SNS", "NumberOfMessagesPublished", "TopicName", "turo-ezpass-alerts"],
            [".", "NumberOfNotificationsFailed", ".", "."]
          ]
          period = 3600
          stat   = "Sum"
          region = var.aws_region
          title  = "SNS Alert Metrics"
          view   = "timeSeries"
        }
      }
    ]
  })

  tags = {
    Name        = "turo-ezpass-dashboard"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# SNS Topic for alerts
resource "aws_sns_topic" "alerts" {
  name = "turo-ezpass-alerts"

  tags = {
    Name        = "turo-ezpass-alerts"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# SNS Topic Subscription
resource "aws_sns_topic_subscription" "email_alerts" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# CloudWatch Alarm: ECS Task Failures
resource "aws_cloudwatch_metric_alarm" "ecs_task_failures" {
  alarm_name          = "turo-ezpass-ecs-task-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TaskCount"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Sum"
  threshold           = "3"
  alarm_description   = "This metric monitors ECS task failures"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = "${var.project_name}-cluster"
    ServiceName = "${var.project_name}-scraper"
  }

  tags = {
    Name        = "turo-ezpass-ecs-failures"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# CloudWatch Alarm: No Data (Scrapers haven't run)
resource "aws_cloudwatch_metric_alarm" "scraper_no_data" {
  alarm_name          = "turo-ezpass-scraper-no-data"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ScraperSuccess"
  namespace           = "TuroEZPass"
  period              = "86400"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "No successful scraper runs in 24 hours"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"

  tags = {
    Name        = "turo-ezpass-no-data"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# CloudWatch Alarm: High Scraper Failure Rate
resource "aws_cloudwatch_metric_alarm" "high_failure_rate" {
  alarm_name          = "turo-ezpass-high-failure-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ScraperFailure"
  namespace           = "TuroEZPass"
  period              = "3600"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "High scraper failure rate detected"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Name        = "turo-ezpass-high-failures"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# CloudWatch Log Group retention (cost optimization)
resource "aws_cloudwatch_log_group" "ecs_logs_extended" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 30

  tags = {
    Name        = "turo-ezpass-logs"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}