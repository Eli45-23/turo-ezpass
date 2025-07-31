# KMS key for SNS encryption
resource "aws_kms_key" "sns_key" {
  description             = "KMS key for ${var.project_name} SNS topic encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = {
    Name = "${var.project_name}-sns-key"
  }
}

resource "aws_kms_alias" "sns_key_alias" {
  name          = "alias/${var.project_name}-sns"
  target_key_id = aws_kms_key.sns_key.key_id
}

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name              = "${var.project_name}-alerts"
  kms_master_key_id = aws_kms_key.sns_key.arn

  tags = {
    Name = "${var.project_name}-alerts"
  }
}

# SNS Topic Subscription
resource "aws_sns_topic_subscription" "email_alerts" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# CloudWatch Alarm for Task Failures
resource "aws_cloudwatch_metric_alarm" "task_failures" {
  alarm_name          = "${var.project_name}-task-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "TasksStoppedByFailure"
  namespace           = "AWS/ECS"
  period              = 43200 # 12 hours
  statistic           = "Sum"
  threshold           = 3
  alarm_description   = "This metric monitors ECS task failures"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    ServiceName = "${var.project_name}-scraper"
    ClusterName = aws_ecs_cluster.main.name
  }

  tags = {
    Name = "${var.project_name}-task-failures"
  }
}

# CloudWatch Alarm for Task Stopped Reason
resource "aws_cloudwatch_log_metric_filter" "login_timeouts" {
  name           = "${var.project_name}-login-timeouts"
  log_group_name = aws_cloudwatch_log_group.ecs_logs.name
  pattern        = "[timestamp, request_id, level=\"ERROR\", message=\"*timeout*\" || message=\"*login*field*missing*\" || message=\"*failed*\"]"

  metric_transformation {
    name      = "LoginTimeouts"
    namespace = "Custom/${var.project_name}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "login_timeouts_alarm" {
  alarm_name          = "${var.project_name}-login-timeouts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "LoginTimeouts"
  namespace           = "Custom/${var.project_name}"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Alert when login timeouts or field missing errors occur"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  tags = {
    Name = "${var.project_name}-login-timeouts"
  }
}

# CloudWatch Alarm for No Data (Scraper not running)
resource "aws_cloudwatch_metric_alarm" "no_data" {
  alarm_name          = "${var.project_name}-no-data"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "RunningTaskCount"
  namespace           = "AWS/ECS"
  period              = 86400 # 24 hours
  statistic           = "Maximum"
  threshold           = 1
  alarm_description   = "Alert when no tasks have run in 24 hours"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"

  dimensions = {
    ServiceName = "${var.project_name}-scraper"
    ClusterName = aws_ecs_cluster.main.name
  }

  tags = {
    Name = "${var.project_name}-no-data"
  }
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "scraper_dashboard" {
  dashboard_name = "${var.project_name}-dashboard"

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
            ["AWS/ECS", "RunningTaskCount", "ServiceName", "${var.project_name}-scraper", "ClusterName", aws_ecs_cluster.main.name],
            [".", "TasksStoppedByFailure", ".", ".", ".", "."],
            ["Custom/${var.project_name}", "LoginTimeouts"]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Scraper Metrics"
          period  = 300
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 6
        width  = 24
        height = 6

        properties = {
          query  = "SOURCE '${aws_cloudwatch_log_group.ecs_logs.name}' | fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20"
          region = var.aws_region
          title  = "Recent Errors"
        }
      }
    ]
  })
}

# Enhanced monitoring for scraper failures
resource "aws_cloudwatch_log_metric_filter" "scraper_failures" {
  name           = "${var.project_name}-scraper-failures"
  log_group_name = aws_cloudwatch_log_group.ecs_logs.name
  pattern        = "[timestamp, ..., message=\"*scraping failed*\" || message=\"*Scraping failed*\" || message=\"Username field not found*\"]"

  metric_transformation {
    name      = "ScraperFailures"
    namespace = "Custom/${var.project_name}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "scraper_failures_alarm" {
  alarm_name          = "${var.project_name}-scraper-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ScraperFailures"
  namespace           = "Custom/${var.project_name}"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Scraper failures detected - website structure may have changed"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  tags = {
    Name = "${var.project_name}-scraper-failures"
  }
}

# Monitor for successful scraper runs
resource "aws_cloudwatch_log_metric_filter" "scraper_success" {
  name           = "${var.project_name}-scraper-success"
  log_group_name = aws_cloudwatch_log_group.ecs_logs.name
  pattern        = "[timestamp, ..., message=\"*Successfully submitted*\" || message=\"*completed successfully*\" || message=\"*totalTrips*\"]"

  metric_transformation {
    name      = "ScraperSuccess"
    namespace = "Custom/${var.project_name}"
    value     = "1"
  }
}