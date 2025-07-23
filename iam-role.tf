# IAM role for Turo-EZPass automation
resource "aws_iam_role" "turo_ezpass_automation_role" {
  name = "turo-ezpass-automation-role"
  path = "/"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.aws_account_id}:root"
        }
        Condition = {
          StringEquals = {
            "sts:ExternalId" = var.external_id
          }
        }
      },
      # Additional trust for specific CI/CD principals if needed
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          AWS = [
            # Add specific ARNs for CI/CD systems that need to assume this role
            # Example: "arn:aws:iam::${var.aws_account_id}:user/github-actions"
            "arn:aws:iam::${var.aws_account_id}:user/turo-terraform"
          ]
        }
      }
    ]
  })

  force_detach_policies = true
  max_session_duration  = 3600

  tags = {
    Name        = "turo-ezpass-automation-role"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Attach the customer-managed policy to the role
resource "aws_iam_role_policy_attachment" "turo_ezpass_automation_policy_attachment" {
  role       = aws_iam_role.turo_ezpass_automation_role.name
  policy_arn = aws_iam_policy.turo_ezpass_automation_policy.arn

  depends_on = [
    aws_iam_policy.turo_ezpass_automation_policy,
    aws_iam_role.turo_ezpass_automation_role
  ]
}