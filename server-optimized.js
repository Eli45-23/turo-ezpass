require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const winston = require('winston');

// Import scalability services
const DatabasePool = require('./services/database-pool');
const { CacheManager } = require('./services/cache-manager');
const { PerformanceMonitor, createPerformanceMiddleware } = require('./services/performance-monitor');
const WebSocketManager = require('./services/websocket-manager');
const JobQueueManager = require('./services/job-queue');
const OptimizedScraperManager = require('./services/optimized-scraper');
const { router: healthRouter, healthCheckService } = require('./routes/health');

// Security middleware imports
const { 
    helmetConfig, 
    generalLimiter, 
    logSecurityEvent 
} = require('./middleware/security');

// Configure main logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({ 
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Ensure logs directory exists
if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
}

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Global service references
let databasePool;
let cacheManager;
let performanceMonitor;
let websocketManager;
let jobQueueManager;
let scraperManager;

// Validate required environment variables
function validateEnvironment() {
    const required = ['SESSION_SECRET', 'ENCRYPTION_MASTER_KEY'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        logger.error('❌ Missing required environment variables:', missing);
        logger.error('🔧 Please copy .env.example to .env and configure the required variables');
        process.exit(1);
    }
    
    // Validate key lengths
    if (process.env.SESSION_SECRET.length < 32) {
        logger.error('❌ SESSION_SECRET must be at least 32 characters long');
        process.exit(1);
    }
    
    if (process.env.ENCRYPTION_MASTER_KEY.length < 32) {
        logger.error('❌ ENCRYPTION_MASTER_KEY must be at least 32 characters long');
        process.exit(1);
    }
}

// Initialize all scalability services
async function initializeServices() {
    try {
        logger.info('🚀 Initializing scalability services...');
        
        // 1. Database Pool
        logger.info('📊 Initializing database connection pool...');
        databasePool = new DatabasePool({
            maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
            minConnections: parseInt(process.env.DB_MIN_CONNECTIONS) || 5
        });
        global.databasePool = databasePool;
        
        // 2. Cache Manager
        logger.info('🗄️ Initializing cache manager...');
        cacheManager = new CacheManager({
            redisUrl: process.env.REDIS_URL,
            defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 300
        });
        global.cacheManager = cacheManager;
        
        // Register cache warming strategies
        cacheManager.registerWarmingStrategy('dashboard', async (cache) => {
            logger.info('🔥 Warming dashboard cache...');
            // Pre-warm common dashboard queries
            const { db } = require('./config/database');
            
            db.all('SELECT DISTINCT host_id FROM hosts WHERE id IS NOT NULL', [], async (err, hosts) => {
                if (!err && hosts) {
                    for (const host of hosts.slice(0, 10)) { // Warm top 10 hosts
                        try {
                            const { CacheKeys } = require('./services/cache-manager');
                            const cacheKey = CacheKeys.dashboardSummary(host.host_id);
                            
                            // This will cache the result for future requests
                            await cache.getOrSet(cacheKey, async () => {
                                // Simplified warm-up query
                                return {
                                    totalTrips: 0,
                                    activeTollAccounts: 0,
                                    pendingCharges: 0,
                                    totalRevenue: 0,
                                    lastUpdated: new Date().toISOString()
                                };
                            }, 300);
                        } catch (error) {
                            logger.warn(`Cache warming failed for host ${host.host_id}:`, error.message);
                        }
                    }
                }
            });
        });
        
        // 3. Performance Monitor
        logger.info('📈 Initializing performance monitor...');
        performanceMonitor = new PerformanceMonitor({
            enabled: process.env.PERFORMANCE_MONITORING !== 'false',
            sampleRate: parseFloat(process.env.PERFORMANCE_SAMPLE_RATE) || 1.0
        });
        global.performanceMonitor = performanceMonitor;
        
        // 4. WebSocket Manager
        logger.info('📡 Initializing WebSocket manager...');
        websocketManager = new WebSocketManager(server, {
            maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS) || 1000,
            maxConnectionsPerIP: parseInt(process.env.WS_MAX_CONNECTIONS_PER_IP) || 10
        });
        global.websocketManager = websocketManager;
        
        // Set up WebSocket event handlers
        websocketManager.on('authenticated', ({ connectionId, hostId }) => {
            logger.info(`WebSocket authenticated: ${connectionId} for host ${hostId}`);
        });
        
        // 5. Job Queue Manager
        logger.info('⚙️ Initializing job queue manager...');
        jobQueueManager = new JobQueueManager({
            redisUrl: process.env.REDIS_URL
        });
        global.jobQueueManager = jobQueueManager;
        
        // 6. Optimized Scraper Manager
        logger.info('🕷️ Initializing optimized scraper manager...');
        scraperManager = new OptimizedScraperManager({
            maxBrowsers: parseInt(process.env.SCRAPER_MAX_BROWSERS) || 3,
            headless: process.env.SCRAPER_HEADLESS !== 'false'
        });
        global.scraperManager = scraperManager;
        
        logger.info('✅ All scalability services initialized successfully');
        
        // Warm up caches
        setTimeout(async () => {
            try {
                await cacheManager.warmCache('dashboard');
                logger.info('🔥 Cache warming completed');
            } catch (error) {
                logger.warn('Cache warming failed:', error.message);
            }
        }, 5000); // Wait 5 seconds after startup
        
    } catch (error) {
        logger.error('❌ Failed to initialize scalability services:', error);
        throw error;
    }
}

