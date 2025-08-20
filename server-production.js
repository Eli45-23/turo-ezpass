require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

// Import database configuration (supports both SQLite and PostgreSQL)
const { db, dbType, isDatabaseURL } = require('./config/database-production');
const { createAuthMiddleware, AUTH_CONFIG } = require('./config/auth-production');

// Security middleware
const { 
    helmetConfig, 
    generalLimiter,
    enhancedGeneralLimiter,
    csvUploadLimiter,
    tollOperationsLimiter,
    dashboardLimiter,
    analyticsLimiter,
    invoiceLimiter,
    mlOperationsLimiter,
    notificationLimiter,
    logSecurityEvent,
    sanitizeJSONResponse,
    enhancedCSP
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Initialize authentication middleware
const authMiddleware = createAuthMiddleware(db);

console.log('🚀 Starting Turo Toll Tracker in production mode...');
console.log(`📊 Database: ${dbType.toUpperCase()}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV}`);

// Production security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// Compression middleware for better performance
app.use(compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    },
    level: 6,
    threshold: 1024
}));

// Request logging
if (process.env.NODE_ENV === 'production') {
    app.use(morgan('combined', {
        skip: (req, res) => res.statusCode < 400
    }));
} else {
    app.use(morgan('dev'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session configuration for production
app.use(session({
    ...AUTH_CONFIG.session,
    store: isDatabaseURL ? undefined : undefined, // TODO: Add Redis session store for production
    genid: () => require('crypto').randomBytes(16).toString('hex')
}));

// CSRF protection
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.session.csrfToken) {
        req.session.csrfToken = authMiddleware.generateCSRFToken(req);
    }
    next();
});

// Rate limiting
app.use('/api/auth', generalLimiter);
app.use('/api/dashboard', dashboardLimiter);
app.use('/api/analytics', analyticsLimiter);
app.use('/api/tolls', tollOperationsLimiter);
app.use('/api/invoices', invoiceLimiter);
app.use('/api/csv', csvUploadLimiter);
app.use('/api/ml', mlOperationsLimiter);
app.use('/api/notifications', notificationLimiter);

// Session cleanup middleware
app.use(authMiddleware.sessionCleanup);

// Serve static files with caching
app.use(express.static('public', {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    lastModified: true
}));

// Health check endpoint (no authentication required)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'Turo Toll Tracker',
        version: require('./package.json').version,
        database: dbType,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
});

// API Routes with authentication
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const tripsRoutes = require('./routes/trips');
const tollsRoutes = require('./routes/tolls');
const invoicesRoutes = require('./routes/invoices');
const analyticsRoutes = require('./routes/analytics');
const transpondersRoutes = require('./routes/transponders');

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', authMiddleware.requireAuth, dashboardRoutes);
app.use('/api/trips', authMiddleware.requireAuth, tripsRoutes);
app.use('/api/tolls', authMiddleware.requireAuth, tollsRoutes);
app.use('/api/invoices', authMiddleware.requireAuth, invoicesRoutes);
app.use('/api/analytics', authMiddleware.requireAuth, analyticsRoutes);
app.use('/api/transponders', authMiddleware.requireAuth, transpondersRoutes);

// Health monitoring endpoints
app.get('/api/health/detailed', authMiddleware.requireAuth, async (req, res) => {
    try {
        // Check database connection
        const dbHealthy = await checkDatabaseHealth();
        
        // System metrics
        const systemMetrics = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            nodeVersion: process.version,
            platform: process.platform
        };

        res.json({
            status: dbHealthy ? 'healthy' : 'degraded',
            database: {
                type: dbType,
                healthy: dbHealthy
            },
            system: systemMetrics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: 'Health check failed',
            timestamp: new Date().toISOString()
        });
    }
});

// Database health check function
async function checkDatabaseHealth() {
    try {
        if (dbType === 'postgresql') {
            await db.query('SELECT 1');
        } else {
            await db.get('SELECT 1');
        }
        return true;
    } catch (error) {
        console.error('Database health check failed:', error);
        return false;
    }
}

// Serve SPA routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', authMiddleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/trips', authMiddleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'trips.html'));
});

app.get('/analytics', authMiddleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

app.get('/invoices', authMiddleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'invoices.html'));
});

app.get('/transponders', authMiddleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'transponders.html'));
});

app.get('/upload', authMiddleware.requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// WebSocket server setup
const wss = new WebSocket.Server({ 
    server,
    verifyClient: (info) => {
        // Basic WebSocket authentication
        // In production, you might want to verify the session here
        return true;
    }
});

wss.on('connection', (ws, req) => {
    console.log('🔗 New WebSocket connection');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 WebSocket message received:', data);
            
            // Handle different message types
            switch (data.type) {
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;
                case 'subscribe':
                    // Handle subscription to real-time updates
                    ws.send(JSON.stringify({ type: 'subscribed', channel: data.channel }));
                    break;
                default:
                    console.log('Unknown WebSocket message type:', data.type);
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        console.log('❌ WebSocket connection closed');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to Turo Toll Tracker',
        timestamp: Date.now()
    }));
});

// Global error handlers
app.use((err, req, res, next) => {
    console.error('🚨 Unhandled error:', err);
    
    // Log security-sensitive errors
    if (err.type === 'entity.too.large') {
        logSecurityEvent('REQUEST_TOO_LARGE', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            contentLength: req.get('Content-Length')
        }, 'MEDIUM');
    }

    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not found',
        path: req.path
    });
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    
    // Close WebSocket server
    wss.close(() => {
        console.log('🔌 WebSocket server closed');
    });
    
    // Close HTTP server
    server.close(() => {
        console.log('🌐 HTTP server closed');
    });
    
    // Close database connection
    try {
        await db.close();
        console.log('💾 Database connection closed');
    } catch (error) {
        console.error('Error closing database:', error);
    }
    
    console.log('👋 Graceful shutdown complete');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    // Same shutdown process as SIGINT
    process.emit('SIGINT');
});

// Unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Promise Rejection:', reason);
    console.error('Promise:', promise);
});

process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    process.exit(1);
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎉 Turo Toll Tracker is running!`);
    console.log(`🌐 Server: http://0.0.0.0:${PORT}`);
    console.log(`🏠 Local: http://localhost:${PORT}`);
    console.log(`🔐 Login: http://localhost:${PORT}/`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`📡 WebSocket: ws://localhost:${PORT}`);
    console.log(`💾 Database: ${dbType.toUpperCase()}`);
    console.log(`🔒 Environment: ${process.env.NODE_ENV}`);
    
    if (process.env.NODE_ENV === 'production') {
        console.log(`🌍 Production URL: https://turoezpass.com`);
    }
});

module.exports = { app, server, wss };