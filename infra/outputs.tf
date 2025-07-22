# =============================================================================
# Outputs for Turo EZPass Infrastructure
# =============================================================================

# Network Outputs
# -----------------------------------------------------------------------------
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_id" {
  description = "ID of the public subnet"
  value       = aws_subnet.public.id
}

output "private_subnet_id" {
  description = "ID of the private subnet"
  value       = aws_subnet.private.id
}

output "private_subnet_secondary_id" {
  description = "ID of the secondary private subnet"
  value       = aws_subnet.private_secondary.id
}

output "internet_gateway_id" {
  description = "ID of the internet gateway"
  value       = aws_internet_gateway.main.id
}

output "nat_gateway_id" {
  description = "ID of the NAT gateway"
  value       = aws_nat_gateway.main.id
}

# Security Group Outputs
# -----------------------------------------------------------------------------
output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

output "lambda_security_group_id" {
  description = "ID of the Lambda security group"
  value       = aws_security_group.lambda.id
}

# Database Outputs
# -----------------------------------------------------------------------------
output "rds_instance_id" {
  description = "RDS instance ID"
  value       = aws_db_instance.postgresql.id
}

output "rds_instance_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.postgresql.endpoint
  sensitive   = true
}

output "rds_instance_address" {
  description = "RDS instance hostname"
  value       = aws_db_instance.postgresql.address
  sensitive   = true
}

output "rds_instance_port" {
  description = "RDS instance port"
  value       = aws_db_instance.postgresql.port
}

output "rds_instance_name" {
  description = "RDS instance database name"
  value       = aws_db_instance.postgresql.db_name
}

output "rds_subnet_group_id" {
  description = "ID of the database subnet group"
  value       = aws_db_subnet_group.main.id
}

# Cognito Outputs
# -----------------------------------------------------------------------------
output "cognito_user_pool_id" {
  description = "ID of the Cognito user pool"
  value       = aws_cognito_user_pool.hosts.id
}

output "cognito_user_pool_arn" {
  description = "ARN of the Cognito user pool"
  value       = aws_cognito_user_pool.hosts.arn
}

output "cognito_user_pool_endpoint" {
  description = "Endpoint name of the Cognito user pool"
  value       = aws_cognito_user_pool.hosts.endpoint
}

output "cognito_client_id" {
  description = "ID of the Cognito user pool client"
  value       = aws_cognito_user_pool_client.web_client.id
}

output "cognito_client_secret" {
  description = "Secret of the Cognito user pool client"
  value       = aws_cognito_user_pool_client.web_client.client_secret
  sensitive   = true
}

output "cognito_domain" {
  description = "Cognito user pool domain"
  value       = aws_cognito_user_pool_domain.main.domain
}

output "cognito_hosted_ui_url" {
  description = "Cognito hosted UI URL"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

# S3 Outputs
# -----------------------------------------------------------------------------
output "s3_bucket_id" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.storage.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.storage.arn
}

output "s3_bucket_domain_name" {
  description = "Domain name of the S3 bucket"
  value       = aws_s3_bucket.storage.bucket_domain_name
}

output "s3_bucket_regional_domain_name" {
  description = "Regional domain name of the S3 bucket"
  value       = aws_s3_bucket.storage.bucket_regional_domain_name
}

# EventBridge Outputs
# -----------------------------------------------------------------------------
output "eventbridge_rule_arn" {
  description = "ARN of the EventBridge rule"
  value       = aws_cloudwatch_event_rule.daily_trigger.arn
}

output "eventbridge_rule_name" {
  description = "Name of the EventBridge rule"
  value       = aws_cloudwatch_event_rule.daily_trigger.name
}

# Lambda IAM Outputs
# -----------------------------------------------------------------------------
output "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.lambda_execution.arn
}

output "lambda_execution_role_name" {
  description = "Name of the Lambda execution role"
  value       = aws_iam_role.lambda_execution.name
}

# Secrets Manager Outputs
# -----------------------------------------------------------------------------
output "db_credentials_secret_arn" {
  description = "ARN of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "db_credentials_secret_name" {
  description = "Name of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.name
}

output "oauth_secrets_secret_arn" {
  description = "ARN of the OAuth secrets secret"
  value       = aws_secretsmanager_secret.oauth_secrets.arn
}

output "oauth_secrets_secret_name" {
  description = "Name of the OAuth secrets secret"
  value       = aws_secretsmanager_secret.oauth_secrets.name
}

output "ezpass_credentials_secret_arn" {
  description = "ARN of the E-ZPass credentials secret"
  value       = aws_secretsmanager_secret.ezpass_credentials.arn
}

output "ezpass_credentials_secret_name" {
  description = "Name of the E-ZPass credentials secret"
  value       = aws_secretsmanager_secret.ezpass_credentials.name
}

# KMS Key Outputs
# -----------------------------------------------------------------------------
output "rds_kms_key_id" {
  description = "ID of the RDS KMS key"
  value       = aws_kms_key.rds.key_id
}

output "rds_kms_key_arn" {
  description = "ARN of the RDS KMS key"
  value       = aws_kms_key.rds.arn
}

output "s3_kms_key_id" {
  description = "ID of the S3 KMS key"
  value       = aws_kms_key.s3.key_id
}

output "s3_kms_key_arn" {
  description = "ARN of the S3 KMS key"
  value       = aws_kms_key.s3.arn
}


# Application Configuration Outputs (for use by application)
# -----------------------------------------------------------------------------
output "application_config" {
  description = "Configuration values for the application"
  value = {
    region               = var.aws_region
    vpc_id               = aws_vpc.main.id
    private_subnet_ids   = [aws_subnet.private.id, aws_subnet.private_secondary.id]
    s3_bucket            = aws_s3_bucket.storage.id
    cognito_user_pool_id = aws_cognito_user_pool.hosts.id
    cognito_client_id    = aws_cognito_user_pool_client.web_client.id
    eventbridge_rule     = aws_cloudwatch_event_rule.daily_trigger.name
    # Secret ARNs for runtime retrieval
    db_secret_arn     = aws_secretsmanager_secret.db_credentials.arn
    oauth_secret_arn  = aws_secretsmanager_secret.oauth_secrets.arn
    ezpass_secret_arn = aws_secretsmanager_secret.ezpass_credentials.arn
  }
  sensitive = true
}

# Summary Output
# -----------------------------------------------------------------------------
output "infrastructure_summary" {
  description = "Summary of deployed infrastructure"
  value = {
    project_name    = var.project_name
    environment     = var.environment
    region          = var.aws_region
    vpc_cidr        = var.vpc_cidr
    database_engine = "postgresql-${var.db_engine_version}"
    s3_bucket_name  = aws_s3_bucket.storage.id
    cognito_domain  = aws_cognito_user_pool_domain.main.domain
    resources_created = [
      "VPC with public/private subnets",
      "Encrypted RDS PostgreSQL instance",
      "Cognito User Pool for authentication",
      "S3 bucket with encryption and lifecycle policies",
      "EventBridge rule for daily Lambda triggers",
      "Secrets Manager for credential storage",
      "KMS keys for encryption",
      "IAM roles and security groups"
    ]
  }
}