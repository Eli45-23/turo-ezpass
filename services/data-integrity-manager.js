const DataIntegrityValidator = require('../utils/data-integrity');
const TransactionManager = require('../utils/transaction-manager');
const BackupManager = require('./backup-manager');
const DataRecoveryManager = require('./data-recovery');
const IntegrityMonitor = require('./integrity-monitor');
const EnhancedTollProcessor = require('./enhanced-toll-processor');

/**
 * Data Integrity Manager - Central Hub
 * 
 * Coordinates all data integrity features for the Turo toll tracking system,
 * providing a unified interface for validation, transactions, backup, recovery,
 * and monitoring operations.
 */

class DataIntegrityManager {
    constructor() {
        this.validator = new DataIntegrityValidator();
        this.transactionManager = new TransactionManager();
        this.backupManager = new BackupManager();
        this.recoveryManager = new DataRecoveryManager();
        this.monitor = new IntegrityMonitor();
        this.tollProcessor = new EnhancedTollProcessor();
        
        this.isInitialized = false;
        this.systemStatus = {
            overallHealth: 'UNKNOWN',
            lastIntegrityCheck: null,
            lastBackup: null,
            monitoringActive: false,
            criticalIssues: []
        };
    }

    /**
     * Initialize the complete data integrity system
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('⚠️ Data Integrity Manager already initialized');
            return;
        }
        
        console.log('🚀 Initializing comprehensive data integrity system...');
        
        try {
            // 1. Initialize backup system
            await this.backupManager.initializeBackupDirectory();
            
            // 2. Start backup scheduling
            this.backupManager.scheduleBackups();
            console.log('✅ Backup system initialized and scheduled');
            
            // 3. Perform initial integrity check
            console.log('🔍 Performing initial integrity check...');
            const initialCheck = await this.recoveryManager.performIntegrityCheck();
            this.systemStatus.lastIntegrityCheck = initialCheck.timestamp;
            this.systemStatus.overallHealth = initialCheck.overallStatus;
            
            if (initialCheck.overallStatus !== 'HEALTHY') {
                console.log(`⚠️ Initial integrity check revealed issues: ${initialCheck.overallStatus}`);
                this.systemStatus.criticalIssues = initialCheck.recoveryRecommendations
                    .filter(rec => rec.priority === 'CRITICAL')
                    .map(rec => rec.description);
                
                // Auto-heal if possible
                const autoHealable = initialCheck.recoveryRecommendations
                    .filter(rec => rec.autoFixAvailable && rec.priority !== 'CRITICAL');
                
                if (autoHealable.length > 0) {
                    console.log(`🔧 Auto-healing ${autoHealable.length} issues...`);
                    await this.recoveryManager.performDataHealing(initialCheck);
                }
            }
            
            // 4. Start real-time monitoring
            this.monitor.startMonitoring();
            this.systemStatus.monitoringActive = true;
            console.log('✅ Real-time monitoring started');
            
            // 5. Create initial backup
            console.log('💾 Creating initial system backup...');
            const initialBackup = await this.backupManager.createFullBackup('manual', 'System initialization backup');
            if (initialBackup.success) {
                this.systemStatus.lastBackup = initialBackup.fileName;
                console.log('✅ Initial backup created successfully');
            } else {
                console.error('❌ Initial backup failed:', initialBackup.error);
            }
            
            this.isInitialized = true;
            console.log('✅ Data Integrity Manager fully initialized');
            
            // Log initialization
            this.validator.logIntegrityEvent('SYSTEM_INITIALIZED', {
                overallHealth: this.systemStatus.overallHealth,
                monitoringActive: this.systemStatus.monitoringActive,
                backupStatus: initialBackup.success,
                criticalIssues: this.systemStatus.criticalIssues.length
            }, 'LOW');
            
        } catch (error) {
            console.error('❌ Data Integrity Manager initialization failed:', error);
            this.validator.logIntegrityEvent('INITIALIZATION_FAILED', {
                error: error.message
            }, 'CRITICAL');
            throw error;
        }
    }

    /**
     * Process toll data with full integrity pipeline
     */
    async processTollDataSafely(tollData, accountId, hostId) {
        if (!this.isInitialized) {
            throw new Error('Data Integrity Manager not initialized');
        }
        
        console.log(`🔐 Processing ${tollData.length} toll transactions with full integrity pipeline...`);
        
        try {
            // Use enhanced toll processor with all integrity features
            const result = await this.tollProcessor.processTollTransactions(tollData, accountId, hostId);
            
            // Log processing results
            this.validator.logIntegrityEvent('TOLL_PROCESSING_COMPLETED', {
                hostId,
                accountId,
                totalTransactions: tollData.length,
                newTransactions: result.newTransactions,
                duplicates: result.duplicates,
                validationFailures: result.validationFailures,
                success: result.success
            }, result.success ? 'LOW' : 'MEDIUM');
            
            return result;
            
        } catch (error) {
            console.error('❌ Safe toll processing failed:', error);
            
            this.validator.logIntegrityEvent('TOLL_PROCESSING_FAILED', {
                hostId,
                accountId,
                error: error.message,
                transactionCount: tollData.length
            }, 'HIGH');
            
            throw error;
        }
    }

