# Outputs for turo-ezpass secrets management module

# Secret ARNs
output "ezpass_secret_arn" {
  description = "ARN of the E-ZPass credentials secret"
  value       = aws_secretsmanager_secret.ezpass_credentials.arn
}

output "turo_secret_arn" {
  description = "ARN of the Turo credentials secret"
  value       = aws_secretsmanager_secret.turo_credentials.arn
}

output "ezpass_secret_name" {
  description = "Name of the E-ZPass credentials secret"
  value       = aws_secretsmanager_secret.ezpass_credentials.name
}

output "turo_secret_name" {
  description = "Name of the Turo credentials secret"
  value       = aws_secretsmanager_secret.turo_credentials.name
}

# IAM Role ARNs
output "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  value       = aws_iam_role.ecs_task_execution_role.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role (for runtime permissions)"
  value       = aws_iam_role.ecs_task_role.arn
}

output "ecs_task_execution_role_name" {
  description = "Name of the ECS task execution role"
  value       = aws_iam_role.ecs_task_execution_role.name
}

output "ecs_task_role_name" {
  description = "Name of the ECS task role"
  value       = aws_iam_role.ecs_task_role.name
}

# Policy ARNs
output "secrets_access_policy_arn" {
  description = "ARN of the secrets access policy"
  value       = aws_iam_policy.secrets_access_policy.arn
}

output "cloudwatch_logs_policy_arn" {
  description = "ARN of the CloudWatch Logs policy (if enabled)"
  value       = var.enable_cloudwatch_logs ? aws_iam_policy.cloudwatch_logs_policy[0].arn : null
}

# Environment variables for container
output "container_environment_variables" {
  description = "Environment variables to inject into ECS container"
  value = {
    AWS_REGION                     = data.aws_region.current.name
    EZPASS_CREDENTIALS_SECRET_NAME = aws_secretsmanager_secret.ezpass_credentials.name
    TURO_CREDENTIALS_SECRET_NAME   = aws_secretsmanager_secret.turo_credentials.name
  }
}

# Complete secret ARN list for ECS task definition
output "secret_arns" {
  description = "List of all secret ARNs for ECS task definition"
  value = [
    aws_secretsmanager_secret.ezpass_credentials.arn,
    aws_secretsmanager_secret.turo_credentials.arn
  ]
}