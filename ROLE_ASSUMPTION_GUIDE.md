# Turo-EZPass Automation Role Assumption Guide

This guide explains how to configure and use the `turo-ezpass-automation-role` for secure access to AWS services.

## Role Details

- **Role ARN**: `arn:aws:iam::486365525776:role/turo-ezpass-automation-role`
- **Policy**: `turo-ezpass-automation-policy` (customer-managed)
- **External ID**: `turo-ezpass-automation-external-id`

## AWS CLI Configuration

### Method 1: Using aws sts assume-role

```bash
# Assume the role and get temporary credentials
aws sts assume-role \
  --role-arn "arn:aws:iam::486365525776:role/turo-ezpass-automation-role" \
  --role-session-name "turo-ezpass-automation" \
  --external-id "turo-ezpass-automation-external-id"

# Extract credentials from the response and set environment variables
export AWS_ACCESS_KEY_ID="<AccessKeyId from response>"
export AWS_SECRET_ACCESS_KEY="<SecretAccessKey from response>"
export AWS_SESSION_TOKEN="<SessionToken from response>"
```

### Method 2: Using AWS CLI profiles

Create a profile in `~/.aws/config`:

```ini
[profile turo-ezpass-automation]
role_arn = arn:aws:iam::486365525776:role/turo-ezpass-automation-role
source_profile = default
external_id = turo-ezpass-automation-external-id
```

Then use the profile:

```bash
aws ecs describe-clusters --profile turo-ezpass-automation
```

## GitHub Actions Configuration

Add the following to your GitHub Actions workflow:

```yaml
name: Turo-EZPass Automation

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  automation:
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: arn:aws:iam::486365525776:role/turo-ezpass-automation-role
          role-session-name: turo-ezpass-github-actions
          role-external-id: ${{ secrets.AWS_EXTERNAL_ID }}
          aws-region: us-east-1

      - name: Run automation tasks
        run: |
          # Your automation commands here
          aws ecs run-task --cluster turo-ezpass-cluster --task-definition turo-ezpass-scraper
```

## Required GitHub Secrets

Add these secrets to your GitHub repository:

- `AWS_EXTERNAL_ID`: `turo-ezpass-automation-external-id`

## Terraform Deployment

To deploy these IAM resources:

```bash
# Initialize Terraform
terraform init

# Plan the deployment
terraform plan

# Apply the changes
terraform apply

# Get the role ARN
terraform output turo_ezpass_automation_role_arn
```

## Security Best Practices

1. **External ID**: Always use the external ID when assuming the role for additional security
2. **Session Duration**: Role sessions are limited to 1 hour (3600 seconds)
3. **Least Privilege**: The policy only grants permissions needed for Turo-EZPass automation
4. **Resource-Specific**: Most permissions are scoped to turo-ezpass resources only

## Troubleshooting

### Common Issues

1. **Access Denied**: Ensure you're using the correct external ID
2. **Session Expired**: Re-assume the role to get fresh credentials
3. **Permission Denied**: Verify the policy includes the required permissions for your operation

### Debugging Commands

```bash
# Verify your current identity
aws sts get-caller-identity

# Test role assumption
aws sts assume-role \
  --role-arn "arn:aws:iam::486365525776:role/turo-ezpass-automation-role" \
  --role-session-name "debug-session" \
  --external-id "turo-ezpass-automation-external-id"

# Test permissions
aws ecs describe-clusters --cluster-name turo-ezpass-cluster
```

## Migration from Inline Policies

When migrating from the existing `turo-terraform` user with inline policies:

1. Deploy the new IAM role and policy using Terraform
2. Update your automation scripts to use role assumption
3. Test thoroughly with the new role
4. Remove the old inline policies from `turo-terraform` user
5. Consider removing the user entirely if no longer needed

## Contact

For questions or issues with role assumption, contact the infrastructure team.