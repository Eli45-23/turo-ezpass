# Variables for turo-ezpass Terraform configuration

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

variable "docker_image" {
  description = "Docker image URI for the scraper"
  type        = string
  # Example: "123456789012.dkr.ecr.us-east-1.amazonaws.com/turo-ezpass:latest"
}

variable "task_cpu" {
  description = "CPU units for the ECS task"
  type        = string
  default     = "256"
}

variable "task_memory" {
  description = "Memory (in MiB) for the ECS task"
  type        = string
  default     = "512"
}

variable "alert_email" {
  description = "Email address for alerts"
  type        = string
}

variable "schedule_enabled" {
  description = "Whether to enable the scheduled task"
  type        = bool
  default     = true
}

variable "secret_recovery_days" {
  description = "Number of days to retain deleted secrets for recovery"
  type        = number
  default     = 7
}

variable "enable_cloudwatch_logs" {
  description = "Enable CloudWatch Logs for ECS tasks"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14

  validation {
    condition = contains([
      1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365,
      400, 545, 731, 1827, 3653
    ], var.log_retention_days)
    error_message = "Log retention days must be a valid CloudWatch retention period."
  }
}