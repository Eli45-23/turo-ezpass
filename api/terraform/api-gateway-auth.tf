# Variable to enable/disable Cognito authentication
variable "enable_cognito_auth" {
  description = "Enable Cognito authentication for API Gateway"
  type        = bool
  default     = false
}

# Authenticated versions of API Gateway methods (optional)
# These will be created only if Cognito authentication is enabled

# GET /trips?userId={userId} method with Cognito auth
resource "aws_api_gateway_method" "trips_list_method_auth" {
  count = var.enable_cognito_auth ? 1 : 0
  
  rest_api_id   = aws_api_gateway_rest_api.trips_api.id
  resource_id   = aws_api_gateway_resource.trips_resource.id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito_authorizer.id

  request_parameters = {
    "method.request.querystring.userId" = false # Make optional when authenticated
  }
}

# GET /trips/{userId}/{scrapeDate} method with Cognito auth
resource "aws_api_gateway_method" "trips_get_method_auth" {
  count = var.enable_cognito_auth ? 1 : 0
  
  rest_api_id   = aws_api_gateway_rest_api.trips_api.id
  resource_id   = aws_api_gateway_resource.trips_item_resource.id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito_authorizer.id

  request_parameters = {
    "method.request.path.userId"     = true
    "method.request.path.scrapeDate" = true
  }
}

# Lambda integrations for authenticated methods
resource "aws_api_gateway_integration" "trips_list_integration_auth" {
  count = var.enable_cognito_auth ? 1 : 0
  
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_resource.id
  http_method = aws_api_gateway_method.trips_list_method_auth[0].http_method

  integration_http_method = "POST"
  type                   = "AWS_PROXY"
  uri                    = aws_lambda_function.trips_api.invoke_arn
}

resource "aws_api_gateway_integration" "trips_get_integration_auth" {
  count = var.enable_cognito_auth ? 1 : 0
  
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_item_resource.id
  http_method = aws_api_gateway_method.trips_get_method_auth[0].http_method

  integration_http_method = "POST"
  type                   = "AWS_PROXY"
  uri                    = aws_lambda_function.trips_api.invoke_arn
}

# Method responses for authenticated endpoints
resource "aws_api_gateway_method_response" "trips_list_response_200_auth" {
  count = var.enable_cognito_auth ? 1 : 0
  
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_resource.id
  http_method = aws_api_gateway_method.trips_list_method_auth[0].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_method_response" "trips_get_response_200_auth" {
  count = var.enable_cognito_auth ? 1 : 0
  
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_item_resource.id
  http_method = aws_api_gateway_method.trips_get_method_auth[0].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Update deployment to include auth methods if enabled
resource "aws_api_gateway_deployment" "trips_api_deployment_with_auth" {
  count = var.enable_cognito_auth ? 1 : 0
  
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  stage_name  = "${var.environment}-auth"

  depends_on = [
    aws_api_gateway_method.trips_list_method_auth,
    aws_api_gateway_method.trips_get_method_auth,
    aws_api_gateway_integration.trips_list_integration_auth,
    aws_api_gateway_integration.trips_get_integration_auth
  ]

  lifecycle {
    create_before_destroy = true
  }

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_method.trips_list_method_auth,
      aws_api_gateway_method.trips_get_method_auth,
      aws_api_gateway_integration.trips_list_integration_auth,
      aws_api_gateway_integration.trips_get_integration_auth,
    ]))
  }
}

# Output authenticated API URL
output "api_gateway_auth_url" {
  description = "URL of the authenticated API Gateway deployment"
  value       = var.enable_cognito_auth ? "https://${aws_api_gateway_rest_api.trips_api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}-auth" : null
}