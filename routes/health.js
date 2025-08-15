const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/health.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

/**
 * Comprehensive Health Check and Monitoring Service
 * Provides detailed system health information and monitoring endpoints
 */
class HealthCheckService {
    constructor() {
        this.healthChecks = new Map();
        this.lastHealthCheck = null;
        this.healthHistory = [];
        this.maxHistorySize = 100;
        
        // Register standard health checks
        this.registerHealthChecks();
    }

    registerHealthChecks() {
        // Database connectivity check
        this.registerCheck('database', async () => {
            const startTime = Date.now();
            
            return new Promise((resolve) => {
                db.get('SELECT 1 as test', [], (err, row) => {
                    const responseTime = Date.now() - startTime;
                    
                    if (err) {
                        resolve({
                            status: 'unhealthy',
                            message: `Database connection failed: ${err.message}`,
                            responseTime,
                            details: { error: err.message }
                        });
                    } else {
                        resolve({
                            status: 'healthy',
                            message: 'Database connection successful',
                            responseTime,
                            details: { result: row }
                        });
                    }
                });
            });
        }, { critical: true, timeout: 5000 });

        // Database performance check
        this.registerCheck('database_performance', async () => {
            const checks = [];
            
            // Check query performance
            const queries = [
                { name: 'trips_count', sql: 'SELECT COUNT(*) as count FROM trips' },
                { name: 'toll_charges_count', sql: 'SELECT COUNT(*) as count FROM toll_charges' },
                { name: 'recent_activity', sql: 'SELECT COUNT(*) as count FROM toll_charges WHERE created_at > datetime("now", "-24 hours")' }
            ];
            
            for (const query of queries) {
                const startTime = Date.now();
                try {
                    const result = await this.executeQuery(query.sql);
                    const responseTime = Date.now() - startTime;
                    
                    checks.push({
                        name: query.name,
                        status: responseTime < 1000 ? 'healthy' : 'degraded',
                        responseTime,
                        result
                    });
                } catch (error) {
                    checks.push({
                        name: query.name,
                        status: 'unhealthy',
                        error: error.message
                    });
                }
            }
            
            const avgResponseTime = checks.reduce((sum, check) => sum + (check.responseTime || 0), 0) / checks.length;
            const status = checks.every(c => c.status === 'healthy') ? 'healthy' : 
                          checks.some(c => c.status === 'unhealthy') ? 'unhealthy' : 'degraded';
            
            return {
                status,
                message: `Database performance check completed`,
                averageResponseTime: Math.round(avgResponseTime),
                details: checks
            };
        }, { critical: false, timeout: 10000 });

        // Memory usage check
        this.registerCheck('memory', async () => {
            const memUsage = process.memoryUsage();
            const totalMem = memUsage.heapTotal;
            const usedMem = memUsage.heapUsed;
            const usagePercent = (usedMem / totalMem) * 100;
            
            let status = 'healthy';
            let message = 'Memory usage is normal';
            
            if (usagePercent > 90) {
                status = 'unhealthy';
                message = 'Memory usage is critically high';
            } else if (usagePercent > 75) {
                status = 'degraded';
                message = 'Memory usage is elevated';
            }
            
            return {
                status,
                message,
                details: {
                    heapUsed: Math.round(usedMem / 1024 / 1024) + 'MB',
                    heapTotal: Math.round(totalMem / 1024 / 1024) + 'MB',
                    usagePercent: Math.round(usagePercent * 100) / 100,
                    rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
                    external: Math.round(memUsage.external / 1024 / 1024) + 'MB'
                }
            };
        }, { critical: true, timeout: 1000 });

        // Event loop lag check
        this.registerCheck('event_loop', async () => {
            return new Promise(resolve => {
                const start = process.hrtime.bigint();
                setImmediate(() => {
                    const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
                    
                    let status = 'healthy';
                    let message = 'Event loop is responsive';
                    
                    if (lag > 100) {
                        status = 'unhealthy';
                        message = 'Event loop lag is critically high';
                    } else if (lag > 50) {
                        status = 'degraded';
                        message = 'Event loop lag is elevated';
                    }
                    
                    resolve({
                        status,
                        message,
                        details: {
                            lagMs: Math.round(lag * 100) / 100,
                            threshold: {
                                healthy: '< 50ms',
                                degraded: '50-100ms',
                                unhealthy: '> 100ms'
                            }
                        }
                    });
                });
            });
        }, { critical: true, timeout: 2000 });

        // Disk space check
        this.registerCheck('disk_space', async () => {
            try {
                const stats = await fs.stat(path.join(__dirname, '..'));
                const dbPath = path.join(__dirname, '..', 'turo_tolls.db');
                
                let dbSize = 0;
                try {
                    const dbStats = await fs.stat(dbPath);
                    dbSize = dbStats.size;
                } catch (error) {
                    // Database file might not exist yet
                }
                
                return {
                    status: 'healthy',
                    message: 'Disk space check completed',
                    details: {
                        databaseSize: Math.round(dbSize / 1024 / 1024 * 100) / 100 + 'MB',
                        lastModified: stats.mtime.toISOString()
                    }
                };
            } catch (error) {
                return {
                    status: 'degraded',
                    message: 'Could not check disk space',
                    details: { error: error.message }
                };
            }
        }, { critical: false, timeout: 2000 });

        // WebSocket health check
        this.registerCheck('websocket', async () => {
            if (!global.websocketManager) {
                return {
                    status: 'degraded',
                    message: 'WebSocket manager not available',
                    details: {}
                };
            }
            
            const metrics = global.websocketManager.getMetrics();
            
            let status = 'healthy';
            let message = 'WebSocket service is healthy';
            
            if (metrics.connectionErrors > 10) {
                status = 'degraded';
                message = 'WebSocket service has elevated error rate';
            }
            
            return {
                status,
                message,
                details: {
                    activeConnections: metrics.activeConnections,
                    totalConnections: metrics.totalConnections,
                    connectionErrors: metrics.connectionErrors,
                    uptime: metrics.uptime
                }
            };
        }, { critical: false, timeout: 1000 });

        // Cache health check
        this.registerCheck('cache', async () => {
            if (!global.cacheManager) {
                return {
                    status: 'degraded',
                    message: 'Cache manager not available',
                    details: {}
                };
            }
            
            try {
                const stats = global.cacheManager.getStats();
                
                let status = 'healthy';
                let message = 'Cache service is healthy';
                
                if (!stats.redisConnected) {
                    status = 'degraded';
                    message = 'Redis connection is unavailable';
                }
                
                return {
                    status,
                    message,
                    details: {
                        hitRate: stats.hitRate,
                        l1HitRate: stats.l1HitRate,
                        l2HitRate: stats.l2HitRate,
                        l1Size: stats.l1Size,
                        redisConnected: stats.redisConnected,
                        errors: stats.errors
                    }
                };
            } catch (error) {
                return {
                    status: 'unhealthy',
                    message: 'Cache health check failed',
                    details: { error: error.message }
                };
            }
        }, { critical: false, timeout: 2000 });

        // Job queue health check
        this.registerCheck('job_queue', async () => {
            if (!global.jobQueueManager) {
                return {
                    status: 'degraded',
                    message: 'Job queue manager not available',
                    details: {}
                };
            }
            
            try {
                const metrics = global.jobQueueManager.getMetrics();
                
                let status = 'healthy';
                let message = 'Job queue service is healthy';
                
                if (metrics.failedJobs > metrics.completedJobs * 0.1) { // More than 10% failure rate
                    status = 'degraded';
                    message = 'Job queue has elevated failure rate';
                }
                
                return {
                    status,
                    message,
                    details: {
                        totalJobs: metrics.totalJobs,
                        completedJobs: metrics.completedJobs,
                        failedJobs: metrics.failedJobs,
                        activeJobs: metrics.activeJobs,
                        queueStatuses: metrics.queueStatuses
                    }
                };
            } catch (error) {
                return {
                    status: 'unhealthy',
                    message: 'Job queue health check failed',
                    details: { error: error.message }
                };
            }
        }, { critical: false, timeout: 3000 });

        // Performance monitor check
        this.registerCheck('performance', async () => {
            if (!global.performanceMonitor) {
                return {
                    status: 'degraded',
                    message: 'Performance monitor not available',
                    details: {}
                };
            }
            
            try {
                const metrics = global.performanceMonitor.getMetrics();
                
                let status = 'healthy';
                let message = 'Performance metrics are healthy';
                
                if (metrics.httpRequests.avgResponseTime > 2000) {
                    status = 'degraded';
                    message = 'Average response time is elevated';
                }
                
                if (metrics.database.slowQueries / Math.max(metrics.database.totalQueries, 1) > 0.1) {
                    status = 'degraded';
                    message = 'High rate of slow database queries detected';
                }
                
                return {
                    status,
                    message,
                    details: {
                        avgResponseTime: Math.round(metrics.httpRequests.avgResponseTime),
                        totalRequests: metrics.httpRequests.total,
                        slowRequests: metrics.httpRequests.slowRequests,
                        totalQueries: metrics.database.totalQueries,
                        slowQueries: metrics.database.slowQueries,
                        avgQueryTime: Math.round(metrics.database.avgQueryTime)
                    }
                };
            } catch (error) {
                return {
                    status: 'unhealthy',
                    message: 'Performance health check failed',
                    details: { error: error.message }
                };
            }
        }, { critical: false, timeout: 1000 });
    }

