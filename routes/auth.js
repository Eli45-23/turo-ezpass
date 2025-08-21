const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { db } = require('../config/database');
const { 
    authLimiter, 
    validateInput, 
    validateCSRF,
    sanitizeInputs,
    logSecurityEvent,
    schemas 
} = require('../middleware/security');

// Host signup
router.post('/signup', 
    authLimiter,
    sanitizeInputs,
    validateInput(schemas.signup),
    validateCSRF,
    async (req, res) => {
        const { email, password, fullName, turoHostId } = req.body;
        
        logSecurityEvent('SIGNUP_ATTEMPT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            email: email
        });

        try {
            const passwordHash = await bcrypt.hash(password, 10);
            
            db.run(
                `INSERT INTO hosts (email, password_hash, full_name, turo_host_id) 
                 VALUES (?, ?, ?, ?)`,
                [email, passwordHash, fullName, turoHostId],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE')) {
                            logSecurityEvent('SIGNUP_DUPLICATE', {
                                ip: req.ip,
                                userAgent: req.get('User-Agent'),
                                email: email
                            });
                            return res.status(409).json({ 
                                success: false, 
                                error: 'Email already registered' 
                            });
                        }
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Registration failed' 
                        });
                    }
                    
                    // Set session data for immediate login after signup
                    req.session.hostId = this.lastID;
                    req.session.email = email;
                    req.session.fullName = fullName;
                    
                    // Regenerate session ID for security
                    req.session.regenerate((err) => {
                        if (err) {
                            console.error('❌ Session regeneration failed:', err);
                            // Continue anyway - session already has data
                        }
                        
                        // Reset session data after regeneration
                        req.session.hostId = this.lastID;
                        req.session.email = email;
                        req.session.fullName = fullName;
                        
                        // Force session save to ensure persistence
                        req.session.save((saveErr) => {
                            if (saveErr) {
                                console.error('❌ Session save failed:', saveErr);
                                return res.status(500).json({
                                    success: false,
                                    error: 'Session creation failed'
                                });
                            }
                            
                            logSecurityEvent('ACCOUNT_CREATED', {
                                ip: req.ip,
                                userAgent: req.get('User-Agent'),
                                email: email,
                                hostId: this.lastID
                            });
                            
                            console.log('✅ User logged in automatically after signup:', {
                                hostId: this.lastID,
                                email: email,
                                sessionId: req.sessionID
                            });
                            
                            res.json({ 
                                success: true, 
                                message: 'Registration successful - you are now logged in',
                                host: {
                                    id: this.lastID,
                                    email: email,
                                    fullName: fullName
                                }
                            });
                        });
                    });
                }
            );
        } catch (error) {
            logSecurityEvent('SIGNUP_ERROR', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                email: email,
                error: error.message
            });
            res.status(500).json({ 
                success: false, 
                error: 'Server error during registration' 
            });
        }
    });

// Host login
router.post('/login', 
    authLimiter,
    sanitizeInputs,
    validateInput(schemas.login),
    validateCSRF,
    (req, res) => {
        const { email, password } = req.body;
        
        logSecurityEvent('LOGIN_ATTEMPT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            email: email
        });

        db.get(
            `SELECT id, email, password_hash, full_name FROM hosts WHERE email = ?`,
            [email],
            async (err, host) => {
                if (err) {
                    logSecurityEvent('LOGIN_ERROR', {
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        email: email,
                        error: err.message
                    });
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Login failed' 
                    });
                }
                
                if (!host) {
                    logSecurityEvent('LOGIN_FAILURE', {
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        email: email,
                        reason: 'user_not_found'
                    });
                    return res.status(401).json({ 
                        success: false, 
                        error: 'Invalid credentials' 
                    });
                }

                const validPassword = await bcrypt.compare(password, host.password_hash);
                
                if (!validPassword) {
                    logSecurityEvent('LOGIN_FAILURE', {
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        email: email,
                        hostId: host.id,
                        reason: 'invalid_password'
                    });
                    return res.status(401).json({ 
                        success: false, 
                        error: 'Invalid credentials' 
                    });
                }

                // Regenerate session ID for security
                req.session.regenerate((err) => {
                    if (err) {
                        console.error('❌ Session regeneration failed on login:', err);
                        // Continue anyway - set session data directly
                    }
                    
                    // Set session data
                    req.session.hostId = host.id;
                    req.session.email = host.email;
                    req.session.fullName = host.full_name;
                    
                    // Force session save to ensure persistence
                    req.session.save((saveErr) => {
                        if (saveErr) {
                            console.error('❌ Session save failed on login:', saveErr);
                            return res.status(500).json({
                                success: false,
                                error: 'Login session creation failed'
                            });
                        }
                        
                        logSecurityEvent('LOGIN_SUCCESS', {
                            ip: req.ip,
                            userAgent: req.get('User-Agent'),
                            email: email,
                            hostId: host.id
                        });
                        
                        console.log('✅ User logged in successfully:', {
                            hostId: host.id,
                            email: host.email,
                            sessionId: req.sessionID
                        });

                        res.json({ 
                            success: true, 
                            message: 'Login successful',
                            host: {
                                id: host.id,
                                email: host.email,
                                fullName: host.full_name
                            }
                        });
                    });
                });
            }
        );
    });

// Logout
router.post('/logout', validateCSRF, (req, res) => {
    const hostId = req.session.hostId;
    
    logSecurityEvent('LOGOUT_ATTEMPT', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        hostId: hostId
    });
    
    req.session.destroy((err) => {
        if (err) {
            logSecurityEvent('LOGOUT_ERROR', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                hostId: hostId,
                error: err.message
            });
            return res.status(500).json({ 
                success: false, 
                error: 'Logout failed' 
            });
        }
        
        logSecurityEvent('LOGOUT_SUCCESS', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            hostId: hostId
        });
        
        res.json({ 
            success: true, 
            message: 'Logged out successfully' 
        });
    });
});

// Check authentication status
router.get('/status', (req, res) => {
    console.log('🔍 Auth status check:', {
        hasSession: !!req.session,
        hostId: req.session?.hostId,
        sessionKeys: req.session ? Object.keys(req.session) : 'no session',
        cookies: req.headers.cookie?.substring(0, 100) + '...',
        timestamp: new Date().toISOString()
    });
    
    if (req.session && req.session.hostId) {
        res.json({ 
            success: true,
            authenticated: true,
            host: {
                id: req.session.hostId,
                email: req.session.email,
                fullName: req.session.fullName
            }
        });
    } else {
        res.json({ 
            success: true,
            authenticated: false 
        });
    }
});

// Simple check endpoint for debugging
router.get('/check', (req, res) => {
    const sessionInfo = {
        hasSession: !!req.session,
        hostId: req.session?.hostId,
        sessionId: req.session?.id,
        keys: req.session ? Object.keys(req.session) : [],
        authenticated: !!(req.session && req.session.hostId)
    };
    
    console.log('🔧 Session check:', sessionInfo);
    
    res.json({
        success: true,
        session: sessionInfo,
        timestamp: new Date().toISOString()
    });
});

// Get CSRF token for frontend forms
router.get('/csrf-token', (req, res) => {
    if (req.session && req.session.csrfToken) {
        res.json({
            success: true,
            csrfToken: req.session.csrfToken
        });
    } else {
        res.status(400).json({
            success: false,
            error: 'No session or CSRF token available'
        });
    }
});

module.exports = router;