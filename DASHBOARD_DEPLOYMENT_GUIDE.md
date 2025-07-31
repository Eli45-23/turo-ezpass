# Turo-E-Pass Dashboard System Deployment Guide

## Overview

This guide covers the complete deployment of a production-ready dashboard system for your Turo-E-Pass scraper, including:

- REST API with AWS Lambda + API Gateway
- React/Next.js dashboard with data visualization
- S3 + CloudFront hosting
- AWS Cognito authentication (optional)
- Analytics and monitoring with CloudWatch
- CI/CD with GitHub Actions

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React App     │────│   API Gateway    │────│   Lambda API    │
│  (CloudFront)   │    │  (REST API)      │    │  (Trips Data)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌──────────────────┐             │
         └──────────────│  AWS Cognito     │             │
                        │ (Authentication) │             │
                        └──────────────────┘             │
                                                         │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Analytics      │────│   CloudWatch     │    │   DynamoDB      │
│   Lambda        │    │  (Metrics/Alarms)│    │ (Trip Records)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │
         │              ┌──────────────────┐
         └──────────────│      SNS         │
                        │   (Alerts)       │
                        └──────────────────┘
```

## Prerequisites

1. AWS CLI configured with appropriate permissions
2. Terraform >= 1.0 installed
3. Node.js >= 18 installed
4. GitHub repository with Actions enabled
5. Your existing DynamoDB table `turo_ezpass_trips`

## Deployment Steps

### 1. Deploy API Infrastructure

```bash
cd api/terraform

# Initialize Terraform
terraform init

# Review the plan
terraform plan \
  -var="project_name=turo-ezpass" \
  -var="environment=prod" \
  -var="dynamodb_table_name=turo_ezpass_trips" \
  -var="alert_email=your-email@example.com"

# Deploy
terraform apply \
  -var="project_name=turo-ezpass" \
  -var="environment=prod" \
  -var="dynamodb_table_name=turo_ezpass_trips" \
  -var="alert_email=your-email@example.com"
```

**Important**: Save the Terraform outputs, especially:
- `api_gateway_url` - Your API endpoint
- `s3_bucket_name` - For dashboard hosting
- `cloudfront_domain_name` - Your dashboard URL
- `cognito_config` - For authentication (if enabled)

### 2. Set Up GitHub Actions Secrets

Add these secrets to your GitHub repository:

1. **AWS_ROLE_ARN**: Your GitHub Actions IAM role ARN
2. **API_URL**: The API Gateway URL from Terraform output
3. **S3_BUCKET_NAME**: S3 bucket name for hosting
4. **CLOUDFRONT_DISTRIBUTION_ID**: CloudFront distribution ID

```bash
# Example commands (replace with your values)
gh secret set AWS_ROLE_ARN --body "arn:aws:iam::123456789012:role/github-actions-role"
gh secret set API_URL --body "https://abc123.execute-api.us-east-1.amazonaws.com/prod"
```

### 3. Enable Cognito Authentication (Optional)

To enable Cognito authentication, redeploy with:

```bash
terraform apply \
  -var="project_name=turo-ezpass" \
  -var="environment=prod" \
  -var="dynamodb_table_name=turo_ezpass_trips" \
  -var="alert_email=your-email@example.com" \
  -var="enable_cognito_auth=true" \
  -var="dashboard_url=https://your-cloudfront-domain.cloudfront.net"
```

Then update your dashboard environment variables:

```bash
# In dashboard/.env.production
NEXT_PUBLIC_API_URL=https://your-api-gateway-url/prod
NEXT_PUBLIC_API_AUTH_URL=https://your-api-gateway-url/prod-auth
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=your-client-id
NEXT_PUBLIC_AWS_REGION=us-east-1
NEXT_PUBLIC_COGNITO_DOMAIN=your-cognito-domain
```

### 4. Deploy Dashboard

The dashboard will be automatically deployed via GitHub Actions when you push to main. To deploy manually:

```bash
cd dashboard

# Install dependencies
npm install

# Build for production
npm run build

# Sync to S3 (replace with your bucket name)
aws s3 sync dist/ s3://your-bucket-name/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

## API Endpoints

### Public Endpoints (No Authentication)

- **GET** `/trips?userId={userId}` - List trips for a user
- **GET** `/trips/{userId}/{scrapeDate}` - Get specific trip

### Authenticated Endpoints (With Cognito)

- **GET** `/trips` - List trips for authenticated user
- **GET** `/trips/{userId}/{scrapeDate}` - Get specific trip

## Environment Variables

### Dashboard (.env.production)

```bash
NEXT_PUBLIC_API_URL=https://your-api-gateway-url/prod
NEXT_PUBLIC_API_AUTH_URL=https://your-api-gateway-url/prod-auth  # Optional
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX            # Optional
NEXT_PUBLIC_COGNITO_CLIENT_ID=your-client-id                    # Optional
NEXT_PUBLIC_AWS_REGION=us-east-1                                # Optional
NEXT_PUBLIC_COGNITO_DOMAIN=your-cognito-domain                  # Optional
```

