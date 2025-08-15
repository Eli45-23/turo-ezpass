const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { CacheManager, CacheKeys } = require('../services/cache-manager');
const { createPerformanceMiddleware } = require('../services/performance-monitor');

// Initialize cache manager if not already available
let cacheManager = global.cacheManager;
if (!cacheManager) {
    cacheManager = new CacheManager();
    global.cacheManager = cacheManager;
}

// Initialize performance monitoring middleware
const performanceMiddleware = global.performanceMonitor ? 
    createPerformanceMiddleware(global.performanceMonitor) : 
    (req, res, next) => next();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (!req.session.hostId) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
        });
    }
    next();
};

// Apply performance monitoring to all routes
router.use(performanceMiddleware);

// Get dashboard summary - Optimized with caching
router.get('/summary', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        // Try to get from cache first
        const cacheKey = CacheKeys.dashboardSummary(hostId);
        const cachedSummary = await cacheManager.getOrSet(
            cacheKey,
            async () => {
                // Optimized single query to get all summary data
                const summaryData = await executeOptimizedSummaryQuery(hostId);
                return summaryData;
            },
            300, // Cache for 5 minutes
            { l1TTL: 60 } // L1 cache for 1 minute
        );
        
        res.json({
            success: true,
            data: cachedSummary
        });
        
    } catch (error) {
        console.error('❌ Error getting dashboard summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get dashboard summary'
        });
    }
});

// Optimized summary query function
async function executeOptimizedSummaryQuery(hostId) {
    return new Promise((resolve, reject) => {
        // Use a single optimized query with joins and subqueries
        const query = `
            WITH summary_stats AS (
                SELECT 
                    -- Trip statistics
                    (SELECT COUNT(*) FROM trips WHERE host_id = ?) as total_trips,
                    
                    -- Active toll accounts
                    (SELECT COUNT(*) FROM toll_accounts WHERE host_id = ? AND is_active = 1) as active_toll_accounts,
                    
                    -- Pending charges with total amount
                    (SELECT COUNT(*) FROM toll_charges tc 
                     JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                     WHERE ta.host_id = ? AND tc.is_matched = 0) as pending_charges_count,
                     
                    (SELECT COALESCE(SUM(tc.toll_amount), 0) FROM toll_charges tc 
                     JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                     WHERE ta.host_id = ? AND tc.is_matched = 0) as pending_charges_total,
                    
                    -- Total revenue from completed invoices
                    (SELECT COALESCE(SUM(i.total_amount), 0) FROM invoices i 
                     JOIN trips t ON i.trip_id = t.id 
                     WHERE t.host_id = ? AND i.status = 'paid') as total_revenue
            ),
            recent_activity AS (
                SELECT 
                    'toll_charge' as activity_type,
                    tc.toll_location as description,
                    tc.toll_amount as amount,
                    tc.created_at as timestamp,
                    tc.toll_date
                FROM toll_charges tc
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                WHERE ta.host_id = ?
                
                UNION ALL
                
                SELECT 
                    'invoice' as activity_type,
                    'Invoice #' || i.invoice_number as description,
                    i.total_amount as amount,
                    i.created_at as timestamp,
                    i.created_at as toll_date
                FROM invoices i
                JOIN trips t ON i.trip_id = t.id
                WHERE t.host_id = ?
                
                ORDER BY timestamp DESC
                LIMIT 10
            )
            SELECT 
                ss.*,
                (SELECT json_group_array(json_object(
                    'type', activity_type,
                    'description', description,
                    'amount', amount,
                    'timestamp', timestamp,
                    'toll_date', toll_date
                )) FROM recent_activity) as recent_activity
            FROM summary_stats ss
        `;
        
        db.get(query, [hostId, hostId, hostId, hostId, hostId, hostId, hostId], (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            
            let recentActivity = [];
            try {
                if (result.recent_activity) {
                    const parsed = JSON.parse(result.recent_activity);
                    recentActivity = parsed.filter(item => item.type !== null);
                }
            } catch (parseError) {
                console.warn('Failed to parse recent activity:', parseError);
            }
            
            const summary = {
                totalTrips: result.total_trips || 0,
                activeTollAccounts: result.active_toll_accounts || 0,
                pendingCharges: result.pending_charges_count || 0,
                pendingChargesTotal: result.pending_charges_total || 0,
                totalRevenue: result.total_revenue || 0,
                recentActivity: recentActivity
            };
            
            resolve(summary);
        });
    });
}

