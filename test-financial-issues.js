/**
 * Financial System Issues Investigation
 * 
 * This script investigates specific issues found during the comprehensive audit
 * and provides detailed analysis and recommendations.
 */

const { db } = require('./config/database');
const TransactionManager = require('./utils/transaction-manager');
const DataIntegrityValidator = require('./utils/data-integrity');

class FinancialIssuesInvestigation {
    constructor() {
        this.transactionManager = new TransactionManager();
        this.validator = new DataIntegrityValidator();
        this.findings = [];
        this.recommendations = [];
    }

    async investigateIssues() {
        console.log('🔍 Investigating Financial System Issues...\n');

        try {
            // Issue 1: Invoice total validation may be too strict
            await this.investigateInvoiceTotalValidation();
            
            // Issue 2: Decimal precision handling in calculations
            await this.investigateDecimalPrecisionHandling();
            
            // Issue 3: Database constraint enforcement
            await this.investigateDatabaseConstraints();
            
            // Issue 4: Zero amount handling in invoice line items
            await this.investigateZeroAmountHandling();
            
            // Issue 5: Analytics calculation verification
            await this.investigateAnalyticsCalculations();
            
            // Generate detailed report
            this.generateIssuesReport();
            
        } catch (error) {
            console.error('❌ Investigation failed:', error);
            this.addFinding('CRITICAL', 'Investigation Framework', 
                `Investigation execution failed: ${error.message}`,
                'Fix critical system issues before proceeding');
        }

        return {
            findings: this.findings,
            recommendations: this.recommendations
        };
    }

    async investigateInvoiceTotalValidation() {
        console.log('💳 Investigating Invoice Total Validation...');

        // Check current validation limits
        const validator = new DataIntegrityValidator();
        
        this.addFinding('INFO', 'Invoice Validation Limits', 
            `Current max toll amount: $${validator.config.maxTollAmount}`,
            'Consider if $200 max per toll is appropriate for business needs');
        
        this.addFinding('INFO', 'Invoice Validation Limits',
            `Current max processing fee: $${validator.config.maxProcessingFee}`,
            'Processing fee limit of $25 appears reasonable');

        // Test a realistic high-toll scenario
        try {
            const testInvoice = {
                trip_id: 1,
                total_amount: 475.24, // High but potentially realistic for long trips
                processing_fee: 2.99,
                toll_total: 472.25
            };

            const validationErrors = validator.validateInvoiceData(testInvoice);
            if (validationErrors.length > 0) {
                this.addFinding('MEDIUM', 'Invoice Total Validation', 
                    'High-value invoices are rejected even if legitimate',
                    'Consider raising total amount limit or implementing business approval workflow for high amounts');
            }
        } catch (error) {
            this.addFinding('LOW', 'Invoice Validation Test', 
                `Test failed: ${error.message}`,
                'Ensure validation logic is robust');
        }

        console.log('  ✅ Invoice validation investigation completed');
    }

    async investigateDecimalPrecisionHandling() {
        console.log('🔢 Investigating Decimal Precision Handling...');

        // Test floating point arithmetic issues
        const testCases = [
            { a: 0.1, b: 0.2, expected: 0.3, operation: 'add' },
            { a: 1.005, operation: 'round2', expected: 1.01 },
            { values: Array(100).fill(0.01), operation: 'sum', expected: 1.00 }
        ];

        for (const testCase of testCases) {
            if (testCase.operation === 'add') {
                const result = testCase.a + testCase.b;
                if (Math.abs(result - testCase.expected) > 0.001) {
                    this.addFinding('HIGH', 'Floating Point Precision', 
                        `${testCase.a} + ${testCase.b} = ${result}, not ${testCase.expected}`,
                        'Implement proper decimal arithmetic using integer cents or decimal.js library');
                }
            } else if (testCase.operation === 'sum') {
                const result = testCase.values.reduce((sum, val) => sum + val, 0);
                if (Math.abs(result - testCase.expected) > 0.01) {
                    this.addFinding('HIGH', 'Cumulative Precision Error', 
                        `Sum of ${testCase.values.length} × $0.01 = $${result}, not $${testCase.expected}`,
                        'Use precise decimal arithmetic for financial calculations');
                }
            }
        }

        // Test the validator's sanitization function
        try {
            const validator = new DataIntegrityValidator();
            const testAmount = validator.sanitizeFinancialAmount(0.1 + 0.2);
            
            if (Math.abs(testAmount - 0.30) > 0.01) {
                this.addFinding('MEDIUM', 'Amount Sanitization', 
                    `Sanitized amount ${testAmount} differs from expected 0.30`,
                    'Verify sanitization function handles floating point precision correctly');
            } else {
                this.addFinding('GOOD', 'Amount Sanitization', 
                    'Sanitization function correctly handles floating point precision',
                    'Continue using sanitization for all financial amounts');
            }
        } catch (error) {
            this.addFinding('HIGH', 'Amount Sanitization', 
                `Sanitization failed: ${error.message}`,
                'Fix sanitization function to handle edge cases');
        }

        console.log('  ✅ Decimal precision investigation completed');
    }

