/**
 * Simplified Financial Security Audit
 * 
 * This script conducts a security audit of the financial components,
 * focusing on database-level security and audit trails.
 */

const { db } = require('./config/database');
const fs = require('fs');
const path = require('path');

class SimpleFinancialSecurityAudit {
    constructor() {
        this.findings = [];
    }

    async runSecurityAudit() {
        console.log('🔒 Starting Financial Security Audit...\n');

        try {
            // Test 1: Database Schema Security
            await this.testDatabaseSchemaSecurity();
            
            // Test 2: Audit Trail Analysis
            await this.testAuditTrailAnalysis();
            
            // Test 3: Code Security Review
            await this.testCodeSecurityReview();
            
            // Test 4: Configuration Security
            await this.testConfigurationSecurity();
            
            // Test 5: Data Encryption Analysis
            await this.testDataEncryptionAnalysis();
            
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

    async testDatabaseSchemaSecurity() {
        console.log('🗃️ Testing Database Schema Security...');

        try {
            // Check for financial tables constraints
            const financialTables = ['toll_charges', 'invoices', 'invoice_items'];
            
            for (const table of financialTables) {
                const schema = await this.getTableSchema(table);
                
                // Check for constraints
                const hasCheckConstraints = schema.includes('CHECK');
                const hasNotNullConstraints = schema.includes('NOT NULL');
                const hasForeignKeys = schema.includes('FOREIGN KEY');
                
                if (!hasCheckConstraints) {
                    this.addFinding('HIGH', 'Database Security', 
                        `Table ${table} lacks CHECK constraints for data validation`,
                        'Implement CHECK constraints to prevent invalid financial data');
                }
                
                if (!hasNotNullConstraints) {
                    this.addFinding('MEDIUM', 'Database Security', 
                        `Table ${table} may lack NOT NULL constraints on critical fields`,
                        'Ensure critical financial fields are marked as NOT NULL');
                }
                
                if (hasForeignKeys) {
                    this.addFinding('GOOD', 'Database Security', 
                        `Table ${table} has proper foreign key relationships`,
                        'Continue maintaining referential integrity');
                }
            }
            
            // Check for indexes on sensitive fields
            const indexes = await this.getTableIndexes();
            const financialIndexes = indexes.filter(idx => 
                financialTables.some(table => idx.name.includes(table))
            );
            
            if (financialIndexes.length > 0) {
                this.addFinding('GOOD', 'Database Performance', 
                    `Found ${financialIndexes.length} indexes on financial tables`,
                    'Continue optimizing query performance with appropriate indexes');
            }
            
        } catch (error) {
            this.addFinding('HIGH', 'Database Schema Analysis', 
                `Failed to analyze database schema: ${error.message}`,
                'Ensure database schema can be properly analyzed');
        }

        console.log('  ✅ Database schema security testing completed');
    }

    async testAuditTrailAnalysis() {
        console.log('📝 Testing Audit Trail Analysis...');

        try {
            // Check if audit tables exist
            const auditTables = await this.getAuditTables();
            
            if (auditTables.length === 0) {
                this.addFinding('CRITICAL', 'Audit Trail', 
                    'No audit tables found in database',
                    'Implement comprehensive audit logging tables');
            } else {
                this.addFinding('GOOD', 'Audit Trail', 
                    `Found ${auditTables.length} audit tables: ${auditTables.join(', ')}`,
                    'Continue maintaining audit trail infrastructure');
            }
            
            // Check audit log completeness
            const recentAuditLogs = await this.getRecentAuditLogs(7); // Last 7 days
            
            if (recentAuditLogs.length === 0) {
                this.addFinding('HIGH', 'Audit Activity', 
                    'No audit logs found in last 7 days',
                    'Ensure audit logging is active and functioning');
            } else {
                const financialAuditLogs = recentAuditLogs.filter(log => 
                    log.event_type && (
                        log.event_type.includes('TRANSACTION') ||
                        log.event_type.includes('INVOICE') ||
                        log.event_type.includes('FINANCIAL')
                    )
                );
                
                if (financialAuditLogs.length === 0) {
                    this.addFinding('MEDIUM', 'Financial Audit Logging', 
                        'No financial-specific audit logs found',
                        'Ensure financial operations are being audited');
                } else {
                    this.addFinding('GOOD', 'Financial Audit Logging', 
                        `Found ${financialAuditLogs.length} financial audit entries`,
                        'Continue auditing all financial operations');
                }
            }
            
            // Check audit log integrity
            await this.checkAuditLogIntegrity(recentAuditLogs);
            
        } catch (error) {
            this.addFinding('HIGH', 'Audit Trail Analysis', 
                `Failed to analyze audit trail: ${error.message}`,
                'Ensure audit trail analysis can be performed');
        }

        console.log('  ✅ Audit trail analysis completed');
    }

    async testCodeSecurityReview() {
        console.log('👨‍💻 Testing Code Security Review...');

        try {
            // Check financial route files for security issues
            const routeFiles = [
                './routes/invoices.js',
                './routes/analytics.js', 
                './utils/transaction-manager.js',
                './utils/data-integrity.js'
            ];
            
            for (const filePath of routeFiles) {
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    await this.analyzeCodeSecurity(filePath, content);
                } else {
                    this.addFinding('LOW', 'Code Review', 
                        `File not found: ${filePath}`,
                        'Ensure all expected financial code files exist');
                }
            }
            
        } catch (error) {
            this.addFinding('MEDIUM', 'Code Security Review', 
                `Failed to perform code security review: ${error.message}`,
                'Ensure code security review can be automated');
        }

        console.log('  ✅ Code security review completed');
    }

    async analyzeCodeSecurity(filePath, content) {
        // Check for potential SQL injection patterns
        const sqlInjectionPatterns = [
            /db\.run\([^?]*\+/g,           // String concatenation in db.run
            /db\.get\([^?]*\+/g,           // String concatenation in db.get
            /db\.all\([^?]*\+/g,           // String concatenation in db.all
            /query\s*=\s*["`'].*\+/g,      // String concatenation in queries
        ];
        
        let sqlInjectionIssues = 0;
        sqlInjectionPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                sqlInjectionIssues += matches.length;
            }
        });
        
        if (sqlInjectionIssues > 0) {
            this.addFinding('HIGH', 'SQL Injection Risk', 
                `Found ${sqlInjectionIssues} potential SQL injection patterns in ${filePath}`,
                'Use parameterized queries for all database operations');
        } else {
            this.addFinding('GOOD', 'SQL Injection Prevention', 
                `No SQL injection patterns found in ${filePath}`,
                'Continue using safe database query practices');
        }
        
        // Check for authentication middleware usage
        const hasAuthCheck = content.includes('requireAuth') || 
                            content.includes('req.session') ||
                            content.includes('hostId');
        
        if (hasAuthCheck && filePath.includes('routes/')) {
            this.addFinding('GOOD', 'Authentication', 
                `${filePath} implements authentication checks`,
                'Continue enforcing authentication on all protected routes');
        } else if (filePath.includes('routes/')) {
            this.addFinding('MEDIUM', 'Authentication', 
                `${filePath} may lack authentication checks`,
                'Ensure all financial routes require proper authentication');
        }
        
        // Check for input validation
        const hasValidation = content.includes('validate') || 
                             content.includes('sanitize') ||
                             content.includes('CHECK') ||
                             content.includes('typeof');
        
        if (hasValidation) {
            this.addFinding('GOOD', 'Input Validation', 
                `${filePath} implements input validation`,
                'Continue validating all user inputs');
        } else {
            this.addFinding('MEDIUM', 'Input Validation', 
                `${filePath} may lack input validation`,
                'Implement comprehensive input validation');
        }
    }

    async testConfigurationSecurity() {
        console.log('⚙️ Testing Configuration Security...');

        try {
            // Check database file permissions (SQLite)
            const dbPath = './turo_tolls.db';
            if (fs.existsSync(dbPath)) {
                const stats = fs.statSync(dbPath);
                const mode = stats.mode.toString(8).slice(-3);
                
                if (mode === '600' || mode === '644') {
                    this.addFinding('GOOD', 'Database File Security', 
                        `Database file has secure permissions: ${mode}`,
                        'Continue maintaining secure file permissions');
                } else {
                    this.addFinding('HIGH', 'Database File Security', 
                        `Database file has potentially insecure permissions: ${mode}`,
                        'Set database file permissions to 600 or 644');
                }
            }
            
            // Check for configuration files with secrets
            const configFiles = ['config/database.js', '.env', 'package.json'];
            for (const configFile of configFiles) {
                if (fs.existsSync(configFile)) {
                    const content = fs.readFileSync(configFile, 'utf8');
                    
                    // Check for hardcoded passwords or keys
                    const secretPatterns = [
                        /password\s*[:=]\s*['"]\w+['"]/i,
                        /secret\s*[:=]\s*['"]\w+['"]/i,
                        /key\s*[:=]\s*['"]\w+['"]/i,
                        /token\s*[:=]\s*['"]\w+['"]/i
                    ];
                    
                    let hasSecrets = false;
                    secretPatterns.forEach(pattern => {
                        if (pattern.test(content)) {
                            hasSecrets = true;
                        }
                    });
                    
                    if (hasSecrets) {
                        this.addFinding('HIGH', 'Configuration Security', 
                            `${configFile} may contain hardcoded secrets`,
                            'Use environment variables for sensitive configuration');
                    } else {
                        this.addFinding('GOOD', 'Configuration Security', 
                            `${configFile} appears to handle secrets securely`,
                            'Continue using secure configuration practices');
                    }
                }
            }
            
        } catch (error) {
            this.addFinding('MEDIUM', 'Configuration Security', 
                `Failed to analyze configuration security: ${error.message}`,
                'Ensure configuration security can be properly assessed');
        }

        console.log('  ✅ Configuration security testing completed');
    }

    async testDataEncryptionAnalysis() {
        console.log('🔐 Testing Data Encryption Analysis...');

        try {
            // Check for encrypted fields in toll accounts
            const sampleAccount = await new Promise((resolve) => {
                db.get('SELECT password_encrypted FROM toll_accounts LIMIT 1', (err, row) => {
                    resolve(row);
                });
            });
            
            if (sampleAccount && sampleAccount.password_encrypted) {
                // Basic heuristics for encryption detection
                const isLikelyEncrypted = sampleAccount.password_encrypted.length > 20 &&
                                        !/^(password|test|admin|encrypted)$/i.test(sampleAccount.password_encrypted);
                
                if (isLikelyEncrypted) {
                    this.addFinding('GOOD', 'Data Encryption', 
                        'Toll account passwords appear to be encrypted',
                        'Continue using strong encryption for sensitive data');
                } else {
                    this.addFinding('HIGH', 'Data Encryption', 
                        'Toll account passwords may not be properly encrypted',
                        'Implement proper encryption for all sensitive data');
                }
            }
            
            // Check for any credit card or payment fields (PCI compliance)
            const paymentFields = await this.checkForPaymentFields();
            if (paymentFields.length > 0) {
                this.addFinding('CRITICAL', 'PCI Compliance', 
                    `Payment card fields found: ${paymentFields.join(', ')}`,
                    'Ensure PCI DSS compliance for payment card data');
            } else {
                this.addFinding('GOOD', 'PCI Compliance', 
                    'No payment card fields found in database',
                    'Continue avoiding storage of sensitive payment data');
            }
            
        } catch (error) {
            this.addFinding('MEDIUM', 'Data Encryption Analysis', 
                `Failed to analyze data encryption: ${error.message}`,
                'Ensure data encryption analysis can be performed');
        }

        console.log('  ✅ Data encryption analysis completed');
    }

    // Helper methods
    async getTableSchema(tableName) {
        return new Promise((resolve) => {
            db.get('SELECT sql FROM sqlite_master WHERE name = ? AND type = "table"', 
                [tableName], (err, row) => {
                resolve(row ? row.sql : '');
            });
        });
    }

    async getTableIndexes() {
        return new Promise((resolve) => {
            db.all('SELECT name, sql FROM sqlite_master WHERE type = "index"', (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    async getAuditTables() {
        return new Promise((resolve) => {
            db.all(`
                SELECT name FROM sqlite_master 
                WHERE type = 'table' 
                AND (name LIKE '%audit%' OR name LIKE '%log%' OR name LIKE '%security%')
            `, (err, rows) => {
                const tableNames = rows ? rows.map(r => r.name) : [];
                resolve(tableNames);
            });
        });
    }

    async getRecentAuditLogs(days) {
        return new Promise((resolve) => {
            db.all(`
                SELECT * FROM security_logs 
                WHERE created_at >= datetime('now', '-${days} days')
                ORDER BY created_at DESC
            `, (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    async checkAuditLogIntegrity(logs) {
        // Check for gaps in audit logs
        if (logs.length === 0) return;
        
        const logsByDate = {};
        logs.forEach(log => {
            const date = log.created_at ? log.created_at.split(' ')[0] : 'unknown';
            logsByDate[date] = (logsByDate[date] || 0) + 1;
        });
        
        const dates = Object.keys(logsByDate).sort();
        let hasGaps = false;
        
        for (let i = 1; i < dates.length; i++) {
            const currentDate = new Date(dates[i]);
            const previousDate = new Date(dates[i-1]);
            const daysDiff = (currentDate - previousDate) / (1000 * 60 * 60 * 24);
            
            if (daysDiff > 1) {
                hasGaps = true;
                break;
            }
        }
        
        if (hasGaps) {
            this.addFinding('MEDIUM', 'Audit Log Integrity', 
                'Gaps detected in audit log timeline',
                'Investigate potential audit log gaps or system downtime');
        } else {
            this.addFinding('GOOD', 'Audit Log Integrity', 
                'Audit logs appear continuous with no major gaps',
                'Continue maintaining consistent audit logging');
        }
    }

    async checkForPaymentFields() {
        return new Promise((resolve) => {
            db.all(`
                SELECT m.name as table_name, p.name as column_name
                FROM sqlite_master m, pragma_table_info(m.name) p
                WHERE m.type = 'table' 
                AND (
                    p.name LIKE '%card%' OR 
                    p.name LIKE '%credit%' OR 
                    p.name LIKE '%cvv%' OR 
                    p.name LIKE '%ccv%' OR
                    p.name LIKE '%expir%' OR
                    p.name LIKE '%payment%'
                )
            `, (err, rows) => {
                const fields = rows ? rows.map(r => `${r.table_name}.${r.column_name}`) : [];
                resolve(fields);
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
        let securityScore = 100;
        securityScore -= (severityCounts.CRITICAL * 30);
        securityScore -= (severityCounts.HIGH * 15);
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
        
        console.log('\n🚨 Critical and High Priority Issues:');
        const criticalHighIssues = this.findings.filter(f => ['CRITICAL', 'HIGH'].includes(f.severity));
        if (criticalHighIssues.length === 0) {
            console.log('None identified');
        } else {
            criticalHighIssues.forEach((issue, index) => {
                console.log(`\n${index + 1}. [${issue.severity}] ${issue.component}`);
                console.log(`   Issue: ${issue.issue}`);
                console.log(`   Recommendation: ${issue.recommendation}`);
            });
        }
        
        return {
            score: securityScore,
            findings: this.findings,
            summary: severityCounts
        };
    }
}

// Run security audit if called directly
if (require.main === module) {
    const audit = new SimpleFinancialSecurityAudit();
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

module.exports = SimpleFinancialSecurityAudit;