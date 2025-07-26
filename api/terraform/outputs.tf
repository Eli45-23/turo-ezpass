# Outputs for the Turo-E-Pass API infrastructure

output "api_gateway_url" {
  description = "URL of the API Gateway deployment"
  value       = "https://${aws_api_gateway_rest_api.trips_api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}"
}

output "api_gateway_id" {
  description = "ID of the API Gateway REST API"
  value       = aws_api_gateway_rest_api.trips_api.id
}

output "lambda_function_name" {
  description = "Name of the trips API Lambda function"
  value       = aws_lambda_function.trips_api.function_name
}

output "lambda_function_arn" {
  description = "ARN of the trips API Lambda function"
  value       = aws_lambda_function.trips_api.arn
}

output "lambda_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.trips_api_lambda_role.arn
}

output "api_endpoints" {
  description = "Available API endpoints"
  value = {
    list_trips = "GET ${aws_api_gateway_rest_api.trips_api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}/trips?userId={userId}"
    get_trip   = "GET ${aws_api_gateway_rest_api.trips_api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}/trips/{userId}/{scrapeDate}"
  }
}