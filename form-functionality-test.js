// Form Functionality and CSV Upload Testing
// Tests specific form interactions and file upload capabilities

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

// Test results for forms and file uploads
const formTestResults = {
    authentication: {},
    csvUpload: {},
    validation: {},
    userExperience: {},
    errors: []
};

// Utility function for making requests
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
                'User-Agent': 'Form-Functionality-Test',
                ...headers
            }
        };

        const startTime = Date.now();
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

        req.on('error', (error) => {
            reject({
                error: error.message,
                responseTime: Date.now() - startTime
            });
        });

        if (data) {
            req.write(typeof data === 'string' ? data : JSON.stringify(data));
        }

        req.end();
    });
}

// Test Authentication Forms
async function testAuthenticationForms() {
    console.log('🔐 Testing Authentication Form Functionality...');

    try {
        // Test login form submission with invalid data
        const invalidLogin = await makeRequest('/api/auth/login', 'POST', {
            email: 'invalid-email',
            password: ''
        });

        formTestResults.authentication.invalidLogin = {
            statusCode: invalidLogin.statusCode,
            responseTime: invalidLogin.responseTime,
            hasValidation: invalidLogin.statusCode === 400 || invalidLogin.body.includes('error'),
            response: invalidLogin.body.substring(0, 200) // First 200 chars
        };

        // Test login form with valid format but non-existent user
        const nonExistentUser = await makeRequest('/api/auth/login', 'POST', {
            email: 'test@example.com',
            password: 'validpassword123'
        });

        formTestResults.authentication.nonExistentUser = {
            statusCode: nonExistentUser.statusCode,
            responseTime: nonExistentUser.responseTime,
            handlesNonExistentUser: nonExistentUser.statusCode === 401 || nonExistentUser.body.includes('Invalid'),
            response: nonExistentUser.body.substring(0, 200)
        };

        // Test signup form with various inputs
        const signupTest = await makeRequest('/api/auth/signup', 'POST', {
            fullName: 'Test User',
            email: 'newuser@example.com',
            password: 'testpassword123',
            turoHostId: 'TH123456'
        });

        formTestResults.authentication.signupTest = {
            statusCode: signupTest.statusCode,
            responseTime: signupTest.responseTime,
            acceptsSignup: signupTest.statusCode === 200 || signupTest.statusCode === 201,
            response: signupTest.body.substring(0, 200)
        };

        // Test signup with missing required fields
        const incompleteSignup = await makeRequest('/api/auth/signup', 'POST', {
            fullName: '',
            email: 'test@example.com',
            password: ''
        });

        formTestResults.authentication.incompleteSignup = {
            statusCode: incompleteSignup.statusCode,
            responseTime: incompleteSignup.responseTime,
            validatesRequiredFields: incompleteSignup.statusCode === 400,
            response: incompleteSignup.body.substring(0, 200)
        };

        console.log('✅ Authentication form testing completed');

    } catch (error) {
        formTestResults.errors.push(`Authentication form test error: ${error.message}`);
        console.error('❌ Authentication form test failed:', error.message);
    }
}

// Test CSV Upload Functionality
async function testCSVUploadFeatures() {
    console.log('📁 Testing CSV Upload Functionality...');

    try {
        // Test if upload endpoints exist and respond appropriately
        const tollUploadTest = await makeRequest('/api/tolls/upload', 'POST');
        
        formTestResults.csvUpload.tollUpload = {
            endpointExists: tollUploadTest.statusCode !== 404,
            statusCode: tollUploadTest.statusCode,
            responseTime: tollUploadTest.responseTime,
            requiresAuth: tollUploadTest.statusCode === 401,
            hasValidation: tollUploadTest.statusCode === 400
        };

        // Test trip upload endpoint
        const tripUploadTest = await makeRequest('/api/trips/upload', 'POST');
        
        formTestResults.csvUpload.tripUpload = {
            endpointExists: tripUploadTest.statusCode !== 404,
            statusCode: tripUploadTest.statusCode,
            responseTime: tripUploadTest.responseTime,
            requiresAuth: tripUploadTest.statusCode === 401
        };

        // Test file type validation (simulate uploading non-CSV)
        const invalidFileTest = await makeRequest('/api/tolls/upload', 'POST', 
            'This is not CSV data', 
            {'Content-Type': 'text/plain'}
        );

        formTestResults.csvUpload.fileValidation = {
            statusCode: invalidFileTest.statusCode,
            responseTime: invalidFileTest.responseTime,
            validatesFileType: invalidFileTest.statusCode === 400 || invalidFileTest.body.includes('CSV')
        };

        console.log('✅ CSV upload functionality testing completed');

    } catch (error) {
        formTestResults.errors.push(`CSV upload test error: ${error.message}`);
        console.error('❌ CSV upload test failed:', error.message);
    }
}