    /**
     * Generate invoice with transaction safety
     */
    async generateInvoiceSafely(tripId, charges, processingFee, hostId) {
        if (!this.isInitialized) {
            throw new Error('Data Integrity Manager not initialized');
        }
        
        console.log(`💰 Generating invoice for trip ${tripId} with ${charges.length} charges...`);
        
        try {
            // Use transaction manager for invoice generation
            const result = await this.transactionManager.executeInvoiceGeneration(
                tripId, charges, processingFee, hostId
            );
            
            // Log invoice generation
            this.validator.logIntegrityEvent('INVOICE_GENERATED', {
                hostId,
                tripId,
                invoiceId: result.invoiceId,
                totalAmount: result.totalAmount,
                lineItemCount: result.lineItemCount
            }, 'LOW');
            
            return result;
            
        } catch (error) {
            console.error('❌ Safe invoice generation failed:', error);
            
            this.validator.logIntegrityEvent('INVOICE_GENERATION_FAILED', {
                hostId,
                tripId,
                error: error.message,
                chargeCount: charges.length
            }, 'HIGH');
            
            throw error;
        }
    }

    /**
     * Match tolls to trips with transaction safety
     */
    async matchTollsToTripsSafely(hostId, tollCharges, trips) {
        if (!this.isInitialized) {
            throw new Error('Data Integrity Manager not initialized');
        }
        
        console.log(`🎯 Matching ${tollCharges.length} tolls to ${trips.length} trips with transaction safety...`);
        
        try {
            // Use transaction manager for toll matching
            const result = await this.transactionManager.executeTollMatching(hostId, tollCharges, trips);
            
            // Log matching results
            this.validator.logIntegrityEvent('TOLL_MATCHING_COMPLETED', {
                hostId,
                tollCount: tollCharges.length,
                tripCount: trips.length,
                matchCount: result.matchCount,
                success: result.success
            }, result.success ? 'LOW' : 'MEDIUM');
            
            return result;
            
        } catch (error) {
            console.error('❌ Safe toll matching failed:', error);
            
            this.validator.logIntegrityEvent('TOLL_MATCHING_FAILED', {
                hostId,
                error: error.message,
                tollCount: tollCharges.length,
                tripCount: trips.length
            }, 'HIGH');
            
            throw error;
        }
    }

    /**
     * Perform comprehensive system health check
     */
    async performSystemHealthCheck(hostId = null) {
        console.log('🏥 Performing comprehensive system health check...');
        
        try {
            // 1. Database integrity check
            const integrityCheck = await this.recoveryManager.performIntegrityCheck(hostId);
            
            // 2. Backup status check
            const backupStatus = await this.backupManager.getBackupStatus();
            
            // 3. Monitoring status
            const monitoringStatus = this.monitor.getMonitoringStatus();
            
            // 4. Transaction manager status
            const activeTransactions = this.transactionManager.getActiveTransactions();
            
            // 5. Processing statistics
            const processingStats = this.tollProcessor.getProcessingStats();
            
            const healthReport = {
                timestamp: new Date().toISOString(),
                overallStatus: this.calculateOverallHealth(integrityCheck, backupStatus, monitoringStatus),
                components: {
                    dataIntegrity: {
                        status: integrityCheck.overallStatus,
                        issues: integrityCheck.checks,
                        recommendations: integrityCheck.recoveryRecommendations
                    },
                    backups: {
                        status: backupStatus.lastSuccessful ? 'HEALTHY' : 'WARNING',
                        lastBackup: backupStatus.lastSuccessful,
                        failedCount: backupStatus.failedCount
                    },
                    monitoring: {
                        status: monitoringStatus.isRunning ? 'ACTIVE' : 'INACTIVE',
                        stats: monitoringStatus.stats,
                        anomalies: monitoringStatus.anomalyHistoryLength
                    },
                    transactions: {
                        status: activeTransactions.length > 10 ? 'WARNING' : 'HEALTHY',
                        activeCount: activeTransactions.length,
                        activeTransactions
                    },
                    processing: {
                        stats: processingStats
                    }
                }
            };
            
            // Update system status
            this.systemStatus.overallHealth = healthReport.overallStatus;
            this.systemStatus.lastIntegrityCheck = healthReport.timestamp;
            this.systemStatus.criticalIssues = integrityCheck.recoveryRecommendations
                .filter(rec => rec.priority === 'CRITICAL')
                .map(rec => rec.description);
            
            console.log(`🏥 System health check completed: ${healthReport.overallStatus}`);
            
            // Log health check
            this.validator.logIntegrityEvent('SYSTEM_HEALTH_CHECK', {
                overallStatus: healthReport.overallStatus,
                componentStatuses: Object.fromEntries(
                    Object.entries(healthReport.components).map(([key, value]) => [key, value.status])
                ),
                criticalIssues: this.systemStatus.criticalIssues.length
            }, healthReport.overallStatus === 'HEALTHY' ? 'LOW' : 'MEDIUM');
            
            return healthReport;
            
        } catch (error) {
            console.error('❌ System health check failed:', error);
            
            this.validator.logIntegrityEvent('HEALTH_CHECK_FAILED', {
                error: error.message
            }, 'HIGH');
            
            throw error;
        }
    }

