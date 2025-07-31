# Turo-EZPass Operations Runbook

## 🚀 Quick Start Guide

### Prerequisites
- AWS CLI configured with appropriate permissions
- Terraform >= 1.0 installed
- Node.js >= 18 installed
- Access to the AWS Console
- GitHub CLI (for secrets management)
- Email configured for alerts

### Initial Deployment

#### Option 1: Automated Deployment (Recommended)
```bash
# 1. Clone and navigate to repository
git clone <your-repo-url>
cd turo-ezpass

# 2. Set up GitHub secrets
./setup-github-secrets.sh  # Interactive script

# 3. Deploy via GitHub Actions
git push origin main
# Monitor deployment at: https://github.com/your-org/turo-ezpass/actions
```

#### Option 2: Manual Deployment
```bash
# 1. Deploy API infrastructure
cd api/terraform
terraform init

# 2. Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your specific values

# 3. Plan and apply infrastructure
terraform plan
terraform apply

# 4. Deploy dashboard
cd ../../dashboard
npm install
npm run build

# 5. Upload to S3
aws s3 sync dist/ s3://$(terraform -chdir=../api/terraform output -raw s3_bucket_name)/ --delete

# 6. Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id $(terraform -chdir=../api/terraform output -raw cloudfront_distribution_id) --paths "/*"
```

#### Option 3: Legacy Scraper Deployment
```bash
# Deploy the original ECS-based scraper
cd app/scripts
./deploy-ezpass.sh
```

## 📊 Monitoring & Dashboards

### Primary Dashboards

#### 1. CloudWatch Dashboard
- **URL**: AWS Console → CloudWatch → Dashboards → "turo-ezpass-prod-dashboard"
- **Key Metrics**:
  - Scraper Activity (successful/failed runs)
  - API Performance (response times, error rates)
  - Dashboard Usage (CloudFront metrics)
  - Infrastructure Health (Lambda, DynamoDB)

#### 2. Turo-EZPass Web Dashboard
- **URL**: Retrieved via `terraform output dashboard_url`
- **Features**:
  - Real-time trip data visualization
  - Success rate trends and charts
  - User activity monitoring
  - System health indicators

#### 3. Application Performance Monitoring
- **Lambda Metrics**: Duration, invocations, errors, throttles
- **API Gateway**: Request count, latency, 4XX/5XX errors
- **DynamoDB**: Read/write capacity, throttled requests
- **CloudFront**: Cache hit ratio, origin latency

### Critical Alarms

#### High Priority (PagerDuty + Slack + Email)
1. **No Recent Scrapes** - No scrapes in 24 hours
2. **API Gateway 5XX Errors** - High error rate indicating system issues
3. **Lambda Function Failures** - Critical function errors
4. **DynamoDB Throttling** - Database capacity issues

#### Medium Priority (Slack + Email)
1. **Low Success Rate** - Success rate below 50% for 2+ hours
2. **High API Latency** - Response times > 5 seconds
3. **Cost Budget Exceeded** - Monthly costs exceed threshold
4. **Storage Alerts** - S3 or DynamoDB storage warnings

#### Low Priority (Slack Only)
1. **Deployment Notifications** - Successful/failed deployments
2. **Weekly Reports** - Automated system health summaries
3. **Configuration Changes** - Infrastructure modifications

## 🔐 Security & Secrets Management

### Secrets Setup
```bash
# Create EZPass credentials secret
aws secretsmanager create-secret \
  --name "turo-ezpass/ezpass/credentials" \
  --description "EZPass login credentials" \
  --secret-string '{"username":"your-username","password":"your-password"}'

# Create Turo credentials secret
aws secretsmanager create-secret \
  --name "turo-ezpass/turo/credentials" \
  --description "Turo login credentials" \
  --secret-string '{"username":"your-email","password":"your-password"}'
```

### Manual Secret Rotation
```bash
# Update EZPass credentials
aws secretsmanager update-secret \
  --secret-id "turo-ezpass/ezpass/credentials" \
  --secret-string '{"username":"new-username","password":"new-password"}'

# Update Turo credentials  
aws secretsmanager update-secret \
  --secret-id "turo-ezpass/turo/credentials" \
  --secret-string '{"username":"new-email","password":"new-password"}'
```

## 🧪 Smoke Testing

### End-to-End Test Procedure

1. **Verify Infrastructure**
```bash
# Check ECS cluster status
aws ecs describe-clusters --clusters turo-ezpass-cluster

# Verify secrets exist
aws secretsmanager list-secrets --filters Key=name,Values=turo-ezpass

# Check S3 bucket
aws s3 ls s3://turo-ezpass-proofs-$(aws sts get-caller-identity --query Account --output text)
```

