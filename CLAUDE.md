# Turo-EZPass Project Guide

This is a comprehensive guide for AI assistants and developers working on the Turo-EZPass automated toll payment system.

## Project Overview

Turo-EZPass is a production-ready automation system that:
1. Scrapes Turo for trip data
2. Identifies toll charges for trips
3. Automatically pays EZPass tolls
4. Provides a web dashboard for monitoring
5. Sends alerts for issues and status updates

**Technology Stack**: Node.js, React, AWS (Lambda, API Gateway, S3, CloudFront, Cognito, DynamoDB), Terraform

## Current State (July 2025)

### ✅ Production Infrastructure (83 AWS Resources)
- **Deployment Status**: Fully deployed and operational
- **Infrastructure**: Managed via Terraform in `api/terraform/`
- **Monitoring**: CloudWatch alarms and SNS notifications active
- **Authentication**: Cognito user pools configured
- **SSL**: Certificate created, pending DNS validation

### Key AWS Resources
```
Lambda Functions:
- turo-ezpass-prod-trips-api (512MB, nodejs18.x)
- turo-ezpass-prod-analytics (256MB, nodejs18.x)

API Gateway: d0dn74r1y1 (Regional)
S3 Bucket: turo-ezpass-prod-dashboard-ao67sl2w
Cognito Pool: us-east-1_5qbHruwXo
Certificate: arn:aws:acm:us-east-1:486365525776:certificate/27b5a90d-d62d-4358-980a-391e2a153e5b
```

## Project Structure

```
turo-ezpass/
├── api/terraform/                 # 🏗️ Infrastructure as Code
│   ├── main.tf                   # Main Terraform configuration
│   ├── lambda.tf                 # Lambda function definitions
│   ├── api-gateway.tf            # API Gateway setup
│   ├── cognito.tf                # Authentication
│   ├── monitoring.tf             # CloudWatch & alerts
│   ├── dns-https.tf              # SSL certificates & domains
│   └── variables.tf              # Configuration variables
├── app/scripts/                  # 🤖 Core processing logic
│   ├── scrapers/                 # Turo & EZPass scrapers
│   │   ├── turo.js              # Turo trip scraping
│   │   └── ezpass.js            # EZPass toll processing
│   └── terraform/               # Legacy terraform configs
├── dashboard/                    # 🖥️ React web application
│   ├── src/components/          # React components
│   ├── src/pages/               # Application pages
│   └── src/services/            # API integration
├── scripts/                     # 🔧 Deployment & utilities
│   ├── deploy-production.sh     # Production deployment
│   ├── terraform-import-all.sh  # Resource import automation
│   └── update-iam-policy.sh     # IAM management
└── docs/                        # 📚 Documentation
```

## Key Files & Their Purposes

### Infrastructure (`api/terraform/`)
- **main.tf**: Core AWS provider and backend configuration
- **lambda.tf**: Trips API and analytics Lambda functions
- **api-gateway.tf**: REST API endpoints and methods
- **cognito.tf**: User authentication and authorization
- **monitoring.tf**: CloudWatch alarms and SNS topics
- **dns-https.tf**: SSL certificates and custom domains
- **hosting.tf**: S3 bucket and CloudFront distribution

### Application Logic (`app/scripts/`)
- **scrapers/turo.js**: Scrapes Turo for trip data and charges
- **scrapers/ezpass.js**: Handles EZPass login and toll payments
- **match.js**: Matches Turo trips with EZPass tolls

### Frontend (`dashboard/`)
- **src/components/Dashboard.tsx**: Main dashboard interface
- **src/components/TripsTable.tsx**: Trip data display
- **src/services/api.ts**: Backend API integration

### Automation (`scripts/`)
- **deploy-production.sh**: Complete production deployment workflow
- **terraform-import-all.sh**: Import existing AWS resources
- **post-commit-docs.sh**: Auto-update documentation on commits

## Development Workflow

### Local Development Setup
```bash
# 1. Clone and install dependencies
git clone <repo>
cd turo-ezpass
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with AWS credentials and configuration

# 3. Start development servers
npm run dev                    # Start all services
cd dashboard && npm start     # Frontend only
```

### Infrastructure Management
```bash
# Navigate to Terraform directory
cd api/terraform

# Plan changes
terraform plan -out=tfplan

# Apply changes
terraform apply tfplan

# Import existing resources
../../scripts/terraform-import-all.sh
```

### Deployment Process
```bash
# Full production deployment
./scripts/deploy-production.sh

# Manual steps:
# 1. Add DNS validation records for SSL certificate
# 2. Complete Terraform apply after certificate validates
# 3. Deploy dashboard to S3
```

