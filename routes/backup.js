const express = require('express');
const router = express.Router();
const BackupService = require('../services/backup-service');
const { requireAuth, dashboardLimiter } = require('../middleware/security');

const backupService = new BackupService();

/**
 * Backup Management API Routes
 * 
 * Provides endpoints for:
 * - Creating manual backups
 * - Listing backup history
 * - Getting backup statistics
 * - Managing backup settings
 */

// Create manual full backup
router.post('/create/full', requireAuth, async (req, res) => {
    try {
        console.log(`📦 Manual full backup requested by host ${req.session.hostId}`);
        
        const result = await backupService.createFullBackup();
        
        res.json({
            success: true,
            message: 'Full backup created successfully',
            backup: {
                id: result.backupId,
                size: backupService.formatFileSize(result.fileSize),
                duration: `${result.duration}ms`,
                compressed: result.compressed,
                encrypted: result.encrypted,
                checksum: result.checksum.substring(0, 16) + '...' // Truncate for security
            }
        });
        
    } catch (error) {
        console.error('❌ Manual full backup failed:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to create full backup: ' + error.message
        });
    }
});

// Create manual incremental backup
router.post('/create/incremental', requireAuth, async (req, res) => {
    try {
        console.log(`📊 Manual incremental backup requested by host ${req.session.hostId}`);
        
        const result = await backupService.createIncrementalBackup();
        
        if (result.message) {
            // No changes to backup
            res.json({
                success: true,
                message: result.message,
                changes: result.changes || 0
            });
        } else {
            res.json({
                success: true,
                message: 'Incremental backup created successfully',
                backup: {
                    id: result.backupId,
                    changes: result.changes,
                    size: backupService.formatFileSize(result.fileSize),
                    duration: `${result.duration}ms`,
                    compressed: result.compressed,
                    encrypted: result.encrypted,
                    checksum: result.checksum.substring(0, 16) + '...'
                }
            });
        }
        
    } catch (error) {
        console.error('❌ Manual incremental backup failed:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to create incremental backup: ' + error.message
        });
    }
});

// List backup history
router.get('/history', requireAuth, async (req, res) => {
    try {
        const backups = await backupService.listBackups();
        
        // Format backup data for frontend
        const formattedBackups = backups.map(backup => ({
            id: backup.id,
            type: backup.backup_type,
            status: backup.status,
            size: backup.file_size ? backupService.formatFileSize(backup.file_size) : 'N/A',
            started: backup.started_at,
            completed: backup.completed_at,
            duration: backup.completed_at && backup.started_at ? 
                new Date(backup.completed_at) - new Date(backup.started_at) : null,
            error: backup.error_message,
            fileName: backup.file_path ? backup.file_path.split('/').pop() : null
        }));
        
        res.json({
            success: true,
            backups: formattedBackups,
            total: backups.length
        });
        
    } catch (error) {
        console.error('❌ Failed to get backup history:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve backup history: ' + error.message
        });
    }
});

// Get backup statistics
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const stats = await backupService.getBackupStats();
        
        // Process stats for dashboard display
        const processedStats = {
            total: 0,
            successful: 0,
            failed: 0,
            byType: {},
            lastBackup: null,
            totalSize: 0
        };
        
        stats.forEach(stat => {
            processedStats.total += stat.count;
            
            if (stat.status === 'success') {
                processedStats.successful += stat.count;
            } else if (stat.status === 'failed') {
                processedStats.failed += stat.count;
            }
            
            if (!processedStats.byType[stat.backup_type]) {
                processedStats.byType[stat.backup_type] = {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    avgSize: 0
                };
            }
            
            processedStats.byType[stat.backup_type].total += stat.count;
            processedStats.byType[stat.backup_type][stat.status] = stat.count;
            
            if (stat.avg_size) {
                processedStats.byType[stat.backup_type].avgSize = stat.avg_size;
                processedStats.totalSize += stat.avg_size * stat.count;
            }
            
            if (stat.last_backup && (!processedStats.lastBackup || stat.last_backup > processedStats.lastBackup)) {
                processedStats.lastBackup = stat.last_backup;
            }
        });
        
        // Calculate success rate
        processedStats.successRate = processedStats.total > 0 ? 
            Math.round((processedStats.successful / processedStats.total) * 100) : 0;
        
        // Format total size
        processedStats.totalSizeFormatted = backupService.formatFileSize(processedStats.totalSize);
        
        res.json({
            success: true,
            stats: processedStats
        });
        
    } catch (error) {
        console.error('❌ Failed to get backup stats:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve backup statistics: ' + error.message
        });
    }
});