2. **Manual Task Execution**
```bash
# Run scraper task manually
aws ecs run-task \
  --cluster turo-ezpass-cluster \
  --task-definition turo-ezpass-scraper \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

3. **Verify Results**
```bash
# Check logs
aws logs describe-log-streams --log-group-name "/ecs/turo-ezpass"

# Check S3 for proof files
aws s3 ls s3://turo-ezpass-proofs-$(aws sts get-caller-identity --query Account --output text) --recursive
```

## 🚨 Troubleshooting Guide

### Dashboard System Issues

#### 1. Dashboard Not Loading
**Symptoms**: White screen, 404 errors, timeout
**Investigation**:
```bash
# Check CloudFront distribution status
aws cloudfront get-distribution --id $(terraform output -raw cloudfront_distribution_id)

# Verify S3 bucket contents
aws s3 ls s3://$(terraform output -raw s3_bucket_name)/ --recursive

# Test direct S3 access
curl -I $(terraform output -raw dashboard_url)

# Check CloudFront invalidation status
aws cloudfront list-invalidations --distribution-id $(terraform output -raw cloudfront_distribution_id)
```

**Common Fixes**:
- Redeploy dashboard: `cd dashboard && npm run build && aws s3 sync dist/ s3://bucket-name/ --delete`
- Invalidate CloudFront cache: `aws cloudfront create-invalidation --distribution-id ID --paths "/*"`
- Check S3 bucket policy and CloudFront OAC configuration

#### 2. API Endpoints Not Responding
**Symptoms**: 502/503 errors, timeouts, CORS errors
**Investigation**:
```bash
# Test API directly
curl -X GET "$(terraform output -raw api_gateway_url)/trips?userId=test"

# Check Lambda function logs
aws logs tail /aws/lambda/turo-ezpass-prod-trips-api --follow

# Check API Gateway logs
aws logs describe-log-groups --log-group-name-prefix "API-Gateway-Execution-Logs"

# Test Lambda function directly
aws lambda invoke --function-name turo-ezpass-prod-trips-api --payload '{}' response.json
```

**Common Fixes**:
- Restart Lambda: Redeploy via Terraform or GitHub Actions
- Check IAM permissions for DynamoDB access
- Verify API Gateway stage deployment
- Update CORS configuration if needed

#### 3. Authentication Issues
**Symptoms**: Login failures, token errors, infinite redirects
**Investigation**:
```bash
# Check Cognito User Pool status
aws cognito-idp describe-user-pool --user-pool-id $(terraform output -raw cognito_user_pool_id)

# Verify User Pool Client configuration
aws cognito-idp describe-user-pool-client --user-pool-id POOL_ID --client-id CLIENT_ID

# Test authentication flow
# Check browser developer tools for JWT token issues
```

**Common Fixes**:
- Verify Cognito configuration in dashboard environment variables
- Check callback URLs in Cognito client
- Ensure JWT tokens are properly validated
- Clear browser cache and localStorage

### Legacy ECS Scraper Issues

#### 4. ECS Task Failures
**Symptoms**: Tasks stopping immediately, error logs in CloudWatch
**Investigation**:
```bash
# Get recent task failures
aws ecs list-tasks --cluster turo-ezpass-cluster --desired-status STOPPED

# Check task details
aws ecs describe-tasks --cluster turo-ezpass-cluster --tasks <task-arn>

# Review logs
aws logs get-log-events --log-group-name "/ecs/turo-ezpass" --log-stream-name "ecs/scraper/<task-id>"
```

**Common Fixes**:
- Verify secrets are properly formatted
- Check network connectivity (security groups/subnets)
- Validate Docker image exists and is accessible

#### 2. Scraper Login Failures
**Symptoms**: "Login failed" errors in logs
**Investigation**:
- Check screenshot files in S3 bucket under `failure-screenshots/`
- Review error logs for specific failure reasons
- Verify credentials in Secrets Manager

**Common Fixes**:
- Update selectors if website layout changed
- Rotate credentials if account locked
- Adjust timeout settings for slow network

