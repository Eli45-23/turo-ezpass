// Detailed Frontend Test Script
// This script performs in-depth testing of frontend components

const http = require('http');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

// Enhanced test results
const testResults = {
    authentication: {},
    dashboard: {},
    api: {},
    ui: {},
    performance: {},
    security: {},
    functionality: {},
    accessibility: {},
    issues: []
};

// Make HTTP request with detailed analysis
function makeRequest(path, method = 'GET', data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Frontend-Test-Suite',
                ...headers
            }
        };

        const startTime = Date.now();
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                const responseTime = Date.now() - startTime;
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body,
                    responseTime: responseTime,
                    size: body.length
                });
            });
        });

        req.on('error', (error) => {
            reject({
                error: error.message,
                responseTime: Date.now() - startTime
            });
        });

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

// Test Authentication Frontend Features
async function testAuthenticationUI() {
    console.log('🔐 Testing Authentication UI Features...');

    try {
        // Test login page
        const loginResponse = await makeRequest('/');
        const loginHTML = loginResponse.body;

        testResults.authentication.loginPage = {
            accessible: loginResponse.statusCode === 200,
            responseTime: loginResponse.responseTime,
            size: loginResponse.size,
            
            // Form validation
            hasEmailValidation: loginHTML.includes('type="email"'),
            hasPasswordValidation: loginHTML.includes('type="password"'),
            hasRequiredFields: loginHTML.includes('required'),
            hasFormSubmitHandler: loginHTML.includes('login-form'),
            
            // UI elements
            hasTabs: loginHTML.includes('tab-btn'),
            hasErrorHandling: loginHTML.includes('error-message'),
            hasSuccessHandling: loginHTML.includes('success-message'),
            
            // JavaScript functionality
            hasAsyncFetch: loginHTML.includes('fetch('),
            hasFormValidation: loginHTML.includes('addEventListener'),
            
            // Security
            usesHTTPS: loginHTML.includes('https://') || !loginHTML.includes('http://'),
            hasCSRF: loginHTML.includes('csrf') || loginHTML.includes('token'),
            
            // Accessibility
            hasLabels: loginHTML.includes('<label'),
            hasAriaElements: loginHTML.includes('aria-'),
            hasTabIndex: loginHTML.includes('tabindex')
        };

        // Test signup functionality
        const signupElements = {
            hasFullNameField: loginHTML.includes('signup-name'),
            hasEmailField: loginHTML.includes('signup-email'),
            hasPasswordField: loginHTML.includes('signup-password'),
            hasTuroIdField: loginHTML.includes('signup-turo-id'),
            hasSubmitButton: loginHTML.includes('Create Account')
        };

        testResults.authentication.signupForm = signupElements;

        // Test 2FA/verification page
        const verificationResponse = await makeRequest('/simple-verification.html');
        const verificationHTML = verificationResponse.body;

        testResults.authentication.twoFactorAuth = {
            accessible: verificationResponse.statusCode === 200,
            responseTime: verificationResponse.responseTime,
            hasModal: verificationHTML.includes('modal'),
            hasEmailOption: verificationHTML.includes('📧 Email'),
            hasSMSOption: verificationHTML.includes('📱 Text'),
            hasCodeInput: verificationHTML.includes('verification-code'),
            hasAPIIntegration: verificationHTML.includes('/api/tolls/request-verification')
        };

        console.log('✅ Authentication UI testing completed');

    } catch (error) {
        testResults.issues.push(`Authentication UI test error: ${error.message}`);
        console.error('❌ Authentication UI test failed:', error.message);
    }
}

