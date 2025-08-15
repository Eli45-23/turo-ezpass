const { db } = require('../config/database');
const DataIntegrityValidator = require('../utils/data-integrity');
const DataRecoveryManager = require('./data-recovery');
const WebSocket = require('ws');

/**
 * Real-time Data Integrity Monitoring System
 * 
 * Provides continuous monitoring of data integrity, anomaly detection,
 * and real-time alerting for the Turo toll tracking system.
 */

class IntegrityMonitor {
    constructor() {
        this.validator = new DataIntegrityValidator();
        this.recoveryManager = new DataRecoveryManager();
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.alertThresholds = {
            criticalErrors: 5,          // Alert after 5 critical errors
            validationFailures: 10,     // Alert after 10 validation failures
            duplicateSpike: 20,         // Alert if >20 duplicates in short period
            integrityCheckInterval: 30000, // Check every 30 seconds
            anomalyWindow: 300000,      // 5 minute window for anomaly detection
        };
        
        this.monitoringStats = {
            checksPerformed: 0,
            anomaliesDetected: 0,
            alertsSent: 0,
            lastCheckTime: null,
            systemStatus: 'UNKNOWN'
        };
        
        this.alertHandlers = new Map();
        this.anomalyHistory = [];
        
        // Initialize alert handlers
        this.initializeDefaultAlertHandlers();
    }

    /**
     * Start real-time monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) {
            console.log('⚠️ Monitoring is already running');
            return;
        }
        
        console.log('🔍 Starting real-time data integrity monitoring...');
        this.isMonitoring = true;
        
        // Start periodic integrity checks
        this.monitoringInterval = setInterval(async () => {
            await this.performMonitoringCycle();
        }, this.alertThresholds.integrityCheckInterval);
        
        // Start anomaly detection
        this.startAnomalyDetection();
        
        // Start database change monitoring
        this.startDatabaseChangeMonitoring();
        
        console.log(`✅ Data integrity monitoring started (interval: ${this.alertThresholds.integrityCheckInterval}ms)`);
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            console.log('⚠️ Monitoring is not running');
            return;
        }
        
        console.log('🛑 Stopping data integrity monitoring...');
        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        console.log('✅ Data integrity monitoring stopped');
    }

    /**
     * Perform single monitoring cycle
     */
    async performMonitoringCycle() {
        try {
            console.log('🔄 Performing monitoring cycle...');
            
            const startTime = Date.now();
            this.monitoringStats.checksPerformed++;
            this.monitoringStats.lastCheckTime = new Date();
            
            // 1. Quick integrity health check
            const healthStatus = await this.performQuickHealthCheck();
            this.monitoringStats.systemStatus = healthStatus.status;
            
            // 2. Recent activity analysis
            const activityAnalysis = await this.analyzeRecentActivity();
            
            // 3. Real-time anomaly detection
            const anomalies = await this.detectRealTimeAnomalies();
            
            // 4. Performance metrics check
            const performanceMetrics = await this.checkPerformanceMetrics();
            
            // 5. Generate monitoring report
            const monitoringReport = {
                timestamp: new Date().toISOString(),
                healthStatus,
                activityAnalysis,
                anomalies,
                performanceMetrics,
                executionTime: Date.now() - startTime
            };
            
            // 6. Process alerts if needed
            await this.processMonitoringAlerts(monitoringReport);
            
            // 7. Update monitoring dashboard
            this.broadcastMonitoringUpdate(monitoringReport);
            
            console.log(`✅ Monitoring cycle completed in ${monitoringReport.executionTime}ms - Status: ${healthStatus.status}`);
            
        } catch (error) {
            console.error('❌ Monitoring cycle failed:', error);
            this.monitoringStats.systemStatus = 'ERROR';
            
            // Send critical alert about monitoring failure
            await this.sendAlert('MONITORING_FAILURE', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'CRITICAL');
        }
    }