#### 3. High Costs
**Symptoms**: Cost alarm triggered
**Investigation**:
```bash
# Check current month costs
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

**Optimization Actions**:
- Review ECS task frequency and resource allocation
- Check S3 storage classes and lifecycle policies
- Analyze CloudWatch log retention settings

## 📅 Maintenance Tasks

### Daily
- [ ] Review CloudWatch dashboard for anomalies
- [ ] Check alert email for any notifications
- [ ] Verify recent scraper runs completed successfully

### Weekly
- [ ] Review cost dashboard and trends
- [ ] Check S3 storage usage and cleanup old files
- [ ] Validate secrets are still working

### Monthly
- [ ] Security review (triggered automatically)
- [ ] Update dependencies and security patches
- [ ] Review and adjust resource sizing based on usage
- [ ] Test disaster recovery procedures

### Quarterly
- [ ] Full infrastructure review
- [ ] Credential rotation (if not automated)
- [ ] Performance optimization review
- [ ] Documentation updates

## 🔄 Disaster Recovery

### Infrastructure Recreation
```bash
# 1. Ensure Terraform state is backed up
terraform state pull > terraform.tfstate.backup

# 2. Destroy and recreate (if needed)
terraform destroy -auto-approve
terraform apply -auto-approve

# 3. Restore secrets from backup
# (Secrets should be stored securely outside of Terraform)
```

### Rollback Procedures
```bash
# 1. Identify last known good deployment
git log --oneline -10

# 2. Checkout previous version
git checkout <commit-hash>

# 3. Apply previous configuration
terraform plan
terraform apply
```

## 🔄 Force New Scraper Run

### Manual Scraper Trigger

#### Option 1: EventBridge Manual Trigger
```bash
# Trigger immediate scraper run
aws events put-events \
  --entries '[{
    "Source": "manual.trigger",
    "DetailType": "Manual Scraper Run",
    "Detail": "{\"userId\":\"manual-trigger\",\"timestamp\":\"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'\"}"
  }]'

# Monitor execution
aws logs tail /ecs/turo-ezpass --follow --since 5m
```

#### Option 2: ECS Task Direct Run
```bash
# Get cluster and task definition info
CLUSTER_NAME=$(aws ecs list-clusters --query 'clusterArns[?contains(@, `turo-ezpass`)]' --output text | head -1)
TASK_DEF=$(aws ecs list-task-definitions --family-prefix turo-ezpass --status ACTIVE --sort DESC --max-items 1 --query 'taskDefinitionArns[0]' --output text)

# Run task manually
aws ecs run-task \
  --cluster "$CLUSTER_NAME" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"

# Follow logs
aws logs tail /ecs/turo-ezpass --follow
```

#### Option 3: GitHub Actions Manual Trigger
```bash
# Trigger via GitHub CLI
gh workflow run "scraper-manual-run.yml" --ref main

# Or via GitHub web interface:
# Go to Actions tab → Select workflow → Run workflow
```

## 🔍 Log Inspection and Monitoring

### Comprehensive Log Analysis

#### 1. Dashboard System Logs
```bash
# API Lambda logs
aws logs tail /aws/lambda/turo-ezpass-prod-trips-api --follow --since 1h

# Analytics Lambda logs
aws logs tail /aws/lambda/turo-ezpass-prod-analytics --follow --since 1h

# CloudFront access logs (if enabled)
aws s3 ls s3://cloudfront-logs-bucket/

# API Gateway execution logs
aws logs describe-log-groups --log-group-name-prefix "API-Gateway-Execution-Logs"
```

#### 2. Legacy Scraper Logs
```bash
# ECS task logs
aws logs tail /ecs/turo-ezpass --follow --since 2h

# Application-specific logs
aws logs filter-events \
  --log-group-name "/ecs/turo-ezpass" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR"

# Docker container logs
aws logs get-log-events \
  --log-group-name "/ecs/turo-ezpass" \
  --log-stream-name "ecs/scraper/$(date +%Y%m%d)"
```

#### 3. Infrastructure Logs
```bash
# CloudWatch Insights queries
aws logs start-query \
  --log-group-name "/aws/lambda/turo-ezpass-prod-trips-api" \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc'

# DynamoDB query patterns
aws logs filter-events \
  --log-group-name "/aws/lambda/turo-ezpass-prod-trips-api" \
  --filter-pattern "[timestamp, requestId, ERROR]"
```

### Log Search and Analysis
```bash
# Search for specific errors
aws logs filter-events \
  --log-group-name "/ecs/turo-ezpass" \
  --start-time $(date -d '24 hours ago' +%s)000 \
  --filter-pattern "{ $.level = \"ERROR\" || $.message = \"*failed*\" }"

# Performance analysis
aws logs filter-events \
  --log-group-name "/aws/lambda/turo-ezpass-prod-trips-api" \
  --filter-pattern "[timestamp, requestId, duration > 5000]"

# User activity patterns
aws logs filter-events \
  --log-group-name "/aws/lambda/turo-ezpass-prod-trips-api" \
  --filter-pattern "{ $.userId = * }"
