#!/bin/bash

# Terraform Import Script for Turo-EZPass Production Resources
# This script imports existing AWS resources into Terraform state

set -e

echo "🚀 Starting Terraform import process for Turo-EZPass production resources..."

cd api/terraform

# Function to run terraform import with error handling
import_resource() {
    local resource_address="$1"
    local resource_id="$2"
    local description="$3"
    
    echo "📦 Importing $description: $resource_address"
    if terraform import "$resource_address" "$resource_id" 2>/dev/null; then
        echo "✅ Successfully imported: $resource_address"
    else
        echo "⚠️  Already exists or failed to import: $resource_address"
    fi
}

# Import Lambda functions
echo "🔧 Importing Lambda functions..."
import_resource "aws_lambda_function.trips_api" "turo-ezpass-prod-trips-api" "Trips API Lambda function"

# Check if analytics Lambda exists and import if so
if aws lambda get-function --function-name turo-ezpass-prod-analytics >/dev/null 2>&1; then
    import_resource "aws_lambda_function.analytics" "turo-ezpass-prod-analytics" "Analytics Lambda function"
else
    echo "⚠️  Analytics Lambda function does not exist yet"
fi

# Import API Gateway resources
echo "🌐 Importing API Gateway resources..."
API_ID="d0dn74r1y1"
import_resource "aws_api_gateway_rest_api.trips_api" "$API_ID" "API Gateway REST API"

# Get deployments and stages
DEPLOYMENTS=$(aws apigateway get-deployments --rest-api-id $API_ID --query 'items[0].id' --output text 2>/dev/null || echo "")
if [ "$DEPLOYMENTS" != "" ] && [ "$DEPLOYMENTS" != "None" ]; then
    import_resource "aws_api_gateway_deployment.trips_api_deployment" "$API_ID/$DEPLOYMENTS" "API Gateway deployment"
fi

# Check for stages
STAGE_PROD=$(aws apigateway get-stage --rest-api-id $API_ID --stage-name prod --query 'stageName' --output text 2>/dev/null || echo "")
if [ "$STAGE_PROD" = "prod" ]; then
    import_resource "aws_api_gateway_stage.prod" "$API_ID/prod" "API Gateway prod stage"
fi

# Import ACM Certificate
echo "🔒 Importing ACM Certificate..."
CERT_ARN=$(aws acm list-certificates --query "CertificateSummaryList[?contains(DomainName, 'turoezpass')].CertificateArn" --output text)
if [ "$CERT_ARN" != "" ]; then
    import_resource "aws_acm_certificate.dashboard_cert[0]" "$CERT_ARN" "ACM Certificate"
fi

# Import S3 buckets
echo "🪣 Importing S3 buckets..."
DASHBOARD_BUCKET=$(aws s3api list-buckets --query "Buckets[?contains(Name, 'turo-ezpass-prod-dashboard')].Name" --output text)
if [ "$DASHBOARD_BUCKET" != "" ]; then
    import_resource "aws_s3_bucket.dashboard_hosting" "$DASHBOARD_BUCKET" "Dashboard S3 bucket"
fi

# Import CloudFront distributions
echo "☁️  Checking for CloudFront distributions..."
CLOUDFRONT_IDS=$(aws cloudfront list-distributions --query "DistributionList.Items[?contains(Comment, 'turo-ezpass') || contains(to_string(Aliases.Items), 'turoezpass')].Id" --output text)
if [ "$CLOUDFRONT_IDS" != "" ]; then
    for dist_id in $CLOUDFRONT_IDS; do
        import_resource "aws_cloudfront_distribution.dashboard_distribution" "$dist_id" "CloudFront distribution"
        break  # Import first one found
    done
fi

# Import Route 53 records if they exist
echo "📍 Checking for Route 53 records..."
HOSTED_ZONES=$(aws route53 list-hosted-zones-by-name --query "HostedZones[?contains(Name, 'turoezpass')].Id" --output text)
if [ "$HOSTED_ZONES" != "" ]; then
    for zone_id in $HOSTED_ZONES; do
        # Remove /hostedzone/ prefix
        clean_zone_id=${zone_id#/hostedzone/}
        
        # Import A records
        import_resource "aws_route53_record.app_domain[0]" "${clean_zone_id}_app.turoezpass.com_A" "Route 53 app domain A record"
        import_resource "aws_route53_record.api_domain[0]" "${clean_zone_id}_api.turoezpass.com_A" "Route 53 API domain A record"
    done
fi

echo "✅ Terraform import process completed!"
echo "📋 Next steps:"
echo "   1. Run 'terraform plan' to see what needs to be updated"
echo "   2. Run 'terraform apply' to synchronize state"
echo "   3. Verify no changes are needed with final 'terraform plan'"