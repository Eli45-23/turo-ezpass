# =============================================================================
# Turo EZPass Infrastructure - Main Configuration
# =============================================================================

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
  }
}

# Configure AWS Provider
# -----------------------------------------------------------------------------
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.common_tags
  }
}

# Data Sources
# -----------------------------------------------------------------------------
data "aws_availability_zones" "available" {
  state = "available"
}

# Generate random password for RDS master user
resource "random_password" "db_password" {
  length  = 16
  special = true
}

# =============================================================================
# NETWORKING - VPC, Subnets, Gateways
# =============================================================================

# VPC with DNS support for RDS and other services
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

# Internet Gateway for public subnet access
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

# Public subnet for NAT Gateway and public-facing resources
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-subnet"
    Type = "public"
  }
}

# Private subnet for RDS and internal resources
resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidr
  availability_zone = data.aws_availability_zones.available.names[1]

  tags = {
    Name = "${var.project_name}-private-subnet"
    Type = "private"
  }
}

# Additional private subnet in different AZ for RDS Multi-AZ requirement
resource "aws_subnet" "private_secondary" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = {
    Name = "${var.project_name}-private-subnet-secondary"
    Type = "private"
  }
}

# Elastic IP for NAT Gateway
resource "aws_eip" "nat" {
  domain = "vpc"
  depends_on = [aws_internet_gateway.main]

  tags = {
    Name = "${var.project_name}-nat-eip"
  }
}

# NAT Gateway for private subnet internet access
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public.id
  depends_on    = [aws_internet_gateway.main]

  tags = {
    Name = "${var.project_name}-nat-gateway"
  }
}

# Route table for public subnet
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

# Route table for private subnets
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-private-rt"
  }
}

# Associate route tables with subnets
resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_secondary" {
  subnet_id      = aws_subnet.private_secondary.id
  route_table_id = aws_route_table.private.id
}

# =============================================================================
# SECURITY GROUPS
# =============================================================================

# Security group for RDS PostgreSQL
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Security group for RDS PostgreSQL instance"
  vpc_id      = aws_vpc.main.id

  # Allow PostgreSQL access from private subnets
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.private_subnet_cidr, "10.0.3.0/24"]
    description = "PostgreSQL access from private subnets"
  }

  # Allow Lambda access (will be in private subnet)
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
    description     = "PostgreSQL access from Lambda"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

# Security group for Lambda functions
resource "aws_security_group" "lambda" {
  name        = "${var.project_name}-lambda-sg"
  description = "Security group for Lambda functions"
  vpc_id      = aws_vpc.main.id

  # Allow all outbound traffic for external API calls
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  # Allow HTTPS for external API calls
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS outbound"
  }

  tags = {
    Name = "${var.project_name}-lambda-sg"
  }
}

# =============================================================================
# RDS POSTGRESQL DATABASE
# =============================================================================

# DB subnet group for RDS Multi-AZ deployment
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = [aws_subnet.private.id, aws_subnet.private_secondary.id]

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

# KMS key for RDS encryption
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS encryption"
  deletion_window_in_days = 7

  tags = {
    Name = "${var.project_name}-rds-kms-key"
  }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.project_name}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# RDS PostgreSQL instance with encryption and automated backups
resource "aws_db_instance" "postgresql" {
  # Basic Configuration
  identifier             = "${var.project_name}-db"
  allocated_storage      = var.db_allocated_storage
  max_allocated_storage  = var.db_max_allocated_storage
  storage_type           = "gp3"
  engine                 = "postgres"
  engine_version         = var.db_engine_version
  instance_class         = var.db_instance_class
  
  # Database Configuration
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  # Network Configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  port                   = 5432

  # Security Configuration
  storage_encrypted = true
  kms_key_id       = aws_kms_key.rds.arn

  # Backup Configuration
  backup_retention_period = var.db_backup_retention_period
  backup_window          = var.db_backup_window
  maintenance_window     = var.db_maintenance_window
  
  # Monitoring and Performance
  monitoring_interval             = 60
  monitoring_role_arn            = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled   = true
  performance_insights_kms_key_id = aws_kms_key.rds.arn
  
  # Operational Configuration
  auto_minor_version_upgrade = true
  deletion_protection       = true
  skip_final_snapshot      = false
  final_snapshot_identifier = "${var.project_name}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # Enable automated backups
  copy_tags_to_snapshot = true

  tags = {
    Name = "${var.project_name}-postgresql"
  }

  # Ensure KMS key is created before RDS
  depends_on = [aws_kms_key.rds]
}

