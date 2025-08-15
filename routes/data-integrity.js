const express = require('express');
const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (!req.session.hostId) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
        });
    }
    next();
};

// Middleware to check if data integrity manager is available
const requireIntegrityManager = (req, res, next) => {
    if (!global.dataIntegrityManager || !global.dataIntegrityManager.isInitialized) {
        return res.status(503).json({
            success: false,
            error: 'Data integrity system not initialized'
        });
    }
    next();
};

/**
 * Get system status and health information
 */
router.get('/status', requireAuth, requireIntegrityManager, (req, res) => {
    try {
        const status = global.dataIntegrityManager.getSystemStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('❌ Failed to get system status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve system status'
        });
    }
});

/**
 * Perform comprehensive system health check
 */
router.post('/health-check', requireAuth, requireIntegrityManager, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        console.log(`🏥 Starting health check for host ${hostId}...`);
        const healthReport = await global.dataIntegrityManager.performSystemHealthCheck(hostId);
        
        res.json({
            success: true,
            data: healthReport
        });
    } catch (error) {
        console.error('❌ Health check failed:', error);
        res.status(500).json({
            success: false,
            error: 'Health check failed: ' + error.message
        });
    }
});

/**
 * Create manual backup
 */
router.post('/backup', requireAuth, requireIntegrityManager, async (req, res) => {
    const { description = 'Manual backup via API' } = req.body;
    
    try {
        console.log('💾 Creating manual backup...');
        const backupResult = await global.dataIntegrityManager.backupManager.createFullBackup('manual', description);
        
        if (backupResult.success) {
            res.json({
                success: true,
                message: 'Backup created successfully',
                data: {
                    fileName: backupResult.fileName,
                    size: backupResult.size,
                    checksum: backupResult.checksum,
                    duration: backupResult.duration
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Backup failed: ' + backupResult.error
            });
        }
    } catch (error) {
        console.error('❌ Manual backup failed:', error);
        res.status(500).json({
            success: false,
            error: 'Backup failed: ' + error.message
        });
    }
});

/**
 * Get backup history and status
 */
router.get('/backup-status', requireAuth, requireIntegrityManager, async (req, res) => {
    try {
        const backupStatus = await global.dataIntegrityManager.backupManager.getBackupStatus();
        res.json({
            success: true,
            data: backupStatus
        });
    } catch (error) {
        console.error('❌ Failed to get backup status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve backup status'
        });
    }
});

/**
 * Restore from backup (admin only - implement additional security)
 */
router.post('/restore', requireAuth, requireIntegrityManager, async (req, res) => {
    const { backupPath, confirmToken } = req.body;
    
    // Additional security check for restore operations
    if (confirmToken !== 'EMERGENCY_RESTORE_CONFIRMED') {
        return res.status(403).json({
            success: false,
            error: 'Restore operations require confirmation token'
        });
    }
    
    try {
        console.log(`🔄 Starting emergency restore from: ${backupPath}`);
        const restoreResult = await global.dataIntegrityManager.performEmergencyRecovery(backupPath);
        
        if (restoreResult.success) {
            res.json({
                success: true,
                message: 'System restore completed successfully',
                data: restoreResult
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Restore failed',
                data: restoreResult
            });
        }
    } catch (error) {
        console.error('❌ System restore failed:', error);
        res.status(500).json({
            success: false,
            error: 'Restore failed: ' + error.message
        });
    }
});

/**
 * Get monitoring status and recent alerts
 */
router.get('/monitoring', requireAuth, requireIntegrityManager, (req, res) => {
    try {
        const monitoringStatus = global.dataIntegrityManager.monitor.getMonitoringStatus();
        res.json({
            success: true,
            data: monitoringStatus
        });
    } catch (error) {
        console.error('❌ Failed to get monitoring status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve monitoring status'
        });
    }
});

/**
 * Get data validation errors for host
 */
