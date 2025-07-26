# DNS & HTTPS Configuration for Turo-EZPass Dashboard
# This file sets up custom domain with ACM certificate and Route53 DNS

# Variables for domain configuration
variable "domain_name" {
  description = "Root domain name (e.g., turo-ezpass.com)"
  type        = string
  default     = ""
}

variable "dashboard_subdomain" {
  description = "Subdomain for dashboard (e.g., dashboard)"
  type        = string
  default     = "dashboard"
}

variable "api_subdomain" {
  description = "Subdomain for API (e.g., api)"
  type        = string
  default     = "api"
}

variable "create_dns_records" {
  description = "Whether to create Route53 DNS records (requires hosted zone)"
  type        = bool
  default     = false
}

# Local values for domain construction
locals {
  dashboard_domain = var.domain_name != "" ? "${var.dashboard_subdomain}.${var.domain_name}" : ""
  api_domain       = var.domain_name != "" ? "${var.api_subdomain}.${var.domain_name}" : ""
  use_custom_domain = var.domain_name != ""
}

# Data source for existing Route53 hosted zone
data "aws_route53_zone" "main" {
  count = local.use_custom_domain && var.create_dns_records ? 1 : 0
  name  = var.domain_name
}

# ACM Certificate for dashboard domain
resource "aws_acm_certificate" "dashboard_cert" {
  count             = local.use_custom_domain ? 1 : 0
  domain_name       = local.dashboard_domain
  validation_method = "DNS"

  subject_alternative_names = [
    local.api_domain,
    "*.${var.domain_name}"  # Wildcard for future subdomains
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-cert"
    Project     = var.project_name
    Environment = var.environment
    Domain      = local.dashboard_domain
  }
}

# DNS validation records for ACM certificate
resource "aws_route53_record" "cert_validation" {
  for_each = local.use_custom_domain && var.create_dns_records ? {
    for dvo in aws_acm_certificate.dashboard_cert[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main[0].zone_id
}

# ACM certificate validation
resource "aws_acm_certificate_validation" "dashboard_cert" {
  count           = local.use_custom_domain && var.create_dns_records ? 1 : 0
  certificate_arn = aws_acm_certificate.dashboard_cert[0].arn
  validation_record_fqdns = [
    for record in aws_route53_record.cert_validation : record.fqdn
  ]

  timeouts {
    create = "5m"
  }
}

# Update CloudFront distribution to use custom domain
resource "aws_cloudfront_distribution" "dashboard_distribution_custom" {
  count = local.use_custom_domain ? 1 : 0
  
  origin {
    domain_name              = aws_s3_bucket.dashboard_hosting.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.dashboard_hosting.bucket}"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard_oac.id
  }

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Turo-E-Pass Dashboard Distribution (Custom Domain)"
  default_root_object = "index.html"

  # Custom domain configuration
  aliases = [local.dashboard_domain]

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
    compress               = true
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
    compress               = true
  }

  # Geographic restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL/TLS certificate configuration
  viewer_certificate {
    acm_certificate_arn      = var.create_dns_records ? aws_acm_certificate_validation.dashboard_cert[0].certificate_arn : aws_acm_certificate.dashboard_cert[0].arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
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

  # Security headers
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 300
  }

  tags = {
    Name        = "${var.project_name}-dashboard-distribution-custom"
    Project     = var.project_name
    Environment = var.environment
    Domain      = local.dashboard_domain
  }

  depends_on = [aws_acm_certificate.dashboard_cert]
}

# Custom domain for API Gateway
resource "aws_api_gateway_domain_name" "api_domain" {
  count           = local.use_custom_domain ? 1 : 0
  domain_name     = local.api_domain
  certificate_arn = var.create_dns_records ? aws_acm_certificate_validation.dashboard_cert[0].certificate_arn : aws_acm_certificate.dashboard_cert[0].arn

  security_policy = "TLS_1_2"

  tags = {
    Name        = "${var.project_name}-api-domain"
    Project     = var.project_name
    Environment = var.environment
  }
}

# API Gateway base path mapping
resource "aws_api_gateway_base_path_mapping" "api_mapping" {
  count       = local.use_custom_domain ? 1 : 0
  api_id      = aws_api_gateway_rest_api.trips_api.id
  stage_name  = aws_api_gateway_deployment.trips_api_deployment.stage_name
  domain_name = aws_api_gateway_domain_name.api_domain[0].domain_name
}

# Route53 DNS records
resource "aws_route53_record" "dashboard_dns" {
  count   = local.use_custom_domain && var.create_dns_records ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = local.dashboard_domain
  type    = "A"

  alias {
    name                   = local.use_custom_domain ? aws_cloudfront_distribution.dashboard_distribution_custom[0].domain_name : aws_cloudfront_distribution.dashboard_distribution.domain_name
    zone_id                = local.use_custom_domain ? aws_cloudfront_distribution.dashboard_distribution_custom[0].hosted_zone_id : aws_cloudfront_distribution.dashboard_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_dns" {
  count   = local.use_custom_domain && var.create_dns_records ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_api_gateway_domain_name.api_domain[0].cloudfront_domain_name
    zone_id                = aws_api_gateway_domain_name.api_domain[0].cloudfront_zone_id
    evaluate_target_health = false
  }
}

# AAAA records for IPv6 support
resource "aws_route53_record" "dashboard_dns_ipv6" {
  count   = local.use_custom_domain && var.create_dns_records ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = local.dashboard_domain
  type    = "AAAA"

  alias {
    name                   = local.use_custom_domain ? aws_cloudfront_distribution.dashboard_distribution_custom[0].domain_name : aws_cloudfront_distribution.dashboard_distribution.domain_name
    zone_id                = local.use_custom_domain ? aws_cloudfront_distribution.dashboard_distribution_custom[0].hosted_zone_id : aws_cloudfront_distribution.dashboard_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

# Output values for DNS configuration
output "dashboard_domain" {
  description = "Custom domain for dashboard"
  value       = local.use_custom_domain ? local.dashboard_domain : null
}

output "api_domain" {
  description = "Custom domain for API"
  value       = local.use_custom_domain ? local.api_domain : null
}

output "dashboard_url_custom" {
  description = "Dashboard URL with custom domain"
  value       = local.use_custom_domain ? "https://${local.dashboard_domain}" : null
}

output "api_url_custom" {
  description = "API URL with custom domain"
  value       = local.use_custom_domain ? "https://${local.api_domain}" : null
}

output "certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = local.use_custom_domain ? (var.create_dns_records ? aws_acm_certificate_validation.dashboard_cert[0].certificate_arn : aws_acm_certificate.dashboard_cert[0].arn) : null
}

output "dns_validation_instructions" {
  description = "Instructions for manual DNS validation if Route53 is not used"
  value = local.use_custom_domain && !var.create_dns_records ? {
    message = "Add these DNS records to your domain registrar:"
    records = [
      for dvo in aws_acm_certificate.dashboard_cert[0].domain_validation_options : {
        name  = dvo.resource_record_name
        type  = dvo.resource_record_type
        value = dvo.resource_record_value
      }
    ]
  } : null
}

# Security headers for CloudFront (Response Headers Policy)
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  count = local.use_custom_domain ? 1 : 0
  name  = "${var.project_name}-${var.environment}-security-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                   = true
      override                  = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override       = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "geolocation=(), microphone=(), camera=()"
      override = true
    }
  }
}

# This resource is commented out to avoid conflicts - we'll use the existing dashboard_distribution_custom
# with the security headers policy when needed