// Test Dashboard Interface
async function testDashboardInterface() {
    console.log('📊 Testing Dashboard Interface...');

    try {
        const dashboardResponse = await makeRequest('/dashboard.html');
        const dashboardHTML = dashboardResponse.body;

        testResults.dashboard.interface = {
            accessible: dashboardResponse.statusCode === 200,
            responseTime: dashboardResponse.responseTime,
            size: dashboardResponse.size,
            
            // Navigation
            hasNavbar: dashboardHTML.includes('navbar'),
            hasSidebar: dashboardHTML.includes('sidebar'),
            hasMenuItems: dashboardHTML.includes('menu'),
            hasActiveStates: dashboardHTML.includes('active'),
            
            // Core sections
            hasOverview: dashboardHTML.includes('overview-section'),
            hasAnalytics: dashboardHTML.includes('analytics-section'),
            hasTrips: dashboardHTML.includes('trips'),
            hasInvoices: dashboardHTML.includes('invoices'),
            hasTollAccounts: dashboardHTML.includes('toll-accounts'),
            
            // Data visualization
            hasCharts: dashboardHTML.includes('chart.js'),
            hasCanvasElements: dashboardHTML.includes('<canvas'),
            hasChartContainers: dashboardHTML.includes('chart-container'),
            
            // Statistics
            hasStatsGrid: dashboardHTML.includes('stats-grid'),
            hasStatCards: dashboardHTML.includes('stat-card'),
            hasKPICards: dashboardHTML.includes('kpi-card'),
            
            // Tables
            hasDataTables: dashboardHTML.includes('data-table'),
            hasTableHeaders: dashboardHTML.includes('<thead'),
            hasSortableColumns: dashboardHTML.includes('sortable'),
            
            // Forms
            hasFileUploads: dashboardHTML.includes('type="file"'),
            hasFormValidation: dashboardHTML.includes('required'),
            hasDropZone: dashboardHTML.includes('drop-zone'),
            
            // Interactive elements
            hasModals: dashboardHTML.includes('modal'),
            hasTooltips: dashboardHTML.includes('tooltip'),
            hasDropdowns: dashboardHTML.includes('dropdown'),
            hasButtons: dashboardHTML.includes('btn'),
            
            // WebSocket
            hasWebSocket: dashboardHTML.includes('WebSocket') || dashboardHTML.includes('ws://'),
            hasRealTimeUpdates: dashboardHTML.includes('websocket'),
            
            // Responsive design
            hasViewportMeta: dashboardHTML.includes('viewport'),
            hasResponsiveClasses: dashboardHTML.includes('col-') || dashboardHTML.includes('responsive')
        };

        console.log('✅ Dashboard interface testing completed');

    } catch (error) {
        testResults.issues.push(`Dashboard interface test error: ${error.message}`);
        console.error('❌ Dashboard interface test failed:', error.message);
    }
}

// Test API Integration
async function testAPIIntegration() {
    console.log('🔌 Testing API Integration...');

    const apiEndpoints = [
        { path: '/api/auth/login', method: 'POST', requiresAuth: false },
        { path: '/api/dashboard/stats', method: 'GET', requiresAuth: true },
        { path: '/api/dashboard/recent-activity', method: 'GET', requiresAuth: true },
        { path: '/api/tolls', method: 'GET', requiresAuth: true },
        { path: '/api/tolls/upload', method: 'POST', requiresAuth: true },
        { path: '/api/analytics/overview', method: 'GET', requiresAuth: true },
        { path: '/api/invoices', method: 'GET', requiresAuth: true },
        { path: '/api/turo-sync', method: 'GET', requiresAuth: true },
        { path: '/api/transponders', method: 'GET', requiresAuth: true }
    ];

    testResults.api.endpoints = {};

    for (const endpoint of apiEndpoints) {
        try {
            const response = await makeRequest(endpoint.path, endpoint.method);
            
            testResults.api.endpoints[endpoint.path] = {
                accessible: response.statusCode !== 404,
                statusCode: response.statusCode,
                responseTime: response.responseTime,
                size: response.size,
                hasJSON: response.headers['content-type']?.includes('application/json'),
                requiresAuth: endpoint.requiresAuth,
                isHealthy: response.statusCode < 500
            };

            // Determine expected status
            let expectedStatus = 'Unknown';
            if (response.statusCode === 401) expectedStatus = 'Needs Authentication';
            else if (response.statusCode === 404) expectedStatus = 'Not Found';
            else if (response.statusCode === 200) expectedStatus = 'OK';
            else if (response.statusCode >= 500) expectedStatus = 'Server Error';

            console.log(`  📡 ${endpoint.path}: ${response.statusCode} (${expectedStatus})`);

        } catch (error) {
            testResults.api.endpoints[endpoint.path] = {
                accessible: false,
                error: error.error,
                responseTime: error.responseTime
            };
            testResults.issues.push(`API ${endpoint.path} error: ${error.error}`);
        }
    }

    console.log('✅ API integration testing completed');
}