    /**
     * Quick health check for monitoring
     */
    async performQuickHealthCheck() {
        const healthCheck = {
            status: 'HEALTHY',
            issues: [],
            metrics: {
                totalTransactions: 0,
                recentErrors: 0,
                systemLoad: 0
            }
        };
        
        try {
            // Check database connectivity
            await this.testDatabaseConnectivity();
            
            // Count recent validation errors
            const recentErrors = await this.countRecentValidationErrors();
            healthCheck.metrics.recentErrors = recentErrors;
            
            if (recentErrors > this.alertThresholds.validationFailures) {
                healthCheck.status = 'DEGRADED';
                healthCheck.issues.push(`High validation error count: ${recentErrors}`);
            }
            
            // Count total transactions
            healthCheck.metrics.totalTransactions = await this.getTotalTransactionCount();
            
            // Check for critical security logs
            const criticalEvents = await this.getCriticalSecurityEvents();
            if (criticalEvents > 0) {
                healthCheck.status = 'CRITICAL';
                healthCheck.issues.push(`Critical security events detected: ${criticalEvents}`);
            }
            
        } catch (error) {
            healthCheck.status = 'ERROR';
            healthCheck.issues.push(`Health check failed: ${error.message}`);
        }
        
        return healthCheck;
    }

    /**
     * Analyze recent database activity
     */
    async analyzeRecentActivity() {
        const analysis = {
            timestamp: new Date().toISOString(),
            recentTransactions: 0,
            insertRate: 0,
            errorRate: 0,
            patterns: []
        };
        
        try {
            const cutoffTime = new Date(Date.now() - this.alertThresholds.anomalyWindow);
            
            // Count recent transactions
            analysis.recentTransactions = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT COUNT(*) as count FROM toll_charges WHERE created_at > ?',
                    [cutoffTime.toISOString()],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row.count);
                    }
                );
            });
            
            // Calculate rates
            const windowMinutes = this.alertThresholds.anomalyWindow / (1000 * 60);
            analysis.insertRate = analysis.recentTransactions / windowMinutes;
            
            // Detect unusual patterns
            if (analysis.insertRate > 50) {
                analysis.patterns.push({
                    type: 'HIGH_INSERT_RATE',
                    severity: 'MEDIUM',
                    description: `Unusually high insert rate: ${analysis.insertRate.toFixed(2)} transactions/minute`
                });
            }
            
            if (analysis.recentTransactions === 0 && this.monitoringStats.checksPerformed > 10) {
                analysis.patterns.push({
                    type: 'NO_ACTIVITY',
                    severity: 'LOW',
                    description: 'No recent transaction activity detected'
                });
            }
            
        } catch (error) {
            console.error('❌ Activity analysis failed:', error);
            analysis.error = error.message;
        }
        
        return analysis;
    }

    /**
     * Detect real-time anomalies
     */
    async detectRealTimeAnomalies() {
        const anomalies = [];
        
        try {
            // Check for duplicate spikes
            const duplicateSpike = await this.detectDuplicateSpikes();
            if (duplicateSpike.detected) {
                anomalies.push(duplicateSpike);
                this.monitoringStats.anomaliesDetected++;
            }
            
            // Check for amount anomalies
            const amountAnomalies = await this.detectAmountAnomalies();
            if (amountAnomalies.length > 0) {
                anomalies.push(...amountAnomalies);
                this.monitoringStats.anomaliesDetected += amountAnomalies.length;
            }
            
            // Check for time-based anomalies
            const timeAnomalies = await this.detectTimeAnomalies();
            if (timeAnomalies.length > 0) {
                anomalies.push(...timeAnomalies);
                this.monitoringStats.anomaliesDetected += timeAnomalies.length;
            }
            
            // Check for location anomalies
            const locationAnomalies = await this.detectLocationAnomalies();
            if (locationAnomalies.length > 0) {
                anomalies.push(...locationAnomalies);
                this.monitoringStats.anomaliesDetected += locationAnomalies.length;
            }
            
            // Store anomalies in history
            this.anomalyHistory.push({
                timestamp: new Date(),
                anomalies: anomalies.length
            });
            
            // Keep only recent history
            const historyLimit = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
            this.anomalyHistory = this.anomalyHistory.filter(h => h.timestamp.getTime() > historyLimit);
            
        } catch (error) {
            console.error('❌ Anomaly detection failed:', error);
            anomalies.push({
                type: 'DETECTION_ERROR',
                severity: 'HIGH',
                description: `Anomaly detection failed: ${error.message}`
            });
        }
        
        return anomalies;
    }

    /**
     * Detect duplicate transaction spikes
     */
    async detectDuplicateSpikes() {
        return new Promise((resolve, reject) => {
            const cutoffTime = new Date(Date.now() - this.alertThresholds.anomalyWindow);
            
            // Count potential duplicates in recent time window
            const query = `
                SELECT COUNT(*) as duplicate_count
                FROM (
                    SELECT toll_location, toll_date, toll_amount, COUNT(*) as dup_count
                    FROM toll_charges 
                    WHERE created_at > ?
                    GROUP BY toll_location, toll_date, toll_amount
                    HAVING COUNT(*) > 1
                )
            `;
            
            db.get(query, [cutoffTime.toISOString()], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const duplicateCount = row.duplicate_count || 0;
                
                resolve({
                    detected: duplicateCount > this.alertThresholds.duplicateSpike,
                    type: 'DUPLICATE_SPIKE',
                    severity: duplicateCount > (this.alertThresholds.duplicateSpike * 2) ? 'HIGH' : 'MEDIUM',
                    description: `Duplicate transaction spike detected: ${duplicateCount} potential duplicates in ${this.alertThresholds.anomalyWindow / 1000}s`,
                    count: duplicateCount
                });
            });
        });
    }

    /**
     * Detect amount anomalies
     */
    async detectAmountAnomalies() {
        return new Promise((resolve, reject) => {
            const cutoffTime = new Date(Date.now() - this.alertThresholds.anomalyWindow);
            
            // Look for unusual amounts
            const query = `
                SELECT toll_amount, toll_location, COUNT(*) as count
                FROM toll_charges 
                WHERE created_at > ? AND (toll_amount > 100 OR toll_amount < 0.01)
                GROUP BY toll_amount, toll_location
                ORDER BY toll_amount DESC
            `;
            
            db.all(query, [cutoffTime.toISOString()], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const anomalies = rows.map(row => ({
                    type: 'AMOUNT_ANOMALY',
                    severity: row.toll_amount > 200 ? 'HIGH' : 'MEDIUM',
                    description: `Unusual toll amount detected: $${row.toll_amount} at ${row.toll_location} (${row.count} occurrences)`,
                    amount: row.toll_amount,
                    location: row.toll_location,
                    count: row.count
                }));
                
                resolve(anomalies);
            });
        });
    }

    /**
     * Detect time-based anomalies
     */
    async detectTimeAnomalies() {
        return new Promise((resolve, reject) => {
            const cutoffTime = new Date(Date.now() - this.alertThresholds.anomalyWindow);
            
            // Look for transactions at unusual times (future dates)
            const query = `
                SELECT toll_date, toll_location, toll_amount, COUNT(*) as count
                FROM toll_charges 
                WHERE created_at > ? AND toll_date > datetime('now', '+1 day')
                GROUP BY toll_date, toll_location
                ORDER BY toll_date DESC
            `;
            
            db.all(query, [cutoffTime.toISOString()], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const anomalies = rows.map(row => ({
                    type: 'TIME_ANOMALY',
                    severity: 'HIGH',
                    description: `Future-dated transaction detected: ${row.toll_date} at ${row.toll_location} ($${row.toll_amount})`,
                    date: row.toll_date,
                    location: row.toll_location,
                    amount: row.toll_amount
                }));
                
                resolve(anomalies);
            });
        });
    }

    /**
     * Detect location anomalies
     */
    async detectLocationAnomalies() {
        return new Promise((resolve, reject) => {
            const cutoffTime = new Date(Date.now() - this.alertThresholds.anomalyWindow);
            
            // Look for suspicious location patterns
            const query = `
                SELECT toll_location, COUNT(*) as count, AVG(toll_amount) as avg_amount
                FROM toll_charges 
                WHERE created_at > ? AND (
                    toll_location LIKE '%test%' OR 
                    toll_location LIKE '%sample%' OR 
                    toll_location = '' OR 
                    LENGTH(toll_location) < 3
                )
                GROUP BY toll_location
                ORDER BY count DESC
            `;
            
            db.all(query, [cutoffTime.toISOString()], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const anomalies = rows.map(row => ({
                    type: 'LOCATION_ANOMALY',
                    severity: row.count > 5 ? 'HIGH' : 'MEDIUM',
                    description: `Suspicious location pattern detected: "${row.toll_location}" (${row.count} transactions, avg $${row.avg_amount?.toFixed(2) || '0.00'})`,
                    location: row.toll_location,
                    count: row.count,
                    avgAmount: row.avg_amount
                }));
                
                resolve(anomalies);
            });
        });
    }

    /**
     * Check system performance metrics
     */
    async checkPerformanceMetrics() {
        const metrics = {
            databaseSize: 0,
            queryPerformance: [],
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        };
        
        try {
            // Get database file size
            const fs = require('fs').promises;
            const path = require('path');
            const dbPath = path.join(__dirname, '..', 'turo_tolls.db');
            
            try {
                const stats = await fs.stat(dbPath);
                metrics.databaseSize = stats.size;
            } catch (error) {
                console.error('❌ Failed to get database size:', error);
            }
            
            // Test query performance
            const queries = [
                { name: 'count_toll_charges', query: 'SELECT COUNT(*) FROM toll_charges' },
                { name: 'count_trips', query: 'SELECT COUNT(*) FROM trips' },
                { name: 'recent_transactions', query: 'SELECT COUNT(*) FROM toll_charges WHERE created_at > datetime("now", "-1 hour")' }
            ];
            
            for (const queryTest of queries) {
                const startTime = Date.now();
                try {
                    await new Promise((resolve, reject) => {
                        db.get(queryTest.query, (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                    });
                    
                    metrics.queryPerformance.push({
                        name: queryTest.name,
                        executionTime: Date.now() - startTime
                    });
                } catch (error) {
                    metrics.queryPerformance.push({
                        name: queryTest.name,
                        executionTime: -1,
                        error: error.message
                    });
                }
            }
            
        } catch (error) {
            console.error('❌ Performance metrics check failed:', error);
            metrics.error = error.message;
        }
        
        return metrics;
    }

    /**
     * Process monitoring alerts
     */
    async processMonitoringAlerts(monitoringReport) {
        const alertsToSend = [];
        
        // Check health status alerts
        if (monitoringReport.healthStatus.status === 'CRITICAL') {
            alertsToSend.push({
                type: 'HEALTH_CRITICAL',
                severity: 'CRITICAL',
                message: `System health is critical: ${monitoringReport.healthStatus.issues.join(', ')}`,
                data: monitoringReport.healthStatus
            });
        }
        
        // Check anomaly alerts
        const highSeverityAnomalies = monitoringReport.anomalies.filter(a => a.severity === 'HIGH');
        if (highSeverityAnomalies.length > 0) {
            alertsToSend.push({
                type: 'ANOMALY_DETECTED',
                severity: 'HIGH',
                message: `${highSeverityAnomalies.length} high-severity anomalies detected`,
                data: highSeverityAnomalies
            });
        }
        
        // Check performance alerts
        const slowQueries = monitoringReport.performanceMetrics.queryPerformance?.filter(q => q.executionTime > 1000);
        if (slowQueries && slowQueries.length > 0) {
            alertsToSend.push({
                type: 'PERFORMANCE_DEGRADED',
                severity: 'MEDIUM',
                message: `${slowQueries.length} queries are running slowly`,
                data: slowQueries
            });
        }
        
        // Send alerts
        for (const alert of alertsToSend) {
            await this.sendAlert(alert.type, alert.data, alert.severity);
        }
    }

    /**
     * Send alert through configured handlers
     */
    async sendAlert(alertType, alertData, severity = 'MEDIUM') {
        this.monitoringStats.alertsSent++;
        
        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: alertType,
            severity,
            data: alertData,
            timestamp: new Date().toISOString()
        };
        
        console.log(`🚨 ALERT [${severity}]: ${alertType}`, alertData);
        
        // Log to database
        db.run(
            `INSERT INTO security_logs (event_type, details, severity) VALUES (?, ?, ?)`,
            [`MONITORING_ALERT_${alertType}`, JSON.stringify(alert), severity],
            (err) => {
                if (err) {
                    console.error('❌ Failed to log alert:', err);
                }
            }
        );
        
        // Execute alert handlers
        for (const [handlerName, handler] of this.alertHandlers) {
            try {
                await handler(alert);
            } catch (error) {
                console.error(`❌ Alert handler ${handlerName} failed:`, error);
            }
        }
        
        return alert;
    }

    /**
     * Broadcast monitoring update via WebSocket
     */
    broadcastMonitoringUpdate(monitoringReport) {
        if (global.sendToHost) {
            // Send to all connected hosts (simplified - in production, you'd track host IDs)
            const updateMessage = {
                type: 'monitoring_update',
                timestamp: monitoringReport.timestamp,
                status: monitoringReport.healthStatus.status,
                anomalyCount: monitoringReport.anomalies.length,
                recentTransactions: monitoringReport.activityAnalysis.recentTransactions,
                systemLoad: monitoringReport.performanceMetrics.memoryUsage?.rss || 0
            };
            
            // In a real implementation, you'd iterate through connected hosts
            console.log('📡 Broadcasting monitoring update:', updateMessage);
        }
    }

    /**
     * Initialize default alert handlers
     */
    initializeDefaultAlertHandlers() {
        // Console logger
        this.alertHandlers.set('console', async (alert) => {
            console.log(`🔔 Alert Handler - Console: [${alert.severity}] ${alert.type}`, alert.data);
        });
        
        // File logger (if needed)
        this.alertHandlers.set('file', async (alert) => {
            const fs = require('fs').promises;
            const path = require('path');
            const logPath = path.join(__dirname, '..', 'alerts.log');
            
            const logEntry = `${alert.timestamp} [${alert.severity}] ${alert.type}: ${JSON.stringify(alert.data)}\n`;
            
            try {
                await fs.appendFile(logPath, logEntry);
            } catch (error) {
                console.error('❌ Failed to write alert to file:', error);
            }
        });
        
        // Auto-recovery handler for specific alerts
        this.alertHandlers.set('auto_recovery', async (alert) => {
            if (alert.type === 'DUPLICATE_SPIKE' && alert.severity === 'HIGH') {
                console.log('🔧 Auto-recovery: Starting duplicate cleanup for spike...');
                // Could trigger automatic duplicate removal here
            }
        });
    }

    /**
     * Helper methods for monitoring
     */
    async testDatabaseConnectivity() {
        return new Promise((resolve, reject) => {
            db.get('SELECT 1 as test', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async countRecentValidationErrors() {
        return new Promise((resolve, reject) => {
            const cutoffTime = new Date(Date.now() - this.alertThresholds.anomalyWindow);
            db.get(
                'SELECT COUNT(*) as count FROM validation_errors WHERE created_at > ? AND resolved = 0',
                [cutoffTime.toISOString()],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });
    }

    async getTotalTransactionCount() {
        return new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM toll_charges', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
    }

    async getCriticalSecurityEvents() {
        return new Promise((resolve, reject) => {
            const cutoffTime = new Date(Date.now() - this.alertThresholds.anomalyWindow);
            db.get(
                'SELECT COUNT(*) as count FROM security_logs WHERE created_at > ? AND severity = "CRITICAL"',
                [cutoffTime.toISOString()],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });
    }

    /**
     * Start anomaly detection background process
     */
    startAnomalyDetection() {
        console.log('🔍 Starting background anomaly detection...');
        // This could run pattern analysis, ML-based anomaly detection, etc.
    }

    /**
     * Start database change monitoring
     */
    startDatabaseChangeMonitoring() {
        console.log('👀 Starting database change monitoring...');
        // This could implement triggers or polling for database changes
    }

    /**
     * Get current monitoring status
     */
    getMonitoringStatus() {
        return {
            isRunning: this.isMonitoring,
            stats: this.monitoringStats,
            uptime: this.monitoringStats.lastCheckTime ? 
                Date.now() - this.monitoringStats.lastCheckTime.getTime() : 0,
            alertThresholds: this.alertThresholds,
            anomalyHistoryLength: this.anomalyHistory.length
        };
    }
}

module.exports = IntegrityMonitor;