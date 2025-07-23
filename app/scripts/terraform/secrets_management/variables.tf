# Variables for turo-ezpass secrets management module

variable "project_name" {
  description = "Name of the project for resource naming"
  type        = string
  default     = "turo-ezpass"
}

variable "ezpass_secret_name" {
  description = "Name of the E-ZPass credentials secret in AWS Secrets Manager"
  type        = string
  default     = "turo-ezpass/ezpass/credentials"
}

variable "turo_secret_name" {
  description = "Name of the Turo credentials secret in AWS Secrets Manager"
  type        = string
  default     = "turo-ezpass/turo/credentials"
}

variable "recovery_window_days" {
  description = "Number of days to retain deleted secrets for recovery"
  type        = number
  default     = 7

  validation {
    condition     = var.recovery_window_days >= 7 && var.recovery_window_days <= 30
    error_message = "Recovery window must be between 7 and 30 days."
  }
}

variable "enable_cloudwatch_logs" {
  description = "Enable CloudWatch Logs permissions for ECS tasks"
  type        = bool
  default     = true
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "turo-ezpass"
    Environment = "production"
    ManagedBy   = "terraform"
    Purpose     = "scraper-automation"
  }
}

variable "aws_region" {
  description = "AWS region for resources (if not using provider default)"
  type        = string
  default     = null
}

variable "kms_key_id" {
  description = "KMS key ID for encrypting secrets (uses AWS managed key if not specified)"
  type        = string
  default     = null
}