# Turo-EZPass AWS Infrastructure

This Terraform configuration sets up AWS Fargate + EventBridge scheduling for automated scraper execution with comprehensive monitoring and alerting.

## Architecture

- **ECS Fargate**: Runs the scraper container serverlessly
- **EventBridge**: Schedules nightly execution at 2 AM ET
- **CloudWatch**: Logging, monitoring, and dashboards
- **SNS**: Email alerts for failures and timeouts
- **IAM**: Secure roles for Secrets Manager access
- **VPC**: Isolated networking with public subnets

## Features

- ✅ Nightly scheduling at 2 AM ET
- ✅ Task failure detection and alerting  
- ✅ Login timeout and field missing error alerts
- ✅ CloudWatch dashboard for monitoring
- ✅ Email notifications via SNS
- ✅ Secure credential management via Secrets Manager
- ✅ Manual trigger capability for testing

## Quick Start

1. **Set up variables**:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

2. **Deploy infrastructure**:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

3. **Confirm SNS email subscription** (check your email)

4. **Test manually**:
   ```bash
   # Enable the manual trigger rule
   aws events enable-rule --name "turo-ezpass-manual-trigger"
   
   # Trigger a test run
   aws events put-events --entries Source=custom.scraper,DetailType="Manual Trigger",Detail='{}'
   ```

## Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `docker_image` | ECR URI for your scraper image | `123456789012.dkr.ecr.us-east-1.amazonaws.com/turo-ezpass:latest` |
| `alert_email` | Email for failure notifications | `alerts@mycompany.com` |

## Monitoring

### CloudWatch Alarms
- **Task Failures**: >3 failures in 12 hours triggers alert
- **Login Timeouts**: Any timeout/field missing errors trigger alert  
- **No Data**: No tasks running in 24 hours triggers alert

### Dashboard
After deployment, access your dashboard at:
```
https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=turo-ezpass-dashboard
```

### Log Groups
All scraper logs are stored in: `/ecs/turo-ezpass`

## Scheduling

The scraper runs nightly at **2 AM ET** (6 AM UTC). This accounts for:
- Standard Time: 2 AM ET = 7 AM UTC
- Daylight Time: 2 AM EDT = 6 AM UTC

The cron expression `0 6 * * ? *` uses 6 AM UTC for consistency.

## Manual Testing

```bash
# Trigger via EventBridge
aws events put-events --entries Source=custom.scraper,DetailType="Manual Trigger",Detail='{}'

# Check task status
aws ecs list-tasks --cluster turo-ezpass-cluster

# View logs
aws logs tail /ecs/turo-ezpass --follow
```

## Troubleshooting

### Common Issues

1. **Task fails to start**:
   - Check ECR image exists and is accessible
   - Verify IAM roles have correct permissions
   - Check VPC/subnet configuration

2. **Login timeouts**:
   - Review scraper logs for selector issues
   - Check if websites changed their structure
   - Verify credentials in Secrets Manager

3. **No email alerts**:
   - Confirm SNS subscription in email
   - Check SNS topic permissions
   - Verify alarm thresholds

### Log Analysis

```bash
# Search for errors
aws logs filter-log-events \
  --log-group-name /ecs/turo-ezpass \
  --filter-pattern "ERROR"

# Search for timeouts
aws logs filter-log-events \
  --log-group-name /ecs/turo-ezpass \
  --filter-pattern "timeout"
```

## Cleanup

```bash
terraform destroy
```

## GitHub Actions Alternative

The `.github/workflows/scheduler.yml` provides an alternative GitHub Actions-based scheduler that runs the same scraper code with:
- Nightly scheduling via cron
- Artifact uploads for screenshots and results
- Automatic issue creation on failures
- Timeout handling and error reporting

Choose either AWS Fargate or GitHub Actions based on your preferences for hosting and cost considerations.