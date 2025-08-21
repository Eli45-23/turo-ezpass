require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

// Security middleware imports
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

// Validate required environment variables
function validateEnvironment() {
    const required = ['SESSION_SECRET', 'ENCRYPTION_MASTER_KEY'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:', missing.join(', '));
        console.error('🔧 Please copy .env.example to .env and configure the required variables');
        if (process.env.NODE_ENV === 'production') {
            console.error('🚫 Production deployment cannot continue without proper configuration');
        }
        process.exit(1);
    }
    
    // Validate key lengths
    if (process.env.SESSION_SECRET.length < 32) {
        console.error('❌ SESSION_SECRET must be at least 32 characters long');
        process.exit(1);
    }
    
    if (process.env.ENCRYPTION_MASTER_KEY.length < 32) {
        console.error('❌ ENCRYPTION_MASTER_KEY must be at least 32 characters long');
        process.exit(1);
    }
    
    // Additional production-specific validations
    if (process.env.NODE_ENV === 'production') {
        console.log('✅ Environment validation passed for production');
        
        // Warn about missing optional but recommended variables
        const recommended = ['BASE_URL', 'EMAIL_HOST', 'EMAIL_USER'];
        const missingRecommended = recommended.filter(key => !process.env[key]);
        if (missingRecommended.length > 0) {
            console.warn('⚠️ Recommended environment variables not set:', missingRecommended.join(', '));
            console.warn('💡 Some features may not work optimally without these variables');
        }
    }
}

// Validate environment (always run, but different behavior per environment)
validateEnvironment();

// WebSocket server for real-time communication
const wss = new WebSocket.Server({ server });

// Store WebSocket connections by host ID for targeted messaging
const wsConnections = new Map();
const wsConnectionCount = new Map(); // Track connections per IP
const wsPendingMessages = new Map(); // Store pending messages for reconnection

wss.on('connection', (ws, req) => {
    const clientIP = req.connection.remoteAddress;
    
    // Rate limit WebSocket connections per IP
    const currentConnections = wsConnectionCount.get(clientIP) || 0;
    if (currentConnections >= (process.env.WS_MAX_CONNECTIONS || 5)) {
        logSecurityEvent('WEBSOCKET_RATE_LIMIT', {
            ip: clientIP,
            userAgent: req.headers['user-agent'],
            connectionCount: currentConnections
        });
        ws.close(1008, 'Too many connections');
        return;
    }
    
    wsConnectionCount.set(clientIP, currentConnections + 1);
    console.log(`📡 New WebSocket connection from ${clientIP}`);
    
    let isAuthenticated = false;
    let hostId = null;
    
    // Set up connection timeout - increased for better stability
    const authTimeout = setTimeout(() => {
        if (!isAuthenticated) {
            logSecurityEvent('WEBSOCKET_AUTH_TIMEOUT', {
                ip: clientIP,
                userAgent: req.headers['user-agent']
            });
            ws.close(1008, 'Authentication timeout');
        }
    }, 60000); // 60 second timeout for better stability
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'authenticate' && data.hostId) {
                // Simplified authentication - just check hostId is provided
                if (data.hostId) {
                    hostId = data.hostId;
                    isAuthenticated = true;
                    clearTimeout(authTimeout);
                    
                    // Associate this WebSocket with the host ID
                    wsConnections.set(data.hostId, ws);
                    
                    logSecurityEvent('WEBSOCKET_AUTHENTICATED', {
                        ip: clientIP,
                        userAgent: req.headers['user-agent'],
                        hostId: data.hostId
                    });
                    
                    console.log(`🔐 WebSocket authenticated for host ${data.hostId}`);
                    
                    ws.send(JSON.stringify({
                        type: 'authenticated',
                        message: 'WebSocket connection established'
                    }));
                    
                    // Heartbeat disabled to improve connection stability
                    // const heartbeatInterval = setInterval(() => {
                    //     if (ws.readyState === WebSocket.OPEN) {
                    //         ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
                    //     } else {
                    //         clearInterval(heartbeatInterval);
                    //     }
                    // }, 30000); // Send heartbeat every 30 seconds
                    
                    // Store heartbeat interval for cleanup
                    // ws.heartbeatInterval = heartbeatInterval;
                    
                    // Send any pending messages for this host
                    const pendingMessages = wsPendingMessages.get(data.hostId);
                    if (pendingMessages && pendingMessages.length > 0) {
                        console.log(`📜 Sending ${pendingMessages.length} pending messages to host ${data.hostId}`);
                        pendingMessages.forEach(message => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify(message));
                                console.log(`✅ Sent pending message:`, message.type);
                            }
                        });
                        // Clear sent messages
                        wsPendingMessages.delete(data.hostId);
                    }
                }
            } else if (data.type === 'ping' && isAuthenticated) {
                // Handle health check pings
                ws.send(JSON.stringify({
                    type: 'pong',
                    timestamp: Date.now()
                }));
            } else if (data.type === 'heartbeat_ack' && isAuthenticated) {
                // Handle heartbeat acknowledgments from client
                console.log(`💗 Received heartbeat ack from host ${hostId}`);
                // No response needed - just log for debugging
            } else if (data.type === 'test' && isAuthenticated) {
                // Handle test messages for debugging
                console.log('📡 Received test message from host:', hostId);
                ws.send(JSON.stringify({
                    type: 'test_response',
                    message: 'Test message received successfully'
                }));
            } else if (!isAuthenticated) {
                logSecurityEvent('WEBSOCKET_UNAUTH_MESSAGE', {
                    ip: clientIP,
                    userAgent: req.headers['user-agent'],
                    messageType: data.type
                });
                ws.close(1008, 'Authentication required');
            }
        } catch (error) {
            console.error('❌ Error processing WebSocket message:', error);
            logSecurityEvent('WEBSOCKET_MESSAGE_ERROR', {
                ip: clientIP,
                userAgent: req.headers['user-agent'],
                error: error.message
            });
        }
    });
    
    ws.on('close', () => {
        // Clean up connection when client disconnects
        clearTimeout(authTimeout);
        
        // Clean up heartbeat interval (currently disabled)
        // if (ws.heartbeatInterval) {
        //     clearInterval(ws.heartbeatInterval);
        // }
        
        // Decrement connection count
        const currentCount = wsConnectionCount.get(clientIP) || 1;
        if (currentCount <= 1) {
            wsConnectionCount.delete(clientIP);
        } else {
            wsConnectionCount.set(clientIP, currentCount - 1);
        }
        
        // Remove from active connections
        if (hostId) {
            wsConnections.delete(hostId);
            console.log(`🔌 WebSocket disconnected for host ${hostId}`);
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        logSecurityEvent('WEBSOCKET_ERROR', {
            ip: clientIP,
            userAgent: req.headers['user-agent'],
            error: error.message,
            hostId: hostId
        });
    });
});

