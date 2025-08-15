const WebSocket = require('ws');
const winston = require('winston');
const { EventEmitter } = require('events');

// Configure logger for WebSocket operations
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/websocket.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

/**
 * Optimized WebSocket Connection Manager
 * Handles connection pooling, load balancing, and real-time communication
 */
class WebSocketManager extends EventEmitter {
    constructor(server, options = {}) {
        super();
        
        this.server = server;
        this.options = {
            maxConnections: options.maxConnections || 1000,
            maxConnectionsPerIP: options.maxConnectionsPerIP || 10,
            heartbeatInterval: options.heartbeatInterval || 30000, // 30 seconds
            connectionTimeout: options.connectionTimeout || 30000, // 30 seconds
            messageRateLimit: options.messageRateLimit || 100, // messages per minute
            maxMessageSize: options.maxMessageSize || 1024 * 1024, // 1MB
            enableCompression: options.enableCompression !== false
        };
        
        // Connection management
        this.connections = new Map(); // connectionId -> connection info
        this.hostConnections = new Map(); // hostId -> Set of connectionIds
        this.ipConnections = new Map(); // IP -> Set of connectionIds
        this.connectionsByRoom = new Map(); // roomId -> Set of connectionIds
        
        // Rate limiting
        this.messageRates = new Map(); // connectionId -> rate limiter
        
        // Metrics
        this.metrics = {
            totalConnections: 0,
            activeConnections: 0,
            totalMessages: 0,
            totalBroadcasts: 0,
            connectionErrors: 0,
            messageErrors: 0,
            rateLimitHits: 0,
            avgMessageSize: 0,
            peakConnections: 0
        };
        
        this.messageSizes = [];
        this.maxMessageHistory = 1000;
        
        // Initialize WebSocket server
        this.wss = new WebSocket.Server({
            server: this.server,
            perMessageDeflate: this.options.enableCompression,
            maxPayload: this.options.maxMessageSize,
            clientTracking: false // We manage connections manually for better control
        });
        
        this.initialize();
    }

    initialize() {
        this.setupWebSocketServer();
        this.startHeartbeat();
        this.startMetricsCollection();
        
        logger.info('WebSocket Manager initialized', {
            maxConnections: this.options.maxConnections,
            heartbeatInterval: this.options.heartbeatInterval,
            enableCompression: this.options.enableCompression
        });
    }

    setupWebSocketServer() {
        this.wss.on('connection', (ws, req) => {
            this.handleNewConnection(ws, req);
        });

        this.wss.on('error', (error) => {
            logger.error('WebSocket server error:', error);
            this.metrics.connectionErrors++;
        });
    }

    handleNewConnection(ws, req) {
        const clientIP = req.connection.remoteAddress || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const connectionId = this.generateConnectionId();
        
        // Check connection limits
        if (!this.canAcceptConnection(clientIP)) {
            logger.warn('Connection rejected - limits exceeded', { clientIP, userAgent });
            ws.close(1008, 'Connection limit exceeded');
            return;
        }
        
        // Create connection info
        const connectionInfo = {
            id: connectionId,
            ws,
            ip: clientIP,
            userAgent,
            connectedAt: Date.now(),
            lastPing: Date.now(),
            lastPong: Date.now(),
            isAuthenticated: false,
            hostId: null,
            rooms: new Set(),
            messageCount: 0,
            bytesReceived: 0,
            bytesSent: 0
        };
        
        // Store connection
        this.connections.set(connectionId, connectionInfo);
        this.addIPConnection(clientIP, connectionId);
        
        // Update metrics
        this.metrics.totalConnections++;
        this.metrics.activeConnections++;
        if (this.metrics.activeConnections > this.metrics.peakConnections) {
            this.metrics.peakConnections = this.metrics.activeConnections;
        }
        
        // Set up connection handlers
        this.setupConnectionHandlers(connectionInfo);
        
        // Set authentication timeout
        const authTimeout = setTimeout(() => {
            if (!connectionInfo.isAuthenticated) {
                logger.warn('Connection authentication timeout', { connectionId, clientIP });
                this.closeConnection(connectionId, 1008, 'Authentication timeout');
            }
        }, this.options.connectionTimeout);
        
        connectionInfo.authTimeout = authTimeout;
        
        logger.info('New WebSocket connection', { connectionId, clientIP, userAgent });
        
        // Emit connection event
        this.emit('connection', {
            connectionId,
            ip: clientIP,
            userAgent
        });
        
        // Send welcome message
        this.sendToConnection(connectionId, {
            type: 'welcome',
            connectionId,
            serverTime: new Date().toISOString()
        });
    }

