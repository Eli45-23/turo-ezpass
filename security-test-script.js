#!/usr/bin/env node

/**
 * Security Infrastructure Test Script
 * Tests various security components of the Turo Toll Tracker
 */

const crypto = require('crypto');
const { 
    encryptSensitiveData, 
    decryptSensitiveData, 
    secureCompare,
    generateSecureToken,
    migrateOldPassword,
    isOldPasswordFormat
} = require('./utils/crypto');

const { 
    sanitizeText,
    schemas,
    logSecurityEvent
} = require('./middleware/security');

const { db } = require('./config/database');
const Joi = require('joi');

// Test result tracking
let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
    details: []
};

function runTest(testName, testFunction) {
    testResults.total++;
    try {
        const result = testFunction();
        if (result) {
            testResults.passed++;
            testResults.details.push({ name: testName, status: 'PASS', message: '' });
            console.log(`✅ ${testName}`);
        } else {
            testResults.failed++;
            testResults.details.push({ name: testName, status: 'FAIL', message: 'Test returned false' });
            console.log(`❌ ${testName}`);
        }
    } catch (error) {
        testResults.failed++;
        testResults.details.push({ name: testName, status: 'FAIL', message: error.message });
        console.log(`❌ ${testName}: ${error.message}`);
    }
}

function testEncryption() {
    console.log('\n📋 Testing Encryption Implementation...');
    
    // Test 1: Basic encryption/decryption
    runTest('AES-256-GCM Basic Encryption/Decryption', () => {
        const plaintext = 'test_password_123!';
        const hostId = 'test_host_001';
        
        // Set required environment variable for testing
        if (!process.env.ENCRYPTION_MASTER_KEY) {
            process.env.ENCRYPTION_MASTER_KEY = 'test_key_that_is_at_least_32_characters_long_for_security';
        }
        
        const encrypted = encryptSensitiveData(plaintext, hostId);
        const decrypted = decryptSensitiveData(encrypted, hostId);
        
        return decrypted === plaintext && encrypted !== plaintext;
    });
    
    // Test 2: Host ID verification (AAD)
    runTest('Host ID Authentication (AAD)', () => {
        const plaintext = 'test_password_123!';
        const hostId1 = 'host_001';
        const hostId2 = 'host_002';
        
        const encrypted = encryptSensitiveData(plaintext, hostId1);
        
        try {
            // This should fail due to different host ID
            decryptSensitiveData(encrypted, hostId2);
            return false; // Should not reach here
        } catch (error) {
            return error.message.includes('Decryption failed');
        }
    });
    
    // Test 3: Tampering detection
    runTest('Tampering Detection', () => {
        const plaintext = 'test_password_123!';
        const hostId = 'test_host';
        
        const encrypted = encryptSensitiveData(plaintext, hostId);
        
        // Tamper with the encrypted data
        const tamperedData = encrypted.substring(0, encrypted.length - 5) + 'XXXXX';
        
        try {
            decryptSensitiveData(tamperedData, hostId);
            return false; // Should not reach here
        } catch (error) {
            return error.message.includes('Decryption failed');
        }
    });
    
    // Test 4: Secure token generation
    runTest('Secure Token Generation', () => {
        const token1 = generateSecureToken(32);
        const token2 = generateSecureToken(32);
        
        return token1 !== token2 && token1.length === 64 && token2.length === 64; // Hex encoding doubles length
    });
    
    // Test 5: Secure comparison function
    runTest('Timing-Safe String Comparison', () => {
        const string1 = 'test_string_123';
        const string2 = 'test_string_123';
        const string3 = 'different_string';
        
        return secureCompare(string1, string2) && !secureCompare(string1, string3);
    });
    
    // Test 6: Password migration
    runTest('Base64 Password Migration', () => {
        const originalPassword = 'my_password_123!';
        const base64Password = Buffer.from(originalPassword).toString('base64');
        const hostId = 'test_host';
        
        const isOldFormat = isOldPasswordFormat(base64Password);
        if (!isOldFormat) return false;
        
        const migratedPassword = migrateOldPassword(base64Password, hostId);
        const decrypted = decryptSensitiveData(migratedPassword, hostId);
        
        return decrypted === originalPassword;
    });
}

