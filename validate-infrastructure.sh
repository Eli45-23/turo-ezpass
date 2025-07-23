#!/bin/bash

# Turo-EZPass Infrastructure Validation Script
# This script performs comprehensive validation of the deployed infrastructure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="turo-ezpass"
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Test function wrapper
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    log_info "Running test: $test_name"
    
    if eval "$test_command" >/dev/null 2>&1; then
        log_success "$test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Detailed test function (shows output)
run_detailed_test() {
    local test_name="$1"
    local test_command="$2"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    log_info "Running detailed test: $test_name"
    
    if eval "$test_command"; then
        log_success "$test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

print_header() {
    echo -e "${BLUE}"
    echo "=================================================="
    echo "  Turo-EZPass Infrastructure Validation"
    echo "=================================================="
    echo -e "${NC}"
    echo "Account ID: $ACCOUNT_ID"
    echo "Region: $REGION"
    echo "Project: $PROJECT_NAME"
    echo ""
}

# Test 1: AWS CLI and credentials
test_aws_cli() {
    aws sts get-caller-identity > /dev/null
}

# Test 2: Terraform state
test_terraform_state() {
    terraform state list > /dev/null
}

# Test 3: ECS Cluster
test_ecs_cluster() {
    aws ecs describe-clusters --clusters ${PROJECT_NAME}-cluster --query 'clusters[0].status' --output text | grep -q ACTIVE
}

# Test 4: Secrets Manager
test_secrets() {
    aws secretsmanager describe-secret --secret-id "turo-ezpass/ezpass/credentials" > /dev/null &&
    aws secretsmanager describe-secret --secret-id "turo-ezpass/turo/credentials" > /dev/null
}

# Test 5: S3 Bucket
test_s3_bucket() {
    aws s3api head-bucket --bucket "turo-ezpass-proofs-${ACCOUNT_ID}"
}

# Test 6: SNS Topic
test_sns_topic() {
    aws sns get-topic-attributes --topic-arn "arn:aws:sns:${REGION}:${ACCOUNT_ID}:turo-ezpass-alerts" > /dev/null
}

# Test 7: CloudWatch Dashboard
test_cloudwatch_dashboard() {
    aws cloudwatch get-dashboard --dashboard-name "turo-ezpass-monitoring" > /dev/null
}

# Test 8: Lambda Functions
test_lambda_functions() {
    aws lambda get-function --function-name "turo-ezpass-smoke-test" > /dev/null &&
    aws lambda get-function --function-name "turo-ezpass-cost-optimizer" > /dev/null
}

# Test 9: EventBridge Rules
test_eventbridge_rules() {
    aws events describe-rule --name "turo-ezpass-smoke-test" > /dev/null &&
    aws events describe-rule --name "turo-ezpass-cost-optimizer" > /dev/null
}

# Test 10: CloudWatch Alarms
test_cloudwatch_alarms() {
    aws cloudwatch describe-alarms --alarm-names \
        "turo-ezpass-ecs-task-failures" \
        "turo-ezpass-scraper-no-data" \
        "turo-ezpass-high-failure-rate" > /dev/null
}

# Detailed test functions for manual inspection
show_infrastructure_status() {
    echo -e "${BLUE}=== Infrastructure Status ===${NC}"
    
    echo -e "\n${YELLOW}ECS Cluster:${NC}"
    aws ecs describe-clusters --clusters ${PROJECT_NAME}-cluster --query 'clusters[0].{Name:clusterName,Status:status,RunningTasks:runningTasksCount,ActiveServices:activeServicesCount}' --output table
    
    echo -e "\n${YELLOW}S3 Bucket Contents:${NC}"
    aws s3 ls s3://turo-ezpass-proofs-${ACCOUNT_ID}/ --recursive --human-readable --summarize | tail -5
    
    echo -e "\n${YELLOW}Recent CloudWatch Logs:${NC}"
    LATEST_STREAM=$(aws logs describe-log-streams --log-group-name "/ecs/${PROJECT_NAME}" --order-by LastEventTime --descending --max-items 1 --query 'logStreams[0].logStreamName' --output text 2>/dev/null || echo "none")
    if [ "$LATEST_STREAM" != "none" ] && [ "$LATEST_STREAM" != "null" ]; then
        echo "Latest log stream: $LATEST_STREAM"
        aws logs get-log-events --log-group-name "/ecs/${PROJECT_NAME}" --log-stream-name "$LATEST_STREAM" --limit 5 --query 'events[*].message' --output text
    else
        echo "No log streams found"
    fi
    
    echo -e "\n${YELLOW}CloudWatch Alarms Status:${NC}"
    aws cloudwatch describe-alarms --alarm-names \
        "turo-ezpass-ecs-task-failures" \
        "turo-ezpass-scraper-no-data" \
        "turo-ezpass-high-failure-rate" \
        --query 'MetricAlarms[*].{Name:AlarmName,State:StateValue,Reason:StateReason}' --output table 2>/dev/null || echo "No alarms found"
}

run_smoke_test() {
    echo -e "${BLUE}=== Running Smoke Test ===${NC}"
    
    log_info "Invoking smoke test Lambda function..."
    RESULT=$(aws lambda invoke --function-name "turo-ezpass-smoke-test" --payload '{"run_ecs_test": false}' response.json --query 'StatusCode' --output text)
    
    if [ "$RESULT" = "200" ]; then
        log_success "Smoke test Lambda invoked successfully"
        echo -e "\n${YELLOW}Smoke Test Results:${NC}"
        cat response.json | jq '.' 2>/dev/null || cat response.json
        rm -f response.json
    else
        log_error "Smoke test Lambda invocation failed with status: $RESULT"
        if [ -f response.json ]; then
            cat response.json
            rm -f response.json
        fi
    fi
}

# Manual ECS task test
run_manual_ecs_test() {
    echo -e "${BLUE}=== Manual ECS Task Test ===${NC}"
    
    log_warning "This will run a real scraper task and may incur costs. Continue? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "ECS test skipped"
        return 0
    fi
    
    # Get subnet and security group (simplified - assumes default VPC setup)
    SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=default-for-az,Values=true" --query 'Subnets[0].SubnetId' --output text)
    SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=default" --query 'SecurityGroups[0].GroupId' --output text)
    
    if [ "$SUBNET_ID" = "None" ] || [ "$SG_ID" = "None" ]; then
        log_error "Could not find default subnet or security group for ECS task"
        return 1
    fi
    
    log_info "Starting ECS task..."
    TASK_ARN=$(aws ecs run-task \
        --cluster ${PROJECT_NAME}-cluster \
        --task-definition ${PROJECT_NAME}-scraper \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_ID}],securityGroups=[${SG_ID}],assignPublicIp=ENABLED}" \
        --query 'tasks[0].taskArn' --output text)
    
    if [ "$TASK_ARN" != "None" ]; then
        log_success "ECS task started: $TASK_ARN"
        log_info "Monitor the task in AWS Console or wait for completion..."
        
        # Wait for task to complete (optional)
        echo "Waiting for task to complete (this may take several minutes)..."
        aws ecs wait tasks-stopped --cluster ${PROJECT_NAME}-cluster --tasks "$TASK_ARN"
        
        # Get task status
        TASK_STATUS=$(aws ecs describe-tasks --cluster ${PROJECT_NAME}-cluster --tasks "$TASK_ARN" --query 'tasks[0].lastStatus' --output text)
        log_info "Task final status: $TASK_STATUS"
        
    else
        log_error "Failed to start ECS task"
        return 1
    fi
}

