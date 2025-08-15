// Frontend Dashboard Audit Test Script
// This script will test various frontend components by making HTTP requests
// and validating the responses

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3000';

// Test results storage
const testResults = {
    auth: {},
    dashboard: {},
    navigation: {},
    ui: {},
    performance: {},
    errors: []
};

// Utility function to make HTTP requests
function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Frontend-Audit-Test'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body,
                    responseTime: Date.now() - startTime
                });
            });
        });

        const startTime = Date.now();
        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// Test 1: Authentication Pages
async function testAuthPages() {
    console.log('🔐 Testing Authentication Pages...');
    
    try {
        // Test login page
        const loginPage = await makeRequest('/');
        testResults.auth.loginPage = {
            accessible: loginPage.statusCode === 200,
            responseTime: loginPage.responseTime,
            hasLoginForm: loginPage.body.includes('login-form'),
            hasSignupForm: loginPage.body.includes('signup-form'),
            hasCSS: loginPage.body.includes('style.css'),
            hasJavaScript: loginPage.body.includes('<script>'),
            hasFormValidation: loginPage.body.includes('required')
        };

        // Test verification page
        const verificationPage = await makeRequest('/simple-verification.html');
        testResults.auth.verificationPage = {
            accessible: verificationPage.statusCode === 200,
            responseTime: verificationPage.responseTime,
            hasModal: verificationPage.body.includes('verification-modal'),
            has2FAOptions: verificationPage.body.includes('email') && verificationPage.body.includes('sms')
        };

        console.log('✅ Authentication pages test completed');
    } catch (error) {
        testResults.errors.push(`Auth test error: ${error.message}`);
        console.error('❌ Authentication test failed:', error.message);
    }
}

// Test 2: Dashboard Page Access
async function testDashboardAccess() {
    console.log('📊 Testing Dashboard Access...');
    
    try {
        // Test public dashboard
        const publicDashboard = await makeRequest('/dashboard.html');
        testResults.dashboard.publicAccess = {
            accessible: publicDashboard.statusCode === 200,
            responseTime: publicDashboard.responseTime,
            hasNavigation: publicDashboard.body.includes('sidebar'),
            hasCharts: publicDashboard.body.includes('chart.js'),
            hasWebSocket: publicDashboard.body.includes('websocket'),
            hasStats: publicDashboard.body.includes('stats-grid')
        };

        // Test main dashboard
        const mainDashboard = await makeRequest('/public/dashboard.html');
        testResults.dashboard.mainAccess = {
            accessible: mainDashboard.statusCode === 200,
            responseTime: mainDashboard.responseTime,
            size: mainDashboard.body.length
        };

        console.log('✅ Dashboard access test completed');
    } catch (error) {
        testResults.errors.push(`Dashboard test error: ${error.message}`);
        console.error('❌ Dashboard test failed:', error.message);
    }
}

// Test 3: API Endpoints
async function testAPIEndpoints() {
    console.log('🔌 Testing API Endpoints...');
    
    const apiEndpoints = [
        '/api/auth/login',
        '/api/dashboard/stats',
        '/api/dashboard/recent-activity',
        '/api/trips',
        '/api/tolls',
        '/api/analytics/overview',
        '/api/health'
    ];

    for (const endpoint of apiEndpoints) {
        try {
            const response = await makeRequest(endpoint);
            testResults.dashboard[endpoint] = {
                accessible: response.statusCode !== 404,
                statusCode: response.statusCode,
                responseTime: response.responseTime,
                hasJSON: response.headers['content-type']?.includes('application/json')
            };
            console.log(`  📡 ${endpoint}: ${response.statusCode}`);
        } catch (error) {
            testResults.errors.push(`API ${endpoint} error: ${error.message}`);
            console.error(`  ❌ ${endpoint}: ${error.message}`);
        }
    }

    console.log('✅ API endpoints test completed');
}

