# Cognito User Pool for authentication
resource "aws_cognito_user_pool" "turo_ezpass_users" {
  name = "${var.project_name}-${var.environment}-users"

  # User attributes
  alias_attributes = ["email", "preferred_username"]
  
  # Username configuration
  username_configuration {
    case_sensitive = false
  }

  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Auto-verified attributes
  auto_verified_attributes = ["email"]

  # User pool add-ons
  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }

  # Email configuration
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Verification message template
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Verify your Turo-E-Pass account"
    email_message        = "Your verification code is {####}"
  }

  # Schema for custom attributes
  schema {
    attribute_data_type = "String"
    name               = "email"
    required           = true
    mutable           = true

    string_attribute_constraints {
      min_length = 7
      max_length = 256
    }
  }

  schema {
    attribute_data_type = "String"
    name               = "preferred_username"
    required           = false
    mutable           = true

    string_attribute_constraints {
      min_length = 1
      max_length = 128
    }
  }

  # User pool tags
  tags = {
    Name        = "${var.project_name}-user-pool"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "turo_ezpass_client" {
  name         = "${var.project_name}-${var.environment}-client"
  user_pool_id = aws_cognito_user_pool.turo_ezpass_users.id

  # Client settings
  generate_secret = false # For public clients (React app)
  
  # OAuth flows
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  # Token validity
  access_token_validity  = 60    # 1 hour
  id_token_validity     = 60    # 1 hour
  refresh_token_validity = 30   # 30 days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # Prevent user existence errors
  prevent_user_existence_errors = "ENABLED"

  # Read/write attributes
  read_attributes = [
    "email",
    "email_verified",
    "preferred_username"
  ]

  write_attributes = [
    "email",
    "preferred_username"
  ]

  # OAuth configuration
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                 = ["code", "implicit"]
  allowed_oauth_scopes               = ["email", "openid", "profile"]
  
  callback_urls = [
    "http://localhost:3000",
    var.dashboard_url != "" ? var.dashboard_url : "https://example.com"
  ]
  
  logout_urls = [
    "http://localhost:3000",
    var.dashboard_url != "" ? var.dashboard_url : "https://example.com"
  ]

  supported_identity_providers = ["COGNITO"]
}

# Cognito User Pool Domain
resource "aws_cognito_user_pool_domain" "turo_ezpass_domain" {
  domain       = "${var.project_name}-${var.environment}-${random_string.cognito_domain_suffix.result}"
  user_pool_id = aws_cognito_user_pool.turo_ezpass_users.id
}

# Random string for Cognito domain uniqueness
resource "random_string" "cognito_domain_suffix" {
  length  = 8
  special = false
  upper   = false
}

# API Gateway Cognito Authorizer
resource "aws_api_gateway_authorizer" "cognito_authorizer" {
  name                   = "${var.project_name}-${var.environment}-cognito-authorizer"
  rest_api_id           = aws_api_gateway_rest_api.trips_api.id
  identity_source       = "method.request.header.Authorization"
  type                  = "COGNITO_USER_POOLS"
  provider_arns         = [aws_cognito_user_pool.turo_ezpass_users.arn]
}

# Variables for Cognito configuration
variable "dashboard_url" {
  description = "URL of the dashboard for Cognito callbacks"
  type        = string
  default     = ""
}

# Outputs for Cognito configuration
output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.turo_ezpass_users.id
}

output "cognito_user_pool_arn" {
  description = "ARN of the Cognito User Pool"
  value       = aws_cognito_user_pool.turo_ezpass_users.arn
}

output "cognito_client_id" {
  description = "ID of the Cognito User Pool Client"
  value       = aws_cognito_user_pool_client.turo_ezpass_client.id
}

output "cognito_domain" {
  description = "Cognito User Pool Domain"
  value       = "https://${aws_cognito_user_pool_domain.turo_ezpass_domain.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "cognito_config" {
  description = "Cognito configuration for the frontend"
  value = {
    userPoolId      = aws_cognito_user_pool.turo_ezpass_users.id
    userPoolWebClientId = aws_cognito_user_pool_client.turo_ezpass_client.id
    region         = var.aws_region
    domain         = aws_cognito_user_pool_domain.turo_ezpass_domain.domain
  }
  sensitive = false
}