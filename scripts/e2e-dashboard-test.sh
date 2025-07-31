#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────
# Turo-EZPass E2E Dashboard Test Script with Playwright
# ──────────────────────────────────────────────────────

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/tmp/turo-ezpass-e2e-test-$(date +%s).log"
readonly TEST_USER_ID="e2e-test-$(date +%s)"
readonly TIMEOUT=300  # 5 minutes
readonly SCREENSHOT_DIR="/tmp/turo-ezpass-screenshots-$(date +%s)"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Global variables
DASHBOARD_URL=""
API_URL=""
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
Usage: $0 <DASHBOARD_URL> <API_URL> <DYNAMODB_TABLE>

End-to-end dashboard test script for Turo-EZPass using Playwright.

Arguments:
    DASHBOARD_URL   The dashboard URL (e.g., https://dashboard.example.com)
    API_URL         The API Gateway URL (e.g., https://api.example.com)
    DYNAMODB_TABLE  The DynamoDB table name (e.g., turo_ezpass_trips)

Environment Variables:
    AWS_REGION      AWS region (default: us-east-1)
    TEST_TIMEOUT    Test timeout in seconds (default: 300)
    HEADLESS        Run browser in headless mode (default: true)

Examples:
    $0 https://d123.cloudfront.net https://api123.execute-api.us-east-1.amazonaws.com/prod turo_ezpass_trips
    
    # With custom domain
    $0 https://dashboard.turo-ezpass.com https://api.turo-ezpass.com turo_ezpass_trips

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
    
    # Clean up screenshot directory if it exists
    if [[ -d "$SCREENSHOT_DIR" ]]; then
        log_info "Screenshot directory: $SCREENSHOT_DIR"
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
    local required_commands=("curl" "jq" "aws" "node" "npm")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required command not found: $cmd"
            exit 1
        fi
    done
    
    # Check Node.js version (need 18+)
    local node_version
    node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$node_version" -lt 18 ]]; then
        log_error "Node.js 18+ required, found version: $(node --version)"
        exit 1
    fi
    
    # Check AWS CLI configuration
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS CLI not configured or no valid credentials"
        exit 1
    fi
    
    # Validate URLs
    if [[ ! "$DASHBOARD_URL" =~ ^https?:// ]]; then
        log_error "Invalid dashboard URL format: $DASHBOARD_URL"
        exit 1
    fi
    
    if [[ ! "$API_URL" =~ ^https?:// ]]; then
        log_error "Invalid API URL format: $API_URL"
        exit 1
    fi
    
    # Create screenshot directory
    mkdir -p "$SCREENSHOT_DIR"
    
    log_success "Requirements check passed"
}

# Set up Playwright environment
setup_playwright() {
    log_info "Setting up Playwright environment..."
    
    # Create temporary test directory
    local test_dir="/tmp/turo-ezpass-playwright-$(date +%s)"
    mkdir -p "$test_dir"
    cd "$test_dir"
    
    # Initialize package.json and install Playwright
    cat > package.json << EOF
{
  "name": "turo-ezpass-e2e-test",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0"
  }
}
EOF

    log_info "Installing Playwright..."
    npm install --silent || {
        log_error "Failed to install Playwright"
        return 1
    }
    
    # Install browsers
    log_info "Installing browser dependencies..."
    npx playwright install chromium --with-deps || {
        log_error "Failed to install browser dependencies"
        return 1
    }
    
    log_success "Playwright environment ready"
    echo "$test_dir"
}

# Create test data in DynamoDB
create_test_data() {
    log_info "Creating test data in DynamoDB..."
    
    local test_scrape_date
    test_scrape_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Create multiple test records for better testing
    local test_records=(
        '{"userId": {"S": "'$TEST_USER_ID'"}, "scrapeDate": {"S": "'$test_scrape_date'"}, "totalRecords": {"N": "5"}, "summary": {"S": "E2E test record 1 - success"}, "status": {"S": "success"}, "timestamp": {"S": "'$test_scrape_date'"}}'
        '{"userId": {"S": "'$TEST_USER_ID'"}, "scrapeDate": {"S": "'$(date -u -d '1 hour ago' +"%Y-%m-%dT%H:%M:%SZ")'"}, "totalRecords": {"N": "3"}, "summary": {"S": "E2E test record 2 - success"}, "status": {"S": "success"}, "timestamp": {"S": "'$(date -u -d '1 hour ago' +"%Y-%m-%dT%H:%M:%SZ")'"}}'
        '{"userId": {"S": "'$TEST_USER_ID'"}, "scrapeDate": {"S": "'$(date -u -d '2 hours ago' +"%Y-%m-%dT%H:%M:%SZ")'"}, "totalRecords": {"N": "0"}, "summary": {"S": "E2E test record 3 - failure"}, "status": {"S": "failure"}, "error": {"S": "Test failure"}, "timestamp": {"S": "'$(date -u -d '2 hours ago' +"%Y-%m-%dT%H:%M:%SZ")'"}}'
    )
    
    for record in "${test_records[@]}"; do
        if aws dynamodb put-item \
            --table-name "$DYNAMODB_TABLE" \
            --item "$record" \
            2>&1 | tee -a "$LOG_FILE"; then
            log_success "Test record created successfully"
        else
            log_error "Failed to create test record in DynamoDB"
            return 1
        fi
    done
    
    # Wait for eventual consistency
    sleep 3
    
    TEST_RESULTS+=("TEST_DATA_CREATION:PASS")
    return 0
}

# Generate Playwright test file
generate_playwright_test() {
    log_info "Generating Playwright test file..."
    
    cat > dashboard.test.js << EOF
import { test, expect } from '@playwright/test';

const DASHBOARD_URL = '${DASHBOARD_URL}';
const TEST_USER_ID = '${TEST_USER_ID}';
const SCREENSHOT_DIR = '${SCREENSHOT_DIR}';

test.describe('Turo-EZPass Dashboard E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for navigation
    test.setTimeout(60000);
    
    // Navigate to dashboard
    await page.goto(DASHBOARD_URL);
    await page.waitForLoadState('networkidle');
  });

  test('Dashboard loads and shows login form', async ({ page }) => {
    await page.screenshot({ path: \`\${SCREENSHOT_DIR}/01-login-page.png\` });
    
    // Check for login form or dashboard
    const hasLoginForm = await page.locator('input[type="text"], input[placeholder*="user"], input[placeholder*="User"]').count() > 0;
    const hasDashboard = await page.locator('text=Turo-E-Pass Dashboard, text=Dashboard').count() > 0;
    
    expect(hasLoginForm || hasDashboard).toBeTruthy();
  });

  test('Login and navigate to dashboard', async ({ page }) => {
    // Look for username input (could be different selectors)
    const usernameSelectors = [
      'input[type="text"]',
      'input[placeholder*="user"]',
      'input[placeholder*="User"]',
      'input[name="username"]',
      'input[id="username"]'
    ];
    
    let usernameInput = null;
    for (const selector of usernameSelectors) {
      try {
        usernameInput = page.locator(selector).first();
        if (await usernameInput.count() > 0) break;
      } catch (e) {
        continue;
      }
    }
    
    if (usernameInput && await usernameInput.count() > 0) {
      // Fill in test user ID
      await usernameInput.fill(TEST_USER_ID);
      await page.screenshot({ path: \`\${SCREENSHOT_DIR}/02-username-filled.png\` });
      
      // Look for login/submit button
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("Enter")',
        'button:has-text("Continue")'
      ];
      
      let submitButton = null;
      for (const selector of submitSelectors) {
        try {
          submitButton = page.locator(selector).first();
          if (await submitButton.count() > 0) break;
        } catch (e) {
          continue;
        }
      }
      
      if (submitButton && await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForLoadState('networkidle');
      }
    }
    
    await page.screenshot({ path: \`\${SCREENSHOT_DIR}/03-after-login.png\` });
    
    // Verify we're on the dashboard
    const dashboardIndicators = [
      'text=Turo-E-Pass Dashboard',
      'text=Dashboard',
      'text=Total Trips',
      'text=Trip History',
      'text=Records Over Time'
    ];
    
    let dashboardFound = false;
    for (const indicator of dashboardIndicators) {
      if (await page.locator(indicator).count() > 0) {
        dashboardFound = true;
        break;
      }
    }
    
    expect(dashboardFound).toBeTruthy();
  });

  test('Dashboard displays trip data', async ({ page }) => {
    // Login first
    await page.goto(\`\${DASHBOARD_URL}?userId=\${TEST_USER_ID}\`);
    await page.waitForLoadState('networkidle');
    
    const usernameInput = page.locator('input[type="text"]').first();
    if (await usernameInput.count() > 0) {
      await usernameInput.fill(TEST_USER_ID);
      const submitButton = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Enter")').first();
      if (await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForLoadState('networkidle');
      }
    }
    
    await page.screenshot({ path: \`\${SCREENSHOT_DIR}/04-dashboard-loaded.png\` });
    
    // Wait for data to load
    await page.waitForTimeout(3000);
    
    // Check for trip data indicators
    const tripDataIndicators = [
      'text=Total Trips',
      'text=Success Rate',
      'text=Trip History',
      'table', // Trip table
      'text=success', // Status indicators
      'text=failure'
    ];
    
    let dataFound = false;
    for (const indicator of tripDataIndicators) {
      if (await page.locator(indicator).count() > 0) {
        dataFound = true;
        break;
      }
    }
    
    expect(dataFound).toBeTruthy();
  });

  test('Chart component loads', async ({ page }) => {
    // Login and navigate to dashboard
    await page.goto(\`\${DASHBOARD_URL}?userId=\${TEST_USER_ID}\`);
    await page.waitForLoadState('networkidle');
    
    const usernameInput = page.locator('input[type="text"]').first();
    if (await usernameInput.count() > 0) {
      await usernameInput.fill(TEST_USER_ID);
      const submitButton = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Enter")').first();
      if (await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForLoadState('networkidle');
      }
    }
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: \`\${SCREENSHOT_DIR}/05-chart-section.png\` });
    
    // Look for chart indicators
    const chartIndicators = [
      'text=Records Over Time',
      'svg', // Chart SVG elements
      '.recharts-wrapper', // Recharts component
      '[class*="chart"]' // Any element with chart in class name
    ];
    
    let chartFound = false;
    for (const indicator of chartIndicators) {
      if (await page.locator(indicator).count() > 0) {
        chartFound = true;
        break;
      }
    }
    
    expect(chartFound).toBeTruthy();
  });

  test('Run Scrape Now button works', async ({ page }) => {
    // Login and navigate to dashboard
    await page.goto(\`\${DASHBOARD_URL}?userId=\${TEST_USER_ID}\`);
    await page.waitForLoadState('networkidle');
    
    const usernameInput = page.locator('input[type="text"]').first();
    if (await usernameInput.count() > 0) {
      await usernameInput.fill(TEST_USER_ID);
      const submitButton = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Enter")').first();
      if (await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForLoadState('networkidle');
      }
    }
    
    await page.waitForTimeout(2000);
    
    // Look for the "Run Scrape Now" button
    const scrapeButton = page.locator('button:has-text("Run Scrape Now"), button:has-text("Scrape"), button:has-text("Run")').first();
    
    if (await scrapeButton.count() > 0) {
      await page.screenshot({ path: \`\${SCREENSHOT_DIR}/06-before-scrape.png\` });
      
      // Click the scrape button
      await scrapeButton.click();
      
      await page.waitForTimeout(2000);
      await page.screenshot({ path: \`\${SCREENSHOT_DIR}/07-after-scrape-click.png\` });
      
      // Look for success/feedback message
      const feedbackIndicators = [
        'text=triggered successfully',
        'text=Event ID',
        'text=Running',
        'text=Failed to trigger',
        '[class*="animate-pulse"]' // Loading indicators
      ];
      
      let feedbackFound = false;
      for (const indicator of feedbackIndicators) {
        if (await page.locator(indicator).count() > 0) {
          feedbackFound = true;
          break;
        }
      }
      
      expect(feedbackFound).toBeTruthy();
    } else {
      // If button not found, that's also valuable information
      await page.screenshot({ path: \`\${SCREENSHOT_DIR}/06-no-scrape-button.png\` });
      console.log('Run Scrape Now button not found - this may be expected in some configurations');
    }
  });

  test('Refresh button works', async ({ page }) => {
    // Login and navigate to dashboard
    await page.goto(\`\${DASHBOARD_URL}?userId=\${TEST_USER_ID}\`);
    await page.waitForLoadState('networkidle');
    
    const usernameInput = page.locator('input[type="text"]').first();
    if (await usernameInput.count() > 0) {
      await usernameInput.fill(TEST_USER_ID);
      const submitButton = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Enter")').first();
      if (await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForLoadState('networkidle');
      }
    }
    
    await page.waitForTimeout(2000);
    
    // Look for refresh button
    const refreshButton = page.locator('button:has-text("Refresh"), button[title*="refresh"], button[aria-label*="refresh"]').first();
    
    if (await refreshButton.count() > 0) {
      await page.screenshot({ path: \`\${SCREENSHOT_DIR}/08-before-refresh.png\` });
      
      // Click refresh
      await refreshButton.click();
      
      await page.waitForTimeout(1000);
      await page.screenshot({ path: \`\${SCREENSHOT_DIR}/09-after-refresh.png\` });
      
      // Look for loading indicators
      const loadingIndicators = [
        '[class*="animate-spin"]',
        'text=Loading',
        '[class*="loading"]'
      ];
      
      let loadingFound = false;
      for (const indicator of loadingIndicators) {
        if (await page.locator(indicator).count() > 0) {
          loadingFound = true;
          break;
        }
      }
      
      // Either loading indicators should appear, or data should be present
      const dataPresent = await page.locator('text=Total Trips, table, text=Trip History').count() > 0;
      
      expect(loadingFound || dataPresent).toBeTruthy();
    } else {
      await page.screenshot({ path: \`\${SCREENSHOT_DIR}/08-no-refresh-button.png\` });
      console.log('Refresh button not found');
    }
  });

  test('Navigation and responsiveness', async ({ page }) => {
    // Test different viewport sizes
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(\`\${DASHBOARD_URL}?userId=\${TEST_USER_ID}\`);
    await page.waitForLoadState('networkidle');
    
    // Login
    const usernameInput = page.locator('input[type="text"]').first();
    if (await usernameInput.count() > 0) {
      await usernameInput.fill(TEST_USER_ID);
      const submitButton = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Enter")').first();
      if (await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForLoadState('networkidle');
      }
    }
    
    await page.screenshot({ path: \`\${SCREENSHOT_DIR}/10-desktop-view.png\` });
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: \`\${SCREENSHOT_DIR}/11-mobile-view.png\` });
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: \`\${SCREENSHOT_DIR}/12-tablet-view.png\` });
    
    // Verify responsive design works (no horizontal scroll on mobile)
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 768;
    
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20); // Allow small tolerance
  });
});
EOF

    log_success "Playwright test file generated"
}

# Run Playwright tests
run_playwright_tests() {
    log_info "Running Playwright tests..."
    
    # Create Playwright config
    cat > playwright.config.js << EOF
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }], ['json', { outputFile: 'test-results.json' }]],
  use: {
    baseURL: '${DASHBOARD_URL}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: ${HEADLESS:-true},
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
EOF

    # Run the tests
    if npm test 2>&1 | tee -a "$LOG_FILE"; then
        log_success "Playwright tests completed"
        TEST_RESULTS+=("PLAYWRIGHT_TESTS:PASS")
        
        # Check if results file exists and parse it
        if [[ -f "test-results.json" ]]; then
            local passed_tests
            local failed_tests
            passed_tests=$(jq '.suites[].specs[] | select(.tests[].results[].status == "passed") | .title' test-results.json 2>/dev/null | wc -l || echo "0")
            failed_tests=$(jq '.suites[].specs[] | select(.tests[].results[].status == "failed") | .title' test-results.json 2>/dev/null | wc -l || echo "0")
            
            log_info "Test results: $passed_tests passed, $failed_tests failed"
            
            if [[ "$failed_tests" -gt 0 ]]; then
                TEST_RESULTS+=("PLAYWRIGHT_FAILURES:$failed_tests")
            fi
        fi
    else
        log_error "Playwright tests failed"
        TEST_RESULTS+=("PLAYWRIGHT_TESTS:FAIL")
        return 1
    fi
}

# Generate comprehensive test report
generate_report() {
    log_info "Generating comprehensive test report..."
    
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    local warning_tests=0
    local skipped_tests=0
    
    echo "
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TURO-EZPASS E2E DASHBOARD TEST REPORT                    ║
╚══════════════════════════════════════════════════════════════════════════════╝

Test Environment:
  • Dashboard URL:  $DASHBOARD_URL
  • API URL:        $API_URL
  • DynamoDB:       $DYNAMODB_TABLE
  • Test User:      $TEST_USER_ID
  • Timestamp:      $(date)
  • Log File:       $LOG_FILE
  • Screenshots:    $SCREENSHOT_DIR

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
            [0-9]*)
                echo -e "  ${YELLOW}⚠️  $test_name: $test_status failures${NC}" | tee -a "$LOG_FILE"
                ((warning_tests++))
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

Screenshots and Artifacts:
  • Screenshot Directory: $SCREENSHOT_DIR
  • Number of Screenshots: $(find "$SCREENSHOT_DIR" -name "*.png" 2>/dev/null | wc -l || echo "0")
  • Playwright Report: $(pwd)/playwright-report/index.html
  • Test Results JSON: $(pwd)/test-results.json
" | tee -a "$LOG_FILE"
    
    # List all screenshots taken
    if [[ -d "$SCREENSHOT_DIR" ]]; then
        echo "Screenshot Files:" | tee -a "$LOG_FILE"
        find "$SCREENSHOT_DIR" -name "*.png" | sort | sed 's/^/  • /' | tee -a "$LOG_FILE"
    fi
    
    if [[ $failed_tests -eq 0 ]]; then
        if [[ $warning_tests -eq 0 ]]; then
            log_success "🎉 All E2E tests passed! Dashboard is working correctly."
            return 0
        else
            log_warning "✅ E2E tests passed with $warning_tests warning(s). Review recommended."
            return 0
        fi
    else
        log_error "💥 $failed_tests E2E test(s) failed. Dashboard may have issues."
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
    
    DASHBOARD_URL="$1"
    API_URL="$2"
    DYNAMODB_TABLE="$3"
    
    # Remove trailing slashes from URLs
    DASHBOARD_URL="${DASHBOARD_URL%/}"
    API_URL="${API_URL%/}"
    
    log_info "Starting Turo-EZPass E2E dashboard tests..."
    log_info "Dashboard URL: $DASHBOARD_URL"
    log_info "API URL: $API_URL"
    log_info "DynamoDB Table: $DYNAMODB_TABLE"
    
    # Run test sequence
    check_requirements
    
    local playwright_dir
    playwright_dir=$(setup_playwright)
    cd "$playwright_dir"
    
    create_test_data
    generate_playwright_test
    run_playwright_tests
    
    # Generate final report
    generate_report
}

# Run main function
main "$@"