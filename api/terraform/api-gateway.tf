# API Gateway REST API
resource "aws_api_gateway_rest_api" "trips_api" {
  name        = "${var.project_name}-${var.environment}-trips-api"
  description = "REST API for Turo-E-Pass trips data"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name        = "${var.project_name}-trips-api"
    Project     = var.project_name
    Environment = var.environment
  }
}

# API Gateway deployment
resource "aws_api_gateway_deployment" "trips_api_deployment" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  stage_name  = var.environment

  depends_on = [
    aws_api_gateway_method.trips_list_method,
    aws_api_gateway_method.trips_get_method,
    aws_api_gateway_method.trips_options_method,
    aws_api_gateway_method.trips_item_options_method,
    aws_api_gateway_method.scrape_post_method,
    aws_api_gateway_method.scrape_options_method,
    aws_api_gateway_integration.trips_list_integration,
    aws_api_gateway_integration.trips_get_integration,
    aws_api_gateway_integration.trips_options_integration,
    aws_api_gateway_integration.trips_item_options_integration,
    aws_api_gateway_integration.scrape_post_integration,
    aws_api_gateway_integration.scrape_options_integration
  ]

  lifecycle {
    create_before_destroy = true
  }

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.trips_resource.id,
      aws_api_gateway_resource.trips_item_resource.id,
      aws_api_gateway_resource.scrape_resource.id,
      aws_api_gateway_method.trips_list_method.id,
      aws_api_gateway_method.trips_get_method.id,
      aws_api_gateway_method.scrape_post_method.id,
      aws_api_gateway_integration.trips_list_integration.id,
      aws_api_gateway_integration.trips_get_integration.id,
      aws_api_gateway_integration.scrape_post_integration.id,
    ]))
  }
}

# /trips resource
resource "aws_api_gateway_resource" "trips_resource" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  parent_id   = aws_api_gateway_rest_api.trips_api.root_resource_id
  path_part   = "trips"
}

# /trips/{userId} resource
resource "aws_api_gateway_resource" "trips_user_resource" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  parent_id   = aws_api_gateway_resource.trips_resource.id
  path_part   = "{userId}"
}

# /trips/{userId}/{scrapeDate} resource
resource "aws_api_gateway_resource" "trips_item_resource" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  parent_id   = aws_api_gateway_resource.trips_user_resource.id
  path_part   = "{scrapeDate}"
}

# GET /trips?userId={userId} method
resource "aws_api_gateway_method" "trips_list_method" {
  rest_api_id   = aws_api_gateway_rest_api.trips_api.id
  resource_id   = aws_api_gateway_resource.trips_resource.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.querystring.userId" = true
  }
}

# GET /trips/{userId}/{scrapeDate} method
resource "aws_api_gateway_method" "trips_get_method" {
  rest_api_id   = aws_api_gateway_rest_api.trips_api.id
  resource_id   = aws_api_gateway_resource.trips_item_resource.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.userId"     = true
    "method.request.path.scrapeDate" = true
  }
}

# OPTIONS /trips method for CORS
resource "aws_api_gateway_method" "trips_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.trips_api.id
  resource_id   = aws_api_gateway_resource.trips_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# OPTIONS /trips/{userId}/{scrapeDate} method for CORS
resource "aws_api_gateway_method" "trips_item_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.trips_api.id
  resource_id   = aws_api_gateway_resource.trips_item_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# Lambda integration for GET /trips
resource "aws_api_gateway_integration" "trips_list_integration" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_resource.id
  http_method = aws_api_gateway_method.trips_list_method.http_method

  integration_http_method = "POST"
  type                   = "AWS_PROXY"
  uri                    = aws_lambda_function.trips_api.invoke_arn
}

# Lambda integration for GET /trips/{userId}/{scrapeDate}
resource "aws_api_gateway_integration" "trips_get_integration" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_item_resource.id
  http_method = aws_api_gateway_method.trips_get_method.http_method

  integration_http_method = "POST"
  type                   = "AWS_PROXY"
  uri                    = aws_lambda_function.trips_api.invoke_arn
}

