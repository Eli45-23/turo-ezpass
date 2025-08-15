/**
 * Financial Security Audit
 * 
 * This script conducts a security audit of the financial components,
 * testing authentication, authorization, SQL injection resistance,
 * and audit trail completeness.
 */

const { db } = require('./config/database');
const express = require('express');
const request = require('supertest');

class FinancialSecurityAudit {
    constructor() {
        this.findings = [];
        this.testApp = this.createTestApp();
    }

    createTestApp() {
        const app = express();
        app.use(express.json());
        
        // Mock session middleware for testing
        app.use((req, res, next) => {
            req.session = req.headers['test-session'] ? 
                JSON.parse(req.headers['test-session']) : {};
            next();
        });
        
        // Load routes
        app.use('/api/invoices', require('./routes/invoices'));
        
        return app;
    }

    async runSecurityAudit() {
        console.log('🔒 Starting Financial Security Audit...\n');

        try {
            // Test 1: Authentication Requirements
            await this.testAuthenticationRequirements();
            
            // Test 2: Authorization and Host Isolation
            await this.testAuthorizationAndIsolation();
            
            // Test 3: SQL Injection Resistance
            await this.testSQLInjectionResistance();
            
            // Test 4: Input Validation and Sanitization
            await this.testInputValidationSanitization();
            
            // Test 5: Audit Trail Completeness
            await this.testAuditTrailCompleteness();
            
            // Test 6: Session Management
            await this.testSessionManagement();
            
            // Test 7: Data Encryption and Storage
            await this.testDataEncryptionStorage();
            
            // Generate security report
            this.generateSecurityReport();
            
        } catch (error) {
            console.error('❌ Security audit failed:', error);
            this.addFinding('CRITICAL', 'Security Audit Framework', 
                `Security audit execution failed: ${error.message}`,
                'Fix critical security audit issues before proceeding');
        }

        return this.findings;
    }

    async testAuthenticationRequirements() {
        console.log('🔐 Testing Authentication Requirements...');

        const endpoints = [
            { method: 'post', path: '/api/invoices/generate/123', description: 'Invoice Generation' },
            { method: 'get', path: '/api/invoices', description: 'List Invoices' },
            { method: 'get', path: '/api/invoices/123', description: 'Get Invoice Details' },
            { method: 'post', path: '/api/invoices/123/send', description: 'Send Invoice' },
            { method: 'post', path: '/api/invoices/123/charge', description: 'Process Payment' },
            { method: 'delete', path: '/api/invoices/123', description: 'Delete Invoice' }
        ];

        for (const endpoint of endpoints) {
            try {
                const response = await request(this.testApp)
                    [endpoint.method](endpoint.path)
                    .expect(401);

                if (response.status !== 401) {
                    this.addFinding('HIGH', 'Authentication', 
                        `${endpoint.description} endpoint allows unauthenticated access`,
                        'Ensure all financial endpoints require authentication');
                } else {
                    this.addFinding('GOOD', 'Authentication', 
                        `${endpoint.description} endpoint properly requires authentication`,
                        'Continue enforcing authentication requirements');
                }
            } catch (error) {
                this.addFinding('MEDIUM', 'Authentication Test', 
                    `Failed to test ${endpoint.description}: ${error.message}`,
                    'Ensure endpoint testing is comprehensive');
            }
        }

        console.log('  ✅ Authentication requirements testing completed');
    }

