const express = require('express');
const router = express.Router();
const { db } = require('../config/supabase');
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
            // Create user with Supabase Auth
            const { data: authData, error: authError } = await db.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        turo_host_id: turoHostId
                    }
                }
            });

            if (authError) {
                logSecurityEvent('SIGNUP_ERROR', {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    email: email,
                    error: authError.message
                });

                // Handle specific Supabase errors
                if (authError.message.includes('already registered')) {
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

            // Create host record in database
            const { data: hostData, error: dbError } = await db.adminFrom('hosts').insert({
                id: authData.user.id, // Use Supabase user UUID
                email: email,
                full_name: fullName,
                turo_host_id: turoHostId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).select().single();

            if (dbError) {
                console.error('❌ Database error during signup:', dbError);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Registration failed' 
                });
            }

            logSecurityEvent('ACCOUNT_CREATED', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                email: email,
                hostId: authData.user.id
            });

            console.log('✅ User registered and logged in automatically:', {
                hostId: authData.user.id,
                email: email,
                session: authData.session ? 'created' : 'pending_confirmation'
            });

            // Set session info in response headers for frontend compatibility
            if (authData.session) {
                res.setHeader('X-Session-Token', authData.session.access_token);
                res.setHeader('X-User-ID', authData.user.id);
            }

            res.json({ 
                success: true, 
                message: authData.session ? 
                    'Registration successful - you are now logged in' : 
                    'Registration successful - please check your email for confirmation',
                host: {
                    id: authData.user.id,
                    email: email,
                    fullName: fullName
                },
                session: authData.session,
                needsEmailConfirmation: !authData.session,
                // Add token for frontend to use
                access_token: authData.session?.access_token,
                authenticated: !!authData.session
            });

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
    async (req, res) => {
        const { email, password } = req.body;
        
        logSecurityEvent('LOGIN_ATTEMPT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            email: email
        });

        try {
            const { data, error } = await db.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                logSecurityEvent('LOGIN_FAILURE', {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    email: email,
                    error: error.message
                });

                return res.status(401).json({ 
                    success: false, 
                    error: 'Invalid credentials' 
                });
            }

            // Get host data from database
            const { data: hostData, error: hostError } = await db.from('hosts')
                .select('*')
                .eq('email', email)
                .single();

            if (hostError || !hostData) {
                console.error('❌ Could not fetch host data:', hostError);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Login failed' 
                });
            }

            logSecurityEvent('LOGIN_SUCCESS', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                email: email,
                hostId: data.user.id
            });

            console.log('✅ User logged in successfully:', {
                hostId: data.user.id,
                email: email,
                sessionExpires: data.session.expires_at
            });

            // Set session info in response headers for frontend compatibility
            res.setHeader('X-Session-Token', data.session.access_token);
            res.setHeader('X-User-ID', data.user.id);

            res.json({ 
                success: true, 
                message: 'Login successful',
                host: {
                    id: hostData.id,
                    email: hostData.email,
                    fullName: hostData.full_name
                },
                session: data.session,
                access_token: data.session.access_token,
                authenticated: true
            });

        } catch (error) {
            logSecurityEvent('LOGIN_ERROR', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                email: email,
                error: error.message
            });
            res.status(500).json({ 
                success: false, 
                error: 'Server error during login' 
            });
        }
    });

// Logout
router.post('/logout', validateCSRF, async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            // Get user info before logout for logging
            const { data: { user } } = await db.getUser(token);
            
            logSecurityEvent('LOGOUT_ATTEMPT', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                hostId: user?.id
            });

            // Sign out from Supabase
            const { error } = await db.auth.signOut();
            
            if (error) {
                logSecurityEvent('LOGOUT_ERROR', {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    hostId: user?.id,
                    error: error.message
                });
                return res.status(500).json({ 
                    success: false, 
                    error: 'Logout failed' 
                });
            }

            logSecurityEvent('LOGOUT_SUCCESS', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                hostId: user?.id
            });
        }

        res.json({ 
            success: true, 
            message: 'Logged out successfully' 
        });

    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Logout failed' 
        });
    }
});

// Check authentication status
router.get('/status', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        console.log('🔍 Auth status check:', {
            hasAuthHeader: !!authHeader,
            hasToken: !!token,
            timestamp: new Date().toISOString()
        });

        if (!token) {
            return res.json({ 
                success: true,
                authenticated: false 
            });
        }

        const { user, error } = await db.getUser(token);

        if (error || !user) {
            console.log('❌ Invalid token or user not found:', error?.message);
            return res.json({ 
                success: true,
                authenticated: false 
            });
        }

        // Get host data
        const { data: hostData, error: hostError } = await db.from('hosts')
            .select('*')
            .eq('id', user.id)
            .single();

        if (hostError || !hostData) {
            console.error('❌ Could not fetch host data:', hostError);
            return res.json({ 
                success: true,
                authenticated: false 
            });
        }

        res.json({ 
            success: true,
            authenticated: true,
            host: {
                id: hostData.id,
                email: hostData.email,
                fullName: hostData.full_name
            }
        });

    } catch (error) {
        console.error('❌ Auth status check error:', error);
        res.json({ 
            success: true,
            authenticated: false 
        });
    }
});

// Get user profile
router.get('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No authorization token provided'
            });
        }

        const { user, error } = await db.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Get host data with additional info
        const { data: hostData, error: hostError } = await db.from('hosts')
            .select(`
                *,
                toll_accounts!inner(count),
                transponder_mappings!inner(count)
            `)
            .eq('id', user.id)
            .single();

        if (hostError) {
            console.error('❌ Could not fetch profile data:', hostError);
            return res.status(500).json({
                success: false,
                error: 'Could not fetch profile'
            });
        }

        res.json({
            success: true,
            profile: hostData
        });

    } catch (error) {
        console.error('❌ Profile fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token required'
            });
        }

        const { data, error } = await db.auth.refreshSession({
            refresh_token
        });

        if (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid refresh token'
            });
        }

        res.json({
            success: true,
            session: data.session
        });

    } catch (error) {
        console.error('❌ Token refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// Get CSRF token for frontend forms (still needed for non-auth routes)
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