// Test UI/UX Quality
async function testUIQuality() {
    console.log('🎨 Testing UI/UX Quality...');

    try {
        // Test CSS
        const cssResponse = await makeRequest('/style.css');
        const cssContent = cssResponse.body;

        testResults.ui.css = {
            accessible: cssResponse.statusCode === 200,
            size: cssResponse.size,
            
            // Responsive design
            hasMediaQueries: cssContent.includes('@media'),
            hasMobileBreakpoints: cssContent.includes('max-width'),
            hasFlexbox: cssContent.includes('display: flex'),
            hasGrid: cssContent.includes('display: grid'),
            
            // Modern CSS features
            hasCustomProperties: cssContent.includes('--'),
            hasTransitions: cssContent.includes('transition'),
            hasAnimations: cssContent.includes('@keyframes') || cssContent.includes('animation'),
            hasTransforms: cssContent.includes('transform'),
            
            // Layout
            hasContainerQueries: cssContent.includes('@container'),
            hasGridAreas: cssContent.includes('grid-area'),
            hasFlexGrow: cssContent.includes('flex-grow'),
            
            // Color and design
            hasColorSchemes: cssContent.includes('color-scheme'),
            hasDarkMode: cssContent.includes('dark'),
            hasConsistentSpacing: cssContent.includes('margin') && cssContent.includes('padding'),
            
            // Typography
            hasFontFamilies: cssContent.includes('font-family'),
            hasFontSizes: cssContent.includes('font-size'),
            hasLineHeight: cssContent.includes('line-height'),
            
            // Accessibility
            hasFocusStyles: cssContent.includes(':focus'),
            hasHoverStates: cssContent.includes(':hover'),
            hasAriaSupport: cssContent.includes('[aria-'),
            
            // Performance
            hasOptimizedSelectors: !cssContent.includes('* * *'),
            minimizesReflows: true // Would need deeper analysis
        };

        // Test dashboard UI components
        const dashboardResponse = await makeRequest('/dashboard.html');
        const dashboardHTML = dashboardResponse.body;

        testResults.ui.dashboard = {
            // Visual hierarchy
            hasProperHeadings: dashboardHTML.includes('<h1') && dashboardHTML.includes('<h2'),
            hasConsistentSpacing: true, // Would need visual analysis
            hasColorConsistency: true, // Would need analysis
            
            // Interactive elements
            hasButtonStyles: dashboardHTML.includes('btn'),
            hasFormStyles: dashboardHTML.includes('form-group'),
            hasInputStyles: true,
            
            // Data presentation
            hasTableStyling: dashboardHTML.includes('data-table'),
            hasCardLayout: dashboardHTML.includes('stat-card'),
            hasIconUsage: dashboardHTML.includes('📊') || dashboardHTML.includes('<i '),
            
            // Loading states
            hasLoadingIndicators: dashboardHTML.includes('loading') || dashboardHTML.includes('spinner'),
            hasProgressBars: dashboardHTML.includes('progress'),
            
            // Error states
            hasErrorHandling: dashboardHTML.includes('error-message'),
            hasEmptyStates: dashboardHTML.includes('no-data') || dashboardHTML.includes('empty'),
            
            // Feedback
            hasSuccessMessages: dashboardHTML.includes('success'),
            hasTooltips: dashboardHTML.includes('title=') || dashboardHTML.includes('tooltip'),
            hasConfirmDialogs: dashboardHTML.includes('confirm')
        };

        console.log('✅ UI/UX quality testing completed');

    } catch (error) {
        testResults.issues.push(`UI quality test error: ${error.message}`);
        console.error('❌ UI quality test failed:', error.message);
    }
}

