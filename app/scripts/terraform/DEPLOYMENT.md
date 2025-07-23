# Turo-EZPass Terraform Deployment Guide

This guide helps you deploy the turo-ezpass infrastructure with Terraform while handling common issues.

## Prerequisites

1. **AWS CLI configured** with proper credentials
2. **Terraform >= 1.0** installed
3. **IAM permissions** for the Terraform user

## Step 1: Apply IAM Policy

The Terraform user (`arn:aws:iam::486365525776:user/turo-terraform`) needs specific permissions. Apply the provided policy:

```bash
aws iam put-user-policy \
  --user-name turo-terraform \
  --policy-name TuroEZPassTerraformPolicy \
  --policy-document file://terraform-user-policy.json
```

## Step 2: Handle Existing Secrets

If the secrets `turo-ezpass/ezpass/credentials` and `turo-ezpass/turo/credentials` already exist, Terraform will:
- Skip creating new secrets (using lifecycle rules)
- Only manage the secret versions with placeholder values
- Ignore changes to secret content after initial creation

## Step 3: Configure Variables

Create `terraform.tfvars` from the example:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit the required variables:
```hcl
# Required
docker_image = "486365525776.dkr.ecr.us-east-1.amazonaws.com/turo-ezpass:latest"
alert_email  = "your-email@example.com"

# Optional overrides
aws_region = "us-east-1"
project_name = "turo-ezpass"
schedule_enabled = true
```

## Step 4: Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Review planned changes
terraform plan

# Apply configuration
terraform apply
```

## Step 5: Update Secrets with Real Credentials

After deployment, update the secrets with actual credentials:

```bash
# E-ZPass credentials
aws secretsmanager update-secret \
  --secret-id turo-ezpass/ezpass/credentials \
  --secret-string '{
    "username": "your-ezpass-username",
    "password": "your-ezpass-password", 
    "state": "ny"
  }'

# Turo credentials  
aws secretsmanager update-secret \
  --secret-id turo-ezpass/turo/credentials \
  --secret-string '{
    "email": "your-turo-email@example.com",
    "password": "your-turo-password"
  }'
```

## Troubleshooting

### DNS Resolution Issues
The provider configuration includes explicit endpoints to handle DNS resolution problems. If you still encounter issues:

1. Check your network configuration
2. Verify DNS settings
3. Try running from a different network

### Duplicate Resource Errors
All duplicates have been removed. Resources are organized as:
- `main.tf`: Core infrastructure (VPC, ECS, secrets module)
- `iam.tf`: EventBridge IAM roles
- `monitoring.tf`: SNS alerts, CloudWatch alarms & dashboard  
- `scheduling.tf`: EventBridge rules & targets
- `secrets_management/`: Secrets module

### Permission Errors
If you encounter permission errors:

1. Verify the IAM policy was applied correctly
2. Check the user has permissions for the specific AWS service
3. Ensure the account ID (486365525776) matches your account

### Import Existing Resources
If resources already exist, you can import them:

```bash
# Import existing secret
terraform import module.secrets_management.aws_secretsmanager_secret.ezpass_credentials turo-ezpass/ezpass/credentials

# Import existing ECS cluster
terraform import aws_ecs_cluster.main turo-ezpass-cluster
```

## Infrastructure Components

After deployment, you'll have:

- **VPC** with public subnets and internet gateway
- **ECS Fargate cluster** with task definition
- **Secrets Manager** for secure credential storage
- **EventBridge rules** for scheduling (nightly + manual)
- **CloudWatch monitoring** with alarms and dashboard
- **SNS alerts** for failure notifications
- **IAM roles** with least-privilege access

## Manual Testing

Test the manual trigger:
```bash
aws events put-events \
  --entries Source=custom.scraper,DetailType="Manual Trigger",Detail='{}'
```

## Monitoring

- **CloudWatch Dashboard**: Monitor ECS metrics and logs
- **SNS Alerts**: Receive notifications for failures
- **EventBridge Rules**: Scheduled and manual execution

The nightly scraper runs at 2 AM ET (6 AM UTC) by default.