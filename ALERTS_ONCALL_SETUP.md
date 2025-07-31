# Alerts & On-Call Integration Setup Guide

## 🚨 Overview

This guide covers setting up comprehensive alerting and on-call integration for the Turo-EZPass system, including Slack, PagerDuty, email notifications, and escalation procedures.

## 📱 Slack Integration

### Setup Instructions

1. **Create Slack App**
   ```bash
   # Go to https://api.slack.com/apps
   # Create new app for your workspace
   # Navigate to "Incoming Webhooks"
   # Activate incoming webhooks
   # Create webhook for desired channel
   ```

2. **Configure Webhook URL**
   ```bash
   # Set GitHub secret
   gh secret set SLACK_WEBHOOK_URL --body "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
   
   # Or set in Terraform
   export TF_VAR_slack_webhook_url="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
   ```

3. **Channel Configuration**
   ```bash
   # Recommended channel structure:
   #alerts-critical    - Critical alerts requiring immediate attention
   #alerts-warning     - Warning alerts for monitoring
   #alerts-info        - Informational notifications
   #turo-ezpass-ops    - General operational updates
   ```

### Slack Message Format

The integration sends rich messages with:
- **Color coding**: Red (critical), Orange (warning), Green (info)
- **Structured fields**: Environment, priority, timestamp
- **Action buttons**: Links to CloudWatch, logs, dashboard
- **Threading**: Related alerts grouped together

Example Slack message:
```
🚨 turo-ezpass-prod
CRITICAL: No Recent Scrapes Detected

Alarm: turo-ezpass-prod-critical-no-recent-scrapes
State: OK → ALARM
Reason: Threshold Crossed: 1 datapoint [0.0] was less than the threshold (1.0)

Environment: prod        Priority: Critical
Timestamp: 2024-01-15T10:30:00Z

[View CloudWatch] [View Logs]
```

## 📟 PagerDuty Integration

### Setup Instructions

1. **Create PagerDuty Service**
   ```bash
   # Log in to PagerDuty
   # Go to Services > Service Directory
   # Create new service: "Turo-EZPass Production"
   # Choose "Use our API directly" integration
   # Copy the Integration Key
   ```

2. **Configure Integration Key**
   ```bash
   # Set GitHub secret
   gh secret set PAGERDUTY_INTEGRATION_KEY --body "your-pagerduty-integration-key"
   
   # Or set in Terraform
   export TF_VAR_pagerduty_integration_key="your-pagerduty-integration-key"
   ```

3. **Escalation Policy**
   ```bash
   # Recommended escalation policy:
   # Level 1: On-call engineer (immediate)
   # Level 2: Team lead (after 15 minutes)
   # Level 3: Engineering manager (after 30 minutes)
   ```

### PagerDuty Event Details

The integration sends structured events with:
- **Severity levels**: Critical, warning, info
- **Auto-resolution**: Alarms automatically resolve when returning to OK state
- **Rich context**: Full alarm details, links to AWS console
- **Deduplication**: Related events grouped by alarm name

## 📧 Email Notifications

### Configuration

```bash
# Set primary alert email
gh secret set ALERT_EMAIL --body "oncall@yourcompany.com"

# Multiple emails can be configured in Terraform:
variable "alert_emails" {
  type = list(string)
  default = [
    "oncall@yourcompany.com",
    "infrastructure@yourcompany.com",
    "devops@yourcompany.com"
  ]
}
```

### Email Templates

The system sends structured emails with:
- **Subject line**: `[CRITICAL] Turo-EZPass: No Recent Scrapes Detected`
- **HTML formatting**: Color-coded severity levels
- **Direct links**: CloudWatch console, dashboard, logs
- **Mobile-friendly**: Optimized for mobile viewing

## 🎯 Alert Severity Levels

### Critical Alerts
**Triggers**: System down, no data for 24+ hours, security issues
**Notifications**: Slack + PagerDuty + Email
**Response Time**: Immediate (< 5 minutes)
**Escalation**: After 15 minutes

**Examples**:
- No scrapes in 24 hours
- API Gateway 5XX errors > 50/hour
- Lambda function errors > 10/hour
- DynamoDB throttling errors

### Warning Alerts
**Triggers**: Performance degradation, high failure rates
**Notifications**: Slack + Email
**Response Time**: Within 1 hour
**Escalation**: After 2 hours

**Examples**:
- Success rate < 50% for 2+ hours
- API response time > 5 seconds
- Cost budget exceeded
- Storage usage > 80%

### Info Alerts
**Triggers**: Routine notifications, successful deployments
**Notifications**: Slack only
**Response Time**: Best effort
**Escalation**: None

**Examples**:
- Deployment notifications
- Daily/weekly reports
- Configuration changes
- Maintenance windows

## 🔄 On-Call Procedures

### Primary On-Call Response

1. **Alert Received** (0-5 minutes)
   ```bash
   # Check alert details in Slack/PagerDuty
   # Acknowledge alert in PagerDuty
   # Access CloudWatch dashboard
   ```

2. **Initial Investigation** (5-15 minutes)
   ```bash
   # Check system health
   aws cloudwatch get-metric-statistics --namespace TuroEZPass
   
   # Review recent logs
   aws logs tail /aws/lambda/turo-ezpass-prod-trips-api --since 1h
   
   # Check ECS cluster status
   aws ecs describe-clusters --clusters turo-ezpass-cluster
   ```

3. **Escalation Triggers**
   - Unable to identify root cause within 15 minutes
   - System impact is increasing
   - Multiple systems affected
   - Security incident suspected

