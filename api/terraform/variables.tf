# Variables for Turo-E-Pass API infrastructure

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "turo-ezpass"
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "dynamodb_table_name" {
  description = "Name of the DynamoDB table containing trip data"
  type        = string
  default     = "turo_ezpass_trips"
}

variable "api_domain_name" {
  description = "Custom domain name for the API (optional)"
  type        = string
  default     = ""
}

variable "cors_allowed_origins" {
  description = "List of allowed CORS origins"
  type        = list(string)
  default     = ["*"] # Restrict this in production
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30
}

variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 256
}