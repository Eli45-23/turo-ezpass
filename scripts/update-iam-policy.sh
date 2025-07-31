#!/bin/bash

# Update IAM policy for turo-terraform user

set -e

echo "Updating IAM policy for turo-terraform user..."

# Get the policy ARN
POLICY_ARN=$(aws iam list-attached-user-policies --user-name turo-terraform --query "AttachedPolicies[?PolicyName=='TuroEZPassTerraformPolicy'].PolicyArn" --output text)

if [ -z "$POLICY_ARN" ]; then
    echo "Error: Could not find TuroEZPassTerraformPolicy attached to turo-terraform user"
    exit 1
fi

echo "Found policy ARN: $POLICY_ARN"

# Create a new policy version
aws iam create-policy-version \
    --policy-arn "$POLICY_ARN" \
    --policy-document file://turo-ezpass-terraform-policy.json \
    --set-as-default

echo "✅ IAM policy updated successfully"