    setupConnectionHandlers(connectionInfo) {
        const { id: connectionId, ws } = connectionInfo;
        
        ws.on('message', (data) => {
            this.handleMessage(connectionId, data);
        });
        
        ws.on('pong', (data) => {
            connectionInfo.lastPong = Date.now();
        });
        
        ws.on('close', (code, reason) => {
            this.handleConnectionClose(connectionId, code, reason);
        });
        
        ws.on('error', (error) => {
            logger.error('WebSocket connection error', { connectionId, error: error.message });
            this.metrics.connectionErrors++;
            this.closeConnection(connectionId, 1011, 'Internal server error');
        });
    }

    handleMessage(connectionId, data) {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo) return;
        
        try {
            // Update connection stats
            connectionInfo.messageCount++;
            connectionInfo.bytesReceived += data.length;
            this.metrics.totalMessages++;
            
            // Track message size
            this.messageSizes.push(data.length);
            if (this.messageSizes.length > this.maxMessageHistory) {
                this.messageSizes.shift();
            }
            this.metrics.avgMessageSize = this.messageSizes.reduce((a, b) => a + b, 0) / this.messageSizes.length;
            
            // Rate limiting check
            if (!this.checkRateLimit(connectionId)) {
                this.metrics.rateLimitHits++;
                this.sendToConnection(connectionId, {
                    type: 'error',
                    message: 'Rate limit exceeded'
                });
                return;
            }
            
            // Parse message
            const message = JSON.parse(data.toString());
            
            // Handle different message types
            this.processMessage(connectionId, message);
            
        } catch (error) {
            logger.error('Error processing message', { 
                connectionId, 
                error: error.message,
                dataLength: data.length 
            });
            this.metrics.messageErrors++;
            
            this.sendToConnection(connectionId, {
                type: 'error',
                message: 'Invalid message format'
            });
        }
    }

    processMessage(connectionId, message) {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo) return;
        
        switch (message.type) {
            case 'authenticate':
                this.handleAuthentication(connectionId, message);
                break;
                
            case 'join_room':
                this.handleJoinRoom(connectionId, message.room);
                break;
                
            case 'leave_room':
                this.handleLeaveRoom(connectionId, message.room);
                break;
                
            case 'ping':
                this.sendToConnection(connectionId, { type: 'pong', timestamp: Date.now() });
                break;
                
            case 'subscribe':
                this.handleSubscription(connectionId, message.events);
                break;
                
            default:
                // Forward to application handlers
                this.emit('message', {
                    connectionId,
                    hostId: connectionInfo.hostId,
                    message
                });
        }
    }

    handleAuthentication(connectionId, message) {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo || connectionInfo.isAuthenticated) return;
        
        const { hostId, sessionId, token } = message;
        
        // TODO: Implement proper authentication validation
        // For now, just check that hostId is provided
        if (hostId) {
            connectionInfo.isAuthenticated = true;
            connectionInfo.hostId = hostId;
            
            // Clear auth timeout
            if (connectionInfo.authTimeout) {
                clearTimeout(connectionInfo.authTimeout);
                delete connectionInfo.authTimeout;
            }
            
            // Add to host connections
            if (!this.hostConnections.has(hostId)) {
                this.hostConnections.set(hostId, new Set());
            }
            this.hostConnections.get(hostId).add(connectionId);
            
            // Join default room for host
            this.addConnectionToRoom(connectionId, `host:${hostId}`);
            
            logger.info('WebSocket authenticated', { connectionId, hostId });
            
            this.sendToConnection(connectionId, {
                type: 'authenticated',
                hostId,
                message: 'Authentication successful'
            });
            
            // Emit authentication event
            this.emit('authenticated', {
                connectionId,
                hostId
            });
        } else {
            this.sendToConnection(connectionId, {
                type: 'auth_error',
                message: 'Invalid authentication credentials'
            });
        }
    }

    handleJoinRoom(connectionId, roomId) {
        if (!roomId || typeof roomId !== 'string') return;
        
        this.addConnectionToRoom(connectionId, roomId);
        
        this.sendToConnection(connectionId, {
            type: 'room_joined',
            room: roomId
        });
        
        logger.debug('Connection joined room', { connectionId, roomId });
    }

    handleLeaveRoom(connectionId, roomId) {
        if (!roomId || typeof roomId !== 'string') return;
        
        this.removeConnectionFromRoom(connectionId, roomId);
        
        this.sendToConnection(connectionId, {
            type: 'room_left',
            room: roomId
        });
        
        logger.debug('Connection left room', { connectionId, roomId });
    }

    handleSubscription(connectionId, events) {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo || !Array.isArray(events)) return;
        
        connectionInfo.subscriptions = new Set(events);
        
        this.sendToConnection(connectionId, {
            type: 'subscribed',
            events
        });
        
        logger.debug('Connection subscribed to events', { connectionId, events });
    }

    handleConnectionClose(connectionId, code, reason) {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo) return;
        
        logger.info('WebSocket connection closed', { 
            connectionId, 
            hostId: connectionInfo.hostId,
            code, 
            reason: reason?.toString(),
            duration: Date.now() - connectionInfo.connectedAt
        });
        
        this.cleanupConnection(connectionId);
        
        // Emit disconnect event
        this.emit('disconnect', {
            connectionId,
            hostId: connectionInfo.hostId,
            code,
            reason
        });
    }

    cleanupConnection(connectionId) {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo) return;
        
        // Clear timeouts
        if (connectionInfo.authTimeout) {
            clearTimeout(connectionInfo.authTimeout);
        }
        
        // Remove from host connections
        if (connectionInfo.hostId) {
            const hostConnections = this.hostConnections.get(connectionInfo.hostId);
            if (hostConnections) {
                hostConnections.delete(connectionId);
                if (hostConnections.size === 0) {
                    this.hostConnections.delete(connectionInfo.hostId);
                }
            }
        }
        
        // Remove from IP connections
        this.removeIPConnection(connectionInfo.ip, connectionId);
        
        // Remove from all rooms
        connectionInfo.rooms.forEach(roomId => {
            this.removeConnectionFromRoom(connectionId, roomId);
        });
        
        // Remove rate limiter
        this.messageRates.delete(connectionId);
        
        // Remove connection
        this.connections.delete(connectionId);
        
        // Update metrics
        this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
    }

    /**
     * Send message to specific connection
     */
    sendToConnection(connectionId, data) {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo || connectionInfo.ws.readyState !== WebSocket.OPEN) {
            return false;
        }
        
        try {
            const message = JSON.stringify(data);
            connectionInfo.ws.send(message);
            connectionInfo.bytesSent += message.length;
            
            return true;
        } catch (error) {
            logger.error('Error sending message to connection', { 
                connectionId, 
                error: error.message 
            });
            this.closeConnection(connectionId, 1011, 'Send error');
            return false;
        }
    }

    /**
     * Send message to specific host (all connections)
     */
    sendToHost(hostId, data) {
        const connections = this.hostConnections.get(hostId);
        if (!connections) {
            return { sent: 0, failed: 0 };
        }
        
        let sent = 0;
        let failed = 0;
        
        connections.forEach(connectionId => {
            if (this.sendToConnection(connectionId, data)) {
                sent++;
            } else {
                failed++;
            }
        });
        
        if (sent > 0) {
            logger.debug('Message sent to host', { hostId, sent, failed });
        }
        
        return { sent, failed };
    }

    /**
     * Broadcast message to room
     */
    broadcastToRoom(roomId, data, excludeConnectionId = null) {
        const connections = this.connectionsByRoom.get(roomId);
        if (!connections) {
            return { sent: 0, failed: 0 };
        }
        
        let sent = 0;
        let failed = 0;
        
        connections.forEach(connectionId => {
            if (connectionId !== excludeConnectionId) {
                if (this.sendToConnection(connectionId, data)) {
                    sent++;
                } else {
                    failed++;
                }
            }
        });
        
        this.metrics.totalBroadcasts++;
        
        if (sent > 0) {
            logger.debug('Message broadcast to room', { roomId, sent, failed });
        }
        
        return { sent, failed };
    }

    /**
     * Broadcast to all authenticated connections
     */
    broadcastToAll(data, filter = null) {
        let sent = 0;
        let failed = 0;
        
        this.connections.forEach((connectionInfo, connectionId) => {
            if (connectionInfo.isAuthenticated) {
                // Apply filter if provided
                if (filter && !filter(connectionInfo)) {
                    return;
                }
                
                if (this.sendToConnection(connectionId, data)) {
                    sent++;
                } else {
                    failed++;
                }
            }
        });
        
        this.metrics.totalBroadcasts++;
        
        logger.debug('Message broadcast to all', { sent, failed });
        
        return { sent, failed };
    }

    /**
     * Connection management utilities
     */
    canAcceptConnection(ip) {
        // Check global connection limit
        if (this.metrics.activeConnections >= this.options.maxConnections) {
            return false;
        }
        
        // Check per-IP limit
        const ipConnections = this.ipConnections.get(ip);
        if (ipConnections && ipConnections.size >= this.options.maxConnectionsPerIP) {
            return false;
        }
        
        return true;
    }

    checkRateLimit(connectionId) {
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        
        if (!this.messageRates.has(connectionId)) {
            this.messageRates.set(connectionId, {
                count: 1,
                resetTime: now + windowMs
            });
            return true;
        }
        
        const rateLimiter = this.messageRates.get(connectionId);
        
        if (now > rateLimiter.resetTime) {
            rateLimiter.count = 1;
            rateLimiter.resetTime = now + windowMs;
            return true;
        }
        
        if (rateLimiter.count >= this.options.messageRateLimit) {
            return false;
        }
        
        rateLimiter.count++;
        return true;
    }

    addConnectionToRoom(connectionId, roomId) {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo) return;
        
        // Add to connection's rooms
        connectionInfo.rooms.add(roomId);
        
        // Add to room's connections
        if (!this.connectionsByRoom.has(roomId)) {
            this.connectionsByRoom.set(roomId, new Set());
        }
        this.connectionsByRoom.get(roomId).add(connectionId);
    }

    removeConnectionFromRoom(connectionId, roomId) {
        const connectionInfo = this.connections.get(connectionId);
        if (connectionInfo) {
            connectionInfo.rooms.delete(roomId);
        }
        
        const roomConnections = this.connectionsByRoom.get(roomId);
        if (roomConnections) {
            roomConnections.delete(connectionId);
            if (roomConnections.size === 0) {
                this.connectionsByRoom.delete(roomId);
            }
        }
    }

    addIPConnection(ip, connectionId) {
        if (!this.ipConnections.has(ip)) {
            this.ipConnections.set(ip, new Set());
        }
        this.ipConnections.get(ip).add(connectionId);
    }

    removeIPConnection(ip, connectionId) {
        const ipConnections = this.ipConnections.get(ip);
        if (ipConnections) {
            ipConnections.delete(connectionId);
            if (ipConnections.size === 0) {
                this.ipConnections.delete(ip);
            }
        }
    }

    closeConnection(connectionId, code = 1000, reason = 'Server closing connection') {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo) return;
        
        try {
            connectionInfo.ws.close(code, reason);
        } catch (error) {
            logger.error('Error closing connection', { connectionId, error: error.message });
        }
        
        // Cleanup will be handled by the close event
    }

    generateConnectionId() {
        return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Heartbeat and cleanup
     */
    startHeartbeat() {
        setInterval(() => {
            const now = Date.now();
            const staleConnections = [];
            
            this.connections.forEach((connectionInfo, connectionId) => {
                // Send ping
                if (connectionInfo.ws.readyState === WebSocket.OPEN) {
                    connectionInfo.ws.ping();
                    connectionInfo.lastPing = now;
                }
                
                // Check for stale connections (no pong response)
                if (now - connectionInfo.lastPong > this.options.heartbeatInterval * 2) {
                    staleConnections.push(connectionId);
                }
            });
            
            // Close stale connections
            staleConnections.forEach(connectionId => {
                logger.warn('Closing stale connection', { connectionId });
                this.closeConnection(connectionId, 1001, 'Connection timeout');
            });
            
        }, this.options.heartbeatInterval);
    }

    startMetricsCollection() {
        setInterval(() => {
            logger.info('WebSocket metrics:', this.getMetrics());
        }, 60000); // Every minute
    }

    /**
     * Get current metrics and statistics
     */
    getMetrics() {
        const connectionsByHost = {};
        this.hostConnections.forEach((connections, hostId) => {
            connectionsByHost[hostId] = connections.size;
        });
        
        return {
            ...this.metrics,
            connectionsByHost,
            roomCount: this.connectionsByRoom.size,
            ipCount: this.ipConnections.size,
            uptime: process.uptime()
        };
    }

    /**
     * Get detailed connection information
     */
    getConnectionInfo(connectionId) {
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo) return null;
        
        return {
            id: connectionId,
            ip: connectionInfo.ip,
            userAgent: connectionInfo.userAgent,
            connectedAt: connectionInfo.connectedAt,
            isAuthenticated: connectionInfo.isAuthenticated,
            hostId: connectionInfo.hostId,
            rooms: Array.from(connectionInfo.rooms),
            messageCount: connectionInfo.messageCount,
            bytesReceived: connectionInfo.bytesReceived,
            bytesSent: connectionInfo.bytesSent,
            lastPing: connectionInfo.lastPing,
            lastPong: connectionInfo.lastPong
        };
    }

    /**
     * Shutdown gracefully
     */
    async shutdown() {
        logger.info('Shutting down WebSocket manager...');
        
        // Close all connections
        this.connections.forEach((connectionInfo, connectionId) => {
            this.closeConnection(connectionId, 1001, 'Server shutting down');
        });
        
        // Close WebSocket server
        return new Promise((resolve) => {
            this.wss.close(() => {
                logger.info('WebSocket manager shut down successfully');
                resolve();
            });
        });
    }
}

module.exports = WebSocketManager;