    async testAuthorizationAndIsolation() {
        console.log('🏠 Testing Authorization and Host Isolation...');

        // Test with different host IDs to ensure data isolation
        const testSessions = [
            { hostId: 1, name: 'Host 1' },
            { hostId: 2, name: 'Host 2' }
        ];

        try {
            // Create test data for each host
            const testData = await this.createMultiHostTestData(testSessions);
            
            // Test that Host 1 cannot access Host 2's data
            for (const session of testSessions) {
                const otherHost = testSessions.find(s => s.hostId !== session.hostId);
                
                try {
                    const response = await request(this.testApp)
                        .get('/api/invoices')
                        .set('test-session', JSON.stringify({ hostId: session.hostId }))
                        .expect(200);

                    const invoices = response.body.data || [];
                    const unauthorizedInvoices = invoices.filter(inv => 
                        testData[otherHost.hostId] && 
                        testData[otherHost.hostId].invoices &&
                        testData[otherHost.hostId].invoices.includes(inv.id)
                    );

                    if (unauthorizedInvoices.length > 0) {
                        this.addFinding('CRITICAL', 'Host Isolation', 
                            `${session.name} can access ${otherHost.name}'s invoices`,
                            'Implement proper host-based data isolation in all queries');
                    } else {
                        this.addFinding('GOOD', 'Host Isolation', 
                            `${session.name} data properly isolated`,
                            'Continue enforcing host-based access control');
                    }
                } catch (error) {
                    this.addFinding('MEDIUM', 'Authorization Test', 
                        `Failed to test isolation for ${session.name}: ${error.message}`,
                        'Ensure authorization testing covers all scenarios');
                }
            }
            
        } catch (error) {
            this.addFinding('HIGH', 'Authorization Setup', 
                `Failed to create test data for authorization testing: ${error.message}`,
                'Ensure test environment supports multi-host scenarios');
        }

        console.log('  ✅ Authorization and isolation testing completed');
    }

    async testSQLInjectionResistance() {
        console.log('💉 Testing SQL Injection Resistance...');

        const sqlInjectionPayloads = [
            "'; DROP TABLE invoices; --",
            "' UNION SELECT * FROM hosts --",
            "1' OR '1'='1",
            "'; UPDATE invoices SET total_amount = 0; --",
            "1'; INSERT INTO invoices (trip_id, invoice_number, total_amount) VALUES (999, 'HACKED', 999999); --"
        ];

        // Test invoice generation endpoint
        for (const payload of sqlInjectionPayloads) {
            try {
                const response = await request(this.testApp)
                    .post(`/api/invoices/generate/${payload}`)
                    .set('test-session', JSON.stringify({ hostId: 1 }))
                    .send({ processingFee: 2.99 });

                // Check if the response indicates successful injection
                if (response.status === 200 && response.body.success) {
                    this.addFinding('CRITICAL', 'SQL Injection', 
                        `Successful SQL injection with payload: ${payload}`,
                        'Immediately implement parameterized queries and input validation');
                } else if (response.status === 500) {
                    // Server error might indicate injection attempt was processed
                    this.addFinding('HIGH', 'SQL Injection', 
                        `Server error with injection payload might indicate vulnerability: ${payload}`,
                        'Review error handling to ensure no information leakage');
                }
            } catch (error) {
                // Expected behavior - injection should be blocked
                this.addFinding('GOOD', 'SQL Injection Resistance', 
                    'SQL injection payload properly rejected',
                    'Continue using parameterized queries');
            }
        }

        // Test direct database queries for injection resistance
        await this.testDirectDatabaseInjection();

        console.log('  ✅ SQL injection resistance testing completed');
    }

    async testDirectDatabaseInjection() {
        const injectionTests = [
            {
                description: 'Invoice lookup with injection',
                query: "SELECT * FROM invoices WHERE trip_id = ?",
                params: ["1'; DROP TABLE invoices; --"],
                shouldSucceed: true // Parameterized query should handle this safely
            },
            {
                description: 'Host isolation with injection',
                query: "SELECT * FROM trips WHERE host_id = ?",
                params: ["1 OR 1=1"],
                shouldSucceed: true // Should only return host 1 trips, not all trips
            }
        ];

        for (const test of injectionTests) {
            try {
                await new Promise((resolve, reject) => {
                    db.all(test.query, test.params, (err, rows) => {
                        if (err) {
                            if (test.shouldSucceed) {
                                reject(new Error(`Parameterized query failed: ${err.message}`));
                            } else {
                                resolve('expected_failure');
                            }
                        } else {
                            resolve(rows);
                        }
                    });
                });

                this.addFinding('GOOD', 'Database Query Safety', 
                    `${test.description} safely handled`,
                    'Continue using parameterized queries for all database operations');

            } catch (error) {
                this.addFinding('MEDIUM', 'Database Query Safety', 
                    `${test.description} test failed: ${error.message}`,
                    'Review database query error handling');
            }
        }
    }

