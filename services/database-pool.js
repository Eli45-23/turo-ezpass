const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const winston = require('winston');

// Configure logger for database operations
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/database.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

/**
 * SQLite Connection Pool Manager
 * Optimizes database connections for high-concurrency operations
 */
class DatabasePool {
    constructor(options = {}) {
        this.dbPath = options.dbPath || path.join(__dirname, '..', 'turo_tolls.db');
        this.maxConnections = options.maxConnections || 20;
        this.minConnections = options.minConnections || 5;
        this.acquireTimeout = options.acquireTimeout || 10000;
        this.idleTimeout = options.idleTimeout || 300000; // 5 minutes
        
        this.pool = [];
        this.activeConnections = new Set();
        this.waitingQueue = [];
        this.metrics = {
            totalConnections: 0,
            activeConnections: 0,
            waitingCount: 0,
            totalQueries: 0,
            slowQueries: 0,
            errors: 0,
            avgQueryTime: 0
        };
        
        this.queryTimes = [];
        this.maxQueryTimeHistory = 1000;
        
        // Initialize minimum connections
        this.initialize();
        
        // Start metrics collection
        setInterval(() => this.collectMetrics(), 30000); // Every 30 seconds
    }

    async initialize() {
        try {
            // Create minimum number of connections
            for (let i = 0; i < this.minConnections; i++) {
                const connection = await this.createConnection();
                this.pool.push({
                    connection,
                    created: Date.now(),
                    lastUsed: Date.now(),
                    queryCount: 0
                });
            }
            
            logger.info(`Database pool initialized with ${this.minConnections} connections`);
            
            // Enable WAL mode for better concurrency
            const connection = await this.acquire();
            await this.execute(connection, 'PRAGMA journal_mode=WAL');
            await this.execute(connection, 'PRAGMA synchronous=NORMAL');
            await this.execute(connection, 'PRAGMA cache_size=10000');
            await this.execute(connection, 'PRAGMA temp_store=MEMORY');
            await this.execute(connection, 'PRAGMA mmap_size=268435456'); // 256MB
            await this.release(connection);
            
            logger.info('Database optimization settings applied');
            
        } catch (error) {
            logger.error('Failed to initialize database pool:', error);
            throw error;
        }
    }

