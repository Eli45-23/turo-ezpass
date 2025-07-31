# DNS & HTTPS Configuration Guide

## Overview
This guide covers setting up custom domains with HTTPS for your Turo-EZPass dashboard system.

## 🌐 Domain Setup Options

### Option 1: With Route53 Managed Domain
If your domain is managed by Route53, DNS records will be created automatically.

```bash
# Deploy with custom domain
cd api/terraform
terraform apply \
  -var="domain_name=turo-ezpass.com" \
  -var="dashboard_subdomain=dashboard" \
  -var="api_subdomain=api" \
  -var="create_dns_records=true"
```

### Option 2: External DNS Provider
If your domain is managed elsewhere, you'll need to manually create DNS records.

```bash
# Deploy without automatic DNS creation
cd api/terraform
terraform apply \
  -var="domain_name=turo-ezpass.com" \
  -var="dashboard_subdomain=dashboard" \
  -var="api_subdomain=api" \
  -var="create_dns_records=false"

# Get DNS validation records
terraform output dns_validation_instructions
```

## 📋 Manual DNS Records (External Provider)

If using external DNS, add these records to your domain registrar:

### ACM Certificate Validation Records
```
# Example records (actual values from terraform output)
_acme-challenge.dashboard.turo-ezpass.com  CNAME  _12345.acm-validations.aws.
_acme-challenge.api.turo-ezpass.com        CNAME  _67890.acm-validations.aws.
_acme-challenge.turo-ezpass.com            CNAME  _abcde.acm-validations.aws.
```

### Application DNS Records
```
# Dashboard - CloudFront distribution
dashboard.turo-ezpass.com  A      ALIAS  d123456789.cloudfront.net
dashboard.turo-ezpass.com  AAAA   ALIAS  d123456789.cloudfront.net

# API - API Gateway custom domain
api.turo-ezpass.com        A      ALIAS  d987654321.cloudfront.net
```

## 🔧 Terraform Configuration Examples

### Basic Custom Domain Setup
```hcl
# terraform.tfvars
domain_name         = "turo-ezpass.com"
dashboard_subdomain = "dashboard"
api_subdomain      = "api"
create_dns_records = true  # Set to false for external DNS

project_name    = "turo-ezpass"
environment     = "prod"
alert_email     = "admin@turo-ezpass.com"
```

### Advanced Configuration with Multiple Environments
```hcl
# Production
domain_name         = "turo-ezpass.com"
dashboard_subdomain = "dashboard"
api_subdomain      = "api"
environment        = "prod"

# Staging
domain_name         = "staging.turo-ezpass.com"
dashboard_subdomain = "dashboard"
api_subdomain      = "api"
environment        = "staging"
```

## 🛡️ SSL/TLS Certificate Details

### Certificate Configuration
- **Provider**: AWS Certificate Manager (ACM)
- **Validation**: DNS validation (recommended)
- **Domains Covered**:
  - `dashboard.turo-ezpass.com`
  - `api.turo-ezpass.com`
  - `*.turo-ezpass.com` (wildcard for future use)

### Security Features
- **TLS Version**: Minimum TLS 1.2
- **Cipher Suites**: Modern cipher suites only
- **HSTS**: Enabled with 1-year max-age
- **Certificate Transparency**: Automatically enabled

## 📱 Application Updates for Custom Domain

### Dashboard Environment Variables
```bash
# dashboard/.env.production
NEXT_PUBLIC_API_URL=https://api.turo-ezpass.com
NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.turo-ezpass.com
```

### CORS Configuration Update
```hcl
# api/terraform/variables.tf
variable "cors_allowed_origins" {
  description = "List of allowed CORS origins"
  type        = list(string)
  default     = [
    "https://dashboard.turo-ezpass.com",
    "https://localhost:3000"  # For development
  ]
}
```

## 🚀 Deployment Sequence

### 1. Certificate Creation and Validation
```bash
# Deploy infrastructure with domain configuration
cd api/terraform
terraform apply -target=aws_acm_certificate.dashboard_cert
terraform apply -target=aws_route53_record.cert_validation

# Wait for certificate validation (usually 5-10 minutes)
aws acm describe-certificate --certificate-arn $(terraform output -raw certificate_arn)
```