// Get toll accounts - Optimized with caching
router.get('/toll-accounts', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        const cacheKey = CacheKeys.tollAccounts(hostId);
        const tollAccounts = await cacheManager.getOrSet(
            cacheKey,
            async () => {
                return await executeOptimizedTollAccountsQuery(hostId);
            },
            600, // Cache for 10 minutes
            { l1TTL: 120 } // L1 cache for 2 minutes
        );
        
        res.json({
            success: true,
            data: tollAccounts
        });
        
    } catch (error) {
        console.error('❌ Error getting toll accounts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get toll accounts'
        });
    }
});

async function executeOptimizedTollAccountsQuery(hostId) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                ta.id,
                ta.provider,
                ta.account_number,
                ta.is_active,
                ta.last_sync,
                ta.created_at,
                COUNT(tc.id) as total_charges,
                COALESCE(SUM(tc.toll_amount), 0) as total_amount,
                COUNT(CASE WHEN tc.is_matched = 0 THEN 1 END) as unmatched_charges
            FROM toll_accounts ta
            LEFT JOIN toll_charges tc ON ta.id = tc.toll_account_id
            WHERE ta.host_id = ?
            GROUP BY ta.id, ta.provider, ta.account_number, ta.is_active, ta.last_sync, ta.created_at
            ORDER BY ta.created_at DESC
        `;
        
        db.all(query, [hostId], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

// Get recent trips - Optimized with caching and pagination
router.get('/recent-trips', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 per page
    const offset = (page - 1) * limit;
    
    try {
        const cacheKey = CacheKeys.trips(hostId, { page, limit });
        const tripsData = await cacheManager.getOrSet(
            cacheKey,
            async () => {
                return await executeOptimizedTripsQuery(hostId, limit, offset);
            },
            300, // Cache for 5 minutes
            { l1TTL: 60 } // L1 cache for 1 minute
        );
        
        res.json({
            success: true,
            data: tripsData.trips,
            pagination: {
                page,
                limit,
                total: tripsData.total,
                totalPages: Math.ceil(tripsData.total / limit)
            }
        });
        
    } catch (error) {
        console.error('❌ Error getting recent trips:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get recent trips'
        });
    }
});

async function executeOptimizedTripsQuery(hostId, limit, offset) {
    return new Promise((resolve, reject) => {
        // Get total count and trips in parallel
        const countQuery = `SELECT COUNT(*) as total FROM trips WHERE host_id = ?`;
        const tripsQuery = `
            SELECT 
                t.id,
                t.turo_trip_id,
                t.renter_name,
                t.vehicle_plate,
                t.start_date,
                t.end_date,
                t.trip_status,
                COUNT(tc.id) as toll_charges_count,
                COALESCE(SUM(tc.toll_amount), 0) as total_toll_amount,
                i.id as invoice_id,
                i.invoice_number,
                i.status as invoice_status,
                i.total_amount as invoice_total
            FROM trips t
            LEFT JOIN toll_charges tc ON t.id = tc.trip_id
            LEFT JOIN invoices i ON t.id = i.trip_id
            WHERE t.host_id = ?
            GROUP BY t.id, t.turo_trip_id, t.renter_name, t.vehicle_plate, 
                     t.start_date, t.end_date, t.trip_status, i.id, i.invoice_number, 
                     i.status, i.total_amount
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        db.get(countQuery, [hostId], (err, countResult) => {
            if (err) {
                reject(err);
                return;
            }
            
            db.all(tripsQuery, [hostId, limit, offset], (err, trips) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        trips: trips || [],
                        total: countResult.total || 0
                    });
                }
            });
        });
    });
}

