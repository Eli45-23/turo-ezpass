#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────
# Turo-EZPass Production Deployment Script
# ──────────────────────────────────────────────────────

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly LOG_FILE="/tmp/turo-ezpass-deploy-$(date +%s).log"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging functions
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}ℹ️  $*${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✅ $*${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $*${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}❌ $*${NC}" | tee -a "$LOG_FILE"
}

# Usage function
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy Turo-EZPass to production with turoezpass.com domain.

Options:
    -h, --help          Show this help message
    -y, --yes           Skip confirmation prompts
    --plan-only         Run terraform plan only (no apply)
    --skip-dns-check    Skip DNS propagation checks
    --email EMAIL       Override alert email address

Examples:
    $0                              # Interactive deployment
    $0 -y                          # Auto-confirm all prompts
    $0 --plan-only                 # Just show what would be deployed
    $0 --email admin@turoezpass.com # Use specific email for alerts

EOF
}

# Parse command line arguments
AUTO_CONFIRM=false
PLAN_ONLY=false
SKIP_DNS_CHECK=false
ALERT_EMAIL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -y|--yes)
            AUTO_CONFIRM=true
            shift
            ;;
        --plan-only)
            PLAN_ONLY=true
            shift
            ;;
        --skip-dns-check)
            SKIP_DNS_CHECK=true
            shift
            ;;
        --email)
            ALERT_EMAIL="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check required commands
    local required_commands=("terraform" "aws" "node" "npm" "dig")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required command not found: $cmd"
            exit 1
        fi
    done
    
    # Check Terraform version (need 1.0+)
    local tf_version
    tf_version=$(terraform version -json | jq -r '.terraform_version' 2>/dev/null || echo "0.0.0")
    if [[ "$(echo "$tf_version" | cut -d'.' -f1)" -lt 1 ]]; then
        log_error "Terraform 1.0+ required, found version: $tf_version"
        exit 1
    fi
    
    # Check AWS CLI configuration
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS CLI not configured or no valid credentials"
        exit 1
    fi
    
    # Check Node.js version (need 18+)
    local node_version
    node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$node_version" -lt 18 ]]; then
        log_error "Node.js 18+ required, found version: $(node --version)"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Validate domain ownership
check_domain_ownership() {
    if [[ "$SKIP_DNS_CHECK" == "true" ]]; then
        log_warning "Skipping DNS ownership check"
        return 0
    fi
    
    log_info "Checking domain ownership for turoezpass.com..."
    
    # Check if domain exists and has NS records
    if dig +short NS turoezpass.com | grep -q .; then
        log_success "Domain turoezpass.com has NS records"
        
        # Check if domain is using Route53
        local ns_records
        ns_records=$(dig +short NS turoezpass.com)
        if echo "$ns_records" | grep -q "awsdns"; then
            log_success "Domain is using Route53 - DNS records will be created automatically"
        else
            log_warning "Domain is not using Route53 - you may need to manually create DNS records"
            log_warning "After deployment, create these DNS records:"
            log_warning "  api.turoezpass.com -> (will be shown in Terraform output)"
            log_warning "  app.turoezpass.com -> (will be shown in Terraform output)"
        fi
    else
        log_error "Domain turoezpass.com does not exist or has no NS records"
        log_error "Please ensure you own this domain and it's configured in Route53"
        exit 1
    fi
}

# Update configuration files
update_configuration() {
    log_info "Updating configuration files..."
    
    # Update alert email if provided
    if [[ -n "$ALERT_EMAIL" ]]; then
        log_info "Updating alert email to: $ALERT_EMAIL"
        sed -i.bak "s/alert_email = \".*\"/alert_email = \"$ALERT_EMAIL\"/" "$SCRIPT_DIR/api/terraform/terraform.tfvars"
    fi
    
    log_success "Configuration updated"
}