router.get('/validation-errors', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const { limit = 50, severity = null, resolved = null } = req.query;
    
    const { db } = require('../config/database');
    
    try {
        let query = `
            SELECT ve.*, 
                   CASE 
                       WHEN ve.table_name = 'toll_charges' THEN 
                           (SELECT tc.toll_location || ' - $' || tc.toll_amount 
                            FROM toll_charges tc 
                            JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                            WHERE tc.id = ve.record_id AND ta.host_id = ?)
                       WHEN ve.table_name = 'trips' THEN 
                           (SELECT t.turo_trip_id || ' - ' || t.renter_name 
                            FROM trips t 
                            WHERE t.id = ve.record_id AND t.host_id = ?)
                       ELSE 'N/A'
                   END as record_description
            FROM validation_errors ve
            WHERE EXISTS (
                CASE 
                    WHEN ve.table_name = 'toll_charges' THEN 
                        (SELECT 1 FROM toll_charges tc 
                         JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                         WHERE tc.id = ve.record_id AND ta.host_id = ?)
                    WHEN ve.table_name = 'trips' THEN 
                        (SELECT 1 FROM trips t 
                         WHERE t.id = ve.record_id AND t.host_id = ?)
                    ELSE 1
                END
            )
        `;
        
        const params = [hostId, hostId, hostId, hostId];
        
        if (severity) {
            query += ' AND ve.severity = ?';
            params.push(severity);
        }
        
        if (resolved !== null) {
            query += ' AND ve.resolved = ?';
            params.push(resolved === 'true' ? 1 : 0);
        }
        
        query += ' ORDER BY ve.created_at DESC LIMIT ?';
        params.push(parseInt(limit));
        
        db.all(query, params, (err, errors) => {
            if (err) {
                console.error('❌ Failed to fetch validation errors:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch validation errors'
                });
            }
            
            res.json({
                success: true,
                data: {
                    errors: errors,
                    totalCount: errors.length,
                    filters: { severity, resolved }
                }
            });
        });
    } catch (error) {
        console.error('❌ Failed to get validation errors:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve validation errors'
        });
    }
});

/**
 * Mark validation error as resolved
 */
router.post('/validation-errors/:errorId/resolve', requireAuth, (req, res) => {
    const errorId = req.params.errorId;
    const { resolution_notes } = req.body;
    
    const { db } = require('../config/database');
    
    try {
        db.run(
            `UPDATE validation_errors 
             SET resolved = 1, resolved_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [errorId],
            function(err) {
                if (err) {
                    console.error('❌ Failed to resolve validation error:', err);
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to resolve validation error'
                    });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Validation error not found'
                    });
                }
                
                res.json({
                    success: true,
                    message: 'Validation error marked as resolved'
                });
            }
        );
    } catch (error) {
        console.error('❌ Failed to resolve validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to resolve validation error'
        });
    }
});

/**
 * Get transaction processing statistics
 */
router.get('/processing-stats', requireAuth, requireIntegrityManager, (req, res) => {
    try {
        const processingStats = global.dataIntegrityManager.tollProcessor.getProcessingStats();
        const activeTransactions = global.dataIntegrityManager.transactionManager.getActiveTransactions();
        
        res.json({
            success: true,
            data: {
                processing: processingStats,
                activeTransactions: {
                    count: activeTransactions.length,
                    transactions: activeTransactions
                }
            }
        });
    } catch (error) {
        console.error('❌ Failed to get processing stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve processing statistics'
        });
    }
});

/**
 * Emergency data export
 */
router.post('/emergency-export', requireAuth, requireIntegrityManager, async (req, res) => {
    try {
        console.log('🚨 Creating emergency data export...');
        const exportResult = await global.dataIntegrityManager.backupManager.emergencyExport();
        
        if (exportResult.success) {
            res.json({
                success: true,
                message: 'Emergency export created successfully',
                data: {
                    exportPath: exportResult.exportPath,
                    fileSize: exportResult.fileSize
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Emergency export failed: ' + exportResult.error
            });
        }
    } catch (error) {
        console.error('❌ Emergency export failed:', error);
        res.status(500).json({
            success: false,
            error: 'Emergency export failed: ' + error.message
        });
    }
});

/**
 * Reset processing statistics (for testing/admin)
 */
router.post('/reset-stats', requireAuth, requireIntegrityManager, (req, res) => {
    try {
        global.dataIntegrityManager.tollProcessor.resetStats();
        res.json({
            success: true,
            message: 'Processing statistics reset successfully'
        });
    } catch (error) {
        console.error('❌ Failed to reset stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset statistics'
        });
    }
});

module.exports = router;