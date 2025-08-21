const { db } = require('../config/supabase');

// Middleware to verify Supabase JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        const { user, error } = await db.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }

        // Attach user to request
        req.user = user;
        next();

    } catch (error) {
        console.error('❌ Authentication middleware error:', error);
        return res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
};

// Middleware to get host data for authenticated user
const getHostData = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const { data: hostData, error } = await db.from('hosts')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (error || !hostData) {
            console.error('❌ Could not fetch host data:', error);
            return res.status(404).json({
                success: false,
                error: 'Host not found'
            });
        }

        req.host = hostData;
        next();

    } catch (error) {
        console.error('❌ Host data middleware error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch host data'
        });
    }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const { user, error } = await db.getUser(token);
            if (!error && user) {
                req.user = user;
                
                // Try to get host data too
                const { data: hostData } = await db.from('hosts')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                
                if (hostData) {
                    req.host = hostData;
                }
            }
        }

        next();
    } catch (error) {
        console.error('❌ Optional auth middleware error:', error);
        next(); // Continue anyway for optional auth
    }
};

module.exports = {
    authenticateToken,
    getHostData,
    optionalAuth
};