# Deploy infrastructure
deploy_infrastructure() {
    log_info "Deploying infrastructure with Terraform..."
    
    cd "$SCRIPT_DIR/api/terraform"
    
    # Initialize Terraform
    log_info "Initializing Terraform..."
    if ! terraform init 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Terraform init failed"
        exit 1
    fi
    
    # Create workspace for production if it doesn't exist
    terraform workspace select prod 2>/dev/null || terraform workspace new prod
    
    # Plan deployment
    log_info "Planning Terraform deployment..."
    if ! terraform plan -out=tfplan 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Terraform plan failed"
        exit 1
    fi
    
    if [[ "$PLAN_ONLY" == "true" ]]; then
        log_info "Plan-only mode: deployment stopped after planning"
        return 0
    fi
    
    # Confirm before applying
    if [[ "$AUTO_CONFIRM" != "true" ]]; then
        echo
        read -p "Do you want to apply these changes? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled by user"
            exit 0
        fi
    fi
    
    # Apply deployment
    log_info "Applying Terraform deployment..."
    if ! terraform apply tfplan 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Terraform apply failed"
        exit 1
    fi
    
    # Save outputs
    log_info "Saving Terraform outputs..."
    terraform output -json > /tmp/terraform-outputs.json
    
    log_success "Infrastructure deployment completed"
}

# Build and deploy dashboard
deploy_dashboard() {
    log_info "Building and deploying dashboard..."
    
    cd "$SCRIPT_DIR/dashboard"
    
    # Install dependencies
    log_info "Installing dashboard dependencies..."
    if ! npm ci 2>&1 | tee -a "$LOG_FILE"; then
        log_error "npm install failed"
        exit 1
    fi
    
    # Update environment with Terraform outputs
    if [[ -f "/tmp/terraform-outputs.json" ]]; then
        log_info "Updating dashboard environment with deployment outputs..."
        
        # Extract values from Terraform outputs
        local api_url dashboard_url cognito_user_pool_id cognito_client_id
        api_url=$(jq -r '.api_gateway_url.value // empty' /tmp/terraform-outputs.json)
        dashboard_url=$(jq -r '.dashboard_url.value // empty' /tmp/terraform-outputs.json)
        cognito_user_pool_id=$(jq -r '.cognito_user_pool_id.value // empty' /tmp/terraform-outputs.json)
        cognito_client_id=$(jq -r '.cognito_client_id.value // empty' /tmp/terraform-outputs.json)
        
        # Update .env.local
        if [[ -n "$api_url" ]]; then
            sed -i.bak "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=$api_url|" .env.local
            sed -i.bak "s|NEXT_PUBLIC_API_AUTH_URL=.*|NEXT_PUBLIC_API_AUTH_URL=$api_url|" .env.local
        fi
        
        if [[ -n "$cognito_user_pool_id" ]]; then
            if grep -q "# NEXT_PUBLIC_COGNITO_USER_POOL_ID" .env.local; then
                sed -i.bak "s|# NEXT_PUBLIC_COGNITO_USER_POOL_ID=.*|NEXT_PUBLIC_COGNITO_USER_POOL_ID=$cognito_user_pool_id|" .env.local
            else
                echo "NEXT_PUBLIC_COGNITO_USER_POOL_ID=$cognito_user_pool_id" >> .env.local
            fi
        fi
        
        if [[ -n "$cognito_client_id" ]]; then
            if grep -q "# NEXT_PUBLIC_COGNITO_CLIENT_ID" .env.local; then
                sed -i.bak "s|# NEXT_PUBLIC_COGNITO_CLIENT_ID=.*|NEXT_PUBLIC_COGNITO_CLIENT_ID=$cognito_client_id|" .env.local
            else
                echo "NEXT_PUBLIC_COGNITO_CLIENT_ID=$cognito_client_id" >> .env.local
            fi
        fi
        
        if grep -q "# NEXT_PUBLIC_COGNITO_REGION" .env.local; then
            sed -i.bak "s|# NEXT_PUBLIC_COGNITO_REGION=.*|NEXT_PUBLIC_COGNITO_REGION=us-east-1|" .env.local
        else
            echo "NEXT_PUBLIC_COGNITO_REGION=us-east-1" >> .env.local
        fi
    fi
    
    # Build dashboard
    log_info "Building dashboard for production..."
    if ! npm run build 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Dashboard build failed"
        exit 1
    fi
    
    log_success "Dashboard built successfully"
}