### Secondary On-Call Response

1. **Handoff Communication**
   - Update Slack thread with investigation status
   - Share CloudWatch links and log findings
   - Document actions taken so far

2. **Advanced Troubleshooting**
   ```bash
   # Deep dive into metrics
   # Check cross-service dependencies
   # Review recent deployments
   # Analyze error patterns
   ```

### Escalation Matrix

| Time | Role | Action |
|------|------|--------|
| 0-5 min | Primary On-Call | Acknowledge, initial triage |
| 15 min | Secondary On-Call | Escalate if unresolved |
| 30 min | Team Lead | Join investigation |
| 60 min | Engineering Manager | Coordinate response |
| 120 min | VP Engineering | Executive escalation |

## 🛠️ Runbook Integration

### Automated Responses

```bash
# Common automated responses for known issues:

# 1. Restart ECS service
aws ecs update-service --cluster turo-ezpass-cluster --service turo-ezpass-scraper --force-new-deployment

# 2. Trigger manual scraper run
aws events put-events --entries '[{"Source":"manual.trigger","DetailType":"Manual Scraper Run","Detail":"{}"}]'

# 3. Check recent deployment
git log --oneline -10
terraform state list | grep -E "(lambda|ecs)"

# 4. Review cost alerts
aws ce get-cost-and-usage --time-period Start=2024-01-01,End=2024-01-31 --granularity DAILY --metrics BlendedCost
```

### Alert Context

Each alert includes contextual information:
- **Dashboard links**: Direct access to relevant data
- **Log queries**: Pre-built CloudWatch Insights queries
- **Runbook references**: Links to specific troubleshooting steps
- **Recent changes**: Git commits, deployments, configuration changes

## 📊 Alert Metrics and Tuning

### Key Metrics to Monitor

```bash
# Alert frequency
aws cloudwatch get-metric-statistics \
  --namespace AWS/SNS \
  --metric-name NumberOfMessagesPublished \
  --dimensions Name=TopicName,Value=turo-ezpass-prod-alerts

# Response times
# Time from alert to acknowledgment
# Time from alert to resolution
# Escalation frequency

# False positive rate
# Alerts that didn't require action
# Threshold adjustments needed
```

### Threshold Tuning

Regular review of alert thresholds:

1. **Monthly Review**
   - Analyze false positive rate
   - Review missed incidents
   - Adjust thresholds based on normal operating ranges

2. **Seasonal Adjustments**
   - Account for usage pattern changes
   - Holiday/weekend baseline adjustments
   - Business hour vs. off-hour sensitivity

## 🔧 Testing and Validation

### Alert Testing

```bash
# Test Slack integration
./scripts/test-slack-integration.sh

# Test PagerDuty integration
./scripts/test-pagerduty-integration.sh

# Simulate alert conditions
aws cloudwatch put-metric-data \
  --namespace TuroEZPass \
  --metric-data MetricName=RecentScrapes24h,Value=0,Unit=Count
```

### Monthly Testing Schedule

1. **Week 1**: Test critical alert paths
2. **Week 2**: Test escalation procedures
3. **Week 3**: Test notification integrations
4. **Week 4**: Review and update documentation

## 📋 Configuration Examples

### Terraform Configuration

```hcl
# terraform.tfvars
alert_email = "oncall@yourcompany.com"
slack_webhook_url = "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
pagerduty_integration_key = "your-pagerduty-integration-key"

alert_severity_levels = {
  critical = {
    slack_channel     = "#alerts-critical"
    pagerduty_enabled = true
    email_enabled     = true
    escalation_delay  = 300
  }
  warning = {
    slack_channel     = "#alerts-warning"
    pagerduty_enabled = false
    email_enabled     = true
    escalation_delay  = 900
  }
}
```

### GitHub Actions Integration

```yaml
# Example: Notify on deployment
- name: Notify Successful Deployment
  if: success()
  run: |
    curl -X POST -H 'Content-type: application/json' \
      --data '{
        "text": "✅ Turo-EZPass deployment successful",
        "channel": "#turo-ezpass-ops"
      }' \
      ${{ secrets.SLACK_WEBHOOK_URL }}
```

## 🔍 Troubleshooting Integration Issues

### Common Problems

1. **Slack Notifications Not Working**
   ```bash
   # Check webhook URL validity
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test message"}' \
     $SLACK_WEBHOOK_URL
   
   # Check Lambda function logs
   aws logs tail /aws/lambda/turo-ezpass-prod-slack-notifier --follow
   ```

2. **PagerDuty Events Not Creating Incidents**
   ```bash
   # Verify integration key
   curl -X POST \
     -H 'Content-Type: application/json' \
     -d '{
       "routing_key": "YOUR_INTEGRATION_KEY",
       "event_action": "trigger",
       "payload": {
         "summary": "Test incident",
         "severity": "critical",
         "source": "test"
       }
     }' \
     https://events.pagerduty.com/v2/enqueue
   ```

3. **Email Notifications Missing**
   ```bash
   # Check SNS subscription status
   aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:us-east-1:123456789012:turo-ezpass-prod-alerts
   
   # Verify email subscription confirmation
   # Check spam folder for confirmation email
   ```

## 📚 Additional Resources

- [Slack Incoming Webhooks Documentation](https://api.slack.com/messaging/webhooks)
- [PagerDuty Events API v2](https://developer.pagerduty.com/api-reference/b3A6Mjc0ODEyNA-send-an-event-to-pager-duty)
- [AWS SNS Documentation](https://docs.aws.amazon.com/sns/)
- [CloudWatch Alarms Guide](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)