// Function to send real-time updates to specific host
function sendToHost(hostId, message) {
    const ws = wsConnections.get(hostId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        console.log(`📤 Sent WebSocket message to host ${hostId}:`, message);
        return true;
    }
    
    // For critical messages (like verification_required), queue them for later delivery
    const criticalMessageTypes = ['verification_required', 'verification_complete', 'sync_status', 'matching-progress', 'matching-complete'];
    if (criticalMessageTypes.includes(message.type)) {
        if (!wsPendingMessages.has(hostId)) {
            wsPendingMessages.set(hostId, []);
        }
        const pendingQueue = wsPendingMessages.get(hostId);
        
        // For matching messages, keep all progress updates in sequence
        if (message.type === 'matching-progress' || message.type === 'matching-complete') {
            pendingQueue.push(message);
            console.log(`📜 Queued ${message.type} message for host ${hostId} (progress: ${message.progress || 'N/A'}%)`);
        } else {
            // For other messages, avoid duplicates by checking if same type already exists
            const existingIndex = pendingQueue.findIndex(m => m.type === message.type);
            if (existingIndex >= 0) {
                // Replace existing message of same type with newer one
                pendingQueue[existingIndex] = message;
                console.log(`📜 Updated pending ${message.type} message for host ${hostId}`);
            } else {
                pendingQueue.push(message);
                console.log(`📜 Queued critical ${message.type} message for host ${hostId}`);
            }
        }
        
        // Limit queue size to prevent memory issues (larger limit for matching messages)
        const maxQueueSize = (message.type === 'matching-progress' || message.type === 'matching-complete') ? 20 : 10;
        if (pendingQueue.length > maxQueueSize) {
            pendingQueue.shift(); // Remove oldest message
        }
        
        return true; // Message was queued successfully
    }
    
    console.log(`⚠️ No active WebSocket connection for host ${hostId}`);
    return false;
}

// Make sendToHost available globally for other modules
global.sendToHost = sendToHost;

// Make sendToHost available to Express routes
app.set('sendToHost', sendToHost);

// Security middleware (order matters!)
app.use(helmetConfig);
app.use(enhancedGeneralLimiter);
app.use(cookieParser());

// Enhanced XSS prevention middleware
app.use(enhancedCSP);
app.use(sanitizeJSONResponse);

// Trust proxy for accurate IP addresses (essential for production behind reverse proxy)
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files with cache control
app.use(express.static('public', {
    setHeaders: (res, path) => {
        // Force no cache for HTML files to fix Safari caching issues
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('ETag', Date.now().toString());
        }
        // Allow caching for other assets but with validation
        else {
            res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
        }
    }
}));