# Mock integration for OPTIONS /trips (CORS)
resource "aws_api_gateway_integration" "trips_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_resource.id
  http_method = aws_api_gateway_method.trips_options_method.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

# Mock integration for OPTIONS /trips/{userId}/{scrapeDate} (CORS)
resource "aws_api_gateway_integration" "trips_item_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_item_resource.id
  http_method = aws_api_gateway_method.trips_item_options_method.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

# Method response for GET /trips
resource "aws_api_gateway_method_response" "trips_list_response_200" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_resource.id
  http_method = aws_api_gateway_method.trips_list_method.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Method response for GET /trips/{userId}/{scrapeDate}
resource "aws_api_gateway_method_response" "trips_get_response_200" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_item_resource.id
  http_method = aws_api_gateway_method.trips_get_method.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Method response for OPTIONS /trips
resource "aws_api_gateway_method_response" "trips_options_response_200" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_resource.id
  http_method = aws_api_gateway_method.trips_options_method.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Method response for OPTIONS /trips/{userId}/{scrapeDate}
resource "aws_api_gateway_method_response" "trips_item_options_response_200" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_item_resource.id
  http_method = aws_api_gateway_method.trips_item_options_method.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Integration response for OPTIONS /trips
resource "aws_api_gateway_integration_response" "trips_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_resource.id
  http_method = aws_api_gateway_method.trips_options_method.http_method
  status_code = aws_api_gateway_method_response.trips_options_response_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
  }

  depends_on = [aws_api_gateway_integration.trips_options_integration]
}

# Integration response for OPTIONS /trips/{userId}/{scrapeDate}
resource "aws_api_gateway_integration_response" "trips_item_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.trips_item_resource.id
  http_method = aws_api_gateway_method.trips_item_options_method.http_method
  status_code = aws_api_gateway_method_response.trips_item_options_response_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
  }

  depends_on = [aws_api_gateway_integration.trips_item_options_integration]
}

# /scrape resource
resource "aws_api_gateway_resource" "scrape_resource" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  parent_id   = aws_api_gateway_rest_api.trips_api.root_resource_id
  path_part   = "scrape"
}

# POST /scrape method
resource "aws_api_gateway_method" "scrape_post_method" {
  rest_api_id   = aws_api_gateway_rest_api.trips_api.id
  resource_id   = aws_api_gateway_resource.scrape_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /scrape method for CORS
resource "aws_api_gateway_method" "scrape_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.trips_api.id
  resource_id   = aws_api_gateway_resource.scrape_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# Lambda integration for POST /scrape
resource "aws_api_gateway_integration" "scrape_post_integration" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.scrape_resource.id
  http_method = aws_api_gateway_method.scrape_post_method.http_method

  integration_http_method = "POST"
  type                   = "AWS_PROXY"
  uri                    = aws_lambda_function.trips_api.invoke_arn
}

# Mock integration for OPTIONS /scrape (CORS)
resource "aws_api_gateway_integration" "scrape_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.scrape_resource.id
  http_method = aws_api_gateway_method.scrape_options_method.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

# Method response for POST /scrape
resource "aws_api_gateway_method_response" "scrape_post_response_200" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.scrape_resource.id
  http_method = aws_api_gateway_method.scrape_post_method.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Method response for OPTIONS /scrape
resource "aws_api_gateway_method_response" "scrape_options_response_200" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.scrape_resource.id
  http_method = aws_api_gateway_method.scrape_options_method.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Integration response for OPTIONS /scrape
resource "aws_api_gateway_integration_response" "scrape_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.trips_api.id
  resource_id = aws_api_gateway_resource.scrape_resource.id
  http_method = aws_api_gateway_method.scrape_options_method.http_method
  status_code = aws_api_gateway_method_response.scrape_options_response_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
  }

  depends_on = [aws_api_gateway_integration.scrape_options_integration]
}