    /**
     * Emergency system recovery
     */
    async performEmergencyRecovery(backupPath = null) {
        if (!this.isInitialized) {
            throw new Error('Data Integrity Manager not initialized');
        }
        
        console.log('🚨 Initiating emergency system recovery...');
        
        try {
            // 1. Stop monitoring to prevent interference
            if (this.monitor.isMonitoring) {
                this.monitor.stopMonitoring();
            }
            
            // 2. Create emergency backup before recovery
            const emergencyBackup = await this.backupManager.createFullBackup('manual', 'Pre-recovery emergency backup');
            
            // 3. Perform database recovery
            let recoveryResult;
            if (backupPath) {
                console.log(`🔄 Restoring from specified backup: ${backupPath}`);
                recoveryResult = await this.backupManager.restoreFromBackup(backupPath);
            } else {
                console.log('🔧 Attempting automated data healing...');
                const integrityCheck = await this.recoveryManager.performIntegrityCheck();
                recoveryResult = await this.recoveryManager.performDataHealing(integrityCheck);
            }
            
            // 4. Verify recovery
            console.log('✅ Verifying recovery...');
            const postRecoveryCheck = await this.recoveryManager.performIntegrityCheck();
            
            // 5. Restart monitoring
            this.monitor.startMonitoring();
            
            const recoveryReport = {
                timestamp: new Date().toISOString(),
                recoveryType: backupPath ? 'RESTORE_FROM_BACKUP' : 'AUTOMATED_HEALING',
                emergencyBackup: emergencyBackup.success ? emergencyBackup.backupPath : null,
                recoveryResult,
                postRecoveryStatus: postRecoveryCheck.overallStatus,
                success: postRecoveryCheck.overallStatus === 'HEALTHY' || postRecoveryCheck.overallStatus === 'DEGRADED'
            };
            
            // Log recovery
            this.validator.logIntegrityEvent('EMERGENCY_RECOVERY', recoveryReport, 'CRITICAL');
            
            console.log(`🚨 Emergency recovery completed: ${recoveryReport.success ? 'SUCCESS' : 'FAILED'}`);
            
            return recoveryReport;
            
        } catch (error) {
            console.error('❌ Emergency recovery failed:', error);
            
            this.validator.logIntegrityEvent('EMERGENCY_RECOVERY_FAILED', {
                error: error.message
            }, 'CRITICAL');
            
            // Try to restart monitoring even if recovery failed
            try {
                this.monitor.startMonitoring();
            } catch (monitorError) {
                console.error('❌ Failed to restart monitoring after recovery failure:', monitorError);
            }
            
            throw error;
        }
    }

    /**
     * Calculate overall system health
     */
    calculateOverallHealth(integrityCheck, backupStatus, monitoringStatus) {
        // Critical issues override everything
        if (integrityCheck.overallStatus === 'CHECK_FAILED' || 
            integrityCheck.recoveryRecommendations?.some(rec => rec.priority === 'CRITICAL')) {
            return 'CRITICAL';
        }
        
        // High priority issues or backup failures
        if (integrityCheck.overallStatus === 'ISSUES_DETECTED' ||
            backupStatus.failedCount > 3 ||
            !monitoringStatus.isRunning) {
            return 'DEGRADED';
        }
        
        // Everything looks good
        if (integrityCheck.overallStatus === 'HEALTHY' &&
            backupStatus.lastSuccessful &&
            monitoringStatus.isRunning) {
            return 'HEALTHY';
        }
        
        return 'UNKNOWN';
    }

    /**
     * Get system status dashboard data
     */
    getSystemStatus() {
        return {
            ...this.systemStatus,
            isInitialized: this.isInitialized,
            monitoringStatus: this.monitor?.getMonitoringStatus() || null,
            processingStats: this.tollProcessor?.getProcessingStats() || null,
            activeTransactions: this.transactionManager?.getActiveTransactions() || []
        };
    }

    /**
     * Shutdown data integrity system gracefully
     */
    async shutdown() {
        console.log('🛑 Shutting down data integrity system...');
        
        try {
            // Stop monitoring
            if (this.monitor && this.monitor.isMonitoring) {
                this.monitor.stopMonitoring();
            }
            
            // Clean up any stale transactions
            if (this.transactionManager) {
                await this.transactionManager.cleanupStaleTransactions();
            }
            
            // Create final backup
            if (this.backupManager) {
                await this.backupManager.createFullBackup('manual', 'System shutdown backup');
            }
            
            this.isInitialized = false;
            console.log('✅ Data integrity system shutdown completed');
            
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            throw error;
        }
    }
}

module.exports = DataIntegrityManager;