### 2. CloudFront and API Gateway Setup
```bash
# Deploy remaining infrastructure
terraform apply

# Verify CloudFront distribution
aws cloudfront get-distribution --id $(terraform output -raw cloudfront_distribution_id)
```

### 3. DNS Propagation Verification
```bash
# Check DNS propagation
dig dashboard.turo-ezpass.com
dig api.turo-ezpass.com

# Test HTTPS connectivity
curl -I https://dashboard.turo-ezpass.com
curl -I https://api.turo-ezpass.com/trips?userId=test
```

## 🔍 Verification & Testing

### SSL/TLS Testing
```bash
# Test SSL configuration
echo | openssl s_client -connect dashboard.turo-ezpass.com:443 -servername dashboard.turo-ezpass.com 2>/dev/null | openssl x509 -noout -dates

# Check SSL rating (external tool)
curl -s "https://api.ssllabs.com/api/v3/analyze?host=dashboard.turo-ezpass.com"
```

### Security Headers Verification
```bash
# Check security headers
curl -I https://dashboard.turo-ezpass.com

# Expected headers:
# Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# Referrer-Policy: strict-origin-when-cross-origin
```

### Performance Testing
```bash
# Test CDN performance
curl -w "@curl-format.txt" -o /dev/null -s https://dashboard.turo-ezpass.com

# curl-format.txt content:
#     time_namelookup:  %{time_namelookup}\n
#        time_connect:  %{time_connect}\n
#     time_appconnect:  %{time_appconnect}\n
#    time_pretransfer:  %{time_pretransfer}\n
#       time_redirect:  %{time_redirect}\n
#  time_starttransfer:  %{time_starttransfer}\n
#                     ----------\n
#          time_total:  %{time_total}\n
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Certificate Validation Timeout
**Problem**: ACM certificate stuck in "Pending validation"
**Solution**:
```bash
# Check DNS records
aws route53 list-resource-record-sets --hosted-zone-id Z123456789
# Verify CNAME records match ACM requirements
aws acm describe-certificate --certificate-arn arn:aws:acm:...
```

#### 2. CloudFront Distribution Not Using Custom Domain
**Problem**: Distribution accessible via CloudFront domain but not custom domain
**Solution**:
```bash
# Check certificate attachment
aws cloudfront get-distribution-config --id E123456789
# Verify viewer certificate configuration
```

#### 3. API Gateway Custom Domain Issues
**Problem**: API not accessible via custom domain
**Solution**:
```bash
# Check domain name configuration
aws apigateway get-domain-name --domain-name api.turo-ezpass.com
# Verify base path mapping
aws apigateway get-base-path-mappings --domain-name api.turo-ezpass.com
```

#### 4. DNS Propagation Delays
**Problem**: DNS changes not visible globally
**Solution**:
```bash
# Check propagation status
dig @8.8.8.8 dashboard.turo-ezpass.com
dig @1.1.1.1 dashboard.turo-ezpass.com
# Wait up to 48 hours for full propagation
```

## 💰 Cost Considerations

### ACM Certificates
- **Public certificates**: Free
- **Private certificates**: $400/month (not needed for this setup)

### Route53 Costs
- **Hosted zone**: $0.50/month
- **DNS queries**: $0.40 per million queries
- **Health checks**: $0.50/month each (if used)

### CloudFront Additional Costs
- **Custom SSL certificate**: No additional cost with ACM
- **Request costs**: Same as standard distribution
- **Data transfer**: Standard CloudFront pricing

## 🔄 Domain Migration

### Changing Domains
```bash
# 1. Update Terraform variables
# 2. Create new certificate
terraform apply -target=aws_acm_certificate.dashboard_cert

# 3. Update CloudFront and API Gateway
terraform apply

# 4. Update application configuration
# 5. Update DNS records
# 6. Test new domain
# 7. Redirect old domain (optional)
```

### Zero-Downtime Migration
1. Create new certificate and resources
2. Test new domain alongside old domain
3. Update DNS records
4. Monitor for 24-48 hours
5. Remove old resources

---

## 📞 Support

For domain and certificate issues:
1. Check AWS ACM console for certificate status
2. Verify DNS records in Route53 or your DNS provider
3. Test SSL configuration with online tools
4. Monitor CloudWatch logs for errors