// Global function to send messages to hosts (for backward compatibility)
global.sendToHost = (hostId, message) => {
    if (websocketManager) {
        return websocketManager.sendToHost(hostId, message);
    }
    logger.warn(`No WebSocket manager available to send message to host ${hostId}`);
    return { sent: 0, failed: 1 };
};

// Validate environment in production
if (process.env.NODE_ENV === 'production') {
    validateEnvironment();
}

// Security middleware (order matters!)
app.use(helmetConfig);
app.use(generalLimiter);
app.use(cookieParser());

// Performance monitoring middleware (applied early)
app.use((req, res, next) => {
    if (performanceMonitor) {
        const middleware = createPerformanceMiddleware(performanceMonitor);
        middleware(req, res, next);
    } else {
        next();
    }
});

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static('public'));

// Session configuration with security hardening
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'turo.toll.sid',
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
    },
    genid: () => {
        return crypto.randomBytes(32).toString('hex');
    }
}));

// Generate CSRF tokens for sessions
app.use((req, res, next) => {
    if (req.session && !req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    next();
});

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard-optimized'); // Use optimized version
const { router: tollRoutes } = require('./routes/tolls');
const invoiceRoutes = require('./routes/invoices');
const turoSyncRoutes = require('./routes/turo-sync');
const transponderRoutes = require('./routes/transponders');
const dataIntegrityRoutes = require('./routes/data-integrity');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');

// Database initialization
const db = require('./config/database');
db.initialize();

// Initialize Data Integrity System
const DataIntegrityManager = require('./services/data-integrity-manager');
const dataIntegrityManager = new DataIntegrityManager();
global.dataIntegrityManager = dataIntegrityManager;

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tolls', tollRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/turo-sync', turoSyncRoutes);
app.use('/api/transponders', transponderRoutes);
app.use('/api/data-integrity', dataIntegrityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check and monitoring routes
app.use('/api/health', healthRouter);
app.use('/health', healthRouter); // Alternative path

// Main page route
app.get('/', (req, res) => {
    if (req.session.hostId) {
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Status endpoint with comprehensive system information
app.get('/status', async (req, res) => {
    try {
        const status = {
            service: 'Turo Toll Tracker',
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            services: {
                database: databasePool ? databasePool.getMetrics() : null,
                cache: cacheManager ? cacheManager.getStats() : null,
                performance: performanceMonitor ? performanceMonitor.getMetrics() : null,
                websocket: websocketManager ? websocketManager.getMetrics() : null,
                jobQueue: jobQueueManager ? jobQueueManager.getMetrics() : null,
                scraper: scraperManager ? scraperManager.getMetrics() : null
            },
            lastHealthCheck: healthCheckService ? healthCheckService.getLastHealthCheck() : null
        };
        
        res.json(status);
    } catch (error) {
        logger.error('Status endpoint error:', error);
        res.status(500).json({
            service: 'Turo Toll Tracker',
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error:', error);
    
    if (performanceMonitor) {
        performanceMonitor.endRequest(req.performanceTracking, res, error);
    }
    
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Initialize services and start server
async function startServer() {
    try {
        // Initialize all scalability services
        await initializeServices();
        
        // Initialize data integrity system
        await dataIntegrityManager.initialize();
        
        // Initialize scheduler for automatic tasks
        const SchedulerService = require('./services/scheduler');
        const scheduler = new SchedulerService();
        scheduler.start();
        
        // Initialize automated reporting service
        const automatedReporting = require('./services/automated-reporting');
        await automatedReporting.initialize();
        
        // Start server
        server.listen(PORT, () => {
            logger.info('🚗 Turo Toll Tracker started successfully!');
            logger.info(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
            logger.info(`🔐 Login: http://localhost:${PORT}/`);
            logger.info(`📡 WebSocket server: ws://localhost:${PORT}`);
            logger.info(`🏥 Health checks: http://localhost:${PORT}/health`);
            logger.info(`📈 Metrics: http://localhost:${PORT}/api/health/metrics`);
            logger.info(`📋 Status: http://localhost:${PORT}/status`);
            logger.info(`🔒 Data Integrity System: ACTIVE`);
            logger.info('✅ All systems operational and ready for production scale!');
            
            // Log service status
            logger.info('📊 Service Status:', {
                database: !!databasePool,
                cache: !!cacheManager,
                performance: !!performanceMonitor,
                websocket: !!websocketManager,
                jobQueue: !!jobQueueManager,
                scraper: !!scraperManager
            });
        });
        
    } catch (error) {
        logger.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown handling
async function gracefulShutdown(signal) {
    logger.info(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    const shutdownTimeout = setTimeout(() => {
        logger.error('❌ Forced shutdown after timeout');
        process.exit(1);
    }, 30000); // 30 second timeout
    
    try {
        // Stop accepting new connections
        server.close();
        
        // Shutdown services in reverse order of initialization
        if (scraperManager) {
            logger.info('🕷️ Shutting down scraper manager...');
            await scraperManager.shutdown();
        }
        
        if (jobQueueManager) {
            logger.info('⚙️ Shutting down job queue manager...');
            await jobQueueManager.shutdown();
        }
        
        if (websocketManager) {
            logger.info('📡 Shutting down WebSocket manager...');
            await websocketManager.shutdown();
        }
        
        if (performanceMonitor) {
            logger.info('📈 Shutting down performance monitor...');
            performanceMonitor.shutdown();
        }
        
        if (cacheManager) {
            logger.info('🗄️ Shutting down cache manager...');
            await cacheManager.shutdown();
        }
        
        if (databasePool) {
            logger.info('📊 Shutting down database pool...');
            await databasePool.shutdown();
        }
        
        if (global.dataIntegrityManager) {
            logger.info('🔒 Shutting down data integrity manager...');
            await global.dataIntegrityManager.shutdown();
        }
        
        clearTimeout(shutdownTimeout);
        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
        
    } catch (error) {
        logger.error('❌ Error during shutdown:', error);
        clearTimeout(shutdownTimeout);
        process.exit(1);
    }
}

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

// Start the server
startServer();

module.exports = app;