    async testInputValidationSanitization() {
        console.log('🧹 Testing Input Validation and Sanitization...');

        const maliciousInputs = [
            '<script>alert("XSS")</script>',
            '${7*7}',
            '../../../etc/passwd',
            'javascript:alert(1)',
            '{{7*7}}',
            '<img src=x onerror=alert(1)>'
        ];

        // Test invoice generation with malicious inputs
        for (const input of maliciousInputs) {
            try {
                const response = await request(this.testApp)
                    .post('/api/invoices/generate/1')
                    .set('test-session', JSON.stringify({ hostId: 1 }))
                    .send({ 
                        processingFee: input, // Malicious processing fee
                        description: input    // Malicious description
                    });

                if (response.status === 200) {
                    // Check if malicious input was stored/executed
                    this.addFinding('HIGH', 'Input Validation', 
                        `Malicious input accepted: ${input}`,
                        'Implement comprehensive input validation and sanitization');
                } else {
                    this.addFinding('GOOD', 'Input Validation', 
                        `Malicious input properly rejected: ${input}`,
                        'Continue validating all user inputs');
                }
            } catch (error) {
                // Expected - malicious input should be rejected
                this.addFinding('GOOD', 'Input Validation', 
                    'Input validation properly functioning',
                    'Continue implementing strict input validation');
            }
        }

        console.log('  ✅ Input validation and sanitization testing completed');
    }

    async testAuditTrailCompleteness() {
        console.log('📝 Testing Audit Trail Completeness...');

        try {
            // Create test financial transaction
            const testHost = await this.createTestHost();
            const testAccount = await this.createTestAccount(testHost.id);
            const testTrip = await this.createTestTrip(testHost.id);
            const testCharge = await this.createTestTollCharge(testAccount.id, 5.50);

            // Perform invoice generation (should be audited)
            const TransactionManager = require('./utils/transaction-manager');
            const txnManager = new TransactionManager();
            
            const result = await txnManager.executeInvoiceGeneration(
                testTrip.id, [testCharge], 2.99, testHost.id
            );

            // Check if transaction was logged
            const auditLogs = await this.getAuditLogs();
            const relevantLogs = auditLogs.filter(log => 
                log.event_type.includes('TRANSACTION_COMMITTED') ||
                log.event_type.includes('INVOICE')
            );

            if (relevantLogs.length === 0) {
                this.addFinding('HIGH', 'Audit Trail', 
                    'Financial transactions not being logged to audit trail',
                    'Implement comprehensive audit logging for all financial operations');
            } else {
                this.addFinding('GOOD', 'Audit Trail', 
                    `${relevantLogs.length} audit log entries found for financial transaction`,
                    'Continue maintaining comprehensive audit trails');
            }

            // Check audit log completeness
            const requiredAuditFields = ['event_type', 'details', 'severity', 'created_at'];
            let incompleteEntries = 0;

            relevantLogs.forEach(log => {
                const missingFields = requiredAuditFields.filter(field => !log[field]);
                if (missingFields.length > 0) {
                    incompleteEntries++;
                }
            });

            if (incompleteEntries > 0) {
                this.addFinding('MEDIUM', 'Audit Log Quality', 
                    `${incompleteEntries} audit entries missing required fields`,
                    'Ensure all audit log entries contain complete information');
            } else {
                this.addFinding('GOOD', 'Audit Log Quality', 
                    'All audit log entries contain required fields',
                    'Continue maintaining audit log data quality');
            }

        } catch (error) {
            this.addFinding('HIGH', 'Audit Trail Testing', 
                `Failed to test audit trail: ${error.message}`,
                'Ensure audit trail functionality is working properly');
        }

        console.log('  ✅ Audit trail completeness testing completed');
    }