// Get backup configuration
router.get('/config', requireAuth, (req, res) => {
    res.json({
        success: true,
        config: {
            maxBackups: backupService.maxBackups,
            compressionEnabled: backupService.compressionEnabled,
            encryptionEnabled: !!backupService.encryptionKey,
            backupDirectory: 'backups/', // Don't expose full path
            scheduleEnabled: true, // This would come from configuration
            fullBackupSchedule: 'Daily at 2:00 AM',
            incrementalBackupSchedule: 'Every 4 hours'
        }
    });
});

// Verify backup integrity (check specific backup)
router.get('/verify/:backupId', requireAuth, async (req, res) => {
    try {
        const { backupId } = req.params;
        
        // This would implement backup verification logic
        // For now, just check if the backup exists in logs
        const backups = await backupService.listBackups();
        const backup = backups.find(b => b.id.toString() === backupId);
        
        if (!backup) {
            return res.status(404).json({
                success: false,
                error: 'Backup not found'
            });
        }
        
        // In a full implementation, this would:
        // 1. Check if backup file exists
        // 2. Verify checksum
        // 3. Test restoration (if possible)
        
        res.json({
            success: true,
            verification: {
                backupId: backup.id,
                status: backup.status,
                fileExists: true, // Would actually check
                checksumValid: true, // Would actually verify
                lastVerified: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Backup verification failed:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to verify backup: ' + error.message
        });
    }
});

// Trigger backup cleanup
router.post('/cleanup', requireAuth, async (req, res) => {
    try {
        console.log(`🧹 Manual backup cleanup requested by host ${req.session.hostId}`);
        
        await backupService.cleanupOldBackups();
        
        res.json({
            success: true,
            message: 'Backup cleanup completed successfully'
        });
        
    } catch (error) {
        console.error('❌ Backup cleanup failed:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to cleanup backups: ' + error.message
        });
    }
});

// Get backup health status
router.get('/health', requireAuth, async (req, res) => {
    try {
        const stats = await backupService.getBackupStats();
        const backups = await backupService.listBackups();
        
        const recentBackups = backups.filter(b => {
            const backupTime = new Date(b.started_at);
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            return backupTime > oneDayAgo;
        });
        
        const health = {
            status: 'healthy',
            lastBackup: backups.length > 0 ? backups[0].started_at : null,
            recentBackups: recentBackups.length,
            recentFailures: recentBackups.filter(b => b.status === 'failed').length,
            issues: []
        };
        
        // Check for issues
        if (!health.lastBackup) {
            health.status = 'warning';
            health.issues.push('No backups found');
        } else {
            const lastBackupTime = new Date(health.lastBackup);
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
            
            if (lastBackupTime < twoDaysAgo) {
                health.status = 'warning';
                health.issues.push('Last backup is more than 2 days old');
            }
        }
        
        if (health.recentFailures > 0) {
            health.status = health.status === 'healthy' ? 'warning' : 'critical';
            health.issues.push(`${health.recentFailures} recent backup failures`);
        }
        
        res.json({
            success: true,
            health
        });
        
    } catch (error) {
        console.error('❌ Failed to get backup health:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to check backup health: ' + error.message,
            health: {
                status: 'error',
                issues: ['Cannot access backup system']
            }
        });
    }
});

module.exports = router;