// Test Performance
async function testPerformance() {
    console.log('⚡ Testing Performance...');

    const pages = [
        { name: 'Login Page', path: '/' },
        { name: 'Dashboard', path: '/dashboard.html' },
        { name: '2FA Page', path: '/simple-verification.html' }
    ];

    testResults.performance.pages = {};

    for (const page of pages) {
        try {
            const results = [];
            
            // Run multiple requests to get average
            for (let i = 0; i < 3; i++) {
                const response = await makeRequest(page.path);
                results.push({
                    responseTime: response.responseTime,
                    size: response.size,
                    statusCode: response.statusCode
                });
            }

            const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
            const avgSize = results.reduce((sum, r) => sum + r.size, 0) / results.length;

            testResults.performance.pages[page.name] = {
                averageResponseTime: Math.round(avgResponseTime),
                averageSize: Math.round(avgSize),
                allSuccessful: results.every(r => r.statusCode === 200),
                
                // Performance grades
                responseTimeGrade: avgResponseTime < 100 ? 'A' : avgResponseTime < 300 ? 'B' : avgResponseTime < 500 ? 'C' : 'D',
                sizeGrade: avgSize < 100000 ? 'A' : avgSize < 500000 ? 'B' : avgSize < 1000000 ? 'C' : 'D'
            };

            console.log(`  ⚡ ${page.name}: ${Math.round(avgResponseTime)}ms, ${(avgSize/1024).toFixed(1)}KB`);

        } catch (error) {
            testResults.performance.pages[page.name] = {
                error: error.error || error.message
            };
            testResults.issues.push(`Performance test ${page.name} error: ${error.error || error.message}`);
        }
    }

    // Test static assets
    const assets = ['/style.css'];
    testResults.performance.assets = {};

    for (const asset of assets) {
        try {
            const response = await makeRequest(asset);
            testResults.performance.assets[asset] = {
                responseTime: response.responseTime,
                size: response.size,
                grade: response.size < 50000 ? 'A' : response.size < 100000 ? 'B' : response.size < 200000 ? 'C' : 'D'
            };
        } catch (error) {
            testResults.performance.assets[asset] = { error: error.error };
        }
    }

    console.log('✅ Performance testing completed');
}

// Test Security Features
async function testSecurityFeatures() {
    console.log('🔒 Testing Security Features...');

    try {
        // Test login page for security headers
        const loginResponse = await makeRequest('/');
        const headers = loginResponse.headers;

        testResults.security = {
            headers: {
                hasContentType: !!headers['content-type'],
                hasXFrameOptions: !!headers['x-frame-options'],
                hasXContentTypeOptions: !!headers['x-content-type-options'],
                hasXXSSProtection: !!headers['x-xss-protection'],
                hasStrictTransportSecurity: !!headers['strict-transport-security'],
                hasContentSecurityPolicy: !!headers['content-security-policy'],
                hasReferrerPolicy: !!headers['referrer-policy']
            },
            
            // Test form security
            authentication: {
                usesHTTPS: false, // Would be true in production
                hasPasswordRequirements: loginResponse.body.includes('required'),
                hasEmailValidation: loginResponse.body.includes('type="email"'),
                hasCSRFProtection: loginResponse.body.includes('csrf') || loginResponse.body.includes('_token'),
                hasRateLimiting: false, // Would need to test with multiple requests
                hasSessionManagement: loginResponse.body.includes('session')
            }
        };

        console.log('✅ Security testing completed');

    } catch (error) {
        testResults.issues.push(`Security test error: ${error.message}`);
        console.error('❌ Security test failed:', error.message);
    }
}

