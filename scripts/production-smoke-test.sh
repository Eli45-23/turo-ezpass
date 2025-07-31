#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────
# Turo-EZPass Production Smoke Test Script
# ──────────────────────────────────────────────────────

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/tmp/turo-ezpass-smoke-test-$(date +%s).log"
readonly TEST_USER_ID="smoke-test-$(date +%s)"
readonly TIMEOUT=300  # 5 minutes
readonly MAX_RETRIES=3

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Global variables
API_URL=""
DASHBOARD_URL=""
DYNAMODB_TABLE=""
TEST_RESULTS=()

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
Usage: $0 <API_URL> <DASHBOARD_URL> <DYNAMODB_TABLE>

Production smoke test script for Turo-EZPass dashboard system.

Arguments:
    API_URL         The API Gateway URL (e.g., https://api.example.com)
    DASHBOARD_URL   The dashboard URL (e.g., https://dashboard.example.com)
    DYNAMODB_TABLE  The DynamoDB table name (e.g., turo_ezpass_trips)

Environment Variables:
    AWS_REGION      AWS region (default: us-east-1)
    TEST_TIMEOUT    Test timeout in seconds (default: 300)

Examples:
    $0 https://api123.execute-api.us-east-1.amazonaws.com/prod https://d123.cloudfront.net turo_ezpass_trips
    
    # With custom domain
    $0 https://api.turo-ezpass.com https://dashboard.turo-ezpass.com turo_ezpass_trips

EOF
}

# Cleanup function
cleanup() {
    log_info "Cleaning up test resources..."
    
    # Remove test records from DynamoDB if they exist
    if [[ -n "${TEST_USER_ID:-}" && -n "${DYNAMODB_TABLE:-}" ]]; then
        log_info "Removing test records for user: $TEST_USER_ID"
        aws dynamodb scan \
            --table-name "$DYNAMODB_TABLE" \
            --filter-expression "userId = :userId" \
            --expression-attribute-values '{":userId":{"S":"'$TEST_USER_ID'"}}' \
            --query 'Items[].{userId: userId, scrapeDate: scrapeDate}' \
            --output json 2>/dev/null | jq -r '.[] | @base64' | while read -r item; do
                decoded=$(echo "$item" | base64 --decode)
                user_id=$(echo "$decoded" | jq -r '.userId.S')
                scrape_date=$(echo "$decoded" | jq -r '.scrapeDate.S')
                
                aws dynamodb delete-item \
                    --table-name "$DYNAMODB_TABLE" \
                    --key "{\"userId\":{\"S\":\"$user_id\"},\"scrapeDate\":{\"S\":\"$scrape_date\"}}" \
                    2>/dev/null || true
            done 2>/dev/null || true
    fi
    
    log_info "Cleanup complete. Log file: $LOG_FILE"
}

# Set up signal handlers
trap cleanup EXIT
trap 'log_error "Script interrupted"; exit 130' INT TERM

# Validate requirements
check_requirements() {
    log_info "Checking requirements..."
    
    # Check required commands
    local required_commands=("curl" "jq" "aws")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required command not found: $cmd"
            exit 1
        fi
    done
    
    # Check AWS CLI configuration
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS CLI not configured or no valid credentials"
        exit 1
    fi
    
    # Validate URLs
    if [[ ! "$API_URL" =~ ^https?:// ]]; then
        log_error "Invalid API URL format: $API_URL"
        exit 1
    fi
    
    if [[ ! "$DASHBOARD_URL" =~ ^https?:// ]]; then
        log_error "Invalid dashboard URL format: $DASHBOARD_URL"
        exit 1
    fi
    
    log_success "Requirements check passed"
}

# Test API endpoints
test_api_endpoints() {
    log_info "Testing API endpoints..."
    
    # Test API health/connectivity
    local api_health_url="$API_URL/trips?userId=nonexistent"
    log_info "Testing API connectivity: $api_health_url"
    
    local response
    local http_code
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$api_health_url" --max-time 30) || {
        log_error "Failed to connect to API"
        TEST_RESULTS+=("API_CONNECTIVITY:FAIL")
        return 1
    }
    
    http_code=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    response=$(echo "$response" | sed -e 's/HTTPSTATUS\:.*//g')
    
    # Expect 200 with empty results or 400 for bad request (both indicate API is working)
    if [[ "$http_code" =~ ^(200|400)$ ]]; then
        log_success "API endpoint is responsive (HTTP $http_code)"
        TEST_RESULTS+=("API_CONNECTIVITY:PASS")
    else
        log_error "API returned unexpected status code: $http_code"
        log_error "Response: $response"
        TEST_RESULTS+=("API_CONNECTIVITY:FAIL")
        return 1
    fi
    
    # Test CORS headers
    log_info "Testing CORS headers..."
    local cors_response
    cors_response=$(curl -s -I -H "Origin: https://dashboard.turo-ezpass.com" "$api_health_url" --max-time 30) || {
        log_warning "Failed to test CORS headers"
        TEST_RESULTS+=("API_CORS:SKIP")
        return 0
    }
    
    if echo "$cors_response" | grep -qi "access-control-allow-origin"; then
        log_success "CORS headers present"
        TEST_RESULTS+=("API_CORS:PASS")
    else
        log_warning "CORS headers not found (may be configured differently)"
        TEST_RESULTS+=("API_CORS:WARN")
    fi
}

# Test dashboard availability
test_dashboard() {
    log_info "Testing dashboard availability..."
    
    local response
    local http_code
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$DASHBOARD_URL" --max-time 30) || {
        log_error "Failed to connect to dashboard"
        TEST_RESULTS+=("DASHBOARD_CONNECTIVITY:FAIL")
        return 1
    }
    
    http_code=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    response=$(echo "$response" | sed -e 's/HTTPSTATUS\:.*//g')
    
    if [[ "$http_code" == "200" ]]; then
        log_success "Dashboard is accessible (HTTP $http_code)"
        TEST_RESULTS+=("DASHBOARD_CONNECTIVITY:PASS")
        
        # Check for expected content
        if echo "$response" | grep -qi "turo.*ezpass\|dashboard"; then
            log_success "Dashboard contains expected content"
            TEST_RESULTS+=("DASHBOARD_CONTENT:PASS")
        else
            log_warning "Dashboard content validation failed"
            TEST_RESULTS+=("DASHBOARD_CONTENT:WARN")
        fi
    else
        log_error "Dashboard returned status code: $http_code"
        TEST_RESULTS+=("DASHBOARD_CONNECTIVITY:FAIL")
        return 1
    fi
}

# Trigger manual scraper run
trigger_manual_scrape() {
    log_info "Triggering manual scraper run..."
    
    # Create a test record in DynamoDB to simulate scraper activity
    local test_scrape_date
    test_scrape_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    local test_record='{
        "userId": {"S": "'$TEST_USER_ID'"},
        "scrapeDate": {"S": "'$test_scrape_date'"},
        "totalRecords": {"N": "5"},
        "summary": {"S": "Smoke test record - automated test"},
        "status": {"S": "success"},
        "timestamp": {"S": "'$test_scrape_date'"}
    }'
    
    log_info "Creating test record in DynamoDB..."
    if aws dynamodb put-item \
        --table-name "$DYNAMODB_TABLE" \
        --item "$test_record" \
        2>&1 | tee -a "$LOG_FILE"; then
        log_success "Test record created successfully"
        TEST_RESULTS+=("DYNAMODB_WRITE:PASS")
    else
        log_error "Failed to create test record in DynamoDB"
        TEST_RESULTS+=("DYNAMODB_WRITE:FAIL")
        return 1
    fi
    
    # Wait a moment for eventual consistency
    sleep 2
    
    return 0
}

# Verify DynamoDB data
verify_dynamodb_data() {
    log_info "Verifying DynamoDB data access..."
    
    # Try to read the test record we created
    log_info "Querying DynamoDB for test record..."
    
    local query_result
    query_result=$(aws dynamodb query \
        --table-name "$DYNAMODB_TABLE" \
        --key-condition-expression "userId = :userId" \
        --expression-attribute-values '{":userId":{"S":"'$TEST_USER_ID'"}}' \
        --limit 1 \
        2>&1) || {
        log_error "Failed to query DynamoDB"
        TEST_RESULTS+=("DYNAMODB_READ:FAIL")
        return 1
    }
    
    local item_count
    item_count=$(echo "$query_result" | jq -r '.Count // 0')
    
    if [[ "$item_count" -gt 0 ]]; then
        log_success "DynamoDB query successful, found $item_count record(s)"
        TEST_RESULTS+=("DYNAMODB_READ:PASS")
        
        # Verify record structure
        local record_data
        record_data=$(echo "$query_result" | jq -r '.Items[0]')
        
        if echo "$record_data" | jq -e '.userId and .scrapeDate and .totalRecords and .status' > /dev/null; then
            log_success "Record structure is valid"
            TEST_RESULTS+=("DYNAMODB_SCHEMA:PASS")
        else
            log_warning "Record structure validation failed"
            TEST_RESULTS+=("DYNAMODB_SCHEMA:WARN")
        fi
    else
        log_error "No records found in DynamoDB query"
        TEST_RESULTS+=("DYNAMODB_READ:FAIL")
        return 1
    fi
}

# Test API with real data
test_api_with_data() {
    log_info "Testing API with actual data..."
    
    # Test the trips endpoint with our test user
    local api_endpoint="$API_URL/trips?userId=$TEST_USER_ID"
    log_info "Testing API endpoint: $api_endpoint"
    
    local response
    local http_code
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$api_endpoint" --max-time 30) || {
        log_error "Failed to call API with test data"
        TEST_RESULTS+=("API_DATA_QUERY:FAIL")
        return 1
    }
    
    http_code=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    response=$(echo "$response" | sed -e 's/HTTPSTATUS\:.*//g')
    
    if [[ "$http_code" == "200" ]]; then
        log_success "API returned successful response (HTTP $http_code)"
        
        # Validate JSON response structure
        if echo "$response" | jq -e '.trips and .count' > /dev/null 2>&1; then
            local trip_count
            trip_count=$(echo "$response" | jq -r '.count // 0')
            
            if [[ "$trip_count" -gt 0 ]]; then
                log_success "API returned $trip_count trip(s) for test user"
                TEST_RESULTS+=("API_DATA_QUERY:PASS")
                
                # Validate trip structure
                local first_trip
                first_trip=$(echo "$response" | jq -r '.trips[0]')
                
                if echo "$first_trip" | jq -e '.userId and .scrapeDate and .totalRecords and .status' > /dev/null; then
                    log_success "Trip record structure is valid"
                    TEST_RESULTS+=("API_DATA_STRUCTURE:PASS")
                else
                    log_warning "Trip record structure validation failed"
                    TEST_RESULTS+=("API_DATA_STRUCTURE:WARN")
                fi
            else
                log_warning "API returned empty results"
                TEST_RESULTS+=("API_DATA_QUERY:WARN")
            fi
        else
            log_error "API response is not valid JSON or missing expected fields"
            log_error "Response: $response"
            TEST_RESULTS+=("API_DATA_QUERY:FAIL")
        fi
    else
        log_error "API returned error status: $http_code"
        log_error "Response: $response"
        TEST_RESULTS+=("API_DATA_QUERY:FAIL")
    fi
}

# Test monitoring and alerting
test_monitoring() {
    log_info "Testing monitoring infrastructure..."
    
    # Check if CloudWatch log groups exist
    local log_groups=("/aws/lambda/turo-ezpass-prod-trips-api" "/aws/lambda/turo-ezpass-prod-analytics")
    
    for log_group in "${log_groups[@]}"; do
        if aws logs describe-log-groups --log-group-name-prefix "$log_group" --query 'logGroups[0].logGroupName' --output text 2>/dev/null | grep -q "$log_group"; then
            log_success "CloudWatch log group exists: $log_group"
            TEST_RESULTS+=("MONITORING_LOGS_${log_group//\//_}:PASS")
        else
            log_warning "CloudWatch log group not found: $log_group"
            TEST_RESULTS+=("MONITORING_LOGS_${log_group//\//_}:WARN")
        fi
    done
    
    # Check if SNS topic exists (try to list topics and look for our pattern)
    if aws sns list-topics --query 'Topics[?contains(TopicArn, `turo-ezpass`) && contains(TopicArn, `alerts`)].TopicArn' --output text | grep -q "turo-ezpass"; then
        log_success "SNS alert topic found"
        TEST_RESULTS+=("MONITORING_SNS:PASS")
    else
        log_warning "SNS alert topic not found"
        TEST_RESULTS+=("MONITORING_SNS:WARN")
    fi
}

# Generate test report
generate_report() {
    log_info "Generating test report..."
    
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    local warning_tests=0
    local skipped_tests=0
    
    echo "
╔══════════════════════════════════════════════════════════════════════════════╗
║                        TURO-EZPASS SMOKE TEST REPORT                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

Test Environment:
  • API URL:       $API_URL
  • Dashboard URL: $DASHBOARD_URL
  • DynamoDB:      $DYNAMODB_TABLE
  • Test User:     $TEST_USER_ID
  • Timestamp:     $(date)
  • Log File:      $LOG_FILE

Test Results:
" | tee -a "$LOG_FILE"
    
    for result in "${TEST_RESULTS[@]}"; do
        local test_name="${result%%:*}"
        local test_status="${result##*:}"
        
        case "$test_status" in
            "PASS")
                echo -e "  ${GREEN}✅ $test_name${NC}" | tee -a "$LOG_FILE"
                ((passed_tests++))
                ;;
            "FAIL")
                echo -e "  ${RED}❌ $test_name${NC}" | tee -a "$LOG_FILE"
                ((failed_tests++))
                ;;
            "WARN")
                echo -e "  ${YELLOW}⚠️  $test_name${NC}" | tee -a "$LOG_FILE"
                ((warning_tests++))
                ;;
            "SKIP")
                echo -e "  ${BLUE}⏭️  $test_name (SKIPPED)${NC}" | tee -a "$LOG_FILE"
                ((skipped_tests++))
                ;;
        esac
        ((total_tests++))
    done
    
    echo "
