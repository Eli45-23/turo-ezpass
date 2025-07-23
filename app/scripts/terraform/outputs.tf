# Outputs for turo-ezpass Terraform configuration

# ECS Resources
output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_task_definition_arn" {
  description = "ARN of the ECS task definition"
  value       = aws_ecs_task_definition.scraper.arn
}

output "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  value       = module.secrets_management.ecs_task_execution_role_arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role"
  value       = module.secrets_management.ecs_task_role_arn
}

# Networking
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "security_group_id" {
  description = "ID of the ECS security group"
  value       = aws_security_group.ecs_task.id
}

# Monitoring
output "sns_topic_arn" {
  description = "ARN of the SNS alerts topic"
  value       = aws_sns_topic.alerts.arn
}

output "cloudwatch_log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.ecs_logs.name
}

output "cloudwatch_dashboard_url" {
  description = "URL to the CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.scraper_dashboard.dashboard_name}"
}

# Scheduling
output "eventbridge_rule_name" {
  description = "Name of the EventBridge rule"
  value       = aws_cloudwatch_event_rule.nightly_scraper.name
}

output "manual_trigger_rule_name" {
  description = "Name of the manual trigger EventBridge rule"
  value       = aws_cloudwatch_event_rule.manual_trigger.name
}

# Secret information (from modules)
output "ezpass_secret_arn" {
  description = "ARN of the E-ZPass credentials secret"
  value       = try(module.secrets_management.ezpass_secret_arn, null)
}

output "turo_secret_arn" {
  description = "ARN of the Turo credentials secret"
  value       = try(module.secrets_management.turo_secret_arn, null)
}

# Instructions for next steps
output "deployment_instructions" {
  description = "Instructions for deploying and using the infrastructure"
  value       = <<-EOT
    
    Deployment Instructions:
    
    1. Set required variables in terraform.tfvars:
       docker_image = "YOUR_ECR_REPO_URI:latest"
       alert_email = "your-email@example.com"
    
    2. Deploy infrastructure:
       terraform init
       terraform plan
       terraform apply
    
    3. Push your Docker image to ECR:
       aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.${var.aws_region}.amazonaws.com
       docker build -t turo-ezpass .
       docker tag turo-ezpass:latest YOUR_ACCOUNT.dkr.ecr.${var.aws_region}.amazonaws.com/turo-ezpass:latest
       docker push YOUR_ACCOUNT.dkr.ecr.${var.aws_region}.amazonaws.com/turo-ezpass:latest
    
    4. Confirm SNS subscription via email
    
    5. Test manual trigger:
       aws events put-events --entries Source=custom.scraper,DetailType="Manual Trigger",Detail='{}'
    
    6. Monitor via CloudWatch Dashboard: ${aws_cloudwatch_dashboard.scraper_dashboard.dashboard_name}
  EOT
}