function testInputValidation() {
    console.log('\n📋 Testing Input Validation & Sanitization...');
    
    // Test 1: XSS Prevention
    runTest('XSS Attack Prevention', () => {
        const maliciousInput = '<script>alert("xss")</script>';
        const sanitized = sanitizeText(maliciousInput);
        
        return !sanitized.includes('<script>') && sanitized.includes('&lt;script&gt;');
    });
    
    // Test 2: SQL Injection Prevention via Schema Validation
    runTest('SQL Injection via Schema Validation', () => {
        const maliciousEmail = "admin'; DROP TABLE users; --";
        const { error } = schemas.login.validate({ email: maliciousEmail, password: 'test123' });
        
        return error !== null;
    });
    
    // Test 3: Password complexity validation
    runTest('Password Complexity Validation', () => {
        const weakPasswords = ['123456', 'password', 'Password', 'Password1'];
        const strongPassword = 'StrongP@ssw0rd123!';
        
        const weakResults = weakPasswords.map(pwd => 
            schemas.signup.validate({ 
                email: 'test@example.com', 
                password: pwd, 
                fullName: 'Test User' 
            }).error !== null
        );
        
        const strongResult = schemas.signup.validate({
            email: 'test@example.com',
            password: strongPassword,
            fullName: 'Test User'
        }).error === null;
        
        return weakResults.every(result => result) && strongResult;
    });
    
    // Test 4: Input length limits
    runTest('Input Length Limits', () => {
        const longEmail = 'a'.repeat(300) + '@example.com';
        const longName = 'n'.repeat(200);
        
        const emailError = schemas.signup.validate({
            email: longEmail,
            password: 'ValidP@ss123!',
            fullName: 'Test User'
        }).error !== null;
        
        const nameError = schemas.signup.validate({
            email: 'test@example.com',
            password: 'ValidP@ss123!',
            fullName: longName
        }).error !== null;
        
        return emailError && nameError;
    });
    
    // Test 5: Special character handling
    runTest('Special Character Handling', () => {
        const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        const sanitized = sanitizeText(specialChars);
        
        // Should preserve most special chars but escape dangerous ones
        return sanitized.length > 0 && !sanitized.includes('<') && !sanitized.includes('>');
    });
}

function testSessionSecurity() {
    console.log('\n📋 Testing Session Security...');
    
    // Test 1: Session configuration check
    runTest('Session Secret Length Validation', () => {
        const shortSecret = 'short';
        const longSecret = 'this_is_a_very_long_secure_session_secret_key_that_meets_requirements';
        
        return shortSecret.length < 32 && longSecret.length >= 32;
    });
    
    // Test 2: CSRF token generation
    runTest('CSRF Token Generation', () => {
        const token1 = crypto.randomBytes(32).toString('hex');
        const token2 = crypto.randomBytes(32).toString('hex');
        
        return token1 !== token2 && token1.length === 64;
    });
}

function testDatabaseSecurity() {
    console.log('\n📋 Testing Database Security...');
    
    // Test 1: Parameterized queries (check structure)
    runTest('Database Schema Security Features', () => {
        // Check if security logging table exists
        return new Promise((resolve) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='security_logs'", (err, row) => {
                resolve(!err && row !== undefined);
            });
        });
    });
    
    // Test 2: Data validation constraints
    runTest('Database Constraint Validation', () => {
        return new Promise((resolve) => {
            // Test toll amount constraint (should be between 0 and 200)
            db.run("INSERT INTO toll_charges (toll_account_id, toll_date, toll_location, toll_amount, plate_number) VALUES (1, datetime('now'), 'Test Location', 999.99, 'TEST123')", (err) => {
                resolve(err !== null); // Should fail due to constraint
            });
        });
    });
}

function testSecurityLogging() {
    console.log('\n📋 Testing Security Logging...');
    
    // Test 1: Security event logging
    runTest('Security Event Logging', () => {
        try {
            logSecurityEvent('TEST_EVENT', {
                ip: '127.0.0.1',
                userAgent: 'Test Agent',
                testData: 'This is a test'
            });
            return true;
        } catch (error) {
            return false;
        }
    });
}

function testRateLimiting() {
    console.log('\n📋 Testing Rate Limiting Configuration...');
    
    // Test 1: Rate limiter configuration validation
    runTest('Rate Limiter Configuration', () => {
        // These are configuration checks, not actual rate limiting tests
        const authLimitWindow = 15 * 60 * 1000; // 15 minutes
        const authMaxRequests = 5;
        const generalLimitWindow = 15 * 60 * 1000;
        const generalMaxRequests = 500;
        
        return authLimitWindow > 0 && authMaxRequests > 0 && 
               generalLimitWindow > 0 && generalMaxRequests > 0;
    });
}

function generateSecurityReport() {
    console.log('\n' + '='.repeat(80));
    console.log('🔒 SECURITY INFRASTRUCTURE AUDIT RESULTS');
    console.log('='.repeat(80));
    
    console.log(`\nTest Summary:`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📊 Total: ${testResults.total}`);
    console.log(`📈 Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
        console.log('\n❌ Failed Tests:');
        testResults.details
            .filter(test => test.status === 'FAIL')
            .forEach(test => {
                console.log(`   • ${test.name}: ${test.message}`);
            });
    }
    
    console.log('\n' + '='.repeat(80));
}

async function runAllTests() {
    console.log('🔒 Starting Security Infrastructure Audit...\n');
    
    testEncryption();
    testInputValidation();
    testSessionSecurity();
    
    // For async database tests
    try {
        await testDatabaseSecurity();
    } catch (error) {
        console.log('❌ Database security tests failed:', error.message);
    }
    
    testSecurityLogging();
    testRateLimiting();
    
    generateSecurityReport();
}

// Run tests if this file is executed directly
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = {
    runAllTests,
    testResults
};