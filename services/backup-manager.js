const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { db } = require('../config/database');

/**
 * Automated Database Backup and Recovery System
 * 
 * Provides comprehensive backup, recovery, and data protection features
 * for the Turo toll tracking system's critical financial data.
 */

class BackupManager {
    constructor() {
        this.backupDir = path.join(__dirname, '..', 'backups');
        this.dbPath = path.join(__dirname, '..', 'turo_tolls.db');
        this.maxBackups = {
            daily: 30,    // Keep 30 daily backups
            weekly: 12,   // Keep 12 weekly backups
            monthly: 12   // Keep 12 monthly backups
        };
        
        this.initializeBackupDirectory();
    }

    /**
     * Initialize backup directory structure
     */
    async initializeBackupDirectory() {
        try {
            const subdirs = ['daily', 'weekly', 'monthly', 'manual', 'temp'];
            
            // Create main backup directory
            await fs.mkdir(this.backupDir, { recursive: true });
            
            // Create subdirectories
            for (const subdir of subdirs) {
                await fs.mkdir(path.join(this.backupDir, subdir), { recursive: true });
            }
            
            console.log('📁 Backup directory structure initialized');
        } catch (error) {
            console.error('❌ Failed to initialize backup directory:', error);
        }
    }

    /**
     * Create a full database backup
     */
    async createFullBackup(backupType = 'manual', description = '') {
        const startTime = new Date();
        const timestamp = startTime.toISOString().replace(/[:.]/g, '-');
        const backupFileName = `turo_tolls_${backupType}_${timestamp}.db`;
        const backupPath = path.join(this.backupDir, backupType, backupFileName);
        
        let backupLogId = null;

        try {
            // Log backup start
            backupLogId = await this.logBackupStart(backupType, backupPath);

            // Create backup by copying database file
            await fs.copyFile(this.dbPath, backupPath);
            
            // Get file stats
            const stats = await fs.stat(backupPath);
            
            // Verify backup integrity
            const isValid = await this.verifyBackupIntegrity(backupPath);
            
            if (!isValid) {
                throw new Error('Backup integrity verification failed');
            }

            // Generate backup checksum
            const checksum = await this.generateFileChecksum(backupPath);
            
            // Create metadata file
            const metadata = {
                originalFile: this.dbPath,
                backupFile: backupPath,
                backupType,
                description,
                timestamp: startTime.toISOString(),
                fileSize: stats.size,
                checksum,
                verified: true,
                createdBy: 'BackupManager'
            };
            
            const metadataPath = backupPath + '.meta';
            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

            const endTime = new Date();
            const duration = endTime - startTime;

            // Log successful backup
            await this.logBackupCompletion(backupLogId, 'success', stats.size, null);

            console.log(`✅ Database backup created successfully: ${backupFileName} (${stats.size} bytes, ${duration}ms)`);
            
            // Clean up old backups
            if (backupType !== 'manual') {
                await this.cleanupOldBackups(backupType);
            }

            return {
                success: true,
                backupPath,
                fileName: backupFileName,
                size: stats.size,
                checksum,
                duration,
                metadata
            };

        } catch (error) {
            console.error('❌ Backup failed:', error);
            
            // Log failed backup
            if (backupLogId) {
                await this.logBackupCompletion(backupLogId, 'failed', null, error.message);
            }

            // Clean up partial backup
            try {
                await fs.unlink(backupPath);
                await fs.unlink(backupPath + '.meta');
            } catch (cleanupError) {
                console.error('❌ Failed to clean up partial backup:', cleanupError);
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Verify backup integrity by opening and testing database
     */
    async verifyBackupIntegrity(backupPath) {
        return new Promise((resolve) => {
            const sqlite3 = require('sqlite3').verbose();
            const testDb = new sqlite3.Database(backupPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    console.error('❌ Backup integrity check failed:', err);
                    resolve(false);
                    return;
                }

                // Test by running a simple query on each critical table
                const testQueries = [
                    'SELECT COUNT(*) FROM hosts',
                    'SELECT COUNT(*) FROM trips',
                    'SELECT COUNT(*) FROM toll_charges',
                    'SELECT COUNT(*) FROM invoices'
                ];

                let completedTests = 0;
                let testsPassed = true;

                const checkTable = (query) => {
                    testDb.get(query, (err, row) => {
                        if (err) {
                            console.error(`❌ Backup integrity test failed for query: ${query}`, err);
                            testsPassed = false;
                        }
                        
                        completedTests++;
                        if (completedTests === testQueries.length) {
                            testDb.close((closeErr) => {
                                if (closeErr) {
                                    console.error('❌ Error closing test database:', closeErr);
                                }
                                resolve(testsPassed);
                            });
                        }
                    });
                };

                testQueries.forEach(checkTable);
            });
        });
    }

    /**
     * Generate SHA-256 checksum for backup file
     */
    async generateFileChecksum(filePath) {
        try {
            const fileBuffer = await fs.readFile(filePath);
            return crypto.createHash('sha256').update(fileBuffer).digest('hex');
        } catch (error) {
            console.error('❌ Failed to generate file checksum:', error);
            return null;
        }
    }

    /**
     * Restore database from backup
     */
    async restoreFromBackup(backupPath, verifyBeforeRestore = true) {
        try {
            // Verify backup exists and is valid
            const stats = await fs.stat(backupPath);
            if (!stats.isFile()) {
                throw new Error('Backup file does not exist or is not a valid file');
            }

            if (verifyBeforeRestore) {
                const isValid = await this.verifyBackupIntegrity(backupPath);
                if (!isValid) {
                    throw new Error('Backup integrity verification failed');
                }
            }

            // Create temporary backup of current database
            const tempBackupPath = path.join(this.backupDir, 'temp', `restore_safety_backup_${Date.now()}.db`);
            await fs.copyFile(this.dbPath, tempBackupPath);

            console.log('🔄 Created safety backup before restore:', tempBackupPath);

            try {
                // Restore by copying backup over current database
                await fs.copyFile(backupPath, this.dbPath);
                
                // Verify restored database
                const restoredValid = await this.verifyBackupIntegrity(this.dbPath);
                if (!restoredValid) {
                    // Restore original database if verification fails
                    await fs.copyFile(tempBackupPath, this.dbPath);
                    throw new Error('Restored database verification failed, original database restored');
                }

                console.log('✅ Database restored successfully from backup');
                
                // Log successful restore
                this.logSecurityEvent('DATABASE_RESTORED', {
                    backupPath,
                    tempBackupPath,
                    restoredSize: stats.size
                }, 'HIGH');

                return {
                    success: true,
                    backupPath,
                    tempBackupPath,
                    restoredSize: stats.size
                };

            } catch (restoreError) {
                // Attempt to restore original database
                try {
                    await fs.copyFile(tempBackupPath, this.dbPath);
                    console.log('🔄 Original database restored after failed restore attempt');
                } catch (rollbackError) {
                    console.error('❌ CRITICAL: Failed to restore original database after failed restore:', rollbackError);
                    this.logSecurityEvent('CRITICAL_RESTORE_FAILURE', {
                        error: rollbackError.message,
                        backupPath,
                        tempBackupPath
                    }, 'CRITICAL');
                }
                throw restoreError;
            }

        } catch (error) {
            console.error('❌ Database restore failed:', error);
            this.logSecurityEvent('DATABASE_RESTORE_FAILED', {
                error: error.message,
                backupPath
            }, 'HIGH');

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create incremental backup (exports recent changes)
     */
    async createIncrementalBackup(sinceDays = 1) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `incremental_${sinceDays}days_${timestamp}.sql`;
        const backupPath = path.join(this.backupDir, 'daily', backupFileName);
        
        const cutoffDate = new Date(Date.now() - (sinceDays * 24 * 60 * 60 * 1000)).toISOString();

        try {
            const queries = [
                `SELECT * FROM trips WHERE created_at > ? OR updated_at > ?`,
                `SELECT * FROM toll_charges WHERE created_at > ? OR updated_at > ?`,
                `SELECT * FROM invoices WHERE created_at > ? OR updated_at > ?`,
                `SELECT * FROM security_logs WHERE created_at > '${cutoffDate}'`
            ];

            const exportData = {
                exportDate: new Date().toISOString(),
                sinceDays,
                cutoffDate,
                tables: {}
            };

            for (const query of queries) {
                const tableName = query.match(/FROM (\w+)/)[1];
                
                const data = await new Promise((resolve, reject) => {
                    db.all(query, [cutoffDate, cutoffDate], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });

                exportData.tables[tableName] = data;
                console.log(`📊 Exported ${data.length} records from ${tableName}`);
            }

            await fs.writeFile(backupPath, JSON.stringify(exportData, null, 2));
            
            const stats = await fs.stat(backupPath);
            console.log(`✅ Incremental backup created: ${backupFileName} (${stats.size} bytes)`);

            return {
                success: true,
                backupPath,
                fileName: backupFileName,
                size: stats.size,
                recordCount: Object.values(exportData.tables).reduce((sum, table) => sum + table.length, 0)
            };

        } catch (error) {
            console.error('❌ Incremental backup failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Clean up old backups based on retention policy
     */
    async cleanupOldBackups(backupType) {
        try {
            const backupTypeDir = path.join(this.backupDir, backupType);
            const files = await fs.readdir(backupTypeDir);
            
            // Filter to only .db files and sort by creation time
            const backupFiles = files
                .filter(file => file.endsWith('.db'))
                .map(file => ({
                    name: file,
                    path: path.join(backupTypeDir, file)
                }));

            // Sort by creation time (newest first)
            const fileStats = await Promise.all(
                backupFiles.map(async (file) => {
                    const stats = await fs.stat(file.path);
                    return {
                        ...file,
                        birthtime: stats.birthtime
                    };
                })
            );

            fileStats.sort((a, b) => b.birthtime - a.birthtime);

            // Remove files beyond retention limit
            const maxRetention = this.maxBackups[backupType] || 10;
            const filesToDelete = fileStats.slice(maxRetention);

            for (const file of filesToDelete) {
                try {
                    await fs.unlink(file.path);
                    await fs.unlink(file.path + '.meta'); // Delete metadata file too
                    console.log(`🗑️ Cleaned up old backup: ${file.name}`);
                } catch (deleteError) {
                    console.error(`❌ Failed to delete old backup ${file.name}:`, deleteError);
                }
            }

            if (filesToDelete.length > 0) {
                console.log(`✅ Backup cleanup completed: removed ${filesToDelete.length} old ${backupType} backups`);
            }

        } catch (error) {
            console.error(`❌ Backup cleanup failed for ${backupType}:`, error);
        }
    }

    /**
     * Schedule automatic backups
     */
    scheduleBackups() {
        const cron = require('node-cron');

        // Daily backup at 2 AM
        cron.schedule('0 2 * * *', async () => {
            console.log('🕐 Running scheduled daily backup...');
            await this.createFullBackup('daily', 'Automated daily backup');
        }, {
            scheduled: true,
            timezone: "America/New_York"
        });

        // Weekly backup on Sundays at 3 AM
        cron.schedule('0 3 * * 0', async () => {
            console.log('🕐 Running scheduled weekly backup...');
            await this.createFullBackup('weekly', 'Automated weekly backup');
        }, {
            scheduled: true,
            timezone: "America/New_York"
        });

        // Monthly backup on 1st day at 4 AM
        cron.schedule('0 4 1 * *', async () => {
            console.log('🕐 Running scheduled monthly backup...');
            await this.createFullBackup('monthly', 'Automated monthly backup');
        }, {
            scheduled: true,
            timezone: "America/New_York"
        });

        // Incremental backup every 6 hours during business hours (6 AM to 10 PM)
        cron.schedule('0 6,12,18,22 * * *', async () => {
            console.log('🕐 Running scheduled incremental backup...');
            await this.createIncrementalBackup(1);
        }, {
            scheduled: true,
            timezone: "America/New_York"
        });

        console.log('⏰ Backup schedules configured and started');
    }

    /**
     * Log backup operation start
     */
    async logBackupStart(backupType, filePath) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO backup_logs (backup_type, file_path, status) VALUES (?, ?, 'in_progress')`,
                [backupType, filePath],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    /**
     * Log backup operation completion
     */
    async logBackupCompletion(backupLogId, status, fileSize, errorMessage) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE backup_logs SET status = ?, file_size = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [status, fileSize, errorMessage, backupLogId],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Get backup history and status
     */
    async getBackupStatus() {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM backup_logs ORDER BY started_at DESC LIMIT 50`,
                (err, backups) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            recentBackups: backups,
                            lastSuccessful: backups.find(b => b.status === 'success'),
                            failedCount: backups.filter(b => b.status === 'failed').length,
                            inProgressCount: backups.filter(b => b.status === 'in_progress').length
                        });
                    }
                }
            );
        });
    }

    /**
     * Log security event
     */
    logSecurityEvent(eventType, details, severity = 'LOW') {
        db.run(
            `INSERT INTO security_logs (event_type, details, severity) VALUES (?, ?, ?)`,
            [`BACKUP_${eventType}`, JSON.stringify(details), severity],
            (err) => {
                if (err) {
                    console.error('❌ Failed to log backup security event:', err);
                }
            }
        );
    }

    /**
     * Emergency database export (for critical failures)
     */
    async emergencyExport() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const exportPath = path.join(this.backupDir, 'manual', `emergency_export_${timestamp}.json`);

        try {
            const tables = ['hosts', 'trips', 'toll_charges', 'invoices', 'invoice_items'];
            const exportData = {
                exportDate: new Date().toISOString(),
                exportType: 'emergency',
                tables: {}
            };

            for (const tableName of tables) {
                const data = await new Promise((resolve, reject) => {
                    db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
                exportData.tables[tableName] = data;
            }

            await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
            
            const stats = await fs.stat(exportPath);
            console.log(`🚨 Emergency export completed: ${exportPath} (${stats.size} bytes)`);

            this.logSecurityEvent('EMERGENCY_EXPORT', {
                exportPath,
                fileSize: stats.size,
                tableCount: tables.length
            }, 'CRITICAL');

            return {
                success: true,
                exportPath,
                fileSize: stats.size
            };

        } catch (error) {
            console.error('❌ Emergency export failed:', error);
            this.logSecurityEvent('EMERGENCY_EXPORT_FAILED', {
                error: error.message
            }, 'CRITICAL');

            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = BackupManager;