// Test Form Validation on Frontend
async function testFrontendValidation() {
    console.log('✅ Testing Frontend Form Validation...');

    try {
        // Get the login page and analyze validation attributes
        const loginPage = await makeRequest('/');
        const loginHTML = loginPage.body;

        formTestResults.validation.loginForm = {
            hasEmailValidation: loginHTML.includes('type="email"'),
            hasRequiredFields: loginHTML.includes('required'),
            hasPasswordField: loginHTML.includes('type="password"'),
            hasClientSideValidation: loginHTML.includes('checkValidity') || loginHTML.includes('reportValidity'),
            hasCustomValidation: loginHTML.includes('setCustomValidity'),
            hasPatternValidation: loginHTML.includes('pattern='),
            hasMinLengthValidation: loginHTML.includes('minlength=') || loginHTML.includes('minLength='),
            hasMaxLengthValidation: loginHTML.includes('maxlength=') || loginHTML.includes('maxLength=')
        };

        // Analyze dashboard form validation
        const dashboardPage = await makeRequest('/dashboard.html');
        const dashboardHTML = dashboardPage.body;

        formTestResults.validation.dashboardForms = {
            hasFileInputs: dashboardHTML.includes('type="file"'),
            hasDropZones: dashboardHTML.includes('drop-zone') || dashboardHTML.includes('dragover'),
            hasFormValidation: dashboardHTML.includes('required'),
            hasFileTypeValidation: dashboardHTML.includes('accept='),
            hasFileSizeValidation: dashboardHTML.includes('size') && dashboardHTML.includes('file'),
            hasProgressBars: dashboardHTML.includes('progress') || dashboardHTML.includes('percent'),
            hasUploadFeedback: dashboardHTML.includes('upload') && (dashboardHTML.includes('success') || dashboardHTML.includes('error'))
        };

        // Check for accessibility features in forms
        formTestResults.validation.accessibility = {
            hasAriaLabels: loginHTML.includes('aria-label') || dashboardHTML.includes('aria-label'),
            hasAriaDescribedBy: loginHTML.includes('aria-describedby') || dashboardHTML.includes('aria-describedby'),
            hasAriaRequired: loginHTML.includes('aria-required') || dashboardHTML.includes('aria-required'),
            hasAriaInvalid: loginHTML.includes('aria-invalid') || dashboardHTML.includes('aria-invalid'),
            hasFieldsets: loginHTML.includes('<fieldset') || dashboardHTML.includes('<fieldset'),
            hasLegends: loginHTML.includes('<legend') || dashboardHTML.includes('<legend')
        };

        console.log('✅ Frontend validation testing completed');

    } catch (error) {
        formTestResults.errors.push(`Frontend validation test error: ${error.message}`);
        console.error('❌ Frontend validation test failed:', error.message);
    }
}

// Test User Experience Features
async function testUserExperienceFeatures() {
    console.log('🎨 Testing User Experience Features...');

    try {
        const dashboardPage = await makeRequest('/dashboard.html');
        const dashboardHTML = dashboardPage.body;

        formTestResults.userExperience = {
            // Loading states
            hasLoadingIndicators: dashboardHTML.includes('loading') || dashboardHTML.includes('spinner'),
            hasSkeletonLoaders: dashboardHTML.includes('skeleton'),
            hasProgressIndicators: dashboardHTML.includes('progress'),
            
            // Feedback mechanisms
            hasToasts: dashboardHTML.includes('toast') || dashboardHTML.includes('notification'),
            hasModalDialogs: dashboardHTML.includes('modal'),
            hasConfirmDialogs: dashboardHTML.includes('confirm'),
            hasSuccessMessages: dashboardHTML.includes('success-message'),
            hasErrorMessages: dashboardHTML.includes('error-message'),
            
            // Interactive elements
            hasTooltips: dashboardHTML.includes('tooltip') || dashboardHTML.includes('title='),
            hasHoverEffects: dashboardHTML.includes(':hover') || dashboardHTML.includes('hover'),
            hasFocusStyles: dashboardHTML.includes(':focus'),
            hasClickFeedback: dashboardHTML.includes('active') || dashboardHTML.includes('pressed'),
            
            // Data display
            hasPagination: dashboardHTML.includes('pagination') || dashboardHTML.includes('page-'),
            hasSorting: dashboardHTML.includes('sort') || dashboardHTML.includes('order'),
            hasFiltering: dashboardHTML.includes('filter') || dashboardHTML.includes('search'),
            hasSearch: dashboardHTML.includes('search') || dashboardHTML.includes('type="search"'),
            
            // Responsive features
            hasHamburgerMenu: dashboardHTML.includes('hamburger') || dashboardHTML.includes('menu-toggle'),
            hasCollapsibleSections: dashboardHTML.includes('collapse') || dashboardHTML.includes('accordion'),
            hasTabInterface: dashboardHTML.includes('tab-'),
            
            // Real-time features
            hasWebSocketConnection: dashboardHTML.includes('WebSocket') || dashboardHTML.includes('ws://'),
            hasAutoRefresh: dashboardHTML.includes('setInterval') || dashboardHTML.includes('refresh'),
            hasLiveUpdates: dashboardHTML.includes('live') || dashboardHTML.includes('real-time')
        };

        console.log('✅ User experience testing completed');

    } catch (error) {
        formTestResults.errors.push(`UX test error: ${error.message}`);
        console.error('❌ User experience test failed:', error.message);
    }
}