# Cleanup function
cleanup() {
    rm -f response.json
}

# Main execution
main() {
    print_header
    
    # Trap cleanup on exit
    trap cleanup EXIT
    
    # Check if jq is available for JSON parsing
    if ! command -v jq &> /dev/null; then
        log_warning "jq is not installed. JSON output may not be formatted."
    fi
    
    log_info "Starting validation tests..."
    echo ""
    
    # Run basic tests
    run_test "AWS CLI and credentials" "test_aws_cli"
    run_test "Terraform state" "test_terraform_state"
    run_test "ECS cluster status" "test_ecs_cluster"
    run_test "Secrets Manager access" "test_secrets"
    run_test "S3 bucket access" "test_s3_bucket"
    run_test "SNS topic exists" "test_sns_topic"
    run_test "CloudWatch dashboard" "test_cloudwatch_dashboard"
    run_test "Lambda functions" "test_lambda_functions"
    run_test "EventBridge rules" "test_eventbridge_rules"
    run_test "CloudWatch alarms" "test_cloudwatch_alarms"
    
    echo ""
    echo -e "${BLUE}=== Test Summary ===${NC}"
    echo "Total tests: $TESTS_TOTAL"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "All basic validation tests passed!"
    else
        log_error "$TESTS_FAILED tests failed. Check the output above for details."
    fi
    
    echo ""
    
    # Offer additional detailed tests
    if [ "$1" = "--detailed" ] || [ "$1" = "-d" ]; then
        show_infrastructure_status
        echo ""
        run_smoke_test
    elif [ "$1" = "--smoke-test" ] || [ "$1" = "-s" ]; then
        run_smoke_test
    elif [ "$1" = "--ecs-test" ] || [ "$1" = "-e" ]; then
        run_manual_ecs_test
    elif [ "$1" = "--full" ] || [ "$1" = "-f" ]; then
        show_infrastructure_status
        echo ""
        run_smoke_test
        echo ""
        run_manual_ecs_test
    else
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --detailed, -d    Show detailed infrastructure status"
        echo "  --smoke-test, -s  Run the smoke test Lambda function"
        echo "  --ecs-test, -e    Run a manual ECS task test"
        echo "  --full, -f        Run all tests including detailed and ECS"
        echo ""
        echo "Run with --detailed for more comprehensive testing."
    fi
    
    # Exit with appropriate code
    if [ $TESTS_FAILED -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function with all arguments
main "$@"