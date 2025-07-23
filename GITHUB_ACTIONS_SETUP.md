# GitHub Actions CI/CD Setup Guide

This guide walks you through setting up automated Docker image builds and ECR pushes using GitHub Actions with OIDC federation (no long-lived AWS credentials).

## 🚀 Quick Setup

### 1. Deploy OIDC Infrastructure

First, update the GitHub repository variable and deploy the OIDC setup:

```bash
# Update the github_repository variable in github-oidc-setup.tf
# Change "your-username/turo-ezpass" to your actual GitHub repo

# Deploy the OIDC infrastructure
terraform apply -target=aws_iam_openid_connect_provider.github_actions \
                -target=aws_iam_role.github_actions_ecr_push \
                -target=aws_iam_policy.github_actions_ecr_policy \
                -target=aws_iam_role_policy_attachment.github_actions_ecr_policy_attachment \
                -target=aws_ecr_repository.turo_ezpass \
                -target=aws_ecr_lifecycle_policy.turo_ezpass_lifecycle
```

### 2. Verify ECR Repository

Check that your ECR repository was created:

```bash
aws ecr describe-repositories --repository-names turo-ezpass --region us-east-1
```

### 3. Test the Workflow

The workflow will automatically trigger on:
- Direct pushes to `main` branch
- When PRs are merged into `main` branch

## 📋 What the Workflow Does

### Build Process
1. **Checks out code** using `actions/checkout@v4`
2. **Sets up Node.js 18** with npm caching
3. **Authenticates to AWS** via OIDC (no static credentials!)
4. **Logs into ECR** securely
5. **Builds Docker image** from `app/scripts/Dockerfile`
6. **Tags image** with both `latest` and git SHA
7. **Pushes to ECR** with Docker layer caching
8. **Cleans up** local Docker resources
9. **Runs security scan** on the pushed image

### Security Features
- ✅ **OIDC Federation** - No long-lived AWS credentials
- ✅ **Minimal Permissions** - Role only has ECR push/scan access
- ✅ **Repository Scoped** - OIDC trust only for your specific repo
- ✅ **Vulnerability Scanning** - Automatic ECR image scanning
- ✅ **Image Signing** - Container provenance and labels

### Performance Features
- ⚡ **Docker Layer Caching** - Uses GitHub Actions cache
- ⚡ **Multi-platform** - Builds for linux/amd64
- ⚡ **Parallel Jobs** - Build and security scan run in parallel
- ⚡ **Resource Cleanup** - Prevents runner disk space issues

## 🔧 Configuration

### Required Secrets/Variables
The workflow uses these from your environment or repository settings:

- `AWS_ACCOUNT_ID`: `486365525776` (hardcoded in workflow)
- `AWS_REGION`: `us-east-1` (hardcoded in workflow)

### IAM Role Configuration
The OIDC role (`github-actions-ecr-push-role`) has these permissions:
- ECR authentication token generation
- ECR repository read/write operations
- ECR vulnerability scanning
- Limited to the `turo-ezpass` repository only

### Repository Settings
No additional repository secrets needed! The workflow uses OIDC federation.

## 🏷️ Image Tagging Strategy

Images are tagged with:
- `latest` - Always points to the most recent main branch build
- `{git-sha}` - Specific commit SHA for reproducible deployments

Example:
```
486365525776.dkr.ecr.us-east-1.amazonaws.com/turo-ezpass:latest
486365525776.dkr.ecr.us-east-1.amazonaws.com/turo-ezpass:abc1234567890
```

## 🔍 Monitoring & Troubleshooting

### View Workflow Runs
- Go to your GitHub repository
- Click "Actions" tab
- Select "Build and Push Docker Image" workflow

### Common Issues

#### 1. OIDC Trust Relationship Error
```
Error: Could not assume role with OIDC
```
**Solution**: Verify the `github_repository` variable matches your actual repo name.

#### 2. ECR Permission Denied
```
Error: denied: User is not authorized to perform ecr:GetAuthorizationToken
```
**Solution**: Ensure the OIDC infrastructure was deployed successfully.

#### 3. Docker Build Context Error
```
Error: failed to solve: failed to read dockerfile
```
**Solution**: Verify `app/scripts/Dockerfile` exists and is valid.

### Debugging Commands

```bash
# Check OIDC provider
aws iam get-openid-connect-provider \
  --open-id-connect-provider-arn $(terraform output -raw oidc_provider_arn)

# Check IAM role
aws iam get-role --role-name github-actions-ecr-push-role

# List ECR images
aws ecr list-images --repository-name turo-ezpass --region us-east-1

# Get latest image digest
aws ecr describe-images \
  --repository-name turo-ezpass \
  --image-ids imageTag=latest \
  --region us-east-1
```

## 🔄 Updating the Workflow

To modify the workflow:

1. Edit `.github/workflows/publish-image.yml`
2. Commit and push to `main`
3. The workflow will run automatically on the push

## 🛡️ Security Best Practices

### What We Implemented
- ✅ OIDC federation instead of long-lived credentials
- ✅ Least privilege IAM policies
- ✅ Repository-scoped trust relationships
- ✅ Automatic vulnerability scanning
- ✅ Container image signing and labeling
- ✅ Encrypted ECR repository
- ✅ Image lifecycle management

### Additional Recommendations
- 🔐 Enable branch protection rules on `main`
- 🔐 Require PR reviews before merging
- 🔐 Enable security advisories for your repository
- 🔐 Set up Dependabot for dependency updates
- 🔐 Consider adding SAST/DAST scanning to the workflow

## 📈 Next Steps

After the workflow is working:

1. **Update ECS Task Definition** - Use the new `latest` tag
2. **Trigger Deployment** - Your existing EventBridge rules will use the new image
3. **Monitor Logs** - Use `./follow-logs.sh` to watch scraper execution
4. **Set up Alerts** - Configure notifications for build failures

## 🎯 Integration with Existing Infrastructure

The workflow integrates seamlessly with your existing Terraform setup:

```bash
# Update your ECS task to use the latest image
terraform apply -var="docker_image=486365525776.dkr.ecr.us-east-1.amazonaws.com/turo-ezpass:latest"

# Trigger a manual run
aws events put-events --entries '[{"Source":"custom.scraper","DetailType":"Manual Trigger","Detail":"{}"}]'

# Monitor the execution
./follow-logs.sh
```

That's it! Your CI/CD pipeline is now fully automated and secure. 🚀