    createConnection() {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE, (err) => {
                if (err) {
                    logger.error('Failed to create database connection:', err);
                    reject(err);
                } else {
                    // Configure connection for optimal performance
                    db.configure('busyTimeout', 30000); // 30 second timeout
                    
                    // Enable foreign key constraints for this connection
                    db.run('PRAGMA foreign_keys = ON', (fkErr) => {
                        if (fkErr) {
                            logger.error('Failed to enable foreign keys on pooled connection:', fkErr);
                        }
                    });
                    
                    // Add query instrumentation
                    const originalRun = db.run.bind(db);
                    const originalGet = db.get.bind(db);
                    const originalAll = db.all.bind(db);
                    
                    db.run = (sql, params, callback) => {
                        const startTime = Date.now();
                        return originalRun(sql, params, (err, result) => {
                            this.recordQueryTime(Date.now() - startTime, sql);
                            if (callback) callback(err, result);
                        });
                    };
                    
                    db.get = (sql, params, callback) => {
                        const startTime = Date.now();
                        return originalGet(sql, params, (err, result) => {
                            this.recordQueryTime(Date.now() - startTime, sql);
                            if (callback) callback(err, result);
                        });
                    };
                    
                    db.all = (sql, params, callback) => {
                        const startTime = Date.now();
                        return originalAll(sql, params, (err, result) => {
                            this.recordQueryTime(Date.now() - startTime, sql);
                            if (callback) callback(err, result);
                        });
                    };
                    
                    resolve(db);
                }
            });
        });
    }

    async acquire() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection acquire timeout'));
            }, this.acquireTimeout);

            const tryAcquire = () => {
                // Check for available connection in pool
                for (let i = 0; i < this.pool.length; i++) {
                    const poolItem = this.pool[i];
                    if (!this.activeConnections.has(poolItem.connection)) {
                        this.activeConnections.add(poolItem.connection);
                        poolItem.lastUsed = Date.now();
                        poolItem.queryCount++;
                        
                        clearTimeout(timeout);
                        this.metrics.activeConnections = this.activeConnections.size;
                        resolve(poolItem.connection);
                        return;
                    }
                }

                // Create new connection if under max limit
                if (this.pool.length < this.maxConnections) {
                    this.createConnection()
                        .then(connection => {
                            const poolItem = {
                                connection,
                                created: Date.now(),
                                lastUsed: Date.now(),
                                queryCount: 1
                            };
                            
                            this.pool.push(poolItem);
                            this.activeConnections.add(connection);
                            
                            clearTimeout(timeout);
                            this.metrics.totalConnections = this.pool.length;
                            this.metrics.activeConnections = this.activeConnections.size;
                            resolve(connection);
                        })
                        .catch(error => {
                            clearTimeout(timeout);
                            reject(error);
                        });
                    return;
                }

                // Add to waiting queue
                this.waitingQueue.push({ resolve, reject, timeout });
                this.metrics.waitingCount = this.waitingQueue.length;
            };

            tryAcquire();
        });
    }

    release(connection) {
        this.activeConnections.delete(connection);
        this.metrics.activeConnections = this.activeConnections.size;
        
        // Process waiting queue
        if (this.waitingQueue.length > 0) {
            const waiter = this.waitingQueue.shift();
            this.metrics.waitingCount = this.waitingQueue.length;
            
            clearTimeout(waiter.timeout);
            this.activeConnections.add(connection);
            this.metrics.activeConnections = this.activeConnections.size;
            
            // Update last used time
            const poolItem = this.pool.find(item => item.connection === connection);
            if (poolItem) {
                poolItem.lastUsed = Date.now();
                poolItem.queryCount++;
            }
            
            waiter.resolve(connection);
        }
    }

    async execute(connection, sql, params = []) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            connection.run(sql, params, function(err) {
                const queryTime = Date.now() - startTime;
                
                if (err) {
                    logger.error('Query error:', { sql, params, error: err.message, queryTime });
                    reject(err);
                } else {
                    if (queryTime > 1000) { // Log slow queries
                        logger.warn('Slow query detected:', { sql, params, queryTime });
                    }
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async get(connection, sql, params = []) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            connection.get(sql, params, (err, row) => {
                const queryTime = Date.now() - startTime;
                
                if (err) {
                    logger.error('Query error:', { sql, params, error: err.message, queryTime });
                    reject(err);
                } else {
                    if (queryTime > 1000) {
                        logger.warn('Slow query detected:', { sql, params, queryTime });
                    }
                    resolve(row);
                }
            });
        });
    }

    async all(connection, sql, params = []) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            connection.all(sql, params, (err, rows) => {
                const queryTime = Date.now() - startTime;
                
                if (err) {
                    logger.error('Query error:', { sql, params, error: err.message, queryTime });
                    reject(err);
                } else {
                    if (queryTime > 1000) {
                        logger.warn('Slow query detected:', { sql, params, queryTime });
                    }
                    resolve(rows);
                }
            });
        });
    }

    recordQueryTime(duration, sql) {
        this.metrics.totalQueries++;
        
        if (duration > 1000) {
            this.metrics.slowQueries++;
        }
        
        this.queryTimes.push(duration);
        if (this.queryTimes.length > this.maxQueryTimeHistory) {
            this.queryTimes.shift();
        }
        
        // Calculate average query time
        this.metrics.avgQueryTime = this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
    }

    collectMetrics() {
        const now = Date.now();
        
        // Clean up idle connections beyond minimum
        let cleanedUp = 0;
        for (let i = this.pool.length - 1; i >= this.minConnections; i--) {
            const poolItem = this.pool[i];
            
            if (!this.activeConnections.has(poolItem.connection) && 
                (now - poolItem.lastUsed) > this.idleTimeout) {
                
                poolItem.connection.close();
                this.pool.splice(i, 1);
                cleanedUp++;
            }
        }
        
        if (cleanedUp > 0) {
            logger.info(`Cleaned up ${cleanedUp} idle database connections`);
        }
        
        // Update metrics
        this.metrics.totalConnections = this.pool.length;
        this.metrics.activeConnections = this.activeConnections.size;
        this.metrics.waitingCount = this.waitingQueue.length;
        
        // Log metrics
        logger.info('Database pool metrics:', this.metrics);
    }

    getMetrics() {
        return {
            ...this.metrics,
            poolSize: this.pool.length,
            queryTimeP95: this.getPercentile(this.queryTimes, 95),
            queryTimeP99: this.getPercentile(this.queryTimes, 99)
        };
    }

    getPercentile(arr, percentile) {
        if (arr.length === 0) return 0;
        
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index];
    }

    async shutdown() {
        logger.info('Shutting down database pool...');
        
        // Clear waiting queue
        this.waitingQueue.forEach(waiter => {
            clearTimeout(waiter.timeout);
            waiter.reject(new Error('Database pool shutting down'));
        });
        this.waitingQueue = [];
        
        // Close all connections
        const closePromises = this.pool.map(poolItem => {
            return new Promise(resolve => {
                poolItem.connection.close(resolve);
            });
        });
        
        await Promise.all(closePromises);
        this.pool = [];
        this.activeConnections.clear();
        
        logger.info('Database pool shut down successfully');
    }
}

module.exports = DatabasePool;