    async investigateDatabaseConstraints() {
        console.log('🗃️ Investigating Database Constraints...');

        // Check current constraints by examining table schema
        const constraints = await this.getTableConstraints();
        
        for (const table of ['toll_charges', 'invoices', 'invoice_items']) {
            const tableConstraints = constraints[table] || [];
            
            if (tableConstraints.length === 0) {
                this.addFinding('HIGH', 'Database Constraints', 
                    `No constraints found for table: ${table}`,
                    'Implement proper CHECK constraints for financial data integrity');
            } else {
                this.addFinding('GOOD', 'Database Constraints', 
                    `Found ${tableConstraints.length} constraints for ${table}`,
                    'Continue maintaining database constraint enforcement');
            }
        }

        // Test constraint enforcement with direct database queries
        await this.testConstraintEnforcement();

        console.log('  ✅ Database constraint investigation completed');
    }

    async investigateZeroAmountHandling() {
        console.log('🔄 Investigating Zero Amount Handling...');

        try {
            // Create test data
            const testHost = await this.createTestHost();
            const testAccount = await this.createTestAccount(testHost.id);
            const testTrip = await this.createTestTrip(testHost.id);
            
            // Create a toll charge with zero amount
            const zeroCharge = await this.createTestTollCharge(testAccount.id, 0.00);
            
            // Attempt to create invoice
            try {
                const result = await this.transactionManager.executeInvoiceGeneration(
                    testTrip.id, [zeroCharge], 2.99, testHost.id
                );
                
                this.addFinding('GOOD', 'Zero Amount Handling', 
                    'Zero toll amounts are properly handled in invoice generation',
                    'Continue allowing zero toll amounts for completeness');
                    
            } catch (error) {
                if (error.message.includes('Invalid line item data')) {
                    this.addFinding('MEDIUM', 'Zero Amount Handling', 
                        'Zero toll amounts cause invoice generation to fail',
                        'Update validation to allow zero amounts in line items if they represent valid toll events');
                } else {
                    this.addFinding('LOW', 'Zero Amount Handling', 
                        `Unexpected error: ${error.message}`,
                        'Review error handling for edge cases');
                }
            }
            
        } catch (error) {
            this.addFinding('HIGH', 'Zero Amount Test Setup', 
                `Test setup failed: ${error.message}`,
                'Ensure test environment can be properly established');
        }

        console.log('  ✅ Zero amount handling investigation completed');
    }

    async investigateAnalyticsCalculations() {
        console.log('📊 Investigating Analytics Calculations...');

        try {
            const AnalyticsEngine = require('./services/analytics-engine');
            
            // Test with known data set
            const testHost = await this.createTestHost();
            
            // Create some test financial data
            await this.createTestFinancialData(testHost.id);
            
            // Calculate analytics
            const metrics = await AnalyticsEngine.calculateFinancialMetrics(testHost.id);
            
            // Verify calculations manually
            const manualCalc = await this.calculateManualMetrics(testHost.id);
            
            const tolerance = 0.01;
            let calculationAccurate = true;
            
            if (Math.abs(metrics.revenue.total - manualCalc.revenue) > tolerance) {
                calculationAccurate = false;
                this.addFinding('HIGH', 'Analytics Revenue Calculation', 
                    `Revenue mismatch: analytics=${metrics.revenue.total}, manual=${manualCalc.revenue}`,
                    'Review revenue calculation logic in analytics engine');
            }
            
            if (Math.abs(metrics.costs.totalTolls - manualCalc.costs) > tolerance) {
                calculationAccurate = false;
                this.addFinding('HIGH', 'Analytics Cost Calculation', 
                    `Cost mismatch: analytics=${metrics.costs.totalTolls}, manual=${manualCalc.costs}`,
                    'Review cost calculation logic in analytics engine');
            }
            
            if (calculationAccurate) {
                this.addFinding('GOOD', 'Analytics Calculations', 
                    'Analytics calculations match manual verification',
                    'Continue using current analytics calculation methods');
            }
            
        } catch (error) {
            this.addFinding('HIGH', 'Analytics Investigation', 
                `Analytics test failed: ${error.message}`,
                'Ensure analytics engine is properly integrated and functional');
        }

        console.log('  ✅ Analytics calculation investigation completed');
    }

