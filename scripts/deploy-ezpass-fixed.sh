#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────
# E-ZPass Scraper Full Deployment Pipeline (Fixed)
# ──────────────────────────────────────────────────────

# Configuration
ECR_REPO="486365525776.dkr.ecr.us-east-1.amazonaws.com/turo-ezpass"
CLUSTER_NAME="turo-ezpass-cluster"
SERVICE_NAME="turo-ezpass-scraper"
LOG_GROUP="/ecs/turo-ezpass"

echo
echo "🚀 Starting E-ZPass deployment pipeline..."
echo

# 1️⃣  Build & tag Docker image
echo "🐳 Building Docker image..."
docker build -t turo-ezpass:latest .

echo "🏷  Tagging for ECR: ${ECR_REPO}:latest"
docker tag turo-ezpass:latest "${ECR_REPO}:latest"
echo

# 2️⃣  Push to ECR
echo "🔐 Authenticating with ECR..."
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin "${ECR_REPO}"

echo "⬆️  Pushing image to ECR..."
docker push "${ECR_REPO}:latest"
echo

# 3️⃣  Try multiple deployment approaches
echo "🔄 Attempting ECS deployment..."

# Check permissions first
echo "🔍 Checking ECS permissions..."
if aws ecs describe-services --cluster "${CLUSTER_NAME}" --services "${SERVICE_NAME}" >/dev/null 2>&1; then
  echo "✅ Can read ECS services"
  
  # Try force deployment
  if aws ecs update-service --cluster "${CLUSTER_NAME}" --service "${SERVICE_NAME}" --force-new-deployment --no-cli-pager 2>/dev/null; then
    echo "✅ Force deployment successful"
  else
    echo "❌ Force deployment failed, trying restart approach..."
    
    # Try stop/start approach
    echo "🛑 Stopping service..."
    aws ecs update-service --cluster "${CLUSTER_NAME}" --service "${SERVICE_NAME}" --desired-count 0 --no-cli-pager
    
    echo "⏳ Waiting for tasks to stop..."
    sleep 15
    
    echo "🚀 Starting service..."
    aws ecs update-service --cluster "${CLUSTER_NAME}" --service "${SERVICE_NAME}" --desired-count 1 --no-cli-pager
  fi
else
  echo "❌ Cannot access ECS service. Check IAM permissions."
  echo "Required permissions: ecs:DescribeServices, ecs:UpdateService"
fi
echo

# 4️⃣  Trigger manual scraper run via EventBridge
echo "⚡ Sending manual trigger event..."
if aws events put-events \
  --entries '[{"Source":"custom.scraper","DetailType":"Manual Scraper Trigger","Detail":"{\"action\":\"run_scraper\"}"}]' \
  --no-cli-pager 2>/dev/null; then
  echo "✅ EventBridge trigger sent"
else
  echo "❌ EventBridge trigger failed - check permissions"
fi
echo

# 5️⃣  Tail the last 5 minutes of CloudWatch logs, follow live
echo "📋 Tailing logs from ${LOG_GROUP} (last 5m) →"
if aws logs tail "${LOG_GROUP}" --since 5m --follow 2>/dev/null; then
  echo "✅ Log tailing complete"
else
  echo "❌ Cannot tail logs - check CloudWatch permissions"
  echo "💡 Try: aws logs describe-log-groups --log-group-name-prefix '/ecs/turo-ezpass'"
fi

echo
echo "✅ Deployment pipeline complete!"