    registerCheck(name, checkFunction, options = {}) {
        this.healthChecks.set(name, {
            name,
            function: checkFunction,
            critical: options.critical || false,
            timeout: options.timeout || 5000,
            enabled: options.enabled !== false
        });
    }

    async executeQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async runSingleCheck(name, check) {
        const startTime = Date.now();
        
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Health check timeout')), check.timeout);
            });
            
            const result = await Promise.race([check.function(), timeoutPromise]);
            const duration = Date.now() - startTime;
            
            return {
                name,
                status: result.status,
                message: result.message,
                duration,
                timestamp: new Date().toISOString(),
                details: result.details || {},
                critical: check.critical
            };
            
        } catch (error) {
            const duration = Date.now() - startTime;
            
            return {
                name,
                status: 'unhealthy',
                message: `Health check failed: ${error.message}`,
                duration,
                timestamp: new Date().toISOString(),
                details: { error: error.message },
                critical: check.critical
            };
        }
    }

    async runAllChecks() {
        const results = {};
        const promises = [];
        
        for (const [name, check] of this.healthChecks) {
            if (check.enabled) {
                promises.push(
                    this.runSingleCheck(name, check).then(result => {
                        results[name] = result;
                    })
                );
            }
        }
        
        await Promise.allSettled(promises);
        
        // Calculate overall status
        const statuses = Object.values(results);
        const criticalChecks = statuses.filter(r => r.critical);
        const nonCriticalChecks = statuses.filter(r => !r.critical);
        
        let overallStatus = 'healthy';
        let statusMessage = 'All systems operational';
        
        // Check critical systems first
        if (criticalChecks.some(c => c.status === 'unhealthy')) {
            overallStatus = 'unhealthy';
            statusMessage = 'Critical system failure detected';
        } else if (criticalChecks.some(c => c.status === 'degraded')) {
            overallStatus = 'degraded';
            statusMessage = 'Critical system performance degraded';
        } else if (nonCriticalChecks.some(c => c.status === 'unhealthy')) {
            overallStatus = 'degraded';
            statusMessage = 'Non-critical system failure detected';
        } else if (nonCriticalChecks.some(c => c.status === 'degraded')) {
            overallStatus = 'degraded';
            statusMessage = 'System performance degraded';
        }
        
        const healthReport = {
            status: overallStatus,
            message: statusMessage,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            checks: results,
            summary: {
                total: statuses.length,
                healthy: statuses.filter(s => s.status === 'healthy').length,
                degraded: statuses.filter(s => s.status === 'degraded').length,
                unhealthy: statuses.filter(s => s.status === 'unhealthy').length,
                critical: criticalChecks.length
            }
        };
        
        // Store in history
        this.healthHistory.push(healthReport);
        if (this.healthHistory.length > this.maxHistorySize) {
            this.healthHistory.shift();
        }
        
        this.lastHealthCheck = healthReport;
        
        // Log health status
        if (overallStatus === 'unhealthy') {
            logger.error('Health check failed:', healthReport);
        } else if (overallStatus === 'degraded') {
            logger.warn('Health check degraded:', healthReport);
        } else {
            logger.info('Health check passed:', { 
                status: overallStatus, 
                checksTotal: statuses.length,
                duration: Math.max(...statuses.map(s => s.duration))
            });
        }
        
        return healthReport;
    }

    getLastHealthCheck() {
        return this.lastHealthCheck;
    }

    getHealthHistory(limit = 10) {
        return this.healthHistory.slice(-limit);
    }

    getSystemInfo() {
        return {
            node: {
                version: process.version,
                platform: process.platform,
                architecture: process.arch,
                uptime: process.uptime(),
                pid: process.pid
            },
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString()
        };
    }
}