// Session configuration with environment-aware security
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'connect.sid',
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // HTTPS in production, HTTP in development
        httpOnly: true, // Prevent XSS
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax' // Strict security in production
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

// Routes - Choose auth system based on environment
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';
console.log(`🔐 Authentication system: ${USE_SUPABASE ? 'Supabase' : 'SQLite + Express Sessions'}`);
const authRoutes = USE_SUPABASE 
    ? require('./routes/auth_supabase')
    : require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const { router: tollRoutes } = require('./routes/tolls');
const invoiceRoutes = require('./routes/invoices');
const tripsRoutes = require('./routes/trips');
const turoSyncRoutes = require('./routes/turo-sync');
const transponderRoutes = require('./routes/transponders');
const dataIntegrityRoutes = require('./routes/data-integrity');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const mlMatchingRoutes = require('./routes/ml-matching');
const mlTrainingRoutes = require('./routes/ml-training');
const backupRoutes = require('./routes/backup');

// Database initialization
const db = require('./config/database');
db.initialize();

// Initialize Data Integrity System
const DataIntegrityManager = require('./services/data-integrity-manager');
const dataIntegrityManager = new DataIntegrityManager();

// Make data integrity manager globally available
global.dataIntegrityManager = dataIntegrityManager;

// Initialize data integrity system
dataIntegrityManager.initialize().catch(error => {
    console.error('❌ Critical: Data Integrity System initialization failed:', error);
    process.exit(1);
});

// Initialize scheduler for automatic tasks
const SchedulerService = require('./services/scheduler');
const scheduler = new SchedulerService();
scheduler.start();

// Initialize automated reporting service
const automatedReporting = require('./services/automated-reporting');
automatedReporting.initialize().catch(console.error);

// Initialize backup service with automatic scheduling
const BackupService = require('./services/backup-service');
const backupService = new BackupService();
const backupSchedule = backupService.scheduleAutomaticBackups();

// Make backup service available globally
global.backupService = backupService;

// Dashboard redirect for user convenience
app.get('/dashboard', (req, res) => {
    res.redirect('/dashboard.html');
});

// API Routes with specific rate limiting
app.use('/api/auth', authRoutes); // Auth routes already have their own limiter
app.use('/api/dashboard', dashboardLimiter, dashboardRoutes);
app.use('/api/tolls', tollOperationsLimiter, tollRoutes);
app.use('/api/invoices', invoiceLimiter, invoiceRoutes);
app.use('/api/trips', dashboardLimiter, tripsRoutes);
app.use('/api/turo-sync', csvUploadLimiter, turoSyncRoutes);
app.use('/api/transponders', tollOperationsLimiter, transponderRoutes);
app.use('/api/data-integrity', dashboardLimiter, dataIntegrityRoutes);
app.use('/api/notifications', notificationLimiter, notificationRoutes);
app.use('/api/analytics', analyticsLimiter, analyticsRoutes);
app.use('/api/toll-analytics', analyticsLimiter, require('./routes/toll-analytics'));
app.use('/api/enhanced-smart-status', dashboardLimiter, require('./routes/enhanced-smart-status'));
app.use('/api/ml-matching', mlOperationsLimiter, mlMatchingRoutes);
app.use('/api/ml-training', mlOperationsLimiter, mlTrainingRoutes);
app.use('/api/backup', dashboardLimiter, backupRoutes);

// Main page route
app.get('/', (req, res) => {
    if (req.session.hostId) {
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'Turo Toll Tracker',
        timestamp: new Date().toISOString()
    });
});

// Start server with WebSocket support
server.listen(PORT, () => {
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    console.log(`🚗 Turo Toll Tracker running on ${baseUrl}`);
    console.log(`📊 Dashboard: ${baseUrl}/dashboard`);
    console.log(`🔐 Login: ${baseUrl}/`);
    console.log(`📡 WebSocket server running on ${baseUrl.replace('http', 'ws')}`);
    console.log(`🔒 Data Integrity System: ACTIVE`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    if (process.env.NODE_ENV === 'production') {
        console.log('✅ Production mode: Enhanced security enabled');
    } else {
        console.log('🔧 Development mode: Relaxed rate limiting');
    }
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    
    try {
        // Shutdown data integrity system
        if (global.dataIntegrityManager) {
            await global.dataIntegrityManager.shutdown();
        }
        
        // Close server
        server.close(() => {
            console.log('✅ Server closed successfully');
            process.exit(0);
        });
        
        // Force close after timeout
        setTimeout(() => {
            console.log('❌ Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
        
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    
    try {
        if (global.dataIntegrityManager) {
            await global.dataIntegrityManager.shutdown();
        }
        
        server.close(() => {
            console.log('✅ Server closed successfully');
            process.exit(0);
        });
        
        setTimeout(() => {
            console.log('❌ Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
        
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

module.exports = app;