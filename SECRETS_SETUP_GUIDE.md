# Secrets & Configuration Setup Guide

## 🔐 GitHub Actions Secrets

### Required Secrets

Add these secrets to your GitHub repository (`Settings > Secrets and variables > Actions`):

```bash
# Core AWS Configuration
AWS_ROLE_ARN="arn:aws:iam::123456789012:role/github-actions-turo-ezpass-role"
DYNAMODB_TABLE_NAME="turo_ezpass_trips"

# Alert Configuration
ALERT_EMAIL="admin@example.com"

# Optional: Custom Domain Configuration
DOMAIN_NAME="turo-ezpass.com"
DASHBOARD_SUBDOMAIN="dashboard"  # Default: dashboard
API_SUBDOMAIN="api"              # Default: api
CREATE_DNS_RECORDS="true"        # Set to false for external DNS

# Optional: Cognito Authentication
ENABLE_COGNITO_AUTH="true"
COGNITO_USER_POOL_ID="us-east-1_XXXXXXXXX"
COGNITO_CLIENT_ID="your-client-id"
COGNITO_DOMAIN="your-cognito-domain"

# Optional: CORS Configuration
CORS_ALLOWED_ORIGINS="https://dashboard.turo-ezpass.com,https://localhost:3000"

# Optional: Slack Integration
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"

# Optional: PagerDuty Integration
PAGERDUTY_INTEGRATION_KEY="your-pagerduty-integration-key"
```

### GitHub CLI Setup Commands

```bash
# Set required secrets
gh secret set AWS_ROLE_ARN --body "arn:aws:iam::123456789012:role/github-actions-turo-ezpass-role"
gh secret set DYNAMODB_TABLE_NAME --body "turo_ezpass_trips"
gh secret set ALERT_EMAIL --body "admin@example.com"

# Set optional domain configuration
gh secret set DOMAIN_NAME --body "turo-ezpass.com"
gh secret set DASHBOARD_SUBDOMAIN --body "dashboard"
gh secret set API_SUBDOMAIN --body "api"
gh secret set CREATE_DNS_RECORDS --body "true"

# Set optional Cognito configuration
gh secret set ENABLE_COGNITO_AUTH --body "true"
gh secret set COGNITO_USER_POOL_ID --body "us-east-1_XXXXXXXXX"
gh secret set COGNITO_CLIENT_ID --body "your-client-id"
gh secret set COGNITO_DOMAIN --body "your-cognito-domain"

# Set optional integrations
gh secret set SLACK_WEBHOOK_URL --body "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
gh secret set PAGERDUTY_INTEGRATION_KEY --body "your-pagerduty-integration-key"
```

### Bulk Secret Setup Script