# Display deployment summary
show_deployment_summary() {
    log_info "Generating deployment summary..."
    
    echo
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                       TURO-EZPASS DEPLOYMENT COMPLETE                       ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo
    
    if [[ -f "/tmp/terraform-outputs.json" ]]; then
        echo "🌐 URLs:"
        local api_url dashboard_url
        api_url=$(jq -r '.api_gateway_url.value // "Not available"' /tmp/terraform-outputs.json)
        dashboard_url=$(jq -r '.dashboard_url.value // "Not available"' /tmp/terraform-outputs.json)
        
        echo "  • Dashboard: https://app.turoezpass.com"
        echo "  • API:       https://api.turoezpass.com"
        echo "  • CloudFront Dashboard: $dashboard_url"
        echo "  • API Gateway: $api_url"
        echo
        
        echo "🔐 Authentication:"
        local cognito_user_pool_id cognito_client_id
        cognito_user_pool_id=$(jq -r '.cognito_user_pool_id.value // "Not configured"' /tmp/terraform-outputs.json)
        cognito_client_id=$(jq -r '.cognito_client_id.value // "Not configured"' /tmp/terraform-outputs.json)
        
        echo "  • Cognito User Pool: $cognito_user_pool_id"
        echo "  • Cognito Client ID: $cognito_client_id"
        echo
        
        echo "💾 Database:"
        echo "  • DynamoDB Table: turo_ezpass_trips"
        echo
    fi
    
    echo "📝 Next Steps:"
    echo "  1. Verify DNS propagation (may take 5-10 minutes)"
    echo "  2. Test dashboard at https://app.turoezpass.com"
    echo "  3. Test API at https://api.turoezpass.com/trips?userId=test"
    echo "  4. Create Cognito users for dashboard access"
    echo "  5. Configure your scraper to use the new API endpoint"
    echo
    
    echo "📊 Monitoring & Logs:"
    echo "  • CloudWatch Logs: /aws/lambda/turo-ezpass-prod-trips-api"
    echo "  • CloudWatch Alarms: Check AWS Console"
    echo "  • Cost Alerts: Configured for \$100/month"
    echo
    
    echo "🔧 Configuration Files:"
    echo "  • Terraform: $SCRIPT_DIR/api/terraform/terraform.tfvars"
    echo "  • Dashboard: $SCRIPT_DIR/dashboard/.env.local"
    echo "  • Log File: $LOG_FILE"
    echo
    
    log_success "🎉 Deployment completed successfully!"
    
    if [[ "$SKIP_DNS_CHECK" != "true" ]]; then
        echo
        log_info "Testing DNS propagation..."
        for i in {1..6}; do
            if dig +short app.turoezpass.com | grep -q .; then
                log_success "DNS propagation complete!"
                break
            elif [[ $i -eq 6 ]]; then
                log_warning "DNS propagation still in progress. Check again in a few minutes."
            else
                log_info "Waiting for DNS propagation... ($i/6)"
                sleep 30
            fi
        done
    fi
}

# Main function
main() {
    log_info "Starting Turo-EZPass production deployment..."
    
    check_prerequisites
    check_domain_ownership
    update_configuration
    deploy_infrastructure
    
    if [[ "$PLAN_ONLY" != "true" ]]; then
        deploy_dashboard
        show_deployment_summary
    fi
    
    log_success "Deployment script completed"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f /tmp/terraform-outputs.json
    find "$SCRIPT_DIR" -name "*.bak" -delete 2>/dev/null || true
}

# Set up signal handlers
trap cleanup EXIT
trap 'log_error "Script interrupted"; exit 130' INT TERM

# Run main function
main "$@"