```

## 🔙 Rollback Procedures

### Git-Based Rollbacks

#### 1. Application Rollback
```bash
# List recent releases
git tag --sort=-version:refname | head -10

# Find last known good version
git log --oneline --since="24 hours ago"

# Rollback to specific version
git checkout v1.2.0  # Replace with last known good version
git push origin main --force-with-lease  # Trigger automatic deployment
```

#### 2. Infrastructure Rollback
```bash
# Rollback Terraform changes
cd api/terraform

# Check what will be reverted
terraform plan

# Apply previous configuration
git checkout HEAD~1 -- *.tf
terraform apply

# Or use specific state
terraform state list
terraform import <resource> <id>  # If needed
```

#### 3. Dashboard Rollback
```bash
# Quick rollback to previous S3 version
aws s3api list-object-versions \
  --bucket $(terraform output -raw s3_bucket_name) \
  --prefix index.html

# Restore previous version
aws s3api restore-object \
  --bucket $(terraform output -raw s3_bucket_name) \
  --key index.html \
  --version-id VERSION_ID

# Full rebuild from previous commit
git checkout v1.2.0
cd dashboard
npm install
npm run build
aws s3 sync dist/ s3://$(terraform output -raw s3_bucket_name)/ --delete
```

### Database Rollbacks
```bash
# DynamoDB point-in-time recovery
aws dynamodb restore-table-to-point-in-time \
  --source-table-name turo_ezpass_trips \
  --target-table-name turo_ezpass_trips_restored \
  --restore-date-time "2024-01-15T10:00:00Z"

# Backup current data before changes
aws dynamodb scan --table-name turo_ezpass_trips > backup-$(date +%Y%m%d-%H%M%S).json
```

### Emergency Procedures
```bash
# Complete system shutdown (emergency only)
# 1. Disable EventBridge rules
aws events disable-rule --name turo-ezpass-scheduler

# 2. Stop ECS service
aws ecs update-service \
  --cluster turo-ezpass-cluster \
  --service turo-ezpass-scraper \
  --desired-count 0

# 3. Disable API Gateway (if needed)
# Update stage to point to maintenance endpoint

# 4. Enable maintenance mode
aws s3 cp maintenance.html s3://$(terraform output -raw s3_bucket_name)/index.html
```

## 📞 On-Call Escalation Procedures

### Escalation Matrix

| Time | Severity | Action | Contact |
|------|----------|--------|---------|
| 0-5 min | Critical | Page primary on-call | PagerDuty |
| 15 min | Critical | Escalate to team lead | PagerDuty + Slack |
| 30 min | Critical | Involve engineering manager | Phone + Email |
| 60 min | Critical | Executive escalation | VP Engineering |
| 2 hour | Critical | All-hands response | CTO |

### Response Procedures

#### 1. Initial Response (0-5 minutes)
```bash
# Acknowledge alert in PagerDuty
# Join incident Slack channel: #incident-turo-ezpass
# Quick system health check:

# Check overall system status
curl -I $(terraform output -raw dashboard_url)
curl -I $(terraform output -raw api_gateway_url)/trips?userId=health

# Review recent alerts
aws cloudwatch describe-alarms --state-value ALARM
```

#### 2. Investigation Phase (5-15 minutes)
```bash
# Gather system metrics
aws cloudwatch get-metric-statistics \
  --namespace TuroEZPass \
  --metric-name RecentScrapes24h \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Maximum

# Check for recent changes
git log --oneline --since="6 hours ago"
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=UpdateService
```

#### 3. Communication Protocol
```bash
# Update incident channel every 15 minutes
# Format: "[HH:MM] STATUS: description of current investigation/actions"