// Test Specific Dashboard Features
async function testDashboardFeatures() {
    console.log('📊 Testing Specific Dashboard Features...');

    try {
        const dashboardPage = await makeRequest('/dashboard.html');
        const dashboardHTML = dashboardPage.body;

        // Test for specific toll tracking features
        const tollFeatures = {
            hasTollMatching: dashboardHTML.includes('toll-matching') || dashboardHTML.includes('match'),
            hasUnmatchedTolls: dashboardHTML.includes('unmatched') || dashboardHTML.includes('pending'),
            hasTripManagement: dashboardHTML.includes('trip') && dashboardHTML.includes('management'),
            hasInvoiceGeneration: dashboardHTML.includes('invoice') && dashboardHTML.includes('generate'),
            hasAnalyticsCharts: dashboardHTML.includes('chart') && dashboardHTML.includes('analytics'),
            hasKPIDashboard: dashboardHTML.includes('kpi') || (dashboardHTML.includes('stat-') && dashboardHTML.includes('value')),
            
            // File upload features
            hasCSVUpload: dashboardHTML.includes('csv') || dashboardHTML.includes('CSV'),
            hasDragDrop: dashboardHTML.includes('drop') && dashboardHTML.includes('drag'),
            hasFileValidation: dashboardHTML.includes('accept=') && dashboardHTML.includes('csv'),
            
            // EZ-Pass integration
            hasEZPassIntegration: dashboardHTML.includes('ez-pass') || dashboardHTML.includes('ezpass'),
            hasTransponderManagement: dashboardHTML.includes('transponder'),
            has2FAVerification: dashboardHTML.includes('verification') || dashboardHTML.includes('2fa'),
            
            // Turo integration
            hasTuroSync: dashboardHTML.includes('turo') && dashboardHTML.includes('sync'),
            hasTuroAPI: dashboardHTML.includes('turo') && dashboardHTML.includes('api'),
            
            // Advanced features
            hasMLMatching: dashboardHTML.includes('machine') || dashboardHTML.includes('ml') || dashboardHTML.includes('smart'),
            hasAutomation: dashboardHTML.includes('auto') && (dashboardHTML.includes('match') || dashboardHTML.includes('process')),
            hasReporting: dashboardHTML.includes('report') && dashboardHTML.includes('export'),
            hasScheduling: dashboardHTML.includes('schedule') || dashboardHTML.includes('cron')
        };

        formTestResults.dashboardFeatures = tollFeatures;

        // Count available features
        const availableFeatures = Object.values(tollFeatures).filter(Boolean).length;
        const totalFeatures = Object.keys(tollFeatures).length;
        
        formTestResults.featureCompleteness = {
            availableFeatures,
            totalFeatures,
            completionPercentage: Math.round((availableFeatures / totalFeatures) * 100)
        };

        console.log(`✅ Dashboard features testing completed (${availableFeatures}/${totalFeatures} features found)`);

    } catch (error) {
        formTestResults.errors.push(`Dashboard features test error: ${error.message}`);
        console.error('❌ Dashboard features test failed:', error.message);
    }
}

