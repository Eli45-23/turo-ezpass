# IAM role for the Trips API Lambda function
resource "aws_iam_role" "trips_api_lambda_role" {
  name = "${var.project_name}-${var.environment}-trips-api-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-trips-api-lambda-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

# IAM policy for DynamoDB read access
resource "aws_iam_policy" "trips_api_dynamodb_policy" {
  name        = "${var.project_name}-${var.environment}-trips-api-dynamodb-policy"
  description = "Policy for Trips API Lambda to read from DynamoDB"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:GetItem"
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:*:table/${var.dynamodb_table_name}"
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-trips-api-dynamodb-policy"
    Project     = var.project_name
    Environment = var.environment
  }
}

# IAM policy for EventBridge access
resource "aws_iam_policy" "trips_api_eventbridge_policy" {
  name        = "${var.project_name}-${var.environment}-trips-api-eventbridge-policy"
  description = "Policy for Trips API Lambda to trigger EventBridge events"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "events:PutEvents"
        ]
        Resource = "arn:aws:events:${var.aws_region}:*:event-bus/default"
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-trips-api-eventbridge-policy"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Attach DynamoDB policy to Lambda role
resource "aws_iam_role_policy_attachment" "trips_api_dynamodb_policy_attachment" {
  role       = aws_iam_role.trips_api_lambda_role.name
  policy_arn = aws_iam_policy.trips_api_dynamodb_policy.arn
}

# Attach EventBridge policy to Lambda role
resource "aws_iam_role_policy_attachment" "trips_api_eventbridge_policy_attachment" {
  role       = aws_iam_role.trips_api_lambda_role.name
  policy_arn = aws_iam_policy.trips_api_eventbridge_policy.arn
}

# Attach basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "trips_api_lambda_basic_policy" {
  role       = aws_iam_role.trips_api_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# CloudWatch Log Group for Lambda function
resource "aws_cloudwatch_log_group" "trips_api_lambda_logs" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-trips-api"
  retention_in_days = 14

  tags = {
    Name        = "${var.project_name}-trips-api-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Archive Lambda function code
data "archive_file" "trips_api_lambda_zip" {
  type        = "zip"
  source_dir  = "../lambdas/trips-api/dist"
  output_path = "../lambdas/trips-api/function.zip"
  depends_on  = [null_resource.build_trips_api_lambda]
}

# Build Lambda function
resource "null_resource" "build_trips_api_lambda" {
  provisioner "local-exec" {
    command = "cd ../lambdas/trips-api && npm install && npm run build"
  }

  triggers = {
    # Rebuild when source files change
    handler_hash = filemd5("../lambdas/trips-api/src/handler.ts")
    types_hash   = filemd5("../lambdas/trips-api/src/types.ts")
    package_hash = filemd5("../lambdas/trips-api/package.json")
  }
}

# Trips API Lambda function
resource "aws_lambda_function" "trips_api" {
  filename         = data.archive_file.trips_api_lambda_zip.output_path
  function_name    = "${var.project_name}-${var.environment}-trips-api"
  role            = aws_iam_role.trips_api_lambda_role.arn
  handler         = "handler.handler"
  runtime         = "nodejs18.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size

  source_code_hash = data.archive_file.trips_api_lambda_zip.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = var.dynamodb_table_name
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.trips_api_lambda_logs,
    aws_iam_role_policy_attachment.trips_api_lambda_basic_policy,
    aws_iam_role_policy_attachment.trips_api_dynamodb_policy_attachment
  ]

  tags = {
    Name        = "${var.project_name}-trips-api"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "trips_api_gateway_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.trips_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.trips_api.execution_arn}/*/*"
}