// Get toll charges with advanced filtering - Optimized
router.get('/toll-charges', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const filters = {
        matched: req.query.matched,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        location: req.query.location,
        minAmount: req.query.minAmount,
        maxAmount: req.query.maxAmount
    };
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 100); // Max 100 per page
    const offset = (page - 1) * limit;
    
    try {
        const cacheKey = CacheKeys.tollCharges(hostId, { ...filters, page, limit });
        const chargesData = await cacheManager.getOrSet(
            cacheKey,
            async () => {
                return await executeOptimizedTollChargesQuery(hostId, filters, limit, offset);
            },
            180, // Cache for 3 minutes (shorter due to frequent updates)
            { l1TTL: 30 } // L1 cache for 30 seconds
        );
        
        res.json({
            success: true,
            data: chargesData.charges,
            pagination: {
                page,
                limit,
                total: chargesData.total,
                totalPages: Math.ceil(chargesData.total / limit)
            },
            filters
        });
        
    } catch (error) {
        console.error('❌ Error getting toll charges:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get toll charges'
        });
    }
});

async function executeOptimizedTollChargesQuery(hostId, filters, limit, offset) {
    return new Promise((resolve, reject) => {
        // Build dynamic WHERE conditions
        let whereConditions = ['ta.host_id = ?'];
        let queryParams = [hostId];
        
        if (filters.matched !== undefined) {
            whereConditions.push('tc.is_matched = ?');
            queryParams.push(filters.matched === 'true' ? 1 : 0);
        }
        
        if (filters.startDate) {
            whereConditions.push('tc.toll_date >= ?');
            queryParams.push(filters.startDate);
        }
        
        if (filters.endDate) {
            whereConditions.push('tc.toll_date <= ?');
            queryParams.push(filters.endDate);
        }
        
        if (filters.location) {
            whereConditions.push('tc.toll_location LIKE ?');
            queryParams.push(`%${filters.location}%`);
        }
        
        if (filters.minAmount) {
            whereConditions.push('tc.toll_amount >= ?');
            queryParams.push(parseFloat(filters.minAmount));
        }
        
        if (filters.maxAmount) {
            whereConditions.push('tc.toll_amount <= ?');
            queryParams.push(parseFloat(filters.maxAmount));
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM toll_charges tc
            JOIN toll_accounts ta ON tc.toll_account_id = ta.id
            WHERE ${whereClause}
        `;
        
        // Data query with optimized joins
        const dataQuery = `
            SELECT 
                tc.id,
                tc.toll_date,
                tc.toll_location,
                tc.toll_amount,
                tc.plate_number,
                tc.transaction_id,
                tc.is_matched,
                tc.match_timestamp,
                tc.created_at,
                ta.provider,
                ta.account_number,
                t.id as trip_id,
                t.turo_trip_id,
                t.renter_name,
                t.vehicle_plate as trip_vehicle_plate
            FROM toll_charges tc
            JOIN toll_accounts ta ON tc.toll_account_id = ta.id
            LEFT JOIN trips t ON tc.trip_id = t.id
            WHERE ${whereClause}
            ORDER BY tc.toll_date DESC, tc.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        db.get(countQuery, queryParams, (err, countResult) => {
            if (err) {
                reject(err);
                return;
            }
            
            // Add limit and offset to params for data query
            const dataParams = [...queryParams, limit, offset];
            
            db.all(dataQuery, dataParams, (err, charges) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        charges: charges || [],
                        total: countResult.total || 0
                    });
                }
            });
        });
    });
}

// Cache invalidation endpoints for real-time updates
router.post('/cache/invalidate', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { pattern } = req.body;
        
        if (pattern) {
            // Invalidate specific pattern
            await cacheManager.invalidatePattern(`*${hostId}*${pattern}*`);
        } else {
            // Invalidate all cache for this host
            await cacheManager.invalidatePattern(`*${hostId}*`);
        }
        
        res.json({
            success: true,
            message: 'Cache invalidated successfully'
        });
        
    } catch (error) {
        console.error('❌ Error invalidating cache:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to invalidate cache'
        });
    }
});

module.exports = router;