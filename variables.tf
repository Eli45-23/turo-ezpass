# Variables for Turo-EZPass IAM configuration

variable "aws_account_id" {
  description = "AWS Account ID where resources will be created"
  type        = string
  default     = "486365525776"
  
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "AWS account ID must be a 12-digit number."
  }
}

variable "aws_region" {
  description = "AWS region where resources will be created"
  type        = string
  default     = "us-east-1"
  
  validation {
    condition = contains([
      "us-east-1", "us-east-2", "us-west-1", "us-west-2",
      "eu-west-1", "eu-west-2", "eu-central-1", "ap-southeast-1",
      "ap-southeast-2", "ap-northeast-1"
    ], var.aws_region)
    error_message = "AWS region must be a valid AWS region code."
  }
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
  default     = "prod"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, or prod."
  }
}

variable "external_id" {
  description = "External ID for additional security when assuming the role"
  type        = string
  default     = "turo-ezpass-automation-external-id"
  sensitive   = true
  
  validation {
    condition     = length(var.external_id) >= 8 && length(var.external_id) <= 128
    error_message = "External ID must be between 8 and 128 characters long."
  }
}

variable "alert_email" {
  type        = string
  description = "Email to receive SNS alerts"
  default     = "alerts@example.com"
  
  validation {
    condition     = can(regex("^\\S+@\\S+\\.\\S+$", var.alert_email))
    error_message = "Alert email must be a valid email address."
  }
}

variable "project_name" {
  description = "The name prefix for all ECS resources (cluster, service, log-group, etc.)"
  type        = string
  default     = "turo-ezpass"
}