## API Endpoints

### Trips API (`/trips`)
- **GET /trips**: List all trips for authenticated user
- **GET /trips/{userId}/{scrapeDate}**: Get specific trip
- **POST /scrape**: Trigger new scraping operation

### Authentication
- Uses AWS Cognito User Pools
- Authorizer: `fvm25c`
- Supports both public and authenticated endpoints

## Configuration Management

### Environment Variables (SSM Parameters)
```
/turo-ezpass/prod/config/environment    # Environment name
/turo-ezpass/prod/config/dynamodb-table # DynamoDB table name
/turo-ezpass/prod/config/api-url        # API Gateway URL
/turo-ezpass/prod/cognito/config        # Cognito configuration
```

### Terraform Variables
- Defined in `terraform.tfvars`
- Environment-specific configurations
- Resource naming and tagging

## Monitoring & Alerting

### CloudWatch Alarms
- **Low Success Rate**: Monitors scraping success
- **No Recent Scrapes**: Detects stalled operations
- **API Gateway Errors**: Tracks API failures

### SNS Topics
- **Critical Alerts**: Immediate action required
- **Warning Alerts**: Issues that need attention
- **General Alerts**: Informational notifications

## Security

### IAM Roles & Policies
- Lambda execution roles with minimal permissions
- S3 bucket policies for secure hosting
- API Gateway authorizers for authentication

### Data Protection
- Secrets stored in AWS Secrets Manager
- Environment variables in SSM Parameter Store
- HTTPS everywhere with ACM certificates

## Common Tasks

### Adding New Features
1. Update Lambda function code in `lambdas/`
2. Modify API Gateway configuration in `api-gateway.tf`
3. Update frontend components in `dashboard/src/`
4. Deploy with `terraform apply`

### Debugging Issues
1. Check CloudWatch logs: `/aws/lambda/turo-ezpass-prod-*`
2. Review CloudWatch alarms for system health
3. Test API endpoints with Postman or curl
4. Verify Cognito authentication flow

### Updating Documentation
The project includes automatic documentation updates:
- Git hook: `.git/hooks/post-commit` 
- Configuration: `.claude-docs-config`
- Slash commands: `~/.claude/slash_commands/`

## Troubleshooting

### Common Issues

**SSL Certificate Pending**: 
- Add DNS validation records to domain registrar
- Check ACM certificate status in AWS console

**Lambda Function Errors**:
- Check CloudWatch logs for detailed error messages
- Verify IAM permissions for resource access
- Test function locally with sample events

**API Gateway 403 Errors**:
- Verify Cognito authorizer configuration
- Check API Gateway method authorization settings
- Test with valid JWT tokens

**Frontend Not Loading**:
- Check S3 bucket policy and public access settings
- Verify CloudFront distribution status
- Check browser console for CORS errors

### Useful Commands
```bash
# Check deployment status
aws lambda get-function --function-name turo-ezpass-prod-trips-api
aws apigateway get-rest-api --rest-api-id d0dn74r1y1
aws s3api get-bucket-website --bucket turo-ezpass-prod-dashboard-ao67sl2w

# Monitor logs
aws logs tail /aws/lambda/turo-ezpass-prod-trips-api --follow

# Test API endpoints
curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://api.turoezpass.com/trips?userId=test
```

## Recent Changes (July 2025)

1. **Complete Infrastructure Deployment**: 83 AWS resources now managed via Terraform
2. **Lambda Functions**: Both trips-api and analytics functions deployed
3. **Automated Documentation**: Git hooks and slash commands for doc updates
4. **Production Monitoring**: Comprehensive CloudWatch alarms and SNS alerts
5. **SSL Configuration**: ACM certificate created, awaiting DNS validation

## Next Steps

1. **DNS Validation**: Add required CNAME records for SSL certificate
2. **CloudFront Setup**: Complete custom domain configuration
3. **Dashboard Deployment**: Build and upload React app to S3
4. **End-to-End Testing**: Verify complete workflow functionality
5. **Performance Optimization**: Monitor and optimize Lambda cold starts

## Auto-Documentation

This project includes automated documentation updates:
- **Git Hook**: Triggers on commits with significant changes
- **Slash Commands**: `/update-docs`, `/sync-docs`, `/update-readme`
- **Configuration**: `.claude-docs-config` controls behavior

---

*Last Updated: July 26, 2025*  
*Infrastructure: 83 AWS resources managed via Terraform*  
*Status: Production deployment complete, SSL pending DNS validation*

🤖 This file is automatically maintained by Claude Code