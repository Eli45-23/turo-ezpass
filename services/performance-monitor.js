const winston = require('winston');
const { performance, PerformanceObserver } = require('perf_hooks');
const { db } = require('../config/database');

// Configure logger for performance monitoring
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/performance.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

/**
 * Comprehensive Performance Monitoring Service
 * Tracks system performance metrics, database queries, API response times, and resource usage
 */
class PerformanceMonitor {
    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.sampleRate = options.sampleRate || 1.0; // 100% sampling by default
        this.slowQueryThreshold = options.slowQueryThreshold || 1000; // 1 second
        this.highMemoryThreshold = options.highMemoryThreshold || 0.8; // 80% of available memory
        
        // Metrics storage
        this.metrics = {
            // Request metrics
            httpRequests: {
                total: 0,
                byMethod: new Map(),
                byRoute: new Map(),
                byStatus: new Map(),
                avgResponseTime: 0,
                slowRequests: 0
            },
            
            // Database metrics
            database: {
                totalQueries: 0,
                slowQueries: 0,
                queryErrors: 0,
                avgQueryTime: 0,
                connectionPool: {
                    active: 0,
                    idle: 0,
                    waiting: 0
                }
            },
            
            // System metrics
            system: {
                memoryUsage: {
                    rss: 0,
                    heapUsed: 0,
                    heapTotal: 0,
                    external: 0
                },
                cpuUsage: {
                    user: 0,
                    system: 0
                },
                eventLoopLag: 0
            },
            
            // WebSocket metrics
            websocket: {
                activeConnections: 0,
                totalConnections: 0,
                messagesSent: 0,
                messagesReceived: 0,
                connectionErrors: 0
            },
            
            // Cache metrics
            cache: {
                hits: 0,
                misses: 0,
                errors: 0,
                hitRate: 0
            },
            
            // Business metrics
            business: {
                tollMatching: {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    avgProcessingTime: 0
                },
                ezpassScraping: {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    avgScrapingTime: 0
                }
            }
        };
        
        // Performance observers
        this.observers = [];
        this.requestTimes = [];
        this.queryTimes = [];
        this.maxHistorySize = 1000;
        
        // Alerting thresholds
        this.alertThresholds = {
            avgResponseTime: 2000, // 2 seconds
            errorRate: 0.05, // 5%
            memoryUsage: 0.9, // 90%
            slowQueryRate: 0.1 // 10%
        };
        