Summary:
  • Total Tests:   $total_tests
  • Passed:        $passed_tests
  • Failed:        $failed_tests
  • Warnings:      $warning_tests
  • Skipped:       $skipped_tests
" | tee -a "$LOG_FILE"
    
    if [[ $failed_tests -eq 0 ]]; then
        if [[ $warning_tests -eq 0 ]]; then
            log_success "🎉 All tests passed! System is ready for production."
            return 0
        else
            log_warning "✅ Tests passed with $warning_tests warning(s). Review recommended."
            return 0
        fi
    else
        log_error "💥 $failed_tests test(s) failed. System may not be ready for production."
        return 1
    fi
}

# Main function
main() {
    # Parse command line arguments
    if [[ $# -ne 3 ]]; then
        usage
        exit 1
    fi
    
    API_URL="$1"
    DASHBOARD_URL="$2"
    DYNAMODB_TABLE="$3"
    
    # Remove trailing slashes from URLs
    API_URL="${API_URL%/}"
    DASHBOARD_URL="${DASHBOARD_URL%/}"
    
    log_info "Starting Turo-EZPass production smoke tests..."
    log_info "API URL: $API_URL"
    log_info "Dashboard URL: $DASHBOARD_URL"
    log_info "DynamoDB Table: $DYNAMODB_TABLE"
    
    # Run tests
    check_requirements
    test_api_endpoints
    test_dashboard
    trigger_manual_scrape
    verify_dynamodb_data
    test_api_with_data
    test_monitoring
    
    # Generate final report
    generate_report
}

# Run main function
main "$@"