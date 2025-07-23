# Turo-EZPass Operations Runbook

## 🚀 Quick Start Guide

### Prerequisites
- AWS CLI configured with appropriate permissions
- Terraform >= 1.0 installed
- Access to the AWS Console
- Email configured for alerts

### Initial Deployment
```bash
# 1. Clone and navigate to repository
cd turo-ezpass

# 2. Initialize Terraform
terraform init

# 3. Review and customize variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your specific values

# 4. Plan deployment
terraform plan

# 5. Deploy infrastructure
terraform apply
```

## 📊 Monitoring & Dashboards

### CloudWatch Dashboard
- **URL**: AWS Console → CloudWatch → Dashboards → "turo-ezpass-monitoring"
- **Key Metrics**:
  - ECS Task Health (Running/Failed)
  - S3 Storage Usage & Object Count
  - Scraper Success/Failure Rates
  - SNS Alert Delivery Status

### Critical Alarms
1. **ECS Task Failures** - Triggers after 3+ failures in 5 minutes
2. **No Data Alarm** - No successful runs in 24 hours
3. **High Failure Rate** - 5+ failures in 1 hour
4. **Cost Alarm** - Monthly costs exceed $50

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

### Common Issues

#### 1. ECS Task Failures
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

## 📞 Escalation Contacts

### On-Call Rotation
- **Primary**: Infrastructure Team
- **Secondary**: Development Team
- **Escalation**: Engineering Manager

### Alert Severity Levels
- **P1 (Critical)**: Complete system failure, data loss
- **P2 (High)**: Partial service degradation, security issues
- **P3 (Medium)**: Performance issues, non-critical failures
- **P4 (Low)**: Cosmetic issues, optimization opportunities

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

**Last Updated**: $(date)
**Version**: 1.0
**Next Review**: Monthly