        // Initialize monitoring
        if (this.enabled) {
            this.initialize();
        }
    }

    initialize() {
        try {
            this.setupPerformanceObservers();
            this.startSystemMetricsCollection();
            this.startPeriodicReporting();
            
            logger.info('Performance monitoring initialized');
        } catch (error) {
            logger.error('Failed to initialize performance monitoring:', error);
        }
    }

    setupPerformanceObservers() {
        // HTTP request observer
        const httpObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.name.startsWith('http-request')) {
                    this.recordHttpRequest(entry);
                }
            }
        });
        httpObserver.observe({ entryTypes: ['measure'] });
        this.observers.push(httpObserver);

        // Database query observer
        const dbObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.name.startsWith('db-query')) {
                    this.recordDatabaseQuery(entry);
                }
            }
        });
        dbObserver.observe({ entryTypes: ['measure'] });
        this.observers.push(dbObserver);
    }

    /**
     * HTTP Request tracking
     */
    startRequest(req) {
        if (!this.enabled || Math.random() > this.sampleRate) {
            return null;
        }

        const requestId = `http-request-${Date.now()}-${Math.random()}`;
        performance.mark(`${requestId}-start`);
        
        return {
            requestId,
            method: req.method,
            route: req.route?.path || req.path,
            startTime: Date.now()
        };
    }

    endRequest(trackingData, res, error = null) {
        if (!trackingData || !this.enabled) {
            return;
        }

        const { requestId, method, route, startTime } = trackingData;
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        performance.mark(`${requestId}-end`);
        performance.measure(requestId, `${requestId}-start`, `${requestId}-end`);

        // Update metrics
        this.metrics.httpRequests.total++;
        this.updateMapCounter(this.metrics.httpRequests.byMethod, method);
        this.updateMapCounter(this.metrics.httpRequests.byRoute, route);
        this.updateMapCounter(this.metrics.httpRequests.byStatus, res?.statusCode || 500);

        // Track response times
        this.requestTimes.push(duration);
        if (this.requestTimes.length > this.maxHistorySize) {
            this.requestTimes.shift();
        }
        
        this.metrics.httpRequests.avgResponseTime = 
            this.requestTimes.reduce((a, b) => a + b, 0) / this.requestTimes.length;

        // Track slow requests
        if (duration > this.slowQueryThreshold) {
            this.metrics.httpRequests.slowRequests++;
            logger.warn('Slow HTTP request detected:', {
                method,
                route,
                duration,
                statusCode: res?.statusCode
            });
        }

        // Track errors
        if (error || (res && res.statusCode >= 400)) {
            logger.error('HTTP request error:', {
                method,
                route,
                statusCode: res?.statusCode,
                error: error?.message,
                duration
            });
        }
    }

    /**
     * Database query tracking
     */
    startQuery(sql) {
        if (!this.enabled || Math.random() > this.sampleRate) {
            return null;
        }

        const queryId = `db-query-${Date.now()}-${Math.random()}`;
        performance.mark(`${queryId}-start`);
        
        return {
            queryId,
            sql: sql.substring(0, 100), // Truncate long queries for logging
            startTime: Date.now()
        };
    }

    endQuery(trackingData, error = null, results = null) {
        if (!trackingData || !this.enabled) {
            return;
        }

        const { queryId, sql, startTime } = trackingData;
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        performance.mark(`${queryId}-end`);
        performance.measure(queryId, `${queryId}-start`, `${queryId}-end`);

        // Update metrics
        this.metrics.database.totalQueries++;
        
        // Track query times
        this.queryTimes.push(duration);
        if (this.queryTimes.length > this.maxHistorySize) {
            this.queryTimes.shift();
        }
        
        this.metrics.database.avgQueryTime = 
            this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;

        // Track slow queries
        if (duration > this.slowQueryThreshold) {
            this.metrics.database.slowQueries++;
            logger.warn('Slow database query detected:', {
                sql,
                duration,
                resultCount: Array.isArray(results) ? results.length : (results ? 1 : 0)
            });
            
            // Store slow query in database for analysis
            this.recordSlowQuery(sql, duration, error);
        }

        // Track errors
        if (error) {
            this.metrics.database.queryErrors++;
            logger.error('Database query error:', {
                sql,
                error: error.message,
                duration
            });
        }
    }

    /**
     * WebSocket tracking
     */
    trackWebSocketConnection(action, details = {}) {
        if (!this.enabled) return;

        switch (action) {
            case 'connect':
                this.metrics.websocket.activeConnections++;
                this.metrics.websocket.totalConnections++;
                break;
                
            case 'disconnect':
                this.metrics.websocket.activeConnections = Math.max(0, this.metrics.websocket.activeConnections - 1);
                break;
                
            case 'message_sent':
                this.metrics.websocket.messagesSent++;
                break;
                
            case 'message_received':
                this.metrics.websocket.messagesReceived++;
                break;
                
            case 'error':
                this.metrics.websocket.connectionErrors++;
                logger.error('WebSocket error:', details);
                break;
        }
    }

    /**
     * Business operation tracking
     */
    trackBusinessOperation(operation, startTime, endTime, success, details = {}) {
        if (!this.enabled) return;

        const duration = endTime - startTime;
        
        switch (operation) {
            case 'toll_matching':
                this.metrics.business.tollMatching.total++;
                if (success) {
                    this.metrics.business.tollMatching.successful++;
                } else {
                    this.metrics.business.tollMatching.failed++;
                }
                
                // Update average processing time
                const totalMatching = this.metrics.business.tollMatching.total;
                const currentAvg = this.metrics.business.tollMatching.avgProcessingTime;
                this.metrics.business.tollMatching.avgProcessingTime = 
                    ((currentAvg * (totalMatching - 1)) + duration) / totalMatching;
                break;
                
            case 'ezpass_scraping':
                this.metrics.business.ezpassScraping.total++;
                if (success) {
                    this.metrics.business.ezpassScraping.successful++;
                } else {
                    this.metrics.business.ezpassScraping.failed++;
                }
                
                // Update average scraping time
                const totalScraping = this.metrics.business.ezpassScraping.total;
                const currentAvgScraping = this.metrics.business.ezpassScraping.avgScrapingTime;
                this.metrics.business.ezpassScraping.avgScrapingTime = 
                    ((currentAvgScraping * (totalScraping - 1)) + duration) / totalScraping;
                break;
        }

        // Log slow business operations
        if (duration > 5000) { // 5 seconds
            logger.warn(`Slow ${operation} operation:`, {
                duration,
                success,
                details
            });
        }
    }

    /**
     * System metrics collection
     */
    startSystemMetricsCollection() {
        setInterval(() => {
            if (!this.enabled) return;

            // Memory usage
            const memUsage = process.memoryUsage();
            this.metrics.system.memoryUsage = memUsage;
            
            // CPU usage
            const cpuUsage = process.cpuUsage();
            this.metrics.system.cpuUsage = cpuUsage;
            
            // Event loop lag
            const start = process.hrtime.bigint();
            setImmediate(() => {
                const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
                this.metrics.system.eventLoopLag = lag;
                
                if (lag > 100) { // More than 100ms lag
                    logger.warn('High event loop lag detected:', { lag });
                }
            });
            
            // Check for memory issues
            const memoryUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
            if (memoryUsagePercent > this.highMemoryThreshold) {
                logger.warn('High memory usage detected:', {
                    percentage: (memoryUsagePercent * 100).toFixed(2) + '%',
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
                });
            }
            
        }, 5000); // Every 5 seconds
    }

    /**
     * Periodic reporting and alerting
     */
    startPeriodicReporting() {
        setInterval(() => {
            if (!this.enabled) return;
            
            this.generatePerformanceReport();
            this.checkAlerts();
            this.persistMetrics();
            
        }, 60000); // Every minute
    }

    generatePerformanceReport() {
        const report = {
            timestamp: new Date().toISOString(),
            httpRequests: {
                ...this.metrics.httpRequests,
                errorRate: this.calculateErrorRate(),
                requestsPerMinute: this.calculateRequestsPerMinute()
            },
            database: {
                ...this.metrics.database,
                slowQueryRate: this.calculateSlowQueryRate(),
                queriesPerMinute: this.calculateQueriesPerMinute()
            },
            system: this.metrics.system,
            websocket: this.metrics.websocket,
            cache: this.metrics.cache,
            business: this.metrics.business,
            health: this.calculateHealthScore()
        };
        
        logger.info('Performance Report:', report);
        return report;
    }

    checkAlerts() {
        const alerts = [];
        
        // Check response time
        if (this.metrics.httpRequests.avgResponseTime > this.alertThresholds.avgResponseTime) {
            alerts.push({
                type: 'HIGH_RESPONSE_TIME',
                value: this.metrics.httpRequests.avgResponseTime,
                threshold: this.alertThresholds.avgResponseTime
            });
        }
        
        // Check error rate
        const errorRate = this.calculateErrorRate();
        if (errorRate > this.alertThresholds.errorRate) {
            alerts.push({
                type: 'HIGH_ERROR_RATE',
                value: errorRate,
                threshold: this.alertThresholds.errorRate
            });
        }
        
        // Check memory usage
        const memoryUsagePercent = this.metrics.system.memoryUsage.heapUsed / 
                                  this.metrics.system.memoryUsage.heapTotal;
        if (memoryUsagePercent > this.alertThresholds.memoryUsage) {
            alerts.push({
                type: 'HIGH_MEMORY_USAGE',
                value: memoryUsagePercent,
                threshold: this.alertThresholds.memoryUsage
            });
        }
        
        // Check slow query rate
        const slowQueryRate = this.calculateSlowQueryRate();
        if (slowQueryRate > this.alertThresholds.slowQueryRate) {
            alerts.push({
                type: 'HIGH_SLOW_QUERY_RATE',
                value: slowQueryRate,
                threshold: this.alertThresholds.slowQueryRate
            });
        }
        
        if (alerts.length > 0) {
            logger.warn('Performance alerts triggered:', alerts);
            
            // Trigger notification system if available
            if (global.sendToHost) {
                // Send alerts to all connected clients
                // This could be enhanced to send to specific administrators
            }
        }
    }

    /**
     * Utility methods
     */
    updateMapCounter(map, key) {
        map.set(key, (map.get(key) || 0) + 1);
    }

    calculateErrorRate() {
        const totalRequests = this.metrics.httpRequests.total;
        if (totalRequests === 0) return 0;
        
        let errorCount = 0;
        for (const [status, count] of this.metrics.httpRequests.byStatus) {
            if (status >= 400) {
                errorCount += count;
            }
        }
        
        return errorCount / totalRequests;
    }

    calculateSlowQueryRate() {
        const totalQueries = this.metrics.database.totalQueries;
        if (totalQueries === 0) return 0;
        
        return this.metrics.database.slowQueries / totalQueries;
    }

    calculateRequestsPerMinute() {
        // This would need to be calculated based on time windows
        // For now, returning a simple estimate
        return this.metrics.httpRequests.total;
    }

    calculateQueriesPerMinute() {
        // This would need to be calculated based on time windows
        // For now, returning a simple estimate
        return this.metrics.database.totalQueries;
    }

    calculateHealthScore() {
        let score = 100;
        
        // Deduct points for various issues
        if (this.metrics.httpRequests.avgResponseTime > 1000) score -= 10;
        if (this.calculateErrorRate() > 0.01) score -= 20;
        if (this.calculateSlowQueryRate() > 0.05) score -= 15;
        if (this.metrics.system.eventLoopLag > 50) score -= 10;
        
        return Math.max(0, score);
    }

    async persistMetrics() {
        try {
            // Store metrics in database for historical analysis
            const metricsJson = JSON.stringify(this.metrics);
            
            db.run(`
                INSERT INTO performance_metrics (
                    host_id, metric_category, metric_name, metric_value,
                    processing_time_ms, measured_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
                null, // System-wide metrics
                'system_performance',
                'comprehensive_metrics',
                null,
                this.metrics.httpRequests.avgResponseTime,
                new Date().toISOString()
            ]);
            
        } catch (error) {
            logger.error('Failed to persist metrics:', error);
        }
    }

    async recordSlowQuery(sql, duration, error) {
        try {
            db.run(`
                INSERT INTO performance_metrics (
                    metric_category, metric_name, processing_time_ms,
                    error_details, measured_at
                ) VALUES (?, ?, ?, ?, ?)
            `, [
                'database_performance',
                'slow_query',
                duration,
                error ? error.message : null,
                new Date().toISOString()
            ]);
        } catch (err) {
            logger.error('Failed to record slow query:', err);
        }
    }

    recordHttpRequest(entry) {
        // Process performance entry for HTTP requests
        logger.debug('HTTP request performance entry:', {
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime
        });
    }

    recordDatabaseQuery(entry) {
        // Process performance entry for database queries
        logger.debug('Database query performance entry:', {
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime
        });
    }

    getMetrics() {
        return { ...this.metrics };
    }

    reset() {
        // Reset counters but keep configuration
        this.metrics.httpRequests.total = 0;
        this.metrics.httpRequests.slowRequests = 0;
        this.metrics.httpRequests.byMethod.clear();
        this.metrics.httpRequests.byRoute.clear();
        this.metrics.httpRequests.byStatus.clear();
        
        this.metrics.database.totalQueries = 0;
        this.metrics.database.slowQueries = 0;
        this.metrics.database.queryErrors = 0;
        
        this.requestTimes = [];
        this.queryTimes = [];
        
        logger.info('Performance metrics reset');
    }

    shutdown() {
        logger.info('Shutting down performance monitor...');
        
        this.observers.forEach(observer => {
            observer.disconnect();
        });
        this.observers = [];
        
        this.enabled = false;
        
        logger.info('Performance monitor shut down successfully');
    }
}

// Express middleware for automatic request tracking
function createPerformanceMiddleware(monitor) {
    return (req, res, next) => {
        const trackingData = monitor.startRequest(req);
        
        // Store tracking data in request for access in other middleware
        req.performanceTracking = trackingData;
        
        // Override res.end to capture response
        const originalEnd = res.end;
        res.end = function(...args) {
            monitor.endRequest(trackingData, res);
            originalEnd.apply(this, args);
        };
        
        // Handle errors
        res.on('error', (error) => {
            monitor.endRequest(trackingData, res, error);
        });
        
        next();
    };
}

module.exports = { PerformanceMonitor, createPerformanceMiddleware };