```bash
#!/bin/bash
# setup-github-secrets.sh

set -e

echo "Setting up GitHub secrets for Turo-EZPass..."

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI is required. Install from: https://cli.github.com/"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "Please authenticate with GitHub CLI: gh auth login"
    exit 1
fi

# Required secrets
read -p "Enter AWS Role ARN: " AWS_ROLE_ARN
read -p "Enter DynamoDB table name [turo_ezpass_trips]: " DYNAMODB_TABLE_NAME
DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME:-turo_ezpass_trips}

read -p "Enter alert email address: " ALERT_EMAIL

# Set required secrets
gh secret set AWS_ROLE_ARN --body "$AWS_ROLE_ARN"
gh secret set DYNAMODB_TABLE_NAME --body "$DYNAMODB_TABLE_NAME"
gh secret set ALERT_EMAIL --body "$ALERT_EMAIL"

# Optional domain configuration
read -p "Do you want to configure a custom domain? (y/n): " SETUP_DOMAIN
if [[ $SETUP_DOMAIN =~ ^[Yy]$ ]]; then
    read -p "Enter domain name (e.g., turo-ezpass.com): " DOMAIN_NAME
    read -p "Enter dashboard subdomain [dashboard]: " DASHBOARD_SUBDOMAIN
    DASHBOARD_SUBDOMAIN=${DASHBOARD_SUBDOMAIN:-dashboard}
    read -p "Enter API subdomain [api]: " API_SUBDOMAIN
    API_SUBDOMAIN=${API_SUBDOMAIN:-api}
    read -p "Create DNS records automatically? (y/n): " CREATE_DNS
    
    gh secret set DOMAIN_NAME --body "$DOMAIN_NAME"
    gh secret set DASHBOARD_SUBDOMAIN --body "$DASHBOARD_SUBDOMAIN"
    gh secret set API_SUBDOMAIN --body "$API_SUBDOMAIN"
    
    if [[ $CREATE_DNS =~ ^[Yy]$ ]]; then
        gh secret set CREATE_DNS_RECORDS --body "true"
    else
        gh secret set CREATE_DNS_RECORDS --body "false"
    fi
fi

# Optional Cognito authentication
read -p "Do you want to enable Cognito authentication? (y/n): " SETUP_COGNITO
if [[ $SETUP_COGNITO =~ ^[Yy]$ ]]; then
    read -p "Enter Cognito User Pool ID: " COGNITO_USER_POOL_ID
    read -p "Enter Cognito Client ID: " COGNITO_CLIENT_ID
    read -p "Enter Cognito Domain: " COGNITO_DOMAIN
    
    gh secret set ENABLE_COGNITO_AUTH --body "true"
    gh secret set COGNITO_USER_POOL_ID --body "$COGNITO_USER_POOL_ID"
    gh secret set COGNITO_CLIENT_ID --body "$COGNITO_CLIENT_ID"
    gh secret set COGNITO_DOMAIN --body "$COGNITO_DOMAIN"
else
    gh secret set ENABLE_COGNITO_AUTH --body "false"
fi

# Optional Slack integration
read -p "Do you want to configure Slack notifications? (y/n): " SETUP_SLACK
if [[ $SETUP_SLACK =~ ^[Yy]$ ]]; then
    read -p "Enter Slack webhook URL: " SLACK_WEBHOOK_URL
    gh secret set SLACK_WEBHOOK_URL --body "$SLACK_WEBHOOK_URL"
fi

echo "✅ GitHub secrets configured successfully!"
echo "You can now run the production deployment workflow."
```

## 🏗️ AWS SSM Parameter Store

### Configuration Structure

The application stores configuration in AWS SSM Parameter Store with this hierarchy:

```
/turo-ezpass/{environment}/
├── config/
│   ├── api-url
│   ├── dynamodb-table
│   ├── aws-region
│   ├── environment
│   └── project-name
├── api/
│   ├── public-api-url
│   └── auth-api-url
├── infrastructure/
│   ├── s3-bucket-name
│   ├── cloudfront-distribution-id
│   ├── cloudfront-domain
│   ├── sns-topic-arn
│   ├── lambda-trips-api-arn
│   └── lambda-analytics-arn
├── cognito/
│   └── config (JSON)
├── domain/
│   └── config (JSON)
├── monitoring/
│   └── config (JSON)
└── features/
    └── flags (JSON)
```

### Reading Configuration in Lambda Functions

```typescript
// Example: Reading configuration in Lambda
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

async function getConfig(parameterName: string): Promise<string> {
  const command = new GetParameterCommand({
    Name: `/turo-ezpass/${process.env.ENVIRONMENT}/${parameterName}`
  });
  
  const response = await ssmClient.send(command);
  return response.Parameter?.Value || '';
}

// Usage examples
const dynamoTableName = await getConfig('config/dynamodb-table');
const cognitoConfig = JSON.parse(await getConfig('cognito/config'));
const featureFlags = JSON.parse(await getConfig('features/flags'));
```

### Bulk Parameter Retrieval