// Create global health check service
const healthCheckService = new HealthCheckService();

// Health check endpoints

// Basic health check - returns minimal information quickly
router.get('/health', async (req, res) => {
    try {
        const basicChecks = ['database', 'memory'];
        const results = {};
        
        for (const checkName of basicChecks) {
            const check = healthCheckService.healthChecks.get(checkName);
            if (check) {
                results[checkName] = await healthCheckService.runSingleCheck(checkName, check);
            }
        }
        
        const allHealthy = Object.values(results).every(r => r.status === 'healthy');
        const status = allHealthy ? 'healthy' : 'unhealthy';
        
        res.status(status === 'healthy' ? 200 : 503).json({
            status,
            timestamp: new Date().toISOString(),
            checks: results
        });
        
    } catch (error) {
        logger.error('Basic health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Comprehensive health check - runs all checks
router.get('/health/full', async (req, res) => {
    try {
        const healthReport = await healthCheckService.runAllChecks();
        const httpStatus = healthReport.status === 'healthy' ? 200 : 
                          healthReport.status === 'degraded' ? 200 : 503;
        
        res.status(httpStatus).json(healthReport);
        
    } catch (error) {
        logger.error('Full health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Readiness check - for Kubernetes/container orchestration
router.get('/health/ready', async (req, res) => {
    try {
        const criticalChecks = ['database', 'memory'];
        const results = {};
        
        for (const checkName of criticalChecks) {
            const check = healthCheckService.healthChecks.get(checkName);
            if (check) {
                results[checkName] = await healthCheckService.runSingleCheck(checkName, check);
            }
        }
        
        const ready = Object.values(results).every(r => r.status === 'healthy');
        
        res.status(ready ? 200 : 503).json({
            ready,
            timestamp: new Date().toISOString(),
            checks: results
        });
        
    } catch (error) {
        logger.error('Readiness check failed:', error);
        res.status(503).json({
            ready: false,
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Liveness check - for Kubernetes/container orchestration
router.get('/health/live', (req, res) => {
    // Simple check that the process is still running
    res.json({
        alive: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pid: process.pid
    });
});

// System information endpoint
router.get('/health/system', (req, res) => {
    try {
        const systemInfo = healthCheckService.getSystemInfo();
        res.json(systemInfo);
    } catch (error) {
        logger.error('System info check failed:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Health check history
router.get('/health/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const history = healthCheckService.getHealthHistory(limit);
        
        res.json({
            history,
            count: history.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Health history check failed:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Metrics endpoint for monitoring systems
router.get('/metrics', async (req, res) => {
    try {
        const metrics = {
            system: healthCheckService.getSystemInfo(),
            performance: global.performanceMonitor ? global.performanceMonitor.getMetrics() : null,
            cache: global.cacheManager ? global.cacheManager.getStats() : null,
            websocket: global.websocketManager ? global.websocketManager.getMetrics() : null,
            jobQueue: global.jobQueueManager ? global.jobQueueManager.getMetrics() : null,
            database: global.databasePool ? global.databasePool.getMetrics() : null,
            lastHealthCheck: healthCheckService.getLastHealthCheck()
        };
        
        res.json(metrics);
    } catch (error) {
        logger.error('Metrics endpoint failed:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Start periodic health checks
setInterval(async () => {
    await healthCheckService.runAllChecks();
}, 60000); // Every minute

module.exports = { router, healthCheckService };