# Example updates:
# "[10:15] INVESTIGATING: API returning 502 errors, checking Lambda health"
# "[10:30] IDENTIFIED: DynamoDB throttling causing timeouts, scaling up"
# "[10:45] FIXING: Applied capacity increase, monitoring recovery"
# "[11:00] RESOLVED: All systems normal, conducting post-mortem"
```

### Escalation Contacts

#### Primary On-Call
- **Contact**: PagerDuty → Primary escalation policy
- **Response Time**: 5 minutes
- **Scope**: Initial triage, basic troubleshooting
- **Authority**: System restarts, basic configuration changes

#### Secondary On-Call (Team Lead)
- **Contact**: PagerDuty → Secondary escalation (15 min)
- **Response Time**: 15 minutes
- **Scope**: Advanced troubleshooting, infrastructure changes
- **Authority**: Terraform applies, significant configuration changes

#### Engineering Manager
- **Contact**: Phone + Email (30 min)
- **Response Time**: 30 minutes
- **Scope**: Resource allocation, external vendor coordination
- **Authority**: Budget increases, third-party service changes

#### Executive Escalation
- **Contact**: VP Engineering (60 min)
- **Response Time**: 60 minutes
- **Scope**: Business impact assessment, customer communication
- **Authority**: Major architectural changes, service shutdowns

### Alert Severity Definitions

#### P1 (Critical) - Page Immediately
- Complete system failure
- Data loss or corruption
- Security breach
- Customer-facing functionality down > 15 minutes

#### P2 (High) - Page within 30 minutes
- Partial service degradation
- Performance issues affecting >50% of users
- Failed deployments to production
- Integration failures with external services

#### P3 (Medium) - Handle during business hours
- Performance issues affecting <50% of users
- Non-critical feature failures
- Monitoring gaps
- Configuration drift

#### P4 (Low) - Queue for next sprint
- Cosmetic issues
- Documentation updates
- Optimization opportunities
- Technical debt

## 📋 Checklists

### Pre-Deployment Checklist
- [ ] Terraform plan reviewed and approved
- [ ] Secrets properly configured
- [ ] Network settings validated
- [ ] Monitoring alerts configured
- [ ] Cost budgets set
- [ ] Documentation updated

### Post-Deployment Checklist
- [ ] Smoke tests passed
- [ ] Monitoring dashboard accessible
- [ ] Alerts functioning
- [ ] S3 bucket created and accessible
- [ ] ECS tasks can start successfully
- [ ] Secrets accessible by tasks

### Incident Response Checklist
- [ ] Alert acknowledged
- [ ] Severity assessed
- [ ] Initial investigation started
- [ ] Stakeholders notified
- [ ] Root cause identified
- [ ] Fix applied and tested
- [ ] Post-mortem scheduled
- [ ] Documentation updated

## 🔗 Useful Links

- [AWS Console](https://console.aws.amazon.com/)
- [CloudWatch Dashboards](https://console.aws.amazon.com/cloudwatch/home#dashboards:)
- [ECS Console](https://console.aws.amazon.com/ecs/home#/clusters)
- [Secrets Manager](https://console.aws.amazon.com/secretsmanager/home)
- [S3 Console](https://s3.console.aws.amazon.com/)
- [Terraform Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

---

## 📚 Additional Resources

### Documentation Links
- [Dashboard Deployment Guide](./DASHBOARD_DEPLOYMENT_GUIDE.md)
- [Secrets Setup Guide](./SECRETS_SETUP_GUIDE.md)
- [DNS Configuration Guide](./DNS_CONFIGURATION_GUIDE.md)
- [Alerts & On-Call Setup](./ALERTS_ONCALL_SETUP.md)
- [Pull Request Review Checklist](./PR_REVIEW_CHECKLIST.md)

### AWS Console Quick Links
- [CloudWatch Dashboard](https://console.aws.amazon.com/cloudwatch/home#dashboards:name=turo-ezpass-prod-dashboard)
- [Lambda Functions](https://console.aws.amazon.com/lambda/home#/functions?f0=true&n0=false&op=and&v0=turo-ezpass)
- [API Gateway](https://console.aws.amazon.com/apigateway/home#/apis)
- [DynamoDB Tables](https://console.aws.amazon.com/dynamodb/home#tables:selected=turo_ezpass_trips)
- [ECS Clusters](https://console.aws.amazon.com/ecs/home#/clusters/turo-ezpass-cluster)
- [S3 Dashboard Bucket](https://s3.console.aws.amazon.com/s3/buckets/)
- [CloudFront Distributions](https://console.aws.amazon.com/cloudfront/home#/distributions)
- [Secrets Manager](https://console.aws.amazon.com/secretsmanager/home)

### External Integration Links
- [GitHub Actions Workflows](https://github.com/your-org/turo-ezpass/actions)
- [PagerDuty Service](https://your-org.pagerduty.com/services/)
- [Slack #turo-ezpass-ops](https://your-org.slack.com/channels/turo-ezpass-ops)

### Emergency Contacts
- **Primary On-Call**: Via PagerDuty escalation policy
- **Secondary On-Call**: Via PagerDuty or Slack @oncall-team
- **Engineering Manager**: manager@yourcompany.com
- **VP Engineering**: vp-eng@yourcompany.com

---

**Document Information**:
- **Last Updated**: January 2024 (v1.0.0 Production Release)
- **Version**: 2.0 (Dashboard System)
- **Next Review**: Monthly
- **Maintained By**: Infrastructure & Development Teams
- **Document Status**: Production Ready