# IAM role for RDS monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-rds-monitoring-role"
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# =============================================================================
# COGNITO USER POOL FOR HOST AUTHENTICATION
# =============================================================================

# Cognito User Pool for Turo host authentication
resource "aws_cognito_user_pool" "hosts" {
  name = "${var.project_name}-hosts"

  # User attributes
  alias_attributes = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length                   = var.cognito_password_minimum_length
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = var.cognito_temporary_password_validity_days
  }


  # Email configuration
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Username configuration
  username_configuration {
    case_sensitive = false
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Schema - required attributes
  schema {
    attribute_data_type = "String"
    name               = "email"
    required           = true
    mutable            = true
    
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    attribute_data_type = "String"
    name               = "name"
    required           = true
    mutable            = true
    
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Custom attributes for Turo host data
  schema {
    attribute_data_type = "String"
    name               = "turo_host_id"
    required           = false
    mutable            = true
    
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = {
    Name = "${var.project_name}-user-pool"
  }
}

# User pool client for web application
resource "aws_cognito_user_pool_client" "web_client" {
  name                                 = "${var.project_name}-web-client"
  user_pool_id                        = aws_cognito_user_pool.hosts.id
  generate_secret                     = true
  prevent_user_existence_errors       = "ENABLED"
  enable_token_revocation            = true
  enable_propagate_additional_user_context_data = false

  # OAuth configuration
  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                = ["email", "openid", "profile"]
  callback_urls                       = ["https://localhost:3000/callback", "https://localhost:8080/callback"]
  logout_urls                         = ["https://localhost:3000/logout", "https://localhost:8080/logout"]

  # Token validity
  access_token_validity  = 60  # 1 hour
  id_token_validity     = 60  # 1 hour
  refresh_token_validity = 30  # 30 days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # Explicit auth flows
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH"
  ]

  # Read and write attributes
  read_attributes  = ["email", "name", "custom:turo_host_id"]
  write_attributes = ["email", "name", "custom:turo_host_id"]
}

# User pool domain for hosted UI
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project_name}-auth-${random_string.domain_suffix.result}"
  user_pool_id = aws_cognito_user_pool.hosts.id
}

resource "random_string" "domain_suffix" {
  length  = 8
  upper   = false
  special = false
}

# =============================================================================
# S3 BUCKET FOR SCREENSHOTS AND LOGS
# =============================================================================

# KMS key for S3 encryption
resource "aws_kms_key" "s3" {
  description             = "KMS key for S3 bucket encryption"
  deletion_window_in_days = 7

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-s3-kms-key"
  }
}

resource "aws_kms_alias" "s3" {
  name          = "alias/${var.project_name}-s3"
  target_key_id = aws_kms_key.s3.key_id
}

data "aws_caller_identity" "current" {}

# S3 bucket for screenshots and application logs
resource "aws_s3_bucket" "storage" {
  bucket = "${var.project_name}-storage-${random_string.bucket_suffix.result}"

  tags = {
    Name        = "${var.project_name}-storage"
    Purpose     = "Screenshots and logs storage"
    Environment = var.environment
  }
}

resource "random_string" "bucket_suffix" {
  length  = 8
  upper   = false
  special = false
}

# S3 bucket versioning
resource "aws_s3_bucket_versioning" "storage" {
  bucket = aws_s3_bucket.storage.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 bucket encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# S3 bucket public access block
resource "aws_s3_bucket_public_access_block" "storage" {
  bucket = aws_s3_bucket.storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 bucket lifecycle configuration
resource "aws_s3_bucket_lifecycle_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id

  rule {
    id     = "lifecycle_rule"
    status = "Enabled"
    
    filter {
      prefix = ""
    }

    # Transition to IA storage class
    transition {
      days          = var.s3_lifecycle_ia_days
      storage_class = "STANDARD_IA"
    }

    # Transition to Glacier
    transition {
      days          = var.s3_lifecycle_glacier_days
      storage_class = "GLACIER"
    }

    # Delete objects after specified days
    expiration {
      days = var.s3_lifecycle_expiration_days
    }

    # Delete incomplete multipart uploads after 7 days
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# =============================================================================
# EVENTBRIDGE AND LAMBDA CONFIGURATION
# =============================================================================

# IAM role for Lambda execution
resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-lambda-execution-role"

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
    Name = "${var.project_name}-lambda-execution-role"
  }
}

# Lambda basic execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_execution.name
}

