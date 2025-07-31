# DynamoDB table for storing E-ZPass and Turo scraper results

resource "aws_dynamodb_table" "turo_ezpass_trips" {
  name           = "turo_ezpass_trips"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"
  range_key      = "scrapeDate"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "scrapeDate"
    type = "S"
  }

  tags = {
    Name        = "turo-ezpass-trips"
    Project     = "turo-ezpass"
    Environment = var.environment
  }

  # Enable point-in-time recovery for data protection
  point_in_time_recovery {
    enabled = true
  }

  # Optional: Add a TTL attribute for automatic cleanup (uncomment if needed)
  # ttl {
  #   attribute_name = "ttl"
  #   enabled        = true
  # }
}

# Output the table name for reference
output "dynamodb_table_name" {
  description = "Name of the DynamoDB table for trip data"
  value       = aws_dynamodb_table.turo_ezpass_trips.name
}

output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB table for trip data"
  value       = aws_dynamodb_table.turo_ezpass_trips.arn
}