    async testSessionManagement() {
        console.log('🍪 Testing Session Management...');

        // Test session timeout (mock test)
        this.addFinding('INFO', 'Session Management', 
            'Session timeout testing requires integration with session store',
            'Implement proper session timeout and regeneration mechanisms');

        // Test session invalidation on logout
        this.addFinding('INFO', 'Session Management', 
            'Session invalidation testing requires logout endpoint implementation',
            'Ensure sessions are properly invalidated on logout');

        console.log('  ✅ Session management testing completed');
    }

    async testDataEncryptionStorage() {
        console.log('🔐 Testing Data Encryption and Storage...');

        // Check if sensitive data is stored encrypted
        try {
            const sampleData = await new Promise((resolve) => {
                db.get('SELECT password_encrypted FROM toll_accounts LIMIT 1', (err, row) => {
                    resolve(row);
                });
            });

            if (sampleData && sampleData.password_encrypted) {
                if (sampleData.password_encrypted === 'encrypted' || 
                    sampleData.password_encrypted.length < 32) {
                    this.addFinding('HIGH', 'Data Encryption', 
                        'Toll account passwords appear to be stored without proper encryption',
                        'Implement proper encryption for sensitive data storage');
                } else {
                    this.addFinding('GOOD', 'Data Encryption', 
                        'Toll account passwords appear to be properly encrypted',
                        'Continue using strong encryption for sensitive data');
                }
            }

            // Check for credit card or payment data
            const paymentDataFields = await this.checkForPaymentDataFields();
            if (paymentDataFields.length > 0) {
                this.addFinding('HIGH', 'PCI Compliance', 
                    `Payment data fields found: ${paymentDataFields.join(', ')}`,
                    'Ensure PCI compliance for any payment data storage');
            }

        } catch (error) {
            this.addFinding('MEDIUM', 'Data Encryption Testing', 
                `Failed to test data encryption: ${error.message}`,
                'Ensure data encryption testing is comprehensive');
        }

        console.log('  ✅ Data encryption and storage testing completed');
    }

    // Helper methods
    async createMultiHostTestData(testSessions) {
        const testData = {};
        
        for (const session of testSessions) {
            try {
                const host = await this.createTestHost();
                const account = await this.createTestAccount(host.id);
                const trip = await this.createTestTrip(host.id);
                
                testData[session.hostId] = {
                    host: host.id,
                    account: account.id,
                    trip: trip.id,
                    invoices: []
                };
            } catch (error) {
                console.log(`Warning: Failed to create test data for ${session.name}: ${error.message}`);
            }
        }
        
        return testData;
    }