// Test 4: Static Assets
async function testStaticAssets() {
    console.log('🎨 Testing Static Assets...');
    
    const assets = [
        '/style.css',
        '/public/style.css'
    ];

    for (const asset of assets) {
        try {
            const response = await makeRequest(asset);
            testResults.ui[asset] = {
                accessible: response.statusCode === 200,
                responseTime: response.responseTime,
                size: response.body.length,
                hasResponsive: response.body.includes('@media'),
                hasGrid: response.body.includes('grid'),
                hasFlexbox: response.body.includes('flex')
            };
            console.log(`  🎨 ${asset}: ${response.statusCode} (${response.body.length} bytes)`);
        } catch (error) {
            testResults.errors.push(`Asset ${asset} error: ${error.message}`);
            console.error(`  ❌ ${asset}: ${error.message}`);
        }
    }

    console.log('✅ Static assets test completed');
}

// Test 5: Performance Metrics
async function testPerformance() {
    console.log('⚡ Testing Performance...');
    
    const pages = ['/', '/dashboard.html', '/public/dashboard.html'];
    const performanceResults = [];

    for (const page of pages) {
        try {
            const startTime = Date.now();
            const response = await makeRequest(page);
            const endTime = Date.now();

            performanceResults.push({
                page,
                responseTime: endTime - startTime,
                statusCode: response.statusCode,
                contentSize: response.body.length
            });

            console.log(`  ⚡ ${page}: ${endTime - startTime}ms, ${response.body.length} bytes`);
        } catch (error) {
            testResults.errors.push(`Performance test ${page} error: ${error.message}`);
        }
    }

    testResults.performance = performanceResults;
    console.log('✅ Performance test completed');
}

// Test 6: UI Component Analysis
async function testUIComponents() {
    console.log('🎛️ Testing UI Components...');
    
    try {
        const dashboardResponse = await makeRequest('/dashboard.html');
        const dashboardHTML = dashboardResponse.body;

        testResults.ui.components = {
            hasModals: dashboardHTML.includes('modal'),
            hasTables: dashboardHTML.includes('<table'),
            hasCharts: dashboardHTML.includes('canvas'),
            hasForms: dashboardHTML.includes('<form'),
            hasButtons: dashboardHTML.includes('btn'),
            hasNavigation: dashboardHTML.includes('nav'),
            hasSidebar: dashboardHTML.includes('sidebar'),
            hasCards: dashboardHTML.includes('card'),
            hasTooltips: dashboardHTML.includes('title='),
            hasResponsiveImages: dashboardHTML.includes('img')
        };

        console.log('✅ UI components analysis completed');
    } catch (error) {
        testResults.errors.push(`UI components test error: ${error.message}`);
        console.error('❌ UI components test failed:', error.message);
    }
}