// Generate Form Functionality Report
function generateFormReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📋 FORM FUNCTIONALITY & FEATURE AUDIT REPORT');
    console.log('='.repeat(80));

    // Authentication Forms
    console.log('\n🔐 AUTHENTICATION FORM TESTING:');
    const auth = formTestResults.authentication;
    
    if (auth.invalidLogin) {
        console.log('  📝 Invalid Login Test:');
        console.log(`    Status: ${auth.invalidLogin.statusCode}`);
        console.log(`    Has Validation: ${auth.invalidLogin.hasValidation ? '✅' : '❌'}`);
        console.log(`    Response Time: ${auth.invalidLogin.responseTime}ms`);
    }

    if (auth.signupTest) {
        console.log('  📝 Signup Form Test:');
        console.log(`    Status: ${auth.signupTest.statusCode}`);
        console.log(`    Accepts Signup: ${auth.signupTest.acceptsSignup ? '✅' : '❌'}`);
        console.log(`    Response Time: ${auth.signupTest.responseTime}ms`);
    }

    if (auth.incompleteSignup) {
        console.log('  📝 Incomplete Signup Test:');
        console.log(`    Validates Required Fields: ${auth.incompleteSignup.validatesRequiredFields ? '✅' : '❌'}`);
    }

    // CSV Upload Testing
    console.log('\n📁 CSV UPLOAD FUNCTIONALITY:');
    const csv = formTestResults.csvUpload;
    
    if (csv.tollUpload) {
        console.log('  📊 Toll Upload Endpoint:');
        console.log(`    Endpoint Exists: ${csv.tollUpload.endpointExists ? '✅' : '❌'}`);
        console.log(`    Requires Auth: ${csv.tollUpload.requiresAuth ? '✅' : '❌'}`);
        console.log(`    Has Validation: ${csv.tollUpload.hasValidation ? '✅' : '❌'}`);
    }

    if (csv.tripUpload) {
        console.log('  🚗 Trip Upload Endpoint:');
        console.log(`    Endpoint Exists: ${csv.tripUpload.endpointExists ? '✅' : '❌'}`);
        console.log(`    Requires Auth: ${csv.tripUpload.requiresAuth ? '✅' : '❌'}`);
    }

    // Frontend Validation
    console.log('\n✅ FRONTEND VALIDATION FEATURES:');
    const validation = formTestResults.validation;
    
    if (validation.loginForm) {
        console.log('  📝 Login Form Validation:');
        console.log(`    Email Validation: ${validation.loginForm.hasEmailValidation ? '✅' : '❌'}`);
        console.log(`    Required Fields: ${validation.loginForm.hasRequiredFields ? '✅' : '❌'}`);
        console.log(`    Password Field: ${validation.loginForm.hasPasswordField ? '✅' : '❌'}`);
        console.log(`    Client-side Validation: ${validation.loginForm.hasClientSideValidation ? '✅' : '❌'}`);
    }

    if (validation.dashboardForms) {
        console.log('  📊 Dashboard Form Features:');
        console.log(`    File Inputs: ${validation.dashboardForms.hasFileInputs ? '✅' : '❌'}`);
        console.log(`    Drop Zones: ${validation.dashboardForms.hasDropZones ? '✅' : '❌'}`);
        console.log(`    File Type Validation: ${validation.dashboardForms.hasFileTypeValidation ? '✅' : '❌'}`);
        console.log(`    Upload Feedback: ${validation.dashboardForms.hasUploadFeedback ? '✅' : '❌'}`);
    }

    if (validation.accessibility) {
        console.log('  ♿ Accessibility Features:');
        console.log(`    ARIA Labels: ${validation.accessibility.hasAriaLabels ? '✅' : '❌'}`);
        console.log(`    ARIA Required: ${validation.accessibility.hasAriaRequired ? '✅' : '❌'}`);
        console.log(`    Fieldsets: ${validation.accessibility.hasFieldsets ? '✅' : '❌'}`);
    }

    // User Experience Features
    console.log('\n🎨 USER EXPERIENCE FEATURES:');
    const ux = formTestResults.userExperience;
    
    if (ux) {
        console.log('  🔄 Loading & Feedback:');
        console.log(`    Loading Indicators: ${ux.hasLoadingIndicators ? '✅' : '❌'}`);
        console.log(`    Progress Indicators: ${ux.hasProgressIndicators ? '✅' : '❌'}`);
        console.log(`    Success Messages: ${ux.hasSuccessMessages ? '✅' : '❌'}`);
        console.log(`    Error Messages: ${ux.hasErrorMessages ? '✅' : '❌'}`);
        
        console.log('  🖱️ Interactive Elements:');
        console.log(`    Tooltips: ${ux.hasTooltips ? '✅' : '❌'}`);
        console.log(`    Modal Dialogs: ${ux.hasModalDialogs ? '✅' : '❌'}`);
        console.log(`    Focus Styles: ${ux.hasFocusStyles ? '✅' : '❌'}`);
        
        console.log('  📊 Data Management:');
        console.log(`    Pagination: ${ux.hasPagination ? '✅' : '❌'}`);
        console.log(`    Sorting: ${ux.hasSorting ? '✅' : '❌'}`);
        console.log(`    Filtering: ${ux.hasFiltering ? '✅' : '❌'}`);
        console.log(`    Search: ${ux.hasSearch ? '✅' : '❌'}`);
        
        console.log('  🔄 Real-time Features:');
        console.log(`    WebSocket Connection: ${ux.hasWebSocketConnection ? '✅' : '❌'}`);
        console.log(`    Live Updates: ${ux.hasLiveUpdates ? '✅' : '❌'}`);
    }

    // Dashboard Features
    console.log('\n📊 DASHBOARD FEATURE ANALYSIS:');
    const features = formTestResults.dashboardFeatures;
    
    if (features) {
        console.log('  🛣️ Core Toll Features:');
        console.log(`    Toll Matching: ${features.hasTollMatching ? '✅' : '❌'}`);
        console.log(`    Unmatched Tolls: ${features.hasUnmatchedTolls ? '✅' : '❌'}`);
        console.log(`    Trip Management: ${features.hasTripManagement ? '✅' : '❌'}`);
        console.log(`    Invoice Generation: ${features.hasInvoiceGeneration ? '✅' : '❌'}`);
        
        console.log('  📈 Analytics & Visualization:');
        console.log(`    Analytics Charts: ${features.hasAnalyticsCharts ? '✅' : '❌'}`);
        console.log(`    KPI Dashboard: ${features.hasKPIDashboard ? '✅' : '❌'}`);
        
        console.log('  📁 File Management:');
        console.log(`    CSV Upload: ${features.hasCSVUpload ? '✅' : '❌'}`);
        console.log(`    Drag & Drop: ${features.hasDragDrop ? '✅' : '❌'}`);
        
        console.log('  🔗 Integrations:');
        console.log(`    EZ-Pass Integration: ${features.hasEZPassIntegration ? '✅' : '❌'}`);
        console.log(`    Turo Sync: ${features.hasTuroSync ? '✅' : '❌'}`);
        console.log(`    2FA Verification: ${features.has2FAVerification ? '✅' : '❌'}`);
        
        console.log('  🤖 Advanced Features:');
        console.log(`    ML Matching: ${features.hasMLMatching ? '✅' : '❌'}`);
        console.log(`    Automation: ${features.hasAutomation ? '✅' : '❌'}`);
        console.log(`    Reporting: ${features.hasReporting ? '✅' : '❌'}`);
    }

    // Feature Completeness
    if (formTestResults.featureCompleteness) {
        const fc = formTestResults.featureCompleteness;
        console.log('\n📊 FEATURE COMPLETENESS SUMMARY:');
        console.log(`  Available Features: ${fc.availableFeatures}/${fc.totalFeatures}`);
        console.log(`  Completion Percentage: ${fc.completionPercentage}%`);
        
        let grade = 'D';
        if (fc.completionPercentage >= 90) grade = 'A';
        else if (fc.completionPercentage >= 80) grade = 'B';
        else if (fc.completionPercentage >= 70) grade = 'C';
        
        console.log(`  Overall Grade: ${grade}`);
    }

    // Issues
    if (formTestResults.errors.length > 0) {
        console.log('\n❌ ISSUES FOUND:');
        formTestResults.errors.forEach((error, index) => {
            console.log(`  ${index + 1}. ${error}`);
        });
    }

    console.log('\n' + '='.repeat(80));
    return formTestResults;
}

// Run all form functionality tests
async function runFormTests() {
    console.log('🚀 Starting Form Functionality & Feature Testing...\n');
    
    await testAuthenticationForms();
    await testCSVUploadFeatures();
    await testFrontendValidation();
    await testUserExperienceFeatures();
    await testDashboardFeatures();
    
    const results = generateFormReport();
    
    // Save results
    fs.writeFileSync(
        '/Users/eli/turo-tolls/form-functionality-audit.json',
        JSON.stringify(results, null, 2)
    );
    
    console.log('\n💾 Form functionality results saved to form-functionality-audit.json');
    console.log('🎉 Form functionality testing completed!');
    
    return results;
}

// Export functions
module.exports = {
    testAuthenticationForms,
    testCSVUploadFeatures,
    testFrontendValidation,
    testUserExperienceFeatures,
    testDashboardFeatures,
    generateFormReport,
    runFormTests
};

// Run if called directly
if (require.main === module) {
    runFormTests().catch(console.error);
}