### Lambda Environment Variables (Set by Terraform)

```bash
# Trips API Lambda
DYNAMODB_TABLE_NAME=turo_ezpass_trips
AWS_REGION=us-east-1

# Analytics Lambda
DYNAMODB_TABLE_NAME=turo_ezpass_trips
AWS_REGION=us-east-1
SNS_TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:alerts
METRIC_NAMESPACE=TuroEZPass
```

## Monitoring and Alerts

### CloudWatch Metrics

The system automatically publishes these metrics:

- `TotalScrapes` - Total number of scrapes
- `SuccessfulScrapes` - Number of successful scrapes
- `FailedScrapes` - Number of failed scrapes
- `SuccessRate` - Overall success rate percentage
- `UniqueUsers` - Number of unique users
- `TotalRecords` - Total records processed
- `AvgRecordsPerScrape` - Average records per scrape
- `RecentScrapes24h` - Scrapes in last 24 hours
- `RecentSuccessRate24h` - Success rate in last 24 hours

### CloudWatch Alarms

- **No Recent Scrapes**: Triggers if no scrapes in 24 hours
- **Low Success Rate**: Triggers if success rate < 50% in 24 hours
- **Lambda Errors**: Triggers on Lambda function errors
- **API Gateway Errors**: Triggers on high 5XX error rates

### Dashboard Access

CloudWatch Dashboard: `https://console.aws.amazon.com/cloudwatch/home#dashboards:name=turo-ezpass-prod-dashboard`

## User Management (Cognito)

### Creating Users (Admin)

```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username testuser \
  --user-attributes Name=email,Value=user@example.com \
  --temporary-password TempPass123! \
  --message-action SUPPRESS
```

### User Self-Registration

Users can register themselves through the dashboard if you enable the sign-up flow in Cognito.

## Troubleshooting

### Common Issues

1. **API Gateway CORS Errors**
   - Check that your domain is included in CORS settings
   - Verify API Gateway has OPTIONS methods configured

2. **Lambda Function Timeouts**
   - Check CloudWatch logs: `/aws/lambda/turo-ezpass-prod-trips-api`
   - Increase timeout if needed in Terraform

3. **Authentication Issues**
   - Verify Cognito configuration in environment variables
   - Check JWT token expiration
   - Ensure callback URLs are correct

4. **Dashboard Not Loading**
   - Check CloudFront distribution status
   - Verify S3 bucket policy allows CloudFront access
   - Check browser console for API errors

### Logs Locations

- **API Lambda**: `/aws/lambda/turo-ezpass-prod-trips-api`
- **Analytics Lambda**: `/aws/lambda/turo-ezpass-prod-analytics`
- **CloudFront**: CloudFront access logs (if enabled)

## Costs

### Estimated Monthly Costs (Low Usage)

- **Lambda**: $0.20 (1M requests)
- **API Gateway**: $3.50 (1M requests)
- **CloudFront**: $1.00 (10GB transfer)
- **S3**: $0.50 (storage + requests)
- **DynamoDB**: $0.25 (existing table)
- **CloudWatch**: $1.00 (metrics + logs)
- **Cognito**: $0.00 (< 50,000 MAU)

**Total**: ~$6/month

## Security Best Practices

1. **Restrict CORS origins** to your actual domain
2. **Use HTTPS only** (enforced by CloudFront)
3. **Enable AWS CloudTrail** for audit logging
4. **Rotate secrets regularly** if using API keys
5. **Use least-privilege IAM policies**
6. **Enable GuardDuty** for threat detection
7. **Regular security updates** for dependencies

## Backup and Recovery

### Data Backup
- DynamoDB point-in-time recovery is enabled
- S3 bucket versioning is enabled for the dashboard

### Disaster Recovery
1. Terraform state is the source of truth
2. Lambda code is in Git
3. Dashboard code is in Git
4. DynamoDB data should be backed up regularly

## Updates and Maintenance

### Code Updates
- Push to main branch triggers automatic deployment
- Lambda functions support blue/green deployment
- Dashboard uses CloudFront cache invalidation

### Infrastructure Updates
- Modify Terraform configuration
- Run `terraform plan` and `terraform apply`
- Test changes in staging environment first

## Support

For issues or questions:
1. Check CloudWatch logs
2. Review GitHub Actions workflow logs
3. Check Terraform state and configuration
4. Monitor CloudWatch alarms and metrics

---

**Next Steps:**
1. Deploy the infrastructure using Terraform
2. Configure GitHub Actions secrets
3. Test the dashboard functionality
4. Set up monitoring alerts
5. Create Cognito users (if using authentication)