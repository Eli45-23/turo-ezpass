#!/bin/bash

# This script updates the GitHub Actions role with necessary Terraform permissions
# Run this with AWS admin credentials

ROLE_NAME="turo-ezpass-github-actions-role"
POLICY_NAME="TerraformDeploymentPolicy"
ACCOUNT_ID="486365525776"

# Create the policy
aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name $POLICY_NAME \
  --policy-document file://github-actions-terraform-policy.json

echo "✅ Updated $ROLE_NAME with Terraform deployment permissions"
echo ""
echo "The role now has permissions to:"
echo "- Create/manage CloudWatch Logs"
echo "- Create/manage IAM roles and policies"
echo "- Create/manage S3 buckets"
echo "- Create/manage SNS topics"
echo "- Create/manage ECR repositories"
echo "- Create/manage EventBridge rules"
echo "- Create/manage KMS keys"
echo "- Create/manage Secrets Manager"
echo "- Create/manage Lambda functions"
echo "- Create/manage ECS resources"
echo "- Create/manage VPC resources"
echo ""
echo "Re-run your GitHub Actions workflow and it should succeed!"