```typescript
// Get all parameters for environment
import { GetParametersByPathCommand } from '@aws-sdk/client-ssm';

async function getAllConfig(environment: string): Promise<Record<string, string>> {
  const command = new GetParametersByPathCommand({
    Path: `/turo-ezpass/${environment}/`,
    Recursive: true,
    WithDecryption: true
  });
  
  const response = await ssmClient.send(command);
  const config: Record<string, string> = {};
  
  response.Parameters?.forEach(param => {
    if (param.Name && param.Value) {
      const key = param.Name.replace(`/turo-ezpass/${environment}/`, '');
      config[key] = param.Value;
    }
  });
  
  return config;
}
```

## 🔄 Environment-Specific Configuration

### Development Environment

```bash
# Local development .env file
cat > dashboard/.env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_AWS_REGION=us-east-1
NEXT_PUBLIC_ENVIRONMENT=development
EOF
```

### Staging Environment

```bash
# GitHub secrets for staging
gh secret set AWS_ROLE_ARN --env staging --body "arn:aws:iam::123456789012:role/github-actions-staging-role"
gh secret set DYNAMODB_TABLE_NAME --env staging --body "turo_ezpass_trips_staging"
gh secret set DOMAIN_NAME --env staging --body "staging.turo-ezpass.com"
```

### Production Environment

```bash
# GitHub secrets for production
gh secret set AWS_ROLE_ARN --env production --body "arn:aws:iam::123456789012:role/github-actions-prod-role"
gh secret set DYNAMODB_TABLE_NAME --env production --body "turo_ezpass_trips"
gh secret set DOMAIN_NAME --env production --body "turo-ezpass.com"
```

## 🛡️ Security Best Practices

### GitHub Actions Security

```yaml
# Example secure workflow configuration
permissions:
  id-token: write   # Required for OIDC
  contents: read    # Required for checkout
  actions: read     # Required for downloading artifacts

environment:
  name: production
  url: ${{ steps.deploy.outputs.url }}
```

### AWS IAM Policies

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": "arn:aws:ssm:us-east-1:*:parameter/turo-ezpass/prod/*"
    }
  ]
}
```

### Secrets Rotation

```bash
# Rotate GitHub OIDC role
aws iam update-role --role-name github-actions-turo-ezpass-role --max-session-duration 3600

# Update role trust policy for additional security
aws iam update-assume-role-policy \
  --role-name github-actions-turo-ezpass-role \
  --policy-document file://github-trust-policy-updated.json
```

## 🔍 Troubleshooting

### Common Issues

#### 1. GitHub Actions Can't Assume Role
```bash
# Check role trust policy
aws iam get-role --role-name github-actions-turo-ezpass-role

# Verify OIDC provider
aws iam get-open-id-connect-provider --open-id-connect-provider-arn arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com
```

#### 2. SSM Parameters Not Found
```bash
# List all parameters
aws ssm get-parameters-by-path --path "/turo-ezpass/prod/" --recursive

# Check parameter permissions
aws ssm describe-parameters --filters "Key=Name,Values=/turo-ezpass/prod/"
```

#### 3. Cognito Configuration Issues
```bash
# Verify Cognito User Pool
aws cognito-idp describe-user-pool --user-pool-id us-east-1_XXXXXXXXX

# Check User Pool Client
aws cognito-idp describe-user-pool-client --user-pool-id us-east-1_XXXXXXXXX --client-id your-client-id
```

### Validation Commands

```bash
# Test GitHub Actions secrets
gh secret list

# Test AWS configuration
aws sts get-caller-identity

# Test SSM access
aws ssm get-parameter --name "/turo-ezpass/prod/config/api-url"

# Test Terraform configuration
cd api/terraform
terraform validate
terraform plan -var-file="terraform.tfvars"
```

## 📚 Additional Resources

- [GitHub Actions Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [AWS SSM Parameter Store Guide](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [AWS IAM Roles for GitHub Actions](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [Terraform AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)