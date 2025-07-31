# EventBridge Rule for Nightly Scheduling
resource "aws_cloudwatch_event_rule" "nightly_scraper" {
  name                = "${var.project_name}-nightly-scraper"
  description         = "Trigger scraper task nightly at 2 AM ET"
  schedule_expression = "cron(0 6 * * ? *)" # 2 AM ET = 6 AM UTC (standard time)
  state               = var.schedule_enabled ? "ENABLED" : "DISABLED"

  tags = {
    Name = "${var.project_name}-nightly-scraper"
  }
}

# EventBridge Target for Nightly Scheduling
resource "aws_cloudwatch_event_target" "nightly_target" {
  rule      = aws_cloudwatch_event_rule.nightly_scraper.name
  target_id = "${var.project_name}-nightly-ecs-target"
  arn       = aws_ecs_cluster.main.arn
  role_arn  = aws_iam_role.eventbridge_role.arn

  ecs_target {
    task_count          = 1
    task_definition_arn = aws_ecs_task_definition.scraper.arn
    launch_type         = "FARGATE"
    platform_version    = "LATEST"

    network_configuration {
      subnets          = aws_subnet.public[*].id
      security_groups  = [aws_security_group.ecs_task.id]
      assign_public_ip = true
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.eventbridge_ecs_policy_attachment
  ]
}

# Optional: Manual trigger for testing
resource "aws_cloudwatch_event_rule" "manual_trigger" {
  name        = "${var.project_name}-manual-trigger"
  description = "Manual trigger for testing the scraper"
  state       = "ENABLED"

  event_pattern = jsonencode({
    source      = ["custom.scraper"]
    detail-type = ["Manual Trigger"]
  })

  tags = {
    Name = "${var.project_name}-manual-trigger"
  }
}

resource "aws_cloudwatch_event_target" "manual_target" {
  rule      = aws_cloudwatch_event_rule.manual_trigger.name
  target_id = "${var.project_name}-manual-ecs-target"
  arn       = aws_ecs_cluster.main.arn
  role_arn  = aws_iam_role.eventbridge_role.arn

  ecs_target {
    task_count          = 1
    task_definition_arn = aws_ecs_task_definition.scraper.arn
    launch_type         = "FARGATE"
    platform_version    = "LATEST"

    network_configuration {
      subnets          = aws_subnet.public[*].id
      security_groups  = [aws_security_group.ecs_task.id]
      assign_public_ip = true
    }
  }
}