// Generate comprehensive report
function generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 FRONTEND DASHBOARD AUDIT REPORT');
    console.log('='.repeat(60));

    // Authentication Results
    console.log('\n🔐 AUTHENTICATION PAGES:');
    if (testResults.auth.loginPage) {
        console.log(`  Login Page: ${testResults.auth.loginPage.accessible ? '✅' : '❌'} Accessible`);
        console.log(`    Response Time: ${testResults.auth.loginPage.responseTime}ms`);
        console.log(`    Has Login Form: ${testResults.auth.loginPage.hasLoginForm ? '✅' : '❌'}`);
        console.log(`    Has Signup Form: ${testResults.auth.loginPage.hasSignupForm ? '✅' : '❌'}`);
        console.log(`    CSS Loaded: ${testResults.auth.loginPage.hasCSS ? '✅' : '❌'}`);
        console.log(`    JavaScript Present: ${testResults.auth.loginPage.hasJavaScript ? '✅' : '❌'}`);
        console.log(`    Form Validation: ${testResults.auth.loginPage.hasFormValidation ? '✅' : '❌'}`);
    }

    if (testResults.auth.verificationPage) {
        console.log(`  2FA Page: ${testResults.auth.verificationPage.accessible ? '✅' : '❌'} Accessible`);
        console.log(`    Response Time: ${testResults.auth.verificationPage.responseTime}ms`);
        console.log(`    Has Modal: ${testResults.auth.verificationPage.hasModal ? '✅' : '❌'}`);
        console.log(`    Has 2FA Options: ${testResults.auth.verificationPage.has2FAOptions ? '✅' : '❌'}`);
    }

    // Dashboard Results
    console.log('\n📊 DASHBOARD PAGES:');
    if (testResults.dashboard.publicAccess) {
        console.log(`  Public Dashboard: ${testResults.dashboard.publicAccess.accessible ? '✅' : '❌'} Accessible`);
        console.log(`    Response Time: ${testResults.dashboard.publicAccess.responseTime}ms`);
        console.log(`    Navigation: ${testResults.dashboard.publicAccess.hasNavigation ? '✅' : '❌'}`);
        console.log(`    Charts Library: ${testResults.dashboard.publicAccess.hasCharts ? '✅' : '❌'}`);
        console.log(`    WebSocket: ${testResults.dashboard.publicAccess.hasWebSocket ? '✅' : '❌'}`);
        console.log(`    Statistics Grid: ${testResults.dashboard.publicAccess.hasStats ? '✅' : '❌'}`);
    }

    if (testResults.dashboard.mainAccess) {
        console.log(`  Main Dashboard: ${testResults.dashboard.mainAccess.accessible ? '✅' : '❌'} Accessible`);
        console.log(`    Response Time: ${testResults.dashboard.mainAccess.responseTime}ms`);
        console.log(`    Content Size: ${(testResults.dashboard.mainAccess.size / 1024).toFixed(1)}KB`);
    }

    // Performance Results
    console.log('\n⚡ PERFORMANCE METRICS:');
    testResults.performance.forEach(result => {
        console.log(`  ${result.page}:`);
        console.log(`    Response Time: ${result.responseTime}ms`);
        console.log(`    Status: ${result.statusCode}`);
        console.log(`    Size: ${(result.contentSize / 1024).toFixed(1)}KB`);
    });

    // UI Components
    console.log('\n🎛️ UI COMPONENTS:');
    if (testResults.ui.components) {
        Object.entries(testResults.ui.components).forEach(([component, present]) => {
            console.log(`  ${component}: ${present ? '✅' : '❌'}`);
        });
    }

    // CSS Analysis
    console.log('\n🎨 CSS ANALYSIS:');
    Object.entries(testResults.ui).forEach(([asset, data]) => {
        if (asset !== 'components' && data.accessible !== undefined) {
            console.log(`  ${asset}:`);
            console.log(`    Accessible: ${data.accessible ? '✅' : '❌'}`);
            console.log(`    Size: ${(data.size / 1024).toFixed(1)}KB`);
            console.log(`    Responsive: ${data.hasResponsive ? '✅' : '❌'}`);
            console.log(`    Grid Layout: ${data.hasGrid ? '✅' : '❌'}`);
            console.log(`    Flexbox: ${data.hasFlexbox ? '✅' : '❌'}`);
        }
    });

    // Errors
    if (testResults.errors.length > 0) {
        console.log('\n❌ ERRORS ENCOUNTERED:');
        testResults.errors.forEach((error, index) => {
            console.log(`  ${index + 1}. ${error}`);
        });
    }

    console.log('\n' + '='.repeat(60));
    return testResults;
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Starting Frontend Dashboard Audit...\n');
    
    await testAuthPages();
    await testDashboardAccess();
    await testAPIEndpoints();
    await testStaticAssets();
    await testPerformance();
    await testUIComponents();
    
    const finalResults = generateReport();
    
    // Save results to file
    require('fs').writeFileSync(
        '/Users/eli/turo-tolls/frontend-audit-results.json',
        JSON.stringify(finalResults, null, 2)
    );
    
    console.log('\n💾 Results saved to frontend-audit-results.json');
    console.log('🎉 Frontend audit completed!');
}

// Export for testing
module.exports = {
    makeRequest,
    testAuthPages,
    testDashboardAccess,
    testAPIEndpoints,
    testStaticAssets,
    testPerformance,
    testUIComponents,
    generateReport,
    runAllTests
};

// Run tests if called directly
if (require.main === module) {
    runAllTests().catch(console.error);
}