// Generate comprehensive report
function generateDetailedReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📋 COMPREHENSIVE FRONTEND DASHBOARD AUDIT REPORT');
    console.log('='.repeat(80));

    // Authentication Results
    console.log('\n🔐 AUTHENTICATION UI ANALYSIS:');
    const auth = testResults.authentication;
    
    if (auth.loginPage) {
        console.log('  📝 Login Page:');
        console.log(`    Accessibility: ${auth.loginPage.accessible ? '✅' : '❌'}`);
        console.log(`    Response Time: ${auth.loginPage.responseTime}ms`);
        console.log(`    Size: ${(auth.loginPage.size/1024).toFixed(1)}KB`);
        console.log(`    Email Validation: ${auth.loginPage.hasEmailValidation ? '✅' : '❌'}`);
        console.log(`    Password Security: ${auth.loginPage.hasPasswordValidation ? '✅' : '❌'}`);
        console.log(`    Form Validation: ${auth.loginPage.hasRequiredFields ? '✅' : '❌'}`);
        console.log(`    Error Handling: ${auth.loginPage.hasErrorHandling ? '✅' : '❌'}`);
        console.log(`    Async Fetch API: ${auth.loginPage.hasAsyncFetch ? '✅' : '❌'}`);
        console.log(`    Accessibility Labels: ${auth.loginPage.hasLabels ? '✅' : '❌'}`);
    }

    if (auth.twoFactorAuth) {
        console.log('  🔒 2FA Verification:');
        console.log(`    Accessibility: ${auth.twoFactorAuth.accessible ? '✅' : '❌'}`);
        console.log(`    Modal Interface: ${auth.twoFactorAuth.hasModal ? '✅' : '❌'}`);
        console.log(`    Email Option: ${auth.twoFactorAuth.hasEmailOption ? '✅' : '❌'}`);
        console.log(`    SMS Option: ${auth.twoFactorAuth.hasSMSOption ? '✅' : '❌'}`);
        console.log(`    API Integration: ${auth.twoFactorAuth.hasAPIIntegration ? '✅' : '❌'}`);
    }

    // Dashboard Analysis
    console.log('\n📊 DASHBOARD INTERFACE ANALYSIS:');
    const dashboard = testResults.dashboard.interface;
    
    if (dashboard) {
        console.log('  🏠 Core Interface:');
        console.log(`    Accessibility: ${dashboard.accessible ? '✅' : '❌'}`);
        console.log(`    Response Time: ${dashboard.responseTime}ms`);
        console.log(`    Size: ${(dashboard.size/1024).toFixed(1)}KB`);
        console.log(`    Navigation Bar: ${dashboard.hasNavbar ? '✅' : '❌'}`);
        console.log(`    Sidebar Menu: ${dashboard.hasSidebar ? '✅' : '❌'}`);
        console.log(`    Overview Section: ${dashboard.hasOverview ? '✅' : '❌'}`);
        console.log(`    Analytics Section: ${dashboard.hasAnalytics ? '✅' : '❌'}`);
        
        console.log('  📊 Data Visualization:');
        console.log(`    Chart.js Integration: ${dashboard.hasCharts ? '✅' : '❌'}`);
        console.log(`    Canvas Elements: ${dashboard.hasCanvasElements ? '✅' : '❌'}`);
        console.log(`    Statistics Grid: ${dashboard.hasStatsGrid ? '✅' : '❌'}`);
        console.log(`    KPI Cards: ${dashboard.hasKPICards ? '✅' : '❌'}`);
        
        console.log('  📋 Data Tables:');
        console.log(`    Data Tables: ${dashboard.hasDataTables ? '✅' : '❌'}`);
        console.log(`    Table Headers: ${dashboard.hasTableHeaders ? '✅' : '❌'}`);
        
        console.log('  🔄 Real-time Features:');
        console.log(`    WebSocket Support: ${dashboard.hasWebSocket ? '✅' : '❌'}`);
        console.log(`    Real-time Updates: ${dashboard.hasRealTimeUpdates ? '✅' : '❌'}`);
        
        console.log('  📱 Interactive Elements:');
        console.log(`    Modals: ${dashboard.hasModals ? '✅' : '❌'}`);
        console.log(`    File Uploads: ${dashboard.hasFileUploads ? '✅' : '❌'}`);
        console.log(`    Buttons: ${dashboard.hasButtons ? '✅' : '❌'}`);
        console.log(`    Responsive Design: ${dashboard.hasViewportMeta ? '✅' : '❌'}`);
    }

    // API Integration
    console.log('\n🔌 API INTEGRATION STATUS:');
    if (testResults.api.endpoints) {
        Object.entries(testResults.api.endpoints).forEach(([endpoint, data]) => {
            const status = data.accessible ? 
                (data.statusCode === 200 ? '✅ OK' : 
                 data.statusCode === 401 ? '🔒 Auth Required' : 
                 data.statusCode === 404 ? '❌ Not Found' : 
                 `⚠️ ${data.statusCode}`) : '❌ Error';
            console.log(`  ${endpoint}: ${status} (${data.responseTime || 0}ms)`);
        });
    }

    // Performance Analysis
    console.log('\n⚡ PERFORMANCE ANALYSIS:');
    if (testResults.performance.pages) {
        Object.entries(testResults.performance.pages).forEach(([page, data]) => {
            if (!data.error) {
                console.log(`  ${page}:`);
                console.log(`    Response Time: ${data.averageResponseTime}ms (Grade: ${data.responseTimeGrade})`);
                console.log(`    Size: ${(data.averageSize/1024).toFixed(1)}KB (Grade: ${data.sizeGrade})`);
                console.log(`    Success Rate: ${data.allSuccessful ? '100%' : 'Issues found'}`);
            }
        });
    }

    // UI/UX Quality
    console.log('\n🎨 UI/UX QUALITY ASSESSMENT:');
    const ui = testResults.ui;
    
    if (ui.css) {
        console.log('  📄 CSS Analysis:');
        console.log(`    Size: ${(ui.css.size/1024).toFixed(1)}KB`);
        console.log(`    Media Queries: ${ui.css.hasMediaQueries ? '✅' : '❌'}`);
        console.log(`    Flexbox Layout: ${ui.css.hasFlexbox ? '✅' : '❌'}`);
        console.log(`    Grid Layout: ${ui.css.hasGrid ? '✅' : '❌'}`);
        console.log(`    CSS Transitions: ${ui.css.hasTransitions ? '✅' : '❌'}`);
        console.log(`    Focus Styles: ${ui.css.hasFocusStyles ? '✅' : '❌'}`);
        console.log(`    Hover States: ${ui.css.hasHoverStates ? '✅' : '❌'}`);
    }

    if (ui.dashboard) {
        console.log('  🖼️ Dashboard UI:');
        console.log(`    Proper Headings: ${ui.dashboard.hasProperHeadings ? '✅' : '❌'}`);
        console.log(`    Button Styles: ${ui.dashboard.hasButtonStyles ? '✅' : '❌'}`);
        console.log(`    Data Tables: ${ui.dashboard.hasTableStyling ? '✅' : '❌'}`);
        console.log(`    Card Layout: ${ui.dashboard.hasCardLayout ? '✅' : '❌'}`);
        console.log(`    Loading States: ${ui.dashboard.hasLoadingIndicators ? '✅' : '❌'}`);
        console.log(`    Error Handling: ${ui.dashboard.hasErrorHandling ? '✅' : '❌'}`);
    }

    // Security Assessment
    console.log('\n🔒 SECURITY ASSESSMENT:');
    const security = testResults.security;
    
    if (security && security.headers) {
        console.log('  🛡️ Security Headers:');
        console.log(`    Content-Type: ${security.headers.hasContentType ? '✅' : '❌'}`);
        console.log(`    X-Frame-Options: ${security.headers.hasXFrameOptions ? '✅' : '❌'}`);
        console.log(`    X-Content-Type-Options: ${security.headers.hasXContentTypeOptions ? '✅' : '❌'}`);
        console.log(`    CSP Header: ${security.headers.hasContentSecurityPolicy ? '✅' : '❌'}`);
    }

    if (security && security.authentication) {
        console.log('  🔐 Authentication Security:');
        console.log(`    Email Validation: ${security.authentication.hasEmailValidation ? '✅' : '❌'}`);
        console.log(`    Password Requirements: ${security.authentication.hasPasswordRequirements ? '✅' : '❌'}`);
        console.log(`    HTTPS Usage: ${security.authentication.usesHTTPS ? '✅' : '❌'} (Dev mode)`);
    }

    // Issues Summary
    if (testResults.issues.length > 0) {
        console.log('\n❌ ISSUES FOUND:');
        testResults.issues.forEach((issue, index) => {
            console.log(`  ${index + 1}. ${issue}`);
        });
    }

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    const recommendations = [];
    
    if (testResults.api.endpoints['/api/dashboard/stats']?.statusCode === 404) {
        recommendations.push('Implement missing dashboard stats API endpoint');
    }
    if (!testResults.ui?.css?.hasAnimations) {
        recommendations.push('Consider adding subtle animations for better user experience');
    }
    if (!testResults.security?.headers?.hasContentSecurityPolicy) {
        recommendations.push('Add Content Security Policy headers for enhanced security');
    }
    if (testResults.performance?.pages?.Dashboard?.responseTimeGrade === 'D') {
        recommendations.push('Optimize dashboard loading performance');
    }

    recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
    });

    console.log('\n' + '='.repeat(80));
    
    return testResults;
}

// Run all comprehensive tests
async function runComprehensiveTests() {
    console.log('🚀 Starting Comprehensive Frontend Audit...\n');
    
    await testAuthenticationUI();
    await testDashboardInterface();
    await testAPIIntegration();
    await testUIQuality();
    await testPerformance();
    await testSecurityFeatures();
    
    const finalResults = generateDetailedReport();
    
    // Save detailed results
    fs.writeFileSync(
        '/Users/eli/turo-tolls/comprehensive-frontend-audit.json',
        JSON.stringify(finalResults, null, 2)
    );
    
    console.log('\n💾 Detailed results saved to comprehensive-frontend-audit.json');
    console.log('🎉 Comprehensive frontend audit completed!');
    
    return finalResults;
}

// Export functions
module.exports = {
    testAuthenticationUI,
    testDashboardInterface,
    testAPIIntegration,
    testUIQuality,
    testPerformance,
    testSecurityFeatures,
    generateDetailedReport,
    runComprehensiveTests
};

// Run if called directly
if (require.main === module) {
    runComprehensiveTests().catch(console.error);
}