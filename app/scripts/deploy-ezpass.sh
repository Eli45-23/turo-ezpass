#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────
# E-ZPass Scraper Full Deployment Pipeline
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

# 3️⃣  Force new ECS deployment
echo "🔄 Forcing ECS service to deploy new image..."
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${SERVICE_NAME}" \
  --force-new-deployment \
  --no-cli-pager
echo

# 4️⃣  Trigger manual scraper run via EventBridge
echo "⚡ Sending manual trigger event..."
aws events put-events \
  --entries '[{"Source":"custom.scraper","DetailType":"Manual Scraper Trigger","Detail":"{\"action\":\"run_scraper\"}"}]' \
  --no-cli-pager
echo

# 5️⃣  Tail the last 5 minutes of CloudWatch logs, follow live
echo "📋 Tailing logs from ${LOG_GROUP} (last 5m) →"
aws logs tail "${LOG_GROUP}" --since 5m --follow
echo

echo "✅ Deployment pipeline complete!"
