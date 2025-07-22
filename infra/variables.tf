# =============================================================================
# Variables for Turo EZPass Infrastructure
# =============================================================================

# Project Configuration
# -----------------------------------------------------------------------------
variable "project_name" {
  description = "Name of the project used for resource naming"
  type        = string
  default     = "turo-ezpass"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

# Network Configuration
# -----------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "private_subnet_cidr" {
  description = "CIDR block for private subnet"
  type        = string
  default     = "10.0.2.0/24"
}

variable "availability_zones" {
  description = "Availability zones for subnets"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# Database Configuration
# -----------------------------------------------------------------------------
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS instance (GB)"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage for RDS instance (GB)"
  type        = number
  default     = 100
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "db_name" {
  description = "Name of the initial database"
  type        = string
  default     = "turoezpass"
}

variable "db_username" {
  description = "Master username for RDS instance"
  type        = string
  default     = "dbadmin"
}

variable "db_backup_retention_period" {
  description = "Number of days to retain DB backups"
  type        = number
  default     = 7
}

variable "db_backup_window" {
  description = "Preferred backup window"
  type        = string
  default     = "03:00-04:00"
}

variable "db_maintenance_window" {
  description = "Preferred maintenance window"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

# Cognito Configuration
# -----------------------------------------------------------------------------
variable "cognito_password_minimum_length" {
  description = "Minimum password length for Cognito users"
  type        = number
  default     = 12
}

variable "cognito_temporary_password_validity_days" {
  description = "Number of days temporary passwords are valid"
  type        = number
  default     = 7
}

# S3 Configuration
# -----------------------------------------------------------------------------
variable "s3_lifecycle_ia_days" {
  description = "Number of days before transitioning to IA storage class"
  type        = number
  default     = 30
}

variable "s3_lifecycle_glacier_days" {
  description = "Number of days before transitioning to Glacier"
  type        = number
  default     = 90
}

variable "s3_lifecycle_expiration_days" {
  description = "Number of days before deleting objects"
  type        = number
  default     = 365
}

# Lambda Configuration
# -----------------------------------------------------------------------------
variable "lambda_schedule_expression" {
  description = "EventBridge schedule expression for Lambda trigger"
  type        = string
  default     = "cron(0 2 * * ? *)"  # Daily at 2 AM UTC
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 300
}

variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 512
}

# Common Tags
# -----------------------------------------------------------------------------
variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "turo-ezpass"
    ManagedBy   = "terraform"
    Owner       = "infra-team"
    Environment = "prod"
  }
}