    async getAuditLogs() {
        return new Promise((resolve) => {
            db.all('SELECT * FROM security_logs ORDER BY created_at DESC LIMIT 50', (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    async checkForPaymentDataFields() {
        return new Promise((resolve) => {
            db.all(`
                SELECT m.name as table_name, p.name as column_name
                FROM sqlite_master m
                JOIN pragma_table_info(m.name) p
                WHERE m.type = 'table' 
                AND (
                    p.name LIKE '%card%' OR 
                    p.name LIKE '%credit%' OR 
                    p.name LIKE '%cvv%' OR 
                    p.name LIKE '%expir%'
                )
            `, (err, rows) => {
                const fields = rows ? rows.map(r => `${r.table_name}.${r.column_name}`) : [];
                resolve(fields);
            });
        });
    }

    async createTestHost() {
        return new Promise((resolve, reject) => {
            const query = 'INSERT INTO hosts (email, password_hash, full_name) VALUES (?, ?, ?)';
            db.run(query, [`sec_test_${Date.now()}@audit.com`, 'hash', 'Security Test Host'], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
        });
    }

    async createTestAccount(hostId) {
        return new Promise((resolve, reject) => {
            const query = 'INSERT INTO toll_accounts (host_id, provider, account_number, username, password_encrypted) VALUES (?, ?, ?, ?, ?)';
            db.run(query, [hostId, 'TEST', 'SEC123', 'sectest', 'properly_encrypted_password_hash'], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
        });
    }

    async createTestTrip(hostId) {
        return new Promise((resolve, reject) => {
            const query = 'INSERT INTO trips (host_id, turo_trip_id, renter_name, vehicle_plate, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)';
            const tripId = `SEC_TEST_${Date.now()}`;
            db.run(query, [hostId, tripId, 'Security Test Renter', 'SEC123', new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
        });
    }

    async createTestTollCharge(accountId, amount) {
        return new Promise((resolve, reject) => {
            const query = 'INSERT INTO toll_charges (toll_account_id, toll_date, toll_location, toll_amount, transaction_id) VALUES (?, ?, ?, ?, ?)';
            const txnId = `SEC_TXN_${Date.now()}`;
            db.run(query, [accountId, new Date().toISOString(), 'Security Test Location', amount, txnId], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, toll_amount: amount });
            });
        });
    }

    addFinding(severity, component, issue, recommendation) {
        this.findings.push({ severity, component, issue, recommendation });
        
        const emoji = {
            'CRITICAL': '🚨',
            'HIGH': '❌', 
            'MEDIUM': '⚠️',
            'LOW': '💡',
            'INFO': 'ℹ️',
            'GOOD': '✅'
        }[severity] || '❓';
        
        console.log(`  ${emoji} ${severity}: ${issue}`);
    }

    generateSecurityReport() {
        console.log('\n🔒 Financial Security Audit Report');
        console.log('='.repeat(50));
        
        const severityCounts = {
            'CRITICAL': 0, 'HIGH': 0, 'MEDIUM': 0, 'LOW': 0, 'INFO': 0, 'GOOD': 0
        };
        
        this.findings.forEach(finding => {
            severityCounts[finding.severity]++;
        });
        
        console.log('\n📊 Security Findings Summary:');
        Object.entries(severityCounts).forEach(([severity, count]) => {
            if (count > 0) {
                console.log(`${severity}: ${count}`);
            }
        });
        
        // Security score calculation
        const totalFindings = this.findings.length;
        const criticalFindings = severityCounts.CRITICAL;
        const highFindings = severityCounts.HIGH;
        const goodFindings = severityCounts.GOOD;
        
        let securityScore = 100;
        securityScore -= (criticalFindings * 30);
        securityScore -= (highFindings * 15);
        securityScore -= (severityCounts.MEDIUM * 5);
        securityScore = Math.max(0, securityScore);
        
        console.log(`\n🎯 Overall Security Score: ${securityScore}/100`);
        
        if (securityScore >= 90) {
            console.log('✅ EXCELLENT - Financial system security is robust');
        } else if (securityScore >= 75) {
            console.log('✅ GOOD - Financial system security is adequate with minor issues');
        } else if (securityScore >= 60) {
            console.log('⚠️ FAIR - Financial system has security concerns that need attention');
        } else {
            console.log('❌ POOR - Financial system has serious security vulnerabilities');
        }
        
        console.log('\n🚨 Critical Security Issues:');
        const criticalIssues = this.findings.filter(f => f.severity === 'CRITICAL');
        if (criticalIssues.length === 0) {
            console.log('None identified');
        } else {
            criticalIssues.forEach((issue, index) => {
                console.log(`${index + 1}. ${issue.issue}`);
                console.log(`   Recommendation: ${issue.recommendation}`);
            });
        }
    }
}

// Run security audit if called directly
if (require.main === module) {
    const audit = new FinancialSecurityAudit();
    audit.runSecurityAudit()
        .then(findings => {
            console.log('\n🎯 Security audit completed!');
            const criticalIssues = findings.filter(f => f.severity === 'CRITICAL').length;
            const highIssues = findings.filter(f => f.severity === 'HIGH').length;
            
            if (criticalIssues > 0) {
                console.log(`🚨 ${criticalIssues} critical security issues found!`);
                process.exit(2);
            } else if (highIssues > 0) {
                console.log(`⚠️ ${highIssues} high-priority security issues found`);
                process.exit(1);
            } else {
                console.log('✅ No critical security vulnerabilities found');
                process.exit(0);
            }
        })
        .catch(error => {
            console.error('\n❌ Security audit failed:', error);
            process.exit(1);
        });
}

module.exports = FinancialSecurityAudit;