    // Helper methods
    async getTableConstraints() {
        return new Promise((resolve) => {
            db.all(`
                SELECT m.name as table_name, m.sql
                FROM sqlite_master m
                WHERE m.type = 'table' 
                AND m.name IN ('toll_charges', 'invoices', 'invoice_items')
            `, (err, rows) => {
                if (err) {
                    resolve({});
                    return;
                }
                
                const constraints = {};
                rows.forEach(row => {
                    // Parse SQL for CHECK constraints
                    const checkMatches = row.sql.match(/CHECK\s*\([^)]+\)/gi);
                    constraints[row.table_name] = checkMatches || [];
                });
                
                resolve(constraints);
            });
        });
    }

    async testConstraintEnforcement() {
        const tests = [
            {
                name: 'Negative toll amount',
                query: 'INSERT INTO toll_charges (toll_account_id, toll_date, toll_location, toll_amount, transaction_id) VALUES (1, datetime("now"), "Test", -5.00, "TEST")',
                shouldFail: true
            },
            {
                name: 'Excessive toll amount',
                query: 'INSERT INTO toll_charges (toll_account_id, toll_date, toll_location, toll_amount, transaction_id) VALUES (1, datetime("now"), "Test", 300.00, "TEST")',
                shouldFail: true
            }
        ];

        for (const test of tests) {
            try {
                await new Promise((resolve, reject) => {
                    db.run(test.query, function(err) {
                        if (err && test.shouldFail) {
                            resolve('expected_failure');
                        } else if (!err && !test.shouldFail) {
                            resolve('expected_success');
                        } else if (err && !test.shouldFail) {
                            reject(new Error(`Unexpected failure: ${err.message}`));
                        } else {
                            reject(new Error('Constraint not enforced'));
                        }
                    });
                });
                
                if (test.shouldFail) {
                    this.addFinding('GOOD', 'Database Constraint Enforcement', 
                        `${test.name} properly rejected`,
                        'Continue enforcing database constraints');
                }
                
            } catch (error) {
                if (error.message === 'Constraint not enforced') {
                    this.addFinding('HIGH', 'Database Constraint Enforcement', 
                        `${test.name} was not rejected by database constraints`,
                        'Implement or fix database CHECK constraints');
                } else {
                    this.addFinding('LOW', 'Constraint Test', 
                        `${test.name} test failed: ${error.message}`,
                        'Review constraint testing methodology');
                }
            }
        }
    }

    async createTestHost() {
        return new Promise((resolve, reject) => {
            const query = 'INSERT INTO hosts (email, password_hash, full_name) VALUES (?, ?, ?)';
            db.run(query, [`test_${Date.now()}@audit.com`, 'hash', 'Test Host'], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
        });
    }

    async createTestAccount(hostId) {
        return new Promise((resolve, reject) => {
            const query = 'INSERT INTO toll_accounts (host_id, provider, account_number, username, password_encrypted) VALUES (?, ?, ?, ?, ?)';
            db.run(query, [hostId, 'TEST', 'TEST123', 'test', 'encrypted'], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
        });
    }

    async createTestTrip(hostId) {
        return new Promise((resolve, reject) => {
            const query = 'INSERT INTO trips (host_id, turo_trip_id, renter_name, vehicle_plate, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)';
            const tripId = `TEST_${Date.now()}`;
            db.run(query, [hostId, tripId, 'Test Renter', 'TEST123', new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            });
        });
    }

    async createTestTollCharge(accountId, amount) {
        return new Promise((resolve, reject) => {
            const query = 'INSERT INTO toll_charges (toll_account_id, toll_date, toll_location, toll_amount, transaction_id) VALUES (?, ?, ?, ?, ?)';
            const txnId = `TXN_${Date.now()}_${Math.random()}`;
            db.run(query, [accountId, new Date().toISOString(), 'Test Location', amount, txnId], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, toll_amount: amount });
            });
        });
    }

    async createTestFinancialData(hostId) {
        // Create minimal test data for analytics verification
        const account = await this.createTestAccount(hostId);
        const trip = await this.createTestTrip(hostId);
        const charges = [
            await this.createTestTollCharge(account.id, 5.50),
            await this.createTestTollCharge(account.id, 3.25)
        ];
        
        const result = await this.transactionManager.executeInvoiceGeneration(
            trip.id, charges, 2.99, hostId
        );
        
        // Mark as paid
        await new Promise((resolve) => {
            db.run('UPDATE invoices SET status = ?, paid_date = CURRENT_TIMESTAMP WHERE id = ?', 
                ['paid', result.invoiceId], () => resolve());
        });
        
        return { account, trip, charges, invoice: result };
    }

    async calculateManualMetrics(hostId) {
        // Manual calculation for verification
        return new Promise((resolve) => {
            db.all(`
                SELECT 
                    SUM(COALESCE(i.total_amount, 0)) as revenue,
                    SUM(COALESCE(tc.toll_amount, 0)) as costs
                FROM trips t
                LEFT JOIN invoices i ON t.id = i.trip_id AND i.status = 'paid'
                LEFT JOIN toll_charges tc ON tc.toll_account_id IN (
                    SELECT ta.id FROM toll_accounts ta WHERE ta.host_id = ?
                )
                WHERE t.host_id = ?
            `, [hostId, hostId], (err, rows) => {
                const row = rows[0] || {};
                resolve({
                    revenue: row.revenue || 0,
                    costs: row.costs || 0
                });
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

    generateIssuesReport() {
        console.log('\n📋 Financial System Issues Report');
        console.log('='.repeat(50));
        
        const severityCounts = {
            'CRITICAL': 0, 'HIGH': 0, 'MEDIUM': 0, 'LOW': 0, 'INFO': 0, 'GOOD': 0
        };
        
        this.findings.forEach(finding => {
            severityCounts[finding.severity]++;
        });
        
        console.log('\n📊 Issues Summary:');
        Object.entries(severityCounts).forEach(([severity, count]) => {
            if (count > 0) {
                console.log(`${severity}: ${count}`);
            }
        });
        
        console.log('\n🔍 Detailed Findings:');
        this.findings.forEach((finding, index) => {
            console.log(`\n${index + 1}. [${finding.severity}] ${finding.component}`);
            console.log(`   Issue: ${finding.issue}`);
            console.log(`   Recommendation: ${finding.recommendation}`);
        });
        
        console.log('\n📝 Key Recommendations:');
        const highPriorityRecommendations = this.findings
            .filter(f => ['CRITICAL', 'HIGH'].includes(f.severity))
            .map(f => f.recommendation);
        
        if (highPriorityRecommendations.length > 0) {
            highPriorityRecommendations.forEach((rec, index) => {
                console.log(`${index + 1}. ${rec}`);
            });
        } else {
            console.log('No critical issues requiring immediate attention.');
        }
    }
}

// Run investigation if called directly
if (require.main === module) {
    const investigation = new FinancialIssuesInvestigation();
    investigation.investigateIssues()
        .then(results => {
            console.log('\n🎯 Investigation completed!');
            console.log(`Found ${results.findings.length} findings`);
            const criticalIssues = results.findings.filter(f => f.severity === 'CRITICAL').length;
            const highIssues = results.findings.filter(f => f.severity === 'HIGH').length;
            
            if (criticalIssues > 0 || highIssues > 0) {
                console.log(`⚠️ ${criticalIssues + highIssues} high-priority issues require attention`);
                process.exit(1);
            } else {
                console.log('✅ No critical issues found');
                process.exit(0);
            }
        })
        .catch(error => {
            console.error('\n❌ Investigation failed:', error);
            process.exit(1);
        });
}

module.exports = FinancialIssuesInvestigation;