# SSM Parameter Store Configuration for Turo-EZPass
# Stores shared configuration and secrets for the application

# Application configuration parameters
resource "aws_ssm_parameter" "app_config" {
  for_each = {
    "api-url"           = aws_api_gateway_rest_api.trips_api.execution_arn
    "dynamodb-table"    = var.dynamodb_table_name
    "aws-region"        = var.aws_region
    "environment"       = var.environment
    "project-name"      = var.project_name
  }

  name  = "/turo-ezpass/${var.environment}/config/${each.key}"
  type  = "String"
  value = each.value

  tags = {
    Name        = "${var.project_name}-${each.key}-config"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Cognito configuration (if enabled)
resource "aws_ssm_parameter" "cognito_config" {
  count = var.enable_cognito_auth ? 1 : 0
  
  name  = "/turo-ezpass/${var.environment}/cognito/config"
  type  = "String"
  value = jsonencode({
    userPoolId         = aws_cognito_user_pool.turo_ezpass_users.id
    userPoolWebClientId = aws_cognito_user_pool_client.turo_ezpass_client.id
    region            = var.aws_region
    domain            = aws_cognito_user_pool_domain.turo_ezpass_domain.domain
    identityPoolId    = null  # Add if using identity pool
  })

  tags = {
    Name        = "${var.project_name}-cognito-config"
    Project     = var.project_name
    Environment = var.environment
  }
}

# API Gateway URLs
resource "aws_ssm_parameter" "api_urls" {
  for_each = {
    "public-api-url"  = "https://${aws_api_gateway_rest_api.trips_api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}"
    "auth-api-url"    = var.enable_cognito_auth ? "https://${aws_api_gateway_rest_api.trips_api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}-auth" : ""
  }

  name  = "/turo-ezpass/${var.environment}/api/${each.key}"
  type  = "String"
  value = each.value

  tags = {
    Name        = "${var.project_name}-${each.key}"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Infrastructure details
resource "aws_ssm_parameter" "infrastructure" {
  for_each = {
    "s3-bucket-name"        = aws_s3_bucket.dashboard_hosting.bucket
    "cloudfront-distribution-id" = aws_cloudfront_distribution.dashboard_distribution.id
    "cloudfront-domain"     = aws_cloudfront_distribution.dashboard_distribution.domain_name
    "sns-topic-arn"         = aws_sns_topic.alerts.arn
    "lambda-trips-api-arn"  = aws_lambda_function.trips_api.arn
    "lambda-analytics-arn"  = aws_lambda_function.analytics.arn
  }

  name  = "/turo-ezpass/${var.environment}/infrastructure/${each.key}"
  type  = "String"
  value = each.value

  tags = {
    Name        = "${var.project_name}-infra-${each.key}"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Custom domain configuration (if enabled)
resource "aws_ssm_parameter" "custom_domain_config" {
  count = local.use_custom_domain ? 1 : 0
  
  name  = "/turo-ezpass/${var.environment}/domain/config"
  type  = "String"
  value = jsonencode({
    domainName        = var.domain_name
    dashboardDomain   = local.dashboard_domain
    apiDomain         = local.api_domain
    certificateArn    = var.create_dns_records ? aws_acm_certificate_validation.dashboard_cert[0].certificate_arn : aws_acm_certificate.dashboard_cert[0].arn
    dashboardUrl      = "https://${local.dashboard_domain}"
    apiUrl           = "https://${local.api_domain}"
  })

  tags = {
    Name        = "${var.project_name}-domain-config"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Monitoring configuration
resource "aws_ssm_parameter" "monitoring_config" {
  name  = "/turo-ezpass/${var.environment}/monitoring/config"
  type  = "String"
  value = jsonencode({
    cloudwatchDashboard = aws_cloudwatch_dashboard.turo_ezpass.dashboard_name
    logGroups = [
      aws_cloudwatch_log_group.trips_api_lambda_logs.name,
      aws_cloudwatch_log_group.analytics_lambda_logs.name
    ]
    alarms = [
      aws_cloudwatch_metric_alarm.no_recent_scrapes.alarm_name,
      aws_cloudwatch_metric_alarm.low_success_rate.alarm_name,
      aws_cloudwatch_metric_alarm.lambda_errors.alarm_name,
      aws_cloudwatch_metric_alarm.api_gateway_errors.alarm_name
    ]
    snsTopicArn = aws_sns_topic.alerts.arn
  })

  tags = {
    Name        = "${var.project_name}-monitoring-config"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Feature flags and application settings
resource "aws_ssm_parameter" "feature_flags" {
  name  = "/turo-ezpass/${var.environment}/features/flags"
  type  = "String"
  value = jsonencode({
    cognitoAuthEnabled    = var.enable_cognito_auth
    customDomainEnabled   = local.use_custom_domain
    analyticsEnabled      = true
    alertingEnabled       = var.alert_email != ""
    debugLoggingEnabled   = var.environment != "prod"
    maintenanceMode       = false
  })

  tags = {
    Name        = "${var.project_name}-feature-flags"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Environment-specific configuration
resource "aws_ssm_parameter" "environment_config" {
  name  = "/turo-ezpass/${var.environment}/config/environment"
  type  = "String"
  value = jsonencode({
    environment           = var.environment
    lambdaTimeout        = var.lambda_timeout
    lambdaMemorySize     = var.lambda_memory_size
    corsAllowedOrigins   = var.cors_allowed_origins
    logRetentionDays     = 14
    backupRetentionDays  = 30
    costBudgetLimit      = var.environment == "prod" ? 50 : 20
  })

  tags = {
    Name        = "${var.project_name}-env-config"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Outputs for SSM parameter access
output "ssm_parameter_prefix" {
  description = "SSM parameter store prefix for this environment"
  value       = "/turo-ezpass/${var.environment}"
}

output "ssm_parameters" {
  description = "List of created SSM parameters"
  value = {
    config_parameters = [for k, v in aws_ssm_parameter.app_config : v.name]
    api_parameters   = [for k, v in aws_ssm_parameter.api_urls : v.name]
    infra_parameters = [for k, v in aws_ssm_parameter.infrastructure : v.name]
    monitoring_config = aws_ssm_parameter.monitoring_config.name
    feature_flags     = aws_ssm_parameter.feature_flags.name
    environment_config = aws_ssm_parameter.environment_config.name
    cognito_config    = var.enable_cognito_auth ? aws_ssm_parameter.cognito_config[0].name : null
    domain_config     = local.use_custom_domain ? aws_ssm_parameter.custom_domain_config[0].name : null
  }
}

# IAM policy for applications to read SSM parameters
resource "aws_iam_policy" "ssm_read_policy" {
  name        = "${var.project_name}-${var.environment}-ssm-read"
  description = "Policy to read SSM parameters for ${var.project_name}"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:*:parameter/turo-ezpass/${var.environment}/*"
        ]
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-ssm-read-policy"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Attach SSM read policy to Lambda roles
resource "aws_iam_role_policy_attachment" "trips_api_ssm_policy" {
  role       = aws_iam_role.trips_api_lambda_role.name
  policy_arn = aws_iam_policy.ssm_read_policy.arn
}

resource "aws_iam_role_policy_attachment" "analytics_ssm_policy" {
  role       = aws_iam_role.analytics_lambda_role.name
  policy_arn = aws_iam_policy.ssm_read_policy.arn
}