# Lambda VPC execution policy
resource "aws_iam_role_policy_attachment" "lambda_vpc_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.lambda_execution.name
}

# Custom policy for Lambda to access required services
resource "aws_iam_role_policy" "lambda_custom_policy" {
  name = "${var.project_name}-lambda-custom-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.storage.arn,
          "${aws_s3_bucket.storage.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.db_credentials.arn,
          aws_secretsmanager_secret.oauth_secrets.arn,
          aws_secretsmanager_secret.ezpass_credentials.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = [
          aws_kms_key.s3.arn,
          aws_kms_key.secrets.arn
        ]
      }
    ]
  })
}

# EventBridge rule to trigger Lambda daily at 2 AM UTC
resource "aws_cloudwatch_event_rule" "daily_trigger" {
  name                = "${var.project_name}-daily-trigger"
  description         = "Trigger toll processing Lambda daily at 2 AM UTC"
  schedule_expression = var.lambda_schedule_expression

  tags = {
    Name = "${var.project_name}-daily-trigger"
  }
}

# EventBridge target (Lambda function placeholder)
# Note: The actual Lambda function would be deployed separately
resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.daily_trigger.name
  target_id = "TollProcessingLambdaTarget"
  arn       = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.project_name}-toll-processor"

  # This will need to be updated once the Lambda function is created
  depends_on = [aws_cloudwatch_event_rule.daily_trigger]
}

# =============================================================================
# AWS SECRETS MANAGER
# =============================================================================

# KMS key for Secrets Manager encryption
resource "aws_kms_key" "secrets" {
  description             = "KMS key for Secrets Manager encryption"
  deletion_window_in_days = 7

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Secrets Manager"
        Effect = "Allow"
        Principal = {
          Service = "secretsmanager.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:GenerateDataKey*",
          "kms:ReEncrypt*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-secrets-kms-key"
  }
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${var.project_name}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# Database credentials in Secrets Manager
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${var.project_name}/database/credentials"
  description = "Database credentials for Turo EZPass application"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = {
    Name = "${var.project_name}-db-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db_password.result
    host     = aws_db_instance.postgresql.address
    port     = aws_db_instance.postgresql.port
    dbname   = aws_db_instance.postgresql.db_name
    engine   = "postgres"
  })
}

# OAuth secrets for Cognito and external services
resource "aws_secretsmanager_secret" "oauth_secrets" {
  name        = "${var.project_name}/oauth/secrets"
  description = "OAuth client secrets and configuration"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = {
    Name = "${var.project_name}-oauth-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "oauth_secrets" {
  secret_id = aws_secretsmanager_secret.oauth_secrets.id
  secret_string = jsonencode({
    cognito_client_id     = aws_cognito_user_pool_client.web_client.id
    cognito_client_secret = aws_cognito_user_pool_client.web_client.client_secret
    cognito_user_pool_id  = aws_cognito_user_pool.hosts.id
    cognito_domain        = aws_cognito_user_pool_domain.main.domain
    # Placeholder for Turo API credentials (to be added later)
    turo_client_id        = "PLACEHOLDER_TURO_CLIENT_ID"
    turo_client_secret    = "PLACEHOLDER_TURO_CLIENT_SECRET"
  })
}

# E-ZPass API credentials placeholder
resource "aws_secretsmanager_secret" "ezpass_credentials" {
  name        = "${var.project_name}/ezpass/credentials"
  description = "E-ZPass account credentials and API configuration"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = {
    Name = "${var.project_name}-ezpass-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "ezpass_credentials" {
  secret_id = aws_secretsmanager_secret.ezpass_credentials.id
  secret_string = jsonencode({
    # Placeholders for E-ZPass account credentials
    ezpass_username = "PLACEHOLDER_EZPASS_USERNAME"
    ezpass_password = "PLACEHOLDER_EZPASS_PASSWORD"
    # Additional E-ZPass networks can be added here
    sunpass_username = "PLACEHOLDER_SUNPASS_USERNAME"
    sunpass_password = "PLACEHOLDER_SUNPASS_PASSWORD"
    fastrak_username = "PLACEHOLDER_FASTRAK_USERNAME"
    fastrak_password = "PLACEHOLDER_FASTRAK_PASSWORD"
  })
}