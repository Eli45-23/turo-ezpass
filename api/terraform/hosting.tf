# S3 bucket for hosting the React app
resource "aws_s3_bucket" "dashboard_hosting" {
  bucket = "${var.project_name}-${var.environment}-dashboard-${random_string.bucket_suffix.result}"

  tags = {
    Name        = "${var.project_name}-dashboard-hosting"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Random string for bucket naming to ensure uniqueness
resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

# S3 bucket versioning
resource "aws_s3_bucket_versioning" "dashboard_versioning" {
  bucket = aws_s3_bucket.dashboard_hosting.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 bucket server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "dashboard_encryption" {
  bucket = aws_s3_bucket.dashboard_hosting.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 bucket public access block
resource "aws_s3_bucket_public_access_block" "dashboard_pab" {
  bucket = aws_s3_bucket.dashboard_hosting.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# S3 bucket website configuration
resource "aws_s3_bucket_website_configuration" "dashboard_website" {
  bucket = aws_s3_bucket.dashboard_hosting.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html" # SPA routing fallback
  }
}

# S3 bucket policy for CloudFront access
resource "aws_s3_bucket_policy" "dashboard_policy" {
  bucket = aws_s3_bucket.dashboard_hosting.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.dashboard_hosting.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.dashboard_distribution.arn
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.dashboard_pab]
}

# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "dashboard_oac" {
  name                              = "${var.project_name}-${var.environment}-dashboard-oac"
  description                       = "OAC for Turo-E-Pass dashboard"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront distribution
resource "aws_cloudfront_distribution" "dashboard_distribution" {
  origin {
    domain_name              = aws_s3_bucket.dashboard_hosting.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.dashboard_hosting.bucket}"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard_oac.id
  }

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Turo-E-Pass Dashboard Distribution"
  default_root_object = "index.html"

  # Cache behavior for the default path
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.dashboard_hosting.bucket}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400

    compress = true
  }

  # Cache behavior for static assets
  ordered_cache_behavior {
    path_pattern     = "/static/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "S3-${aws_s3_bucket.dashboard_hosting.bucket}"

    forwarded_values {
      query_string = false
      headers      = ["Origin"]
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000

    compress = true
  }

  # Cache behavior for API calls (no caching)
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.dashboard_hosting.bucket}"

    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0

    compress = true
  }

  # Geographic restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL/TLS certificate
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  # Custom error pages for SPA routing
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  tags = {
    Name        = "${var.project_name}-dashboard-distribution"
    Project     = var.project_name
    Environment = var.environment
  }
}

# CloudWatch log group for CloudFront access logs (optional)
resource "aws_cloudwatch_log_group" "cloudfront_logs" {
  name              = "/aws/cloudfront/${var.project_name}-${var.environment}-dashboard"
  retention_in_days = 30

  tags = {
    Name        = "${var.project_name}-cloudfront-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Output values for hosting infrastructure
output "s3_bucket_name" {
  description = "Name of the S3 bucket hosting the dashboard"
  value       = aws_s3_bucket.dashboard_hosting.bucket
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket hosting the dashboard"
  value       = aws_s3_bucket.dashboard_hosting.arn
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.dashboard_distribution.id
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.dashboard_distribution.domain_name
}

output "dashboard_url" {
  description = "URL of the hosted dashboard"
  value       = "https://${aws_cloudfront_distribution.dashboard_distribution.domain_name}"
}