#!/usr/bin/env node

/**
 * Security Administration Utility
 * Provides tools for managing security aspects of the Turo Toll system
 */

const crypto = require('crypto');
const { db } = require('../config/database');

class SecurityAdmin {
    /**
     * Generate secure keys for environment variables
     */
    static generateKeys() {
        console.log('🔐 Generating secure keys for production deployment:');
        console.log('');
        
        console.log('SESSION_SECRET=', crypto.randomBytes(32).toString('hex'));
        console.log('ENCRYPTION_MASTER_KEY=', crypto.randomBytes(32).toString('hex'));
        console.log('CSRF_SECRET=', crypto.randomBytes(32).toString('hex'));
        console.log('');
        console.log('⚠️ Store these keys securely and never commit them to version control!');
    }

    /**
     * Audit security logs
     */
    static async auditSecurityLogs(days = 7) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT event_type, severity, COUNT(*) as count, 
                       MAX(created_at) as last_occurrence
                FROM security_logs 
                WHERE created_at > datetime('now', '-${days} days')
                GROUP BY event_type, severity
                ORDER BY severity DESC, count DESC
            `;
            
            db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                console.log(`🔍 Security Log Summary (Last ${days} days):`);
                console.log('==========================================');
                
                const severityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2, 'INFO': 3 };
                rows.sort((a, b) => 
                    (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4) ||
                    b.count - a.count
                );
                
                rows.forEach(row => {
                    const icon = {
                        'HIGH': '🚨',
                        'MEDIUM': '⚠️',
                        'LOW': '💡',
                        'INFO': 'ℹ️'
                    }[row.severity] || '❓';
                    
                    console.log(`${icon} ${row.event_type}: ${row.count} events (${row.severity})`);
                    console.log(`   Last: ${row.last_occurrence}`);
                });
                
                resolve(rows);
            });
        });
    }

    /**
     * Check for suspicious activity
     */
    static async checkSuspiciousActivity() {
        const checks = [
            {
                name: 'Failed Login Attempts',
                query: `SELECT ip_address, COUNT(*) as attempts 
                       FROM login_attempts 
                       WHERE success = 0 AND attempt_time > datetime('now', '-1 hour')
                       GROUP BY ip_address 
                       HAVING attempts >= 3
                       ORDER BY attempts DESC`,
                threshold: 3
            },
            {
                name: 'Rate Limit Violations',
                query: `SELECT JSON_EXTRACT(details, '$.ip') as ip, COUNT(*) as violations
                       FROM security_logs 
                       WHERE event_type = 'RATE_LIMIT_EXCEEDED' 
                       AND created_at > datetime('now', '-1 hour')
                       GROUP BY JSON_EXTRACT(details, '$.ip')
                       HAVING violations >= 2
                       ORDER BY violations DESC`,
                threshold: 2
            },
            {
                name: 'CSRF Attacks',
                query: `SELECT JSON_EXTRACT(details, '$.ip') as ip, COUNT(*) as attempts
                       FROM security_logs 
                       WHERE event_type = 'CSRF_TOKEN_MISMATCH'
                       AND created_at > datetime('now', '-1 day')
                       GROUP BY JSON_EXTRACT(details, '$.ip')
                       ORDER BY attempts DESC`,
                threshold: 1
            }
        ];
        
        console.log('🕵️ Checking for suspicious activity...');
        console.log('=====================================');
        
        for (const check of checks) {
            await new Promise((resolve, reject) => {
                db.all(check.query, [], (err, rows) => {
                    if (err) {
                        console.error(`❌ Error checking ${check.name}:`, err.message);
                        resolve();
                        return;
                    }
                    
                    if (rows.length > 0) {
                        console.log(`🚨 ${check.name}:`);
                        rows.forEach(row => {
                            const key = Object.keys(row)[0];
                            const value = Object.values(row)[0];
                            const count = Object.values(row)[1];
                            console.log(`   ${key}: ${value} (${count} events)`);
                        });
                    } else {
                        console.log(`✅ ${check.name}: No issues found`);
                    }
                    
                    resolve();
                });
            });
        }
    }

    /**
     * Clean old security logs
     */
    static async cleanOldLogs(retentionDays = 90) {
        return new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM security_logs WHERE created_at < datetime("now", "-' + retentionDays + ' days")',
                [],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    console.log(`🧹 Cleaned ${this.changes} old security log entries`);
                    resolve(this.changes);
                }
            );
        });
    }

    /**
     * Migrate old passwords to new encryption format
     */
    static async migratePasswords() {
        const cryptoUtils = require('./crypto');
        
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT id, host_id, password_encrypted FROM toll_accounts',
                [],
                async (err, accounts) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    let migrated = 0;
                    let errors = 0;
                    
                    console.log(`🔄 Checking ${accounts.length} toll accounts for password migration...`);
                    
                    for (const account of accounts) {
                        try {
                            if (cryptoUtils.isOldPasswordFormat(account.password_encrypted)) {
                                const newEncrypted = cryptoUtils.migrateOldPassword(
                                    account.password_encrypted,
                                    account.host_id.toString()
                                );
                                
                                await new Promise((resolve, reject) => {
                                    db.run(
                                        'UPDATE toll_accounts SET password_encrypted = ? WHERE id = ?',
                                        [newEncrypted, account.id],
                                        function(err) {
                                            if (err) {
                                                reject(err);
                                            } else {
                                                resolve();
                                            }
                                        }
                                    );
                                });
                                
                                migrated++;
                                console.log(`✅ Migrated password for account ${account.id}`);
                            }
                        } catch (error) {
                            console.error(`❌ Failed to migrate account ${account.id}:`, error.message);
                            errors++;
                        }
                    }
                    
                    console.log(`🏁 Migration complete: ${migrated} migrated, ${errors} errors`);
                    resolve({ migrated, errors });
                }
            );
        });
    }

    /**
     * Test encryption/decryption functionality
     */
    static testEncryption() {
        const cryptoUtils = require('./crypto');
        
        console.log('🧪 Testing encryption functionality...');
        
        try {
            const testData = 'test-password-123!@#';
            const hostId = 'test-host-1';
            
            // Test encryption
            const encrypted = cryptoUtils.encryptSensitiveData(testData, hostId);
            console.log('✅ Encryption successful');
            
            // Test decryption
            const decrypted = cryptoUtils.decryptSensitiveData(encrypted, hostId);
            console.log('✅ Decryption successful');
            
            // Verify data integrity
            if (decrypted === testData) {
                console.log('✅ Data integrity verified');
            } else {
                console.log('❌ Data integrity check failed');
            }
            
            // Test with wrong host ID (should fail)
            try {
                cryptoUtils.decryptSensitiveData(encrypted, 'wrong-host-id');
                console.log('❌ Security test failed - decryption succeeded with wrong host ID');
            } catch (error) {
                console.log('✅ Security test passed - decryption failed with wrong host ID');
            }
            
        } catch (error) {
            console.error('❌ Encryption test failed:', error.message);
        }
    }
}

// CLI interface
async function main() {
    const command = process.argv[2];
    
    switch (command) {
        case 'generate-keys':
            SecurityAdmin.generateKeys();
            break;
            
        case 'audit-logs':
            const days = parseInt(process.argv[3]) || 7;
            await SecurityAdmin.auditSecurityLogs(days);
            break;
            
        case 'check-suspicious':
            await SecurityAdmin.checkSuspiciousActivity();
            break;
            
        case 'clean-logs':
            const retention = parseInt(process.argv[3]) || 90;
            await SecurityAdmin.cleanOldLogs(retention);
            break;
            
        case 'migrate-passwords':
            await SecurityAdmin.migratePasswords();
            break;
            
        case 'test-encryption':
            SecurityAdmin.testEncryption();
            break;
            
        default:
            console.log('🔐 Turo Toll Security Administration Tool');
            console.log('');
            console.log('Available commands:');
            console.log('  generate-keys              - Generate secure keys for production');
            console.log('  audit-logs [days]          - Audit security logs (default: 7 days)');
            console.log('  check-suspicious           - Check for suspicious activity');
            console.log('  clean-logs [retention]     - Clean old logs (default: 90 days)');
            console.log('  migrate-passwords          - Migrate old passwords to new encryption');
            console.log('  test-encryption            - Test encryption functionality');
            console.log('');
            console.log('Usage: node utils/security-admin.js <command>');
    }
    
    process.exit(0);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SecurityAdmin;