# EventBridge Role for triggering ECS tasks
resource "aws_iam_role" "eventbridge_role" {
  name = "${var.project_name}-eventbridge-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-eventbridge-role"
  }
}

resource "aws_iam_policy" "eventbridge_ecs_policy" {
  name        = "${var.project_name}-eventbridge-ecs-policy"
  description = "Policy for EventBridge to run ECS tasks"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RunTask"
        ]
        Resource = [
          aws_ecs_task_definition.scraper.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          module.secrets_management.ecs_task_execution_role_arn,
          module.secrets_management.ecs_task_role_arn
        ]
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-eventbridge-ecs-policy"
  }
}

resource "aws_iam_role_policy_attachment" "eventbridge_ecs_policy_attachment" {
  role       = aws_iam_role.eventbridge_role.name
  policy_arn = aws_iam_policy.eventbridge_ecs_policy.arn
}

data "aws_caller_identity" "current" {}