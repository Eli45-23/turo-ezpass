const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabaseAdmin } = require('../config/supabase');
const { CacheManager, CacheKeys } = require('../services/cache-manager');
const { createPerformanceMiddleware } = require('../services/performance-monitor');
const EnhancedTollMatcher = require('../services/enhanced-toll-matcher');
const SimpleTollMatcher = require('../services/simple-toll-matcher');

// Configure multer for file uploads
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});


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
const requireAuth = async (req, res, next) => {
    console.log('🔐 Auth check - Session:', {
        hostId: req.session.hostId,
        sessionId: req.session.id,
        path: req.path,
        cookies: req.headers.cookie
    });
    
    try {
        // Check if we have a UUID in session
        if (!req.session.hostId || typeof req.session.hostId === 'number') {
            console.log('🔧 No UUID hostId in session - creating/getting UUID for user');
            
            const userEmail = req.session.email || 'eliascolon23@gmail.com';
            
            // Check if host already exists in Supabase
            const { data: existingHost, error } = await supabaseAdmin
                .from('hosts')
                .select('id')
                .eq('email', userEmail)
                .single();
            
            if (existingHost) {
                console.log('✅ Found existing host UUID:', existingHost.id);
                req.session.hostId = existingHost.id;
                req.session.email = userEmail;
            } else {
                // Create new host with UUID
                const { data: newHost, error: createError } = await supabaseAdmin
                    .from('hosts')
                    .insert({
                        email: userEmail,
                        full_name: 'Migrated User'
                    })
                    .select('id')
                    .single();
                
                if (createError) {
                    console.error('❌ Error creating host:', createError);
                    return res.status(500).json({ success: false, error: 'Authentication failed' });
                }
                
                console.log('✅ Created new host UUID:', newHost.id);
                req.session.hostId = newHost.id;
                req.session.email = userEmail;
            }
        }
        
        console.log('✅ Authentication passed for host:', req.session.hostId);
        next();
    } catch (error) {
        console.error('❌ Authentication error:', error);
        return res.status(500).json({ success: false, error: 'Authentication failed' });
    }
};

// Apply performance monitoring to all routes
router.use(performanceMiddleware);

// Test route without authentication for debugging
router.get('/test-summary', async (req, res) => {
    const hostId = 1; // Hard-coded for testing
    
    try {
        console.log('🔍 Test route called for hostId:', hostId);
        const summaryData = await executeOptimizedSummaryQuery(hostId);
        console.log('📊 Test route data:', summaryData);
        
        res.json({
            success: true,
            data: summaryData,
            debug: 'Test route without auth'
        });
        
    } catch (error) {
        console.error('❌ Test route error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            debug: 'Test route failed'
        });
    }
});

// Get dashboard summary - Optimized with caching
router.get('/summary', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const startTime = Date.now();
    
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
        
        const loadTime = Date.now() - startTime;
        
        // Performance monitoring (subagent functionality removed)
        if (loadTime > 3000) {
            console.warn(`⚠️ Dashboard loaded slowly: ${loadTime}ms`);
        }
        
        res.json({
            success: true,
            data: cachedSummary,
            loadTime: loadTime
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
// Optimized dashboard summary query using Supabase
async function executeOptimizedSummaryQuery(hostId) {
    try {
        console.log('📊 Fetching dashboard summary for host:', hostId);
        
        // Fetch all trips for this host
        const { data: trips, error: tripsError } = await supabaseAdmin
            .from('trips')
            .select('*')
            .eq('host_id', hostId)
            .not('trip_status', 'in', '(canceled,cancelled,declined,expired,terminated,rejected)');

        if (tripsError) {
            console.error('❌ Error fetching trips:', tripsError);
            throw tripsError;
        }

        // Fetch all toll accounts for this host
        const { data: tollAccounts, error: accountsError } = await supabaseAdmin
            .from('toll_accounts')
            .select('*')
            .eq('host_id', hostId)
            .eq('is_active', true);

        if (accountsError) {
            console.error('❌ Error fetching toll accounts:', accountsError);
            throw accountsError;
        }

        // Fetch all toll charges for this host
        const { data: tollCharges, error: chargesError } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                *,
                toll_accounts!inner(host_id)
            `)
            .eq('toll_accounts.host_id', hostId)
            .not('is_archived', 'eq', true);

        if (chargesError) {
            console.error('❌ Error fetching toll charges:', chargesError);
            throw chargesError;
        }

        // Fetch all invoices for this host
        const { data: invoices, error: invoicesError } = await supabaseAdmin
            .from('invoices')
            .select(`
                *,
                trips!inner(host_id, trip_status)
            `)
            .eq('trips.host_id', hostId)
            .not('trips.trip_status', 'in', '(canceled,cancelled,declined,expired,terminated,rejected)');

        if (invoicesError) {
            console.error('❌ Error fetching invoices:', invoicesError);
            // Don't throw - invoices might not exist yet
        }

        // Calculate metrics
        const totalTrips = trips?.length || 0;
        const activeTollAccounts = tollAccounts?.length || 0;
        
        const pendingCharges = tollCharges?.filter(tc => !tc.is_matched) || [];
        const matchedCharges = tollCharges?.filter(tc => tc.is_matched) || [];
        
        const pendingChargesCount = pendingCharges.length;
        const pendingChargesTotal = pendingCharges.reduce((sum, tc) => sum + (tc.toll_amount || 0), 0);
        const matchedChargesCount = matchedCharges.length;
        const matchedChargesTotal = matchedCharges.reduce((sum, tc) => sum + (tc.toll_amount || 0), 0);
        
        const totalTollCharges = tollCharges?.length || 0;
        const totalTollAmount = tollCharges?.reduce((sum, tc) => sum + (tc.toll_amount || 0), 0) || 0;
        
        const uniqueTollLocations = new Set(tollCharges?.map(tc => tc.toll_location) || []).size;
        
        // Revenue calculations
        const totalRevenue = invoices?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;
        const collectedRevenue = invoices?.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;
        const outstandingRevenue = invoices?.filter(inv => ['pending', 'sent'].includes(inv.status)).reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;
        
        // Vehicles with tolls
        const tripsWithTolls = trips?.filter(trip => 
            tollCharges?.some(tc => tc.trip_id === trip.id)
        ) || [];
        const vehiclesWithTolls = new Set(tripsWithTolls.map(trip => trip.vehicle_plate)).size;
        
        // Recent activity - get last 20 toll charges with trip info
        const recentActivity = tollCharges
            ?.sort((a, b) => new Date(b.toll_date) - new Date(a.toll_date))
            .slice(0, 20)
            .map(tc => {
                const trip = trips?.find(t => t.id === tc.trip_id);
                return {
                    toll_date: tc.toll_date,
                    toll_location: tc.toll_location,
                    toll_amount: tc.toll_amount,
                    renter_name: trip?.renter_name || 'Unmatched',
                    timestamp: tc.created_at
                };
            }) || [];

        // Calculate rates
        const tripTolls = totalTollCharges - pendingChargesCount;
        const matchRate = tripTolls > 0 ? (matchedChargesCount / tripTolls * 100) : 0;
        const collectionRate = totalRevenue > 0 ? (collectedRevenue / totalRevenue * 100) : 0;
        const avgTollPerTrip = totalTrips > 0 ? (totalTollAmount / totalTrips) : 0;

        const summary = {
            // Main metrics for frontend (matching expected field names)
            totalTolls: totalTollCharges,
            matchedTolls: matchedChargesCount,
            personalTolls: pendingChargesCount,
            personalAmount: pendingChargesTotal.toFixed(2),
            matchedAmount: matchedChargesTotal.toFixed(2),
            monthlyRevenue: totalRevenue.toFixed(2),
            matchingAccuracy: matchRate.toFixed(1),
            
            // Detailed metrics (keeping existing names for backward compatibility)
            totalTrips: totalTrips,
            activeTollAccounts: activeTollAccounts,
            pendingCharges: pendingChargesCount,
            pendingChargesTotal: pendingChargesTotal,
            matchedCharges: matchedChargesCount,
            matchedChargesTotal: matchedChargesTotal,
            totalRevenue: totalRevenue,
            collectedRevenue: collectedRevenue,
            outstandingRevenue: outstandingRevenue,
            recentActivity: recentActivity,
            
            // Additional real-time toll metrics
            totalTollCharges: totalTollCharges,
            totalTollAmount: totalTollAmount,
            uniqueTollLocations: uniqueTollLocations,
            vehiclesWithTolls: vehiclesWithTolls,
            
            // Calculated percentages and averages
            matchRate: matchRate.toFixed(1),
            collectionRate: collectionRate.toFixed(1),
            avgTollPerTrip: avgTollPerTrip.toFixed(2),
            tripsWithTolls: recentActivity.filter(a => a.renter_name !== 'Unmatched').length,
            
            // System info
            last_updated: new Date().toISOString(),
            host_id: hostId
        };
        
        console.log('✅ Dashboard summary calculated:', {
            trips: totalTrips,
            tollCharges: totalTollCharges,
            pending: pendingChargesCount,
            matched: matchedChargesCount
        });
        
        return summary;
    } catch (error) {
        console.error('❌ Error in executeOptimizedSummaryQuery:', error);
        throw error;
    }
}

// Get all toll accounts for host
router.get('/toll-accounts', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    
    console.log('🔍 Getting toll accounts for hostId:', hostId);
    
    db.all(
        `SELECT 
            id,
            provider,
            account_number,
            username,
            is_active,
            last_sync,
            created_at,
            host_id
         FROM toll_accounts 
         WHERE host_id = ?
         ORDER BY created_at DESC`,
        [hostId],
        (err, accounts) => {
            if (err) {
                console.error('❌ Error fetching toll accounts:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to fetch toll accounts' 
                });
            }
            
            console.log(`📊 Found ${accounts.length} toll accounts for host ${hostId}:`, accounts);
            
            res.json({
                success: true,
                data: accounts
            });
        }
    );
});

// Add new toll account
router.post('/toll-accounts', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const { provider, accountNumber, username, password } = req.body;
    
    if (!provider || !accountNumber || !username || !password) {
        return res.status(400).json({ 
            success: false, 
            error: 'All fields are required' 
        });
    }

    // Encrypt password using AES-256-GCM
    const crypto = require('../utils/crypto');
    const passwordEncrypted = crypto.encryptSensitiveData(password, hostId.toString());
    
    db.run(
        `INSERT INTO toll_accounts (host_id, provider, account_number, username, password_encrypted)
         VALUES (?, ?, ?, ?, ?)`,
        [hostId, provider, accountNumber, username, passwordEncrypted],
        function(err) {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to add toll account' 
                });
            }
            
            res.json({
                success: true,
                message: 'Toll account added successfully',
                accountId: this.lastID
            });
        }
    );
});

// Get all trips for host (legacy endpoint - returns all trips)
router.get('/trips', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    
    db.all(
        `SELECT 
            t.*,
            COUNT(CASE WHEN tc.id IS NOT NULL THEN 1 END) as toll_count,
            COALESCE(SUM(tc.toll_amount), 0) as total_tolls
         FROM trips t
         LEFT JOIN toll_charges tc ON t.id = tc.trip_id
         WHERE t.host_id = ? AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
         GROUP BY t.id
         ORDER BY t.start_date DESC`,
        [hostId],
        (err, trips) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to fetch trips' 
                });
            }
            
            res.json({
                success: true,
                data: trips
            });
        }
    );
});

// Get active trips (past trips, excluding canceled/declined ones)
router.get('/trips/active', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const now = new Date().toISOString();
    
    db.all(
        `SELECT 
            t.*,
            COUNT(CASE WHEN tc.id IS NOT NULL THEN 1 END) as toll_count,
            COALESCE(SUM(tc.toll_amount), 0) as total_tolls
         FROM trips t
         LEFT JOIN toll_charges tc ON t.id = tc.trip_id
         WHERE t.host_id = ? 
         AND t.end_date < ?
         AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
         GROUP BY t.id
         ORDER BY t.start_date DESC`,
        [hostId, now],
        (err, trips) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to fetch active trips' 
                });
            }
            
            res.json({
                success: true,
                data: trips
            });
        }
    );
});

// Get upcoming trips (future trips that haven't started yet)
router.get('/trips/upcoming', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const now = Date.now();
    
    db.all(
        `SELECT 
            t.*,
            COUNT(CASE WHEN tc.id IS NOT NULL THEN 1 END) as toll_count,
            COALESCE(SUM(tc.toll_amount), 0) as total_tolls
         FROM trips t
         LEFT JOIN toll_charges tc ON t.id = tc.trip_id
         WHERE t.host_id = ? 
         AND t.start_date > ?
         AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
         GROUP BY t.id
         ORDER BY t.start_date ASC`,
        [hostId, now],
        (err, trips) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to fetch upcoming trips' 
                });
            }
            
            res.json({
                success: true,
                data: trips
            });
        }
    );
});

// Get completed trips (trips that have toll matches)
router.get('/trips/completed', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    
    db.all(
        `SELECT 
            t.*,
            COUNT(tc.id) as toll_count,
            COALESCE(SUM(tc.toll_amount), 0) as total_tolls
         FROM trips t
         INNER JOIN toll_charges tc ON t.id = tc.trip_id
         WHERE t.host_id = ?
         AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
         GROUP BY t.id
         HAVING COUNT(tc.id) > 0
         ORDER BY t.start_date DESC`,
        [hostId],
        (err, trips) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to fetch completed trips' 
                });
            }
            
            // For each trip, get detailed toll information
            let completedRequests = 0;
            const tripsWithTolls = [];
            
            if (trips.length === 0) {
                return res.json({
                    success: true,
                    data: []
                });
            }
            
            trips.forEach((trip, index) => {
                db.all(
                    `SELECT 
                        tc.toll_date,
                        tc.toll_location,
                        tc.toll_amount,
                        tc.transaction_id,
                        tc.plate_number,
                        tc.transponder_id,
                        ta.provider,
                        ta.account_number
                     FROM toll_charges tc
                     JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                     WHERE tc.trip_id = ?
                     ORDER BY tc.toll_date DESC`,
                    [trip.id],
                    (tollErr, tolls) => {
                        completedRequests++;
                        
                        if (!tollErr) {
                            trip.toll_details = tolls;
                        } else {
                            trip.toll_details = [];
                        }
                        
                        tripsWithTolls[index] = trip;
                        
                        // When all toll queries are complete, send response
                        if (completedRequests === trips.length) {
                            res.json({
                                success: true,
                                data: tripsWithTolls
                            });
                        }
                    }
                );
            });
        }
    );
});

// Get tolls for a specific trip
router.get('/trips/:tripId/tolls', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const tripId = req.params.tripId;
    
    // First verify the trip belongs to the host
    db.get(
        `SELECT * FROM trips WHERE id = ? AND host_id = ? AND (trip_status IS NULL OR trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))`,
        [tripId, hostId],
        (err, trip) => {
            if (err || !trip) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Trip not found' 
                });
            }
            
            // Get all toll charges for this trip
            db.all(
                `SELECT 
                    tc.*,
                    ta.provider,
                    ta.account_number
                 FROM toll_charges tc
                 JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                 WHERE tc.trip_id = ?
                 ORDER BY tc.toll_date DESC`,
                [tripId],
                (err, tolls) => {
                    if (err) {
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to fetch tolls' 
                        });
                    }
                    
                    res.json({
                        success: true,
                        data: {
                            trip: trip,
                            tolls: tolls,
                            totalAmount: tolls.reduce((sum, toll) => sum + toll.toll_amount, 0),
                            tollCount: tolls.length
                        }
                    });
                }
            );
        }
    );
});

// Get in-progress trips (trips currently happening)
router.get('/trips/in-progress', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const now = Date.now();
    
    db.all(
        `SELECT 
            t.*,
            COUNT(CASE WHEN tc.id IS NOT NULL THEN 1 END) as toll_count,
            COALESCE(SUM(tc.toll_amount), 0) as total_tolls
         FROM trips t
         LEFT JOIN toll_charges tc ON t.id = tc.trip_id
         WHERE t.host_id = ? 
         AND t.start_date <= ?
         AND t.end_date >= ?
         AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected', 'completed'))
         GROUP BY t.id
         ORDER BY t.start_date DESC`,
        [hostId, now, now],
        (err, trips) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to fetch in-progress trips' 
                });
            }
            
            res.json({
                success: true,
                data: trips
            });
        }
    );
});

// Get personal driving tolls (business expenses from host driving outside rental periods)
router.get('/tolls/personal', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    console.log('🔍 Personal tolls endpoint - Authentication restored:', {
        hostId: hostId,
        message: 'Using session hostId with temporary fix applied'
    });
    
    db.all(
        `SELECT 
            tc.*,
            ta.account_number,
            ta.provider,
            tm.transponder_number,
            tm.vehicle_description
         FROM toll_charges tc
         JOIN toll_accounts ta ON tc.toll_account_id = ta.id
         LEFT JOIN transponder_mappings tm ON ((tc.plate_number = tm.vehicle_plate OR tc.transponder_id = tm.transponder_number) AND ta.host_id = tm.host_id)
         WHERE ta.host_id = ? 
         AND (tc.trip_id IS NULL OR tc.is_matched = 0)
         AND tc.toll_date IS NOT NULL
         ORDER BY tc.toll_date DESC
         LIMIT 200`,
        [hostId],
        (err, tolls) => {
            if (err) {
                console.error('❌ Personal tolls query error:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to fetch personal tolls' 
                });
            }
            
            console.log(`📋 Personal tolls query returned ${tolls.length} results for host ${hostId}`);
            if (tolls.length > 0) {
                console.log('📋 Sample toll data:', tolls[0]);
            }
            
            // Format for the display function
            const formattedTolls = tolls.map(toll => ({
                id: toll.id,
                transaction_id: toll.transaction_id,
                toll_date: toll.toll_date,
                toll_time: new Date(toll.toll_date).toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                }),
                location: toll.toll_location || 'Unknown Location',
                vehicle: toll.vehicle_description || `Vehicle ${toll.plate_number}`,
                plate_number: toll.plate_number,
                transponder_id: toll.transponder_id,  // ← Fixed: Frontend expects 'transponder_id'
                transponder_number: toll.transponder_number,  // Keep for compatibility
                vehicle_description: toll.vehicle_description,  // ← Added: Frontend expects 'vehicle_description'
                amount: parseFloat(toll.toll_amount || 0),
                provider: toll.provider,
                account_info: `${toll.provider} (${toll.account_number})`
            }));
            
            console.log(`📋 Sending ${formattedTolls.length} formatted tolls to frontend`);
            if (formattedTolls.length > 0) {
                console.log('📋 Sample formatted toll:', formattedTolls[0]);
            }
            
            res.json({
                success: true,
                data: formattedTolls
            });
        }
    );
});

// Get toll matching overview - shows matched vs personal driving tolls for analysis
router.get('/tolls/matching-overview', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    
    console.log('📊 Toll matching overview requested for host:', hostId);
    
    // Get comprehensive toll matching statistics
    const queries = {
        // Total tolls
        totalTolls: `SELECT COUNT(*) as count FROM toll_charges tc 
                     JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                     WHERE ta.host_id = ? AND (tc.is_archived = 0 OR tc.is_archived IS NULL)`,
        
        // Matched tolls (using is_matched flag for consistency)
        matchedTolls: `SELECT COUNT(*) as count FROM toll_charges tc 
                       JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                       WHERE ta.host_id = ? AND tc.is_matched = 1 AND (tc.is_archived = 0 OR tc.is_archived IS NULL)`,
        
        // Personal driving tolls (not matched to rentals)
        personalDrivingTolls: `SELECT COUNT(*) as count FROM toll_charges tc 
                         JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                         WHERE ta.host_id = ? AND tc.is_matched = 0 AND (tc.is_archived = 0 OR tc.is_archived IS NULL)`,
        
        // All matched tolls with details (removed LIMIT to show all)
        recentMatches: `SELECT tc.*, ta.provider, t.renter_name, t.turo_trip_id, t.vehicle_plate
                        FROM toll_charges tc 
                        JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                        LEFT JOIN trips t ON tc.trip_id = t.id
                        WHERE ta.host_id = ? AND tc.trip_id IS NOT NULL AND (tc.is_archived = 0 OR tc.is_archived IS NULL)
                        ORDER BY tc.toll_date DESC`,
        
        // All personal driving tolls with details (removed LIMIT to show all)
        recentPersonalDriving: `SELECT tc.*, ta.provider, tm.transponder_number, tm.vehicle_description
                          FROM toll_charges tc 
                          JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                          LEFT JOIN transponder_mappings tm ON ((tc.plate_number = tm.vehicle_plate OR tc.transponder_id = tm.transponder_number) AND ta.host_id = tm.host_id)
                          WHERE ta.host_id = ? AND (tc.trip_id IS NULL OR tc.is_matched = 0) AND (tc.is_archived = 0 OR tc.is_archived IS NULL)
                          ORDER BY tc.toll_date DESC`,
        
        // Matching accuracy by date range
        matchingByDate: `SELECT 
                           DATE(tc.toll_date/1000, 'unixepoch') as toll_date,
                           COUNT(*) as total_tolls,
                           COUNT(tc.trip_id) as matched_tolls,
                           (COUNT(tc.trip_id) * 100.0 / COUNT(*)) as match_percentage
                         FROM toll_charges tc 
                         JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                         WHERE ta.host_id = ? AND (tc.is_archived = 0 OR tc.is_archived IS NULL)
                         GROUP BY DATE(tc.toll_date/1000, 'unixepoch')
                         ORDER BY toll_date DESC 
                         LIMIT 30`
    };
    
    const results = {};
    let completed = 0;
    
    Object.keys(queries).forEach(key => {
        db.all(queries[key], [hostId], (err, rows) => {
            if (err) {
                console.error(`❌ Error in ${key} query:`, err);
                results[key] = key === 'recentMatches' || key === 'recentPersonalDriving' || key === 'matchingByDate' ? [] : { count: 0 };
            } else {
                results[key] = rows;
            }
            
            completed++;
            if (completed === Object.keys(queries).length) {
                // All queries completed, send response
                const overview = {
                    totalTolls: results.totalTolls[0]?.count || 0,
                    matchedTolls: results.matchedTolls[0]?.count || 0,
                    unmatchedTolls: results.personalDrivingTolls[0]?.count || 0,
                    matchingAccuracy: (() => {
                        const matched = results.matchedTolls[0]?.count || 0;
                        const personalDriving = results.personalDrivingTolls[0]?.count || 0;
                        const total = results.totalTolls[0]?.count || 0;
                        const tripTolls = total - personalDriving;
                        // Calculate accuracy only based on tolls from trips, not personal driving
                        return tripTolls > 0 ? ((matched / tripTolls) * 100).toFixed(1) : '100.0';
                    })(),
                    recentMatches: results.recentMatches.map(toll => ({
                        id: toll.id,
                        toll_date: toll.toll_date,
                        toll_location: toll.toll_location,
                        toll_amount: parseFloat(toll.toll_amount),
                        plate_number: toll.plate_number,
                        provider: toll.provider,
                        trip: {
                            id: toll.trip_id,
                            renter_name: toll.renter_name,
                            turo_trip_id: toll.turo_trip_id,
                            vehicle_plate: toll.vehicle_plate
                        }
                    })),
                    recentUnmatched: results.recentPersonalDriving.map(toll => ({
                        id: toll.id,
                        toll_date: toll.toll_date,
                        toll_location: toll.toll_location,
                        toll_amount: parseFloat(toll.toll_amount),
                        plate_number: toll.plate_number,
                        provider: toll.provider,
                        transponder_number: toll.transponder_number,
                        vehicle_description: toll.vehicle_description
                    })),
                    matchingByDate: results.matchingByDate.map(row => ({
                        date: row.toll_date,
                        total_tolls: row.total_tolls,
                        matched_tolls: row.matched_tolls,
                        match_percentage: parseFloat(row.match_percentage || 0).toFixed(1)
                    }))
                };
                
                console.log('📊 Toll matching overview summary:', {
                    total: overview.totalTolls,
                    matched: overview.matchedTolls,
                    unmatched: overview.unmatchedTolls,
                    accuracy: overview.matchingAccuracy + '%'
                });
                
                res.json({
                    success: true,
                    data: overview
                });
            }
        });
    });
});

// Add new trip
router.post('/trips', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const { turoTripId, renterName, renterEmail, vehiclePlate, startDate, endDate } = req.body;
    
    if (!turoTripId || !renterName || !vehiclePlate || !startDate || !endDate) {
        return res.status(400).json({ 
            success: false, 
            error: 'Required fields missing' 
        });
    }
    
    db.run(
        `INSERT INTO trips (host_id, turo_trip_id, renter_name, renter_email, vehicle_plate, start_date, end_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [hostId, turoTripId, renterName, renterEmail, vehiclePlate, startDate, endDate],
        function(err) {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to add trip' 
                });
            }
            
            res.json({
                success: true,
                message: 'Trip added successfully',
                tripId: this.lastID
            });
        }
    );
});

// Activate trip (change status from upcoming to active)
router.put('/trips/:tripId/activate', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const tripId = req.params.tripId;
    
    // Verify trip belongs to host and update status
    db.run(
        `UPDATE trips SET trip_status = 'active' WHERE id = ? AND host_id = ?`,
        [tripId, hostId],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to activate trip'
                });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Trip not found or already activated'
                });
            }
            
            res.json({
                success: true,
                message: 'Trip activated successfully',
                tripId: parseInt(tripId)
            });
        }
    );
});

// CSV Processing Helper Functions
function parseTuroCSV(csvData) {
    try {
        console.log('📝 Parsing Turo CSV data...');
        const lines = csvData.trim().split('\n');
        console.log(`📋 Found ${lines.length} lines in Turo CSV`);
        
        if (lines.length < 3) {
            throw new Error('Turo CSV appears to be empty or invalid');
        }
        
        // Debug: log first few lines to understand structure
        console.log('🔍 Line 0:', lines[0]);
        console.log('🔍 Line 1:', lines[1]);
        console.log('🔍 Line 2:', lines[2]);
        
        // Find the actual header line by looking for typical column names
        let headerLineIndex = -1;
        let headers = [];
        
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const parsedLine = parseCSVLine(lines[i]);
            console.log(`🔍 Testing line ${i} for headers:`, parsedLine);
            
            // Check if this line contains typical Turo headers (must have multiple columns)
            if (parsedLine.length > 3 && parsedLine.some(col => 
                col.toLowerCase().includes('reservation') && col.toLowerCase().includes('id') ||
                col.toLowerCase().includes('guest') ||
                col.toLowerCase().includes('vehicle') && col.toLowerCase().includes('name')
            )) {
                headerLineIndex = i;
                headers = parsedLine.map(h => h.trim());
                break;
            }
        }
        
        if (headerLineIndex === -1) {
            throw new Error('Could not find valid headers in Turo CSV');
        }
        
        console.log('📋 Found Turo headers at line', headerLineIndex, ':', headers);
        const trips = [];
    
        // Process data rows (starting from line after headers)
        for (let i = headerLineIndex + 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = parseCSVLine(lines[i]);
            const trip = {};
        
        headers.forEach((header, index) => {
            trip[header] = values[index] || '';
        });
        
        // Parse dates - handle real Turo format: "2025-04-05 10:00 AM"
        if (trip['Trip start']) {
            trip.startDate = new Date(trip['Trip start']);
        }
        if (trip['Trip end']) {
            trip.endDate = new Date(trip['Trip end']);
        }
        
        // Extract key identifiers
        trip.reservationId = trip['Reservation ID'];
        trip.turoTripId = trip['Reservation ID']; // Map reservationId to turoTripId for database storage
        
        // Extract plate from Vehicle field - real format: "Elias's Mazda (NY #LPJ3806)"
        const vehicleString = trip['Vehicle'] || trip['Vehicle Name'] || trip['Vehicle name'];
        trip.vehiclePlate = normalizeVehiclePlate(extractPlateNumber(vehicleString));
        trip.guest = trip['Guest'];
        trip.status = trip['Trip status'];
        
        // Extract toll information if available
        if (trip['Tolls & tickets']) {
            const tollStr = trip['Tolls & tickets'].replace(/[$,]/g, '');
            trip.tollAmount = parseFloat(tollStr) || 0;
        }
        
        // Only include active/completed trips - filter out cancelled trips
        const tripStatus = (trip.status || '').toLowerCase();
        const isCancelled = tripStatus.includes('cancel') || tripStatus.includes('decline') || 
                           tripStatus.includes('expired') || tripStatus.includes('terminated') || 
                           tripStatus.includes('rejected');
        
        if (!isCancelled) {
            trips.push(trip);
        } else {
            console.log(`🚫 Filtered out cancelled trip: ${trip.reservationId} (Status: ${trip.status})`);
        }
    }
    
        console.log('🚗 Sample Turo trip:', trips.length > 0 ? JSON.stringify(trips[0], null, 2) : 'No trips found');
        return trips;
    } catch (error) {
        console.error('❌ Turo CSV parsing error:', error);
        return [];
    }
}

function parseEZPassCSV(csvData) {
    try {
        console.log('📝 Parsing E-ZPass CSV data...');
        const lines = csvData.trim().split('\n');
        console.log(`📋 Found ${lines.length} lines in E-ZPass CSV`);
        
        if (lines.length < 3) {
            throw new Error('E-ZPass CSV appears to be empty or invalid');
        }
        
        // Debug: log first few lines to understand structure
        console.log('🔍 Line 0:', lines[0]);
        console.log('🔍 Line 1:', lines[1]);
        console.log('🔍 Line 2:', lines[2]);
        
        // Find the actual header line by looking for typical column names
        let headerLineIndex = -1;
        let headers = [];
        
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const parsedLine = parseCSVLine(lines[i]);
            console.log(`🔍 Testing line ${i} for headers:`, parsedLine);
            
            // Check if this line contains typical E-ZPass headers
            if (parsedLine.some(col => 
                col.toLowerCase().includes('posted') || 
                col.toLowerCase().includes('date') ||
                col.toLowerCase().includes('plate') ||
                col.toLowerCase().includes('tag') ||
                col.toLowerCase().includes('amount')
            )) {
                headerLineIndex = i;
                headers = parsedLine.map(h => h.trim());
                break;
            }
        }
        
        if (headerLineIndex === -1) {
            throw new Error('Could not find valid headers in E-ZPass CSV');
        }
        
        console.log('📋 Found E-ZPass headers at line', headerLineIndex, ':', headers);
        const tolls = [];
    
        // Process data rows (starting from line after headers)
        for (let i = headerLineIndex + 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = parseCSVLine(lines[i]);
            const toll = {};
        
        headers.forEach((header, index) => {
            toll[header] = values[index] || '';
        });
        
        // Parse and standardize toll data
        const tagPlateField = toll['Tag/Plate #'] || toll['Plate'] || '';
        
        // Extract plate number if present, or store as transponder ID
        if (tagPlateField.match(/^[A-Z]{2,3}\s+[A-Z0-9]+$/)) {
            // Format: "NY LLL1078" - extract plate
            toll.plateNumber = cleanPlateNumber(tagPlateField);
            toll.transponderId = null;
        } else if (tagPlateField.match(/^\d{10,11}$/)) {
            // Format: "08600713744" or "8600713744" - transponder ID only
            // Add leading zero if missing (EZ-Pass sometimes drops it)
            toll.transponderId = tagPlateField.length === 10 ? '0' + tagPlateField : tagPlateField;
            toll.plateNumber = null;
        } else if (tagPlateField.length > 0) {
            // Try to extract plate from mixed format
            toll.plateNumber = cleanPlateNumber(tagPlateField);
            toll.transponderId = null;
        } else {
            // No data
            toll.plateNumber = null;
            toll.transponderId = null;
        }
        
        // Parse dates with proper Date+Time handling for EZ-Pass CSV
        if (toll['Posted Date']) {
            const postedDateStr = toll['Posted Date'];
            if (postedDateStr.includes('/')) {
                const [month, day, year] = postedDateStr.split('/');
                toll.postedDate = new Date(year, month - 1, day);
            } else {
                toll.postedDate = new Date(toll['Posted Date']);
            }
        }
        
        // Parse transaction date and time (primary toll timestamp)
        if (toll['Date']) {
            const transDateStr = toll['Date'];
            const timeStr = toll['Time'] || '12:00 AM'; // Default time if missing
            
            let transactionDate;
            if (transDateStr.includes('/')) {
                const [month, day, year] = transDateStr.split('/');
                transactionDate = new Date(year, month - 1, day);
            } else {
                transactionDate = new Date(toll['Date']);
            }
            
            // Parse time and add to date (handle formats like "08:05 PM")
            if (timeStr && timeStr.includes(':')) {
                const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
                if (timeMatch) {
                    let hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const isPM = timeMatch[3] && timeMatch[3].toUpperCase() === 'PM';
                    
                    // Convert to 24-hour format
                    if (isPM && hours !== 12) hours += 12;
                    if (!isPM && hours === 12) hours = 0;
                    
                    transactionDate.setHours(hours, minutes, 0, 0);
                }
            }
            
            toll.transactionDate = transactionDate;
        } else {
            toll.transactionDate = toll.postedDate;
        }
        
        // Parse amount and make positive (E-ZPass shows tolls as negative debits like -$9.00)
        const amountStr = toll['Amount'] || '0';
        const cleanAmount = amountStr.replace(/[$,-]/g, '');
        toll.amount = Math.abs(parseFloat(cleanAmount)) || 0;
        
        // Build location string from Entry/Exit plazas
        const entryPlaza = toll['Entry Plaza'] || '';
        const exitPlaza = toll['Exit Plaza'] || '';
        toll.location = entryPlaza && exitPlaza ? `${entryPlaza} → ${exitPlaza}` : (entryPlaza || exitPlaza || 'Unknown');
        toll.agency = toll['Agency'];
        
        // Generate robust transaction ID with fallback for null/empty lane IDs
        let laneId = toll['Lane Txn ID'];
        if (!laneId || laneId.trim() === '' || laneId === 'null' || laneId === 'undefined') {
            // Generate unique transaction ID using timestamp and toll data
            const dateStr = toll.postedDate ? toll.postedDate.getTime() : Date.now();
            const amountStr = Math.round(toll.amount * 100).toString();
            const locationHash = toll.location.replace(/\s+/g, '').substring(0, 8);
            laneId = `EZ_${dateStr}_${amountStr}_${locationHash}_${i}`;
        }
        toll.laneId = laneId;
        
        tolls.push(toll);
    }
    
            // Check for duplicate transaction IDs and resolve them
        const transactionIds = new Set();
        let duplicateCount = 0;
        
        for (let toll of tolls) {
            let originalId = toll.laneId;
            let counter = 1;
            
            while (transactionIds.has(toll.laneId)) {
                toll.laneId = `${originalId}_DUP_${counter}`;
                counter++;
                duplicateCount++;
            }
            
            transactionIds.add(toll.laneId);
        }
        
        if (duplicateCount > 0) {
            console.log(`⚠️ Resolved ${duplicateCount} duplicate transaction IDs`);
        }
        
        console.log('🛣️ Sample E-ZPass toll:', tolls.length > 0 ? JSON.stringify(tolls[0], null, 2) : 'No tolls found');
        console.log(`✅ Generated ${tolls.length} unique transaction IDs`);
        return tolls;
    } catch (error) {
        console.error('❌ E-ZPass CSV parsing error:', error);
        return [];
    }
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
}

function extractPlateNumber(vehicleString) {
    // Extract plate number from vehicle string
    // Real Turo format: "Elias's Mazda (NY #LPJ3806)"
    // Also supports: "2019 Honda Civic (ABC123)" and "2023 Toyota Camry #LPJ3806"
    if (!vehicleString || typeof vehicleString !== 'string') {
        return '';
    }
    
    // First try parentheses with state prefix: "Elias's Mazda (NY #LPJ3806)"
    let match = vehicleString.match(/\([A-Z]{2}\s*#([A-Z0-9]+)\)/);
    if (match) {
        return cleanPlateNumber(match[1]);
    }
    
    // Then try parentheses format: "2019 Honda Civic (ABC123)"
    match = vehicleString.match(/\(([^)]+)\)/);
    if (match) {
        return cleanPlateNumber(match[1]);
    }
    
    // Then try # prefix format: "2023 Toyota Camry #LPJ3806"
    match = vehicleString.match(/#([A-Z0-9]+)/);
    if (match) {
        return cleanPlateNumber(match[1]);
    }
    
    return '';
}

function cleanPlateNumber(plate) {
    if (!plate) return '';
    // Remove state prefixes, hash symbols, and clean up
    return plate.replace(/^(NY|NJ|CT|PA|MA|FL)\s*/, '').replace(/^#/, '').trim().toUpperCase();
}

// Get transponder-to-plate mapping from database (real data only)
async function getTransponderMapping(hostId) {
    return new Promise((resolve) => {
        const sql = `SELECT transponder_number, vehicle_plate FROM transponder_mappings WHERE host_id = ? AND is_active = 1`;
        db.all(sql, [hostId], (err, rows) => {
            if (err) {
                console.error('❌ Error fetching transponder mapping:', err);
                resolve({});
                return;
            }
            
            const mapping = {};
            rows.forEach(row => {
                mapping[row.transponder_number] = row.vehicle_plate;
            });
            
            console.log('🔍 Transponder mapping loaded:', mapping);
            resolve(mapping);
        });
    });
}

// Convert transponder ID to plate number using real database data
function getPlateFromTransponder(transponderId, mapping) {
    return mapping[transponderId] || null;
}

async function performTollMatching(turoTrips, ezpassTolls, hostId) {
    const matches = [];
    const needsReview = [];
    const confidenceStats = { high: 0, medium: 0, low: 0 };
    
    console.log('🎯 Starting EXACT toll matching (no fuzzy logic, pure CSV data)...');
    
    // Load real transponder mapping from database
    const transponderMapping = await getTransponderMapping(hostId);
    
    ezpassTolls.forEach((toll, tollIndex) => {
        const potentialMatches = [];
        
        turoTrips.forEach((trip, tripIndex) => {
            const score = calculateMatchScore(toll, trip, transponderMapping);
            
            // ONLY accept PERFECT matches (exact plate + exact time)
            if (score.total === 1.0 && score.exact_match === true) {
                potentialMatches.push({
                    trip,
                    tripIndex,
                    toll,
                    tollIndex,
                    score,
                    confidence: score.total
                });
            }
        });
        
        if (potentialMatches.length > 0) {
            // All matches are perfect (1.0) so take the first one
            const perfectMatch = potentialMatches[0];
            
            matches.push({
                ...perfectMatch,
                status: 'matched',
                confidence_level: 'perfect' // All matches are now perfect
            });
            confidenceStats.high++; // Count as high confidence
            
            console.log(`🎯 PERFECT MATCH: Toll ${toll.laneId} matched to Trip ${perfectMatch.trip.reservationId}`);
        } else {
            // No exact matches found
            needsReview.push({
                toll,
                tollIndex,
                trip: null,
                confidence: 0,
                status: 'no_exact_match',
                confidence_level: 'none'
            });
            
            console.log(`❌ NO EXACT MATCH: Toll ${toll.laneId} (plate: ${toll.plateNumber}, time: ${toll.transactionDate})`);
        }
    });
    
    const summary = {
        total_tolls: ezpassTolls.length,
        total_trips: turoTrips.length,
        high_confidence_matches: confidenceStats.high,
        medium_confidence_matches: confidenceStats.medium,
        low_confidence_matches: confidenceStats.low,
        no_matches: needsReview.filter(r => r.status === 'no_match').length
    };
    
    console.log('📊 Matching summary:', summary);
    
    return {
        matches,
        needsReview,
        confidenceStats,
        summary
    };
}

function calculateMatchScore(toll, trip, transponderMapping) {
    let score = {
        plate: 0,
        time: 0,
        exact_match: false,
        total: 0
    };
    
    // Determine the toll's plate (either from plate field or transponder lookup)
    let tollPlate = null;
    let matchMethod = '';
    
    if (toll.plateNumber) {
        tollPlate = toll.plateNumber;
        matchMethod = 'plate';
        console.log(`🔍 Using toll plate: "${tollPlate}"`);
    } else if (toll.transponderId) {
        tollPlate = getPlateFromTransponder(toll.transponderId, transponderMapping);
        matchMethod = 'transponder';
        console.log(`🔍 Using transponder ${toll.transponderId} → plate: "${tollPlate}"`);
    }
    
    console.log(`🔍 Matching ${matchMethod} "${tollPlate}" with trip plate "${trip.vehiclePlate}"`);
    console.log(`🕐 Toll time: ${toll.transactionDate}, Trip: ${trip.startDate} to ${trip.endDate}`);
    
    // EXACT plate number matching ONLY - no partial matches
    if (tollPlate && trip.vehiclePlate) {
        // Clean both plates for exact comparison
        const cleanTollPlate = tollPlate.replace(/[^A-Z0-9]/g, '').toUpperCase();
        const cleanTripPlate = trip.vehiclePlate.replace(/[^A-Z0-9]/g, '').toUpperCase();
        
        if (cleanTollPlate === cleanTripPlate) {
            score.plate = 1.0; // EXACT match only
            console.log(`✅ EXACT ${matchMethod} match: ${cleanTollPlate} = ${cleanTripPlate}`);
        } else {
            score.plate = 0; // NO partial matches
            console.log(`❌ No ${matchMethod} match: ${cleanTollPlate} ≠ ${cleanTripPlate}`);
            return score; // Exit early if plates don't match exactly
        }
    } else {
        console.log(`❌ Missing plate data: toll="${tollPlate}", trip="${trip.vehiclePlate}"`);
        return score; // Exit if no plate data
    }
    
    // EXACT time window matching - NO buffers, NO proximity
    if (toll.transactionDate && trip.startDate && trip.endDate) {
        const tollTime = toll.transactionDate.getTime();
        const tripStart = trip.startDate.getTime();
        const tripEnd = trip.endDate.getTime();
        
        console.log(`🕐 Time check: ${tollTime} >= ${tripStart} && ${tollTime} <= ${tripEnd}`);
        
        if (tollTime >= tripStart && tollTime <= tripEnd) {
            // Toll occurred EXACTLY during trip window
            score.time = 1.0;
            score.exact_match = true;
            console.log(`✅ EXACT time match: toll within trip window`);
        } else {
            score.time = 0; // NO proximity scoring
            console.log(`❌ Time mismatch: toll outside trip window`);
            return score; // Exit if time doesn't match exactly
        }
    } else {
        console.log(`❌ Missing time data`);
        return score; // Exit if no time data
    }
    
    // Only return positive score if BOTH plate AND time match exactly
    if (score.plate === 1.0 && score.time === 1.0) {
        score.total = 1.0; // Perfect exact match
        console.log(`🎯 PERFECT MATCH: plate + time both exact`);
    } else {
        score.total = 0; // No match
        console.log(`❌ Not a perfect match`);
    }
    
    return score;
}

async function storeTollMatchingResults(matchingResults, hostId, turoTrips, ezpassTolls, userEmail) {
    // Store CSV results in the database for persistence
    
    const dbUpdates = {
        trips_updated: 0,
        tolls_inserted: 0,
        tolls_filtered: 0,
        matches_created: 0
    };
    
    try {
        console.log('💾 Starting actual database storage...');
        
        // Supabase handles transactions automatically - no explicit BEGIN needed
        console.log('🔄 Starting database operations with Supabase');
        
        // Get list of known vehicles (plates and transponders) ONLY from user-provided mappings
        const { data: vehicleRows, error: vehicleError } = await supabaseAdmin
            .from('transponder_mappings')
            .select('vehicle_plate')
            .eq('host_id', hostId)
            .eq('is_active', true);
        
        if (vehicleError) {
            throw new Error(`Error fetching vehicle mappings: ${vehicleError.message}`);
        }
        
        const knownVehicles = new Set((vehicleRows || []).map(row => normalizeVehiclePlate(row.vehicle_plate)));
        
        const { data: transponderRows, error: transponderError } = await supabaseAdmin
            .from('transponder_mappings')
            .select('transponder_number')
            .eq('host_id', hostId)
            .eq('is_active', true);
        
        if (transponderError) {
            throw new Error(`Error fetching transponder mappings: ${transponderError.message}`);
        }
        
        const knownTransponders = new Set((transponderRows || []).map(row => row.transponder_number));
        
        console.log('🚗 Known vehicles:', Array.from(knownVehicles));
        console.log('🏷️ Known transponders:', Array.from(knownTransponders));
        
        // Get list of previously deleted/deactivated vehicles to avoid recreating them
        const { data: deletedMappings, error: deletedMappingsError } = await supabaseAdmin
            .from('transponder_mappings')
            .select('vehicle_plate')
            .eq('host_id', hostId)
            .eq('is_active', false);
            
        const { data: deletedPlates, error: deletedPlatesError } = await supabaseAdmin
            .from('deleted_transponder_plates')
            .select('vehicle_plate')
            .eq('host_id', hostId);
        
        if (deletedMappingsError || deletedPlatesError) {
            console.warn('⚠️ Could not fetch deleted vehicles - continuing without this check');
        }
        
        const deletedVehicles = new Set([
            ...(deletedMappings || []).map(row => normalizeVehiclePlate(row.vehicle_plate)),
            ...(deletedPlates || []).map(row => normalizeVehiclePlate(row.vehicle_plate))
        ]);
        
        console.log('❌ Previously deleted vehicles:', Array.from(deletedVehicles));
        
        // AUTO-DISCOVERY DISABLED: Per user request, only match against user-defined transponders
        // The system will no longer automatically create transponder mappings for unknown vehicles
        console.log('🚫 Auto-discovery disabled - only using user-defined transponder mappings');
        console.log('🔍 Known vehicles from user mappings:', Array.from(knownVehicles));
        
        /*
        // COMMENTED OUT: Auto-discovery code removed per user request
        // This prevented user control over which vehicles to track
        const discoveredVehicles = new Set();
        let nextTransponderId = 8600713750;
        ... [auto-discovery logic removed] ...
        */
        
        // 1. Insert trips from CSV into trips table (exclude cancelled trips)
        const activeTrips = turoTrips.filter(trip => {
            const tripStatus = (trip.status || '').toLowerCase();
            const isCancelled = tripStatus.includes('cancel') || tripStatus.includes('decline') || 
                               tripStatus.includes('expired') || tripStatus.includes('terminated') || 
                               tripStatus.includes('rejected');
            if (isCancelled) {
                console.log(`🚫 Database storage: Excluding cancelled trip ${trip.turoTripId} (Status: ${trip.status})`);
            }
            return !isCancelled;
        });
        
        console.log(`💾 Storing ${activeTrips.length}/${turoTrips.length} active trips to database`);
        
        for (let i = 0; i < activeTrips.length; i++) {
            const trip = activeTrips[i];
            console.log(`🔍 DEBUG: Inserting trip ${i + 1}/${activeTrips.length}:`, {
                hostId: hostId,
                turoTripId: trip.turoTripId,
                guest: trip.guest,
                vehiclePlate: normalizeVehiclePlate(trip.vehiclePlate),
                startDate: trip.startDate,
                endDate: trip.endDate,
                status: trip.status
            });
            
            // Ensure host exists in database (required for foreign key constraints)
            // If not, create a host record for the authenticated user
            const { data: hostExists, error: hostError } = await supabaseAdmin
                .from('hosts')
                .select('id, email')
                .eq('id', hostId)
                .single();
            
            if (!hostExists) {
                console.log(`🔧 Host ID ${hostId} not found in database - creating host record`);
                // Get email from session if available
                const hostEmail = userEmail || `user_${hostId}@system.generated`;
                
                const { data: newHost, error: createError } = await supabaseAdmin
                    .from('hosts')
                    .insert({
                        id: hostId,
                        email: hostEmail,
                        full_name: 'System Generated User'
                    })
                    .select()
                    .single();
                
                if (createError) {
                    console.error(`❌ Failed to create host record: ${createError.message}`);
                    throw createError;
                } else {
                    console.log(`✅ Created host record for ID ${hostId} with email ${userEmail}`);
                }
            } else {
                console.log(`✅ Host ID ${hostId} exists: ${hostExists.email}`);
            }
            
            // Check if trip already exists and has invoices (preserve for toll memory system)
            const { data: existingTrips, error: tripCheckError } = await supabaseAdmin
                .from('trips')
                .select(`
                    id,
                    invoices!inner(id)
                `)
                .eq('turo_trip_id', trip.turoTripId);
            
            if (tripCheckError && tripCheckError.code !== 'PGRST116') {
                throw new Error(`Error checking existing trip: ${tripCheckError.message}`);
            }
            
            const existingTripWithInvoice = existingTrips && existingTrips.length > 0 ? {
                id: existingTrips[0].id,
                invoice_count: existingTrips[0].invoices.length
            } : null;
            
            console.log(`🔍 DEBUG: Checking trip ${trip.turoTripId} for existing invoices:`, existingTripWithInvoice);
            
            if (existingTripWithInvoice && existingTripWithInvoice.invoice_count > 0) {
                console.log(`⚠️ Skipping trip ${trip.turoTripId} - already exists with ${existingTripWithInvoice.invoice_count} invoice(s) (preserved for toll memory)`);
                // Don't increment trips_updated since we're not modifying anything
            } else {
                console.log(`✅ Proceeding to insert trip ${trip.turoTripId} - no existing invoices`);
                
                const tripData = {
                    host_id: hostId,
                    turo_trip_id: trip.turoTripId,
                    renter_name: trip.guest,
                    renter_email: trip.guest,
                    vehicle_plate: normalizeVehiclePlate(trip.vehiclePlate),
                    start_date: trip.startDate.toISOString(),
                    end_date: trip.endDate.toISOString(),
                    trip_status: trip.status
                };
                
                console.log(`🔍 DEBUG: Inserting trip data:`, tripData);
                
                const { data: newTrip, error: tripError } = await supabaseAdmin
                    .from('trips')
                    .upsert(tripData, {
                        onConflict: 'turo_trip_id',
                        ignoreDuplicates: false
                    })
                    .select()
                    .single();
                
                if (tripError) {
                    console.error(`❌ Failed to insert trip ${i + 1}:`, {
                        error: tripError.message,
                        code: tripError.code,
                        hint: tripError.hint,
                        details: tripError.details,
                        tripData: tripData
                    });
                    throw tripError;
                } else if (!newTrip) {
                    console.error(`❌ Trip upsert returned no data for ${trip.turoTripId}`);
                    throw new Error(`Trip upsert failed - no data returned for ${trip.turoTripId}`);
                } else {
                    console.log(`✅ Successfully inserted trip ${i + 1}: ${trip.turoTripId} with database ID: ${newTrip.id}`);
                    
                    // Verify the trip was actually saved by querying it back
                    const { data: verifyTrip, error: verifyError } = await supabaseAdmin
                        .from('trips')
                        .select('id, turo_trip_id, vehicle_plate')
                        .eq('turo_trip_id', trip.turoTripId)
                        .eq('host_id', hostId)
                        .single();
                    
                    if (verifyError || !verifyTrip) {
                        console.error(`❌ CRITICAL: Trip ${trip.turoTripId} not found after insert!`, verifyError);
                        throw new Error(`Trip verification failed for ${trip.turoTripId}`);
                    } else {
                        console.log(`🔍 VERIFIED: Trip ${trip.turoTripId} saved with ID ${verifyTrip.id}, plate: ${verifyTrip.vehicle_plate}`);
                        dbUpdates.trips_updated++;
                    }
                }
            }
        }
        
        // 2. Insert tolls from CSV into toll_charges table (ONLY for known vehicles)
        // First get or create a toll account for CSV imports  
        // Get or create CSV toll account for this host
        const { data: existingTollAccount, error: tollAccountError } = await supabaseAdmin
            .from('toll_accounts')
            .select('id')
            .eq('host_id', hostId)
            .eq('provider', 'CSV Import')
            .single();
        
        let csvTollAccount;
        if (existingTollAccount) {
            console.log('✅ Using existing CSV toll account:', existingTollAccount.id);
            csvTollAccount = existingTollAccount;
        } else {
            console.log('🆕 Creating new CSV toll account for host:', hostId);
            let encryptedPassword;
            try {
                const crypto = require('../utils/crypto');
                encryptedPassword = crypto.encryptSensitiveData('csv_system_password', hostId.toString());
            } catch (cryptoError) {
                console.warn('⚠️ Crypto utility not available, using placeholder password');
                encryptedPassword = 'placeholder_encrypted_password';
            }
            
            const { data: newTollAccount, error: createTollAccountError } = await supabaseAdmin
                .from('toll_accounts')
                .insert({
                    host_id: hostId,
                    provider: 'CSV Import',
                    account_number: 'CSV_UPLOAD_' + Date.now(),
                    username: 'csv_import@system',
                    password_encrypted: encryptedPassword,
                    is_active: true
                })
                .select()
                .single();
            
            if (createTollAccountError) {
                throw new Error(`Failed to create toll account: ${createTollAccountError.message}`);
            }
            
            console.log('✅ Created new CSV toll account:', newTollAccount.id);
            csvTollAccount = newTollAccount;
        }
        
        for (const toll of ezpassTolls) {
            // FIXED: Store ALL tolls regardless of transponder mappings
            // This allows users to upload toll data first, then add transponder mappings later
            let shouldInsert = true; // Always insert tolls
            
            // Log whether toll matches known vehicles (for informational purposes)
            if (toll.plateNumber) {
                const cleanPlate = normalizeVehiclePlate(toll.plateNumber);
                if (knownVehicles.has(cleanPlate)) {
                    console.log(`✅ Toll matches known vehicle: ${toll.plateNumber} at ${toll.location}`);
                } else {
                    console.log(`⚠️ Toll for unmapped vehicle: ${toll.plateNumber} at ${toll.location} (can be mapped later)`);
                }
            } else if (toll.transponderId) {
                if (knownTransponders.has(toll.transponderId)) {
                    console.log(`✅ Toll matches known transponder: ${toll.transponderId} at ${toll.location}`);
                } else {
                    console.log(`⚠️ Toll for unmapped transponder: ${toll.transponderId} at ${toll.location} (can be mapped later)`);
                }
            }
            
            if (shouldInsert) {
                // Validate toll amount (must be > 0 and <= 200 per database constraint)
                if (!toll.amount || toll.amount <= 0 || toll.amount > 200) {
                    console.log(`⚠️ Skipping invalid toll amount: $${toll.amount} for transaction ${toll.laneId}`);
                    console.log('🔍 Toll details:', {
                        amount: toll.amount,
                        type: typeof toll.amount,
                        location: toll.location,
                        date: toll.transactionDate,
                        plate: toll.plateNumber
                    });
                    dbUpdates.tolls_skipped = (dbUpdates.tolls_skipped || 0) + 1;
                    continue;
                }

                console.log(`✅ Valid toll amount: $${toll.amount} for transaction ${toll.laneId}`);

                try {
                    // Check if transaction_id already exists to avoid UNIQUE constraint violations
                    const { data: existingToll, error: checkError } = await supabaseAdmin
                        .from('toll_charges')
                        .select('id')
                        .eq('transaction_id', toll.laneId)
                        .single();
                    
                    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows found
                        throw new Error(`Database error checking duplicate transaction_id: ${checkError.message}`);
                    }
                    
                    if (existingToll) {
                        console.log(`⚠️ Skipping duplicate transaction_id: ${toll.laneId}`);
                        continue;
                    }

                    // Insert toll charge with Supabase
                    const { data: newTollCharge, error: insertError } = await supabaseAdmin
                        .from('toll_charges')
                        .insert({
                            toll_account_id: csvTollAccount.id,
                            toll_date: toll.transactionDate,
                            toll_location: toll.location,
                            toll_amount: toll.amount,
                            plate_number: toll.plateNumber,
                            transponder_id: toll.transponderId,
                            transaction_id: toll.laneId,
                            is_matched: false
                        })
                        .select()
                        .single();

                    if (insertError) {
                        if (insertError.code === '23503') { // Foreign key constraint
                            throw new Error(`Foreign key constraint violation: toll_account_id ${csvTollAccount.id} does not exist in toll_accounts table`);
                        } else if (insertError.code === '23505') { // Unique constraint
                            console.log(`⚠️ Skipping duplicate transaction_id: ${toll.laneId}`);
                            continue;
                        } else if (insertError.code === '23514') { // Check constraint
                            throw new Error(`Invalid toll amount: $${toll.amount} must be between $0.01 and $200.00`);
                        } else {
                            throw new Error(`Failed to insert toll charge: ${insertError.message}`);
                        }
                    }

                    console.log(`✅ Inserted toll: ${toll.laneId} for ${toll.plateNumber || toll.transponderId || 'unknown'}`);
                    dbUpdates.tolls_inserted++;

                } catch (error) {
                    console.error(`❌ Error inserting toll ${toll.laneId}:`, error.message);
                    throw error;
                }
            } else {
                dbUpdates.tolls_filtered++;
                console.log(`🚫 Filtered out toll for unknown vehicle: ${toll.plateNumber || toll.transponderId} at ${toll.location}`);
            }
        }
        
        // 3. Create match relationships for matched tolls
        for (const match of matchingResults.matches) {
            try {
                // Get the actual trip.id from turo_trip_id
                const { data: trip, error: tripError } = await supabaseAdmin
                    .from('trips')
                    .select('id')
                    .eq('turo_trip_id', match.trip.reservationId)
                    .eq('host_id', hostId)
                    .single();
                
                if (tripError) {
                    if (tripError.code === 'PGRST116') {
                        throw new Error(`Trip not found for turo_trip_id: ${match.trip.reservationId}`);
                    } else {
                        throw new Error(`Database error finding trip: ${tripError.message}`);
                    }
                }
                
                // Check if toll charge exists before updating
                const { data: tollCharge, error: tollError } = await supabaseAdmin
                    .from('toll_charges')
                    .select('id')
                    .eq('transaction_id', match.toll.laneId)
                    .single();
                
                if (tollError) {
                    if (tollError.code === 'PGRST116') {
                        throw new Error(`Toll charge with transaction_id ${match.toll.laneId} not found`);
                    } else {
                        throw new Error(`Database error finding toll charge: ${tollError.message}`);
                    }
                }
                
                // Update toll as matched with correct trip.id
                const { error: updateError } = await supabaseAdmin
                    .from('toll_charges')
                    .update({ 
                        is_matched: true, 
                        trip_id: trip.id 
                    })
                    .eq('transaction_id', match.toll.laneId);
                
                if (updateError) {
                    if (updateError.code === '23503') {
                        throw new Error(`Foreign key constraint violation: trip_id ${trip.id} does not exist in trips table`);
                    } else {
                        throw new Error(`Failed to update toll charge: ${updateError.message}`);
                    }
                }
                
                console.log(`✅ Matched toll ${match.toll.laneId} to trip ${trip.id}`);
                dbUpdates.matches_created++;
                
            } catch (error) {
                console.error(`❌ Error matching toll ${match.toll.laneId}:`, error.message);
                throw error;
            }
        }
        
        // Supabase operations are automatically committed
        console.log('✅ Database operations completed successfully');
        
        console.log('✅ Database storage complete:', dbUpdates);
        console.log(`✅ Filtered out ${dbUpdates.tolls_filtered} tolls from unknown vehicles`);
        
    } catch (error) {
        console.error('❌ Database storage error:', error);
        
        // Enhanced error classification
        let errorType = 'UNKNOWN_ERROR';
        let errorDetails = error.message;
        
        if (error.message.includes('FOREIGN KEY constraint failed')) {
            errorType = 'FOREIGN_KEY_VIOLATION';
            if (error.message.includes('toll_account_id')) {
                errorDetails = 'Toll account reference is invalid - toll_accounts table missing required record';
            } else if (error.message.includes('trip_id')) {
                errorDetails = 'Trip reference is invalid - trips table missing required record';
            } else if (error.message.includes('host_id')) {
                errorDetails = 'Host reference is invalid - hosts table missing required record';
            } else {
                errorDetails = `Foreign key constraint violated - referenced record does not exist. Host ID: ${hostId}`;
            }
        } else if (error.message.includes('UNIQUE constraint failed')) {
            errorType = 'DUPLICATE_RECORD';
            if (error.message.includes('transaction_id')) {
                errorDetails = 'Duplicate transaction ID - toll charge already exists';
            } else {
                errorDetails = 'Duplicate record - unique constraint violated';
            }
        } else if (error.message.includes('NOT NULL constraint failed')) {
            errorType = 'MISSING_REQUIRED_DATA';
            errorDetails = 'Required field is missing or null';
        }
        
        console.error('🔍 Error Classification:', {
            type: errorType,
            details: errorDetails,
            originalMessage: error.message,
            databaseUpdates: dbUpdates
        });
        
        // Rollback transaction on error
        try {
            await new Promise((resolve, reject) => {
                db.run('ROLLBACK', (rollbackErr) => {
                    if (rollbackErr) {
                        console.error('❌ Failed to rollback transaction:', rollbackErr.message);
                        reject(rollbackErr);
                    } else {
                        console.log('🔄 Transaction rolled back due to error');
                        resolve();
                    }
                });
            });
        } catch (rollbackError) {
            console.error('❌ Critical: Failed to rollback transaction:', rollbackError.message);
        }
        
        // Re-throw with enhanced error information
        const enhancedError = new Error(`${errorType}: ${errorDetails}`);
        enhancedError.originalError = error;
        enhancedError.errorType = errorType;
        enhancedError.dbUpdates = dbUpdates;
        throw enhancedError;
    }
    
    return dbUpdates;
}

// Enhanced plate matching with state prefix handling
function normalizeVehiclePlate(plateString) {
    if (!plateString) return '';
    
    // Convert to uppercase and remove common separators
    let normalized = plateString.toString().toUpperCase().trim();
    
    // Remove common state prefixes and formatting
    // NY LFA5222 -> LFA5222
    // NJ ABC123 -> ABC123
    // # prefix from Turo -> remove
    normalized = normalized
        .replace(/^(NY|NJ|PA|CT|MA|VT|NH|ME|RI|DE|MD|VA|WV|OH|MI|IN|IL|WI|MN|IA|MO|ND|SD|NE|KS|OK|TX|NM|CO|WY|MT|ID|UT|AZ|NV|CA|OR|WA|AK|HI|FL|GA|SC|NC|TN|KY|AL|MS|AR|LA|DC)\s+/, '')
        .replace(/^#/, '')
        .replace(/[^A-Z0-9]/g, '');
    
    return normalized;
}

// Process both Turo and E-ZPass CSV files
router.post('/csv/process-both', requireAuth, upload.fields([
    { name: 'turo-csv', maxCount: 1 },
    { name: 'ezpass-csv', maxCount: 1 }
]), async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        console.log('📄 CSV Processing request received for hostId:', hostId);
        console.log('🔍 DEBUG: Session info:', {
            hostId: hostId,
            sessionId: req.session.id,
            email: req.session.email
        });
        console.log('Files:', req.files);
        
        // Check if both files were uploaded
        if (!req.files || !req.files['turo-csv'] || !req.files['ezpass-csv']) {
            return res.status(400).json({
                success: false,
                error: 'Both Turo and E-ZPass CSV files are required'
            });
        }
        
        const turoFile = req.files['turo-csv'][0];
        const ezpassFile = req.files['ezpass-csv'][0];
        
        console.log(`📊 Processing files: Turo (${turoFile.originalname}), EZPass (${ezpassFile.originalname})`);
        
        // Parse CSV files with comprehensive processing
        const turoData = turoFile.buffer.toString('utf8');
        const ezpassData = ezpassFile.buffer.toString('utf8');
        
        console.log('📄 Turo CSV sample:', turoData.substring(0, 200));
        console.log('📄 EZPass CSV sample:', ezpassData.substring(0, 200));
        
        // Parse Turo CSV
        console.log('🔍 Starting Turo CSV parsing...');
        const turoTrips = parseTuroCSV(turoData);
        console.log(`🚗 Parsed ${turoTrips.length} Turo trips`);
        
        // Parse E-ZPass CSV
        console.log('🔍 Starting E-ZPass CSV parsing...');
        const ezpassTolls = parseEZPassCSV(ezpassData);
        console.log(`🛣️ Parsed ${ezpassTolls.length} E-ZPass tolls`);
        
        // Perform EXACT toll matching after CSV import
        console.log('🔍 Starting exact toll-to-trip matching...');
        const matchingResults = await performTollMatching(turoTrips, ezpassTolls, hostId);
        console.log(`🎯 Matching complete: ${matchingResults.matches.length} exact matches found`);
        
        // Store results in database
        console.log('🔍 Starting database storage...');
        const dbResults = await storeTollMatchingResults(matchingResults, hostId, turoTrips, ezpassTolls, req.session.email);
        console.log('💾 Database storage complete');
        
        // Clear dashboard cache to force fresh data load
        console.log('🗑️ Clearing dashboard cache...');
        const cacheKey = CacheKeys.dashboardSummary(hostId);
        await cacheManager.del(cacheKey);
        console.log('✅ Dashboard cache cleared');
        
        // Calculate matching statistics for user feedback
        const totalTollsFromCSV = ezpassTolls.length;
        const tollsFromUserVehicles = dbResults.tolls_inserted;
        const tollsFiltered = dbResults.tolls_filtered;
        const exactMatches = matchingResults.matches.length;
        const unmatchedTolls = tollsFromUserVehicles - exactMatches;
        const matchingRate = tollsFromUserVehicles > 0 ? ((exactMatches / tollsFromUserVehicles) * 100).toFixed(1) : 0;

        res.json({
            success: true,
            data: {
                trips_processed: turoTrips.length,
                tolls_imported: totalTollsFromCSV,
                tolls_filtered: tollsFiltered,
                tolls_from_your_vehicles: tollsFromUserVehicles,
                automatic_matches: exactMatches,
                unmatched_tolls: unmatchedTolls,
                matching_rate: `${matchingRate}%`,
                details: {
                    message: `Successfully processed CSV files and matched ${exactMatches} tolls to trips`,
                    turo_file: turoFile.originalname,
                    ezpass_file: ezpassFile.originalname,
                    summary: {
                        success: "✅ Exact matching complete",
                        filtered_out: `🚫 ${tollsFiltered} tolls from unknown vehicles (not your fleet)`,
                        processed: `🚗 ${tollsFromUserVehicles} tolls from your 3 vehicles`,
                        matched: `🎯 ${exactMatches} tolls matched to specific trips`,
                        unmatched: `🚗 ${unmatchedTolls} personal driving tolls found (business expenses)`
                    },
                    database_updates: dbResults
                }
            }
        });
        
    } catch (error) {
        console.error('❌ CSV processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// Process both Turo and E-ZPass CSV files with smart matching
router.post('/csv/process-both-smart', requireAuth, upload.fields([
    { name: 'turo-csv', maxCount: 1 },
    { name: 'ezpass-csv', maxCount: 1 }
]), async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        console.log('🎯 Smart CSV Processing request received for hostId:', hostId);
        console.log('🔍 DEBUG: Session info:', {
            hostId: hostId,
            sessionId: req.session.id,
            email: req.session.email
        });
        console.log('Files:', req.files);
        console.log('Body params:', req.body);
        console.log('🔍 DETAILED DEBUG: req.body contents:');
        console.log('  - dateRangeType:', typeof req.body.dateRangeType, '=', req.body.dateRangeType);
        console.log('  - dateRangeDays:', typeof req.body.dateRangeDays, '=', req.body.dateRangeDays);
        console.log('  - startDate:', typeof req.body.startDate, '=', req.body.startDate);
        console.log('  - endDate:', typeof req.body.endDate, '=', req.body.endDate);
        console.log('  - processAllTolls:', typeof req.body.processAllTolls, '=', req.body.processAllTolls);
        console.log('  - accuracyLevel:', typeof req.body.accuracyLevel, '=', req.body.accuracyLevel);
        
        // Check if both files were uploaded
        if (!req.files || !req.files['turo-csv'] || !req.files['ezpass-csv']) {
            return res.status(400).json({
                success: false,
                error: 'Both Turo and E-ZPass CSV files are required'
            });
        }
        
        const turoFile = req.files['turo-csv'][0];
        const ezpassFile = req.files['ezpass-csv'][0];
        
        // Get smart matching options from request
        const processAllTolls = req.body.processAllTolls === 'true';
        const accuracyLevel = parseInt(req.body.accuracyLevel) || 8;
        const useSmartMatching = req.body.useSmartMatching === 'true';
        
        // Get date range settings (new format from frontend)
        let dateFilter = null;
        console.log('🔍 DEBUG: Date range parameters:', {
            dateRangeType: req.body.dateRangeType,
            dateRangeDays: req.body.dateRangeDays,
            startDate: req.body.startDate,
            endDate: req.body.endDate
        });
        
        // Handle new date range format from frontend
        console.log('🔍 CHECKING DATE RANGE CONDITIONS:');
        console.log('  - req.body.dateRangeType exists?', !!req.body.dateRangeType);
        console.log('  - req.body.dateRangeDays exists?', !!req.body.dateRangeDays);
        console.log('  - Both exist?', !!(req.body.dateRangeType && req.body.dateRangeDays));
        
        // More lenient condition check - use string comparison to handle potential type issues
        const hasDateRangeType = req.body.dateRangeType && req.body.dateRangeType !== 'undefined';
        const hasDateRangeDays = req.body.dateRangeDays && req.body.dateRangeDays !== 'undefined';
        
        if (hasDateRangeType && hasDateRangeDays) {
            console.log('✅ Date range parameters found, processing...');
            if (req.body.dateRangeType === 'custom' && req.body.startDate && req.body.endDate) {
                // Server-side validation for custom date ranges
                const startDate = new Date(req.body.startDate);
                const endDate = new Date(req.body.endDate);
                const now = new Date();
                
                // Validate date format
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid date format. Please use YYYY-MM-DD format.'
                    });
                }
                
                // Validate date range logic
                if (startDate > endDate) {
                    return res.status(400).json({
                        success: false,
                        error: 'Start date cannot be after end date.'
                    });
                }
                
                // Validate reasonable date range (not more than 2 years in the past, not in future)
                const twoYearsAgo = new Date(now.getTime() - (2 * 365 * 24 * 60 * 60 * 1000));
                if (startDate < twoYearsAgo) {
                    return res.status(400).json({
                        success: false,
                        error: 'Start date cannot be more than 2 years in the past.'
                    });
                }
                
                if (endDate > now) {
                    return res.status(400).json({
                        success: false,
                        error: 'End date cannot be in the future.'
                    });
                }
                
                // Validate maximum range (not more than 1 year)
                const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1 year
                if ((endDate.getTime() - startDate.getTime()) > maxRangeMs) {
                    return res.status(400).json({
                        success: false,
                        error: 'Date range cannot exceed 1 year.'
                    });
                }
                
                dateFilter = {
                    filterType: 'custom',
                    fromDate: req.body.startDate,
                    toDate: req.body.endDate
                };
                console.log('📅 Using custom date range:', dateFilter);
            } else if (req.body.dateRangeType === 'preset') {
                // Server-side validation for preset ranges
                const days = parseInt(req.body.dateRangeDays);
                
                if (isNaN(days) || days <= 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid number of days. Must be a positive number.'
                    });
                }
                
                if (days > 730) { // Max 2 years
                    return res.status(400).json({
                        success: false,
                        error: 'Date range cannot exceed 730 days (2 years).'
                    });
                }
                
                dateFilter = {
                    filterType: 'days',
                    days: days
                };
                console.log('📅 Using preset date range:', dateFilter);
            } else {
                console.log('❌ Date range type not recognized:', req.body.dateRangeType);
            }
        } else {
            console.log('❌ Date range parameters missing or empty:');
            console.log('  - hasDateRangeType:', hasDateRangeType);
            console.log('  - hasDateRangeDays:', hasDateRangeDays);
        }
        
        // Fallback: Handle legacy dateFilter parameter
        if (!dateFilter && req.body.dateFilter) {
            try {
                dateFilter = JSON.parse(req.body.dateFilter);
                console.log('📅 Using legacy date filter settings:', dateFilter);
            } catch (error) {
                console.error('❌ Invalid date filter JSON:', error);
            }
        }
        
        if (!dateFilter) {
            console.log('📅 No date filter provided - processing all data');
        }
        
        console.log(`🎯 Processing files with smart matching: Turo (${turoFile.originalname}), EZPass (${ezpassFile.originalname})`);
        console.log(`⚙️ Smart matching settings: accuracy=${accuracyLevel}, processAll=${processAllTolls}, smartMatching=${useSmartMatching}`);
        
        // Parse CSV files first
        const turoData = turoFile.buffer.toString('utf8');
        const ezpassData = ezpassFile.buffer.toString('utf8');
        
        console.log('📄 Turo CSV sample:', turoData.substring(0, 200));
        console.log('📄 EZPass CSV sample:', ezpassData.substring(0, 200));
        
        // Parse Turo CSV
        console.log('🔍 Starting Turo CSV parsing...');
        const turoTrips = parseTuroCSV(turoData);
        console.log(`🚗 Parsed ${turoTrips.length} Turo trips`);
        
        // Parse E-ZPass CSV
        console.log('🔍 Starting E-ZPass CSV parsing...');
        const ezpassTolls = parseEZPassCSV(ezpassData);
        console.log(`🛣️ Parsed ${ezpassTolls.length} E-ZPass tolls`);
        
        // Apply date filtering if specified
        let filteredTuroTrips = turoTrips;
        let filteredEzpassTolls = ezpassTolls;
        
        if (dateFilter && dateFilter.filterType !== 'all') {
            console.log('📅 Applying date filtering...');
            
            let filterFromDate, filterToDate;
            
            if (dateFilter.filterType === 'custom') {
                filterFromDate = new Date(dateFilter.fromDate);
                filterToDate = new Date(dateFilter.toDate + 'T23:59:59'); // End of day
            } else if (dateFilter.filterType === 'days') {
                filterToDate = new Date();
                filterFromDate = new Date(filterToDate.getTime() - (dateFilter.days * 24 * 60 * 60 * 1000));
            }
            
            console.log(`📅 Filtering data from ${filterFromDate.toDateString()} to ${filterToDate.toDateString()}`);
            console.log(`📅 Filter dates: FROM ${filterFromDate.toISOString()} TO ${filterToDate.toISOString()}`);
            
            // Filter trips by start date
            const originalTripCount = filteredTuroTrips.length;
            filteredTuroTrips = filteredTuroTrips.filter(trip => {
                const tripDate = new Date(trip.startDate);
                const withinRange = tripDate >= filterFromDate && tripDate <= filterToDate;
                if (!withinRange && originalTripCount <= 5) {
                    console.log(`📅 TRIP FILTERED: ${trip.startDate} -> ${tripDate.toDateString()} (outside range)`);
                }
                return withinRange;
            });
            
            // Filter tolls by transaction date  
            const originalTollCount = filteredEzpassTolls.length;
            let filteredTollCount = 0;
            filteredEzpassTolls = filteredEzpassTolls.filter(toll => {
                const tollDate = new Date(toll.transactionDate);
                const withinRange = tollDate >= filterFromDate && tollDate <= filterToDate;
                if (!withinRange) {
                    filteredTollCount++;
                    if (filteredTollCount <= 5) {
                        console.log(`📅 TOLL FILTERED: ${toll.transactionDate} -> ${tollDate.toDateString()} (outside range)`);
                    }
                }
                return withinRange;
            });
            
            console.log(`📅 Date filtering results:`);
            console.log(`  - Trips: ${originalTripCount} → ${filteredTuroTrips.length} (${originalTripCount - filteredTuroTrips.length} filtered out)`);
            console.log(`  - Tolls: ${originalTollCount} → ${filteredEzpassTolls.length} (${originalTollCount - filteredEzpassTolls.length} filtered out)`);
        }
        
        // Store basic CSV data first
        console.log('📁 Storing CSV data in database...');
        const basicResults = await storeTollMatchingResults(
            { matches: [], unmatched: [] }, // Empty matching results for now
            hostId, 
            filteredTuroTrips, 
            filteredEzpassTolls,
            req.session.email
        );
        console.log('💾 Basic CSV storage complete');
        
        if (useSmartMatching) {
            // NEW: Use Simple Toll Matcher following user's exact specification
            console.log('🎯 Setting up Simple Toll Matching (User Spec)...');
            const simpleMatcher = new SimpleTollMatcher();
            
            // Create matching session ID for WebSocket tracking
            const matchingSessionId = `simple_matching_${hostId}_${Date.now()}`;
            console.log(`🎯 Created simple matching session: ${matchingSessionId}`);
            
            // Set up progress callback for real-time updates
            const progressCallback = (progress) => {
                console.log('🔔 Simple CSV matching progress:', progress);
                
                // Broadcast progress to connected WebSocket clients
                const sendToHost = req.app.get('sendToHost');
                if (sendToHost) {
                    const message = {
                        type: 'matching-progress',
                        sessionId: matchingSessionId,
                        hostId: hostId,
                        ...progress
                    };
                    console.log('📤 Sending simple matching WebSocket message:', message);
                    sendToHost(hostId, message);
                }
            };
            
            // Start simple matching following user's 4-step process
            console.log('🚀 Starting simple toll matching after CSV import...');
            
            // Add small delay to ensure all database transactions have committed
            console.log('⏱️ Waiting 2 seconds for database consistency...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const matchResult = await simpleMatcher.matchTollsToTrips(hostId, filteredTuroTrips, filteredEzpassTolls, progressCallback);
            
            // Send final completion event
            const sendToHost = req.app.get('sendToHost');
            if (sendToHost) {
                sendToHost(hostId, {
                    type: 'simple-matching-complete',
                    sessionId: matchingSessionId,
                    hostId: hostId,
                    result: matchResult
                });
            }
            
            // Clear dashboard cache to force fresh data load
            console.log('🗑️ Clearing dashboard cache...');
            const cacheKey = CacheKeys.dashboardSummary(hostId);
            await cacheManager.del(cacheKey);
            console.log('✅ Dashboard cache cleared');
            
            // Calculate enhanced statistics
            const enhancedStats = {
                trips_processed: turoTrips.length,
                tolls_imported: ezpassTolls.length,
                tolls_filtered: basicResults.tolls_filtered || 0,
                tolls_from_your_vehicles: basicResults.tolls_inserted || 0,
                smart_matches: matchResult.matchedCount,
                unmatched_tolls: matchResult.totalCharges - matchResult.matchedCount,
                matching_rate: `${((matchResult.matchedCount / Math.max(matchResult.totalCharges, 1)) * 100).toFixed(1)}%`,
                average_confidence: `${(parseFloat(matchResult.averageConfidence) * 100).toFixed(1)}%`,
                high_confidence_matches: matchResult.highConfidence,
                medium_confidence_matches: matchResult.mediumConfidence,
                low_confidence_matches: matchResult.lowConfidence
            };
            
            res.json({
                success: true,
                sessionId: matchingSessionId,
                message: `Smart CSV processing completed: ${matchResult.matchedCount}/${matchResult.totalCharges} tolls matched with ${matchResult.averageConfidence * 100}% avg confidence`,
                data: {
                    ...enhancedStats,
                    details: {
                        message: `Successfully processed CSV files with smart matching: ${matchResult.matchedCount} tolls matched`,
                        turo_file: turoFile.originalname,
                        ezpass_file: ezpassFile.originalname,
                        summary: {
                            success: "✅ Smart matching complete",
                            accuracy_level: accuracyLevel,
                            process_all_tolls: processAllTolls
                        }
                    }
                }
            });
        } else {
            // Fallback to basic matching
            console.log('🔍 Using basic toll matching...');
            const matchingResults = await performTollMatching(turoTrips, ezpassTolls, hostId);
            
            // Store matching results
            const results = await storeTollMatchingResults(matchingResults, hostId, turoTrips, ezpassTolls, req.session.email);
            
            // Clear cache
            const cacheKey = CacheKeys.dashboardSummary(hostId);
            await cacheManager.del(cacheKey);
            
            const basicStats = {
                trips_processed: turoTrips.length,
                tolls_imported: ezpassTolls.length,
                tolls_filtered: results.tolls_filtered,
                tolls_from_your_vehicles: results.tolls_inserted,
                automatic_matches: matchingResults.matches.length,
                unmatched_tolls: results.tolls_inserted - matchingResults.matches.length,
                matching_rate: `${((matchingResults.matches.length / Math.max(results.tolls_inserted, 1)) * 100).toFixed(1)}%`
            };
            
            res.json({
                success: true,
                message: `Basic CSV processing completed: ${matchingResults.matches.length} tolls matched`,
                data: basicStats
            });
        }
        
    } catch (error) {
        console.error('❌ Smart CSV processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Clear UNSUBMITTED data only (preserves toll memory system)
router.post('/clear-data', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        console.log('🧽 Clearing ALL data except Invoices and Transponders - requested by host:', hostId);
        
        const results = {
            toll_accounts_deleted: 0,
            trips_without_invoices_deleted: 0,
            toll_charges_archived: 0,
            toll_charges_without_invoices_deleted: 0,
            late_tolls_deleted: 0,
            analytics_cleared: 0,
            invoices_preserved: 0,
            transponder_mappings_preserved: 0
        };
        
        // Start a transaction and disable foreign keys temporarily
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('PRAGMA foreign_keys = OFF', (err) => {
                    if (err) reject(err);
                    else {
                        db.run('BEGIN TRANSACTION', (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    }
                });
            });
        });
        
        // Count what we're preserving (for user feedback)
        const preservedCount = await new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    (SELECT COUNT(*) FROM invoices) as invoices,
                    (SELECT COUNT(*) FROM invoice_items) as invoice_items,
                    (SELECT COUNT(*) FROM transponder_mappings WHERE host_id = ?) as transponder_mappings`,
                [hostId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows[0]);
                }
            );
        });
        
        console.log(`🛡️ PRESERVING: ${preservedCount.invoices} invoices, ${preservedCount.invoice_items} invoice items, ${preservedCount.transponder_mappings} transponder mappings`);
        
        // Archive toll charges referenced in invoices & delete those not in invoices
        await new Promise((resolve, reject) => {
            // First archive toll charges that are in invoices (preserve for toll memory)
            db.run(
                `UPDATE toll_charges 
                 SET is_archived = 1 
                 WHERE id IN (
                     SELECT DISTINCT toll_charge_id 
                     FROM invoice_items 
                     WHERE toll_charge_id IS NOT NULL
                 )`,
                function(err) {
                    if (err) reject(err);
                    else {
                        results.toll_charges_archived = this.changes;
                        console.log(`📁 Archived ${this.changes} toll charges for toll memory system`);
                        
                        // Then delete toll charges not in invoices
                        db.run(
                            `DELETE FROM toll_charges 
                             WHERE id NOT IN (
                                 SELECT DISTINCT toll_charge_id 
                                 FROM invoice_items 
                                 WHERE toll_charge_id IS NOT NULL
                             )`,
                            function(err) {
                                if (err) reject(err);
                                else {
                                    results.toll_charges_without_invoices_deleted = this.changes;
                                    console.log(`🗑️ Deleted ${this.changes} toll charges not in invoices`);
                                    resolve();
                                }
                            }
                        );
                    }
                }
            );
        });
        
        // Clear trips WITHOUT invoices AND not referenced by preserved toll_charges
        await new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM trips 
                 WHERE host_id = ?
                   AND id NOT IN (SELECT DISTINCT trip_id FROM invoices WHERE trip_id IS NOT NULL)
                   AND id NOT IN (SELECT DISTINCT trip_id FROM toll_charges WHERE trip_id IS NOT NULL)`,
                [hostId],
                function(err) {
                    if (err) reject(err);
                    else {
                        results.trips_without_invoices_deleted = this.changes;
                        console.log(`🗑️ Deleted ${this.changes} trips without invoices or toll references`);
                        resolve();
                    }
                }
            );
        });
        
        // Clear ONLY unreferenced toll accounts (preserve those referenced by archived toll_charges)
        await new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM toll_accounts 
                 WHERE host_id = ? 
                   AND id NOT IN (
                       SELECT DISTINCT toll_account_id 
                       FROM toll_charges 
                       WHERE toll_account_id IS NOT NULL
                         AND is_archived = 1
                   )`,
                [hostId],
                function(err) {
                    if (err) reject(err);
                    else {
                        results.toll_accounts_deleted = this.changes;
                        console.log(`🗑️ Deleted ${this.changes} toll accounts (preserved those referenced by archived charges)`);
                        resolve();
                    }
                }
            );
        });
        
        // Recreate any missing toll_accounts that are referenced by archived charges
        await new Promise((resolve, reject) => {
            db.all(
                `SELECT DISTINCT toll_account_id 
                 FROM toll_charges 
                 WHERE is_archived = 1 
                   AND toll_account_id IS NOT NULL
                   AND toll_account_id NOT IN (SELECT id FROM toll_accounts)`,
                [],
                (err, missingAccounts) => {
                    if (err) reject(err);
                    else if (missingAccounts.length === 0) {
                        console.log('✅ All archived toll charges have valid toll_account references');
                        resolve();
                    } else {
                        console.log(`🔧 Recreating ${missingAccounts.length} missing toll_accounts for archived charges`);
                        
                        let completed = 0;
                        for (const account of missingAccounts) {
                            db.run(
                                `INSERT INTO toll_accounts (id, host_id, provider, account_number, username, password_encrypted, is_active) 
                                 VALUES (?, ?, ?, ?, ?, ?, 0)`,
                                [account.toll_account_id, hostId, 'ARCHIVED', `ARCHIVED-${account.toll_account_id}`, 'archived@system', 'archived_password', 0],
                                (err) => {
                                    if (err) {
                                        console.warn(`⚠️ Could not recreate toll_account ${account.toll_account_id}:`, err.message);
                                    } else {
                                        console.log(`✅ Recreated toll_account ${account.toll_account_id}`);
                                    }
                                    
                                    completed++;
                                    if (completed === missingAccounts.length) {
                                        resolve();
                                    }
                                }
                            );
                        }
                    }
                }
            );
        });
        
        // Clear late tolls detected table
        await new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM late_tolls_detected 
                 WHERE trip_id IN (SELECT id FROM trips WHERE host_id = ?)`,
                [hostId],
                function(err) {
                    if (err) reject(err);
                    else {
                        results.late_tolls_deleted = this.changes;
                        console.log(`🗑️ Deleted ${this.changes} late toll detections`);
                        resolve();
                    }
                }
            );
        });
        
        // Store preserved counts for response
        results.invoices_preserved = preservedCount.invoices;
        results.transponder_mappings_preserved = preservedCount.transponder_mappings;
        
        // Clear analytics and logs (these can be safely cleared - don't affect toll memory)
        const analyticsTablesToClear = [
            'analytics_metrics',
            'automated_reports',
            'backup_logs',
            'bi_reports',
            'data_checkpoints',
            'financial_analytics',
            'notification_events',
            'notification_logs',
            'notification_queue',
            'performance_metrics',
            'predictive_analytics',
            'security_logs',
            'toll_location_analytics',
            'transaction_log',
            'trip_status_history',
            'trip_status_intelligence',
            'user_trip_patterns',
            'validation_errors',
            'vehicle_analytics',
            'ml_timing_patterns',
            'login_attempts'
            // NOTE: We preserve:
            // - invoices & invoice_items (toll memory system for preventing double-charging!)
            // - transponder_mappings (user vehicle configurations)
            // - deleted_transponder_plates (user preferences)
            // - hosts (needed for login)
            // DELETED for fresh start: toll_accounts, trips, toll_charges not in invoices
        ];
        
        let analyticsCleared = 0;
        for (const table of analyticsTablesToClear) {
            try {
                await new Promise((resolve, reject) => {
                    db.run(
                        `DELETE FROM ${table} WHERE EXISTS (
                            SELECT 1 FROM hosts WHERE id = ? 
                        )`,
                        [hostId],
                        function(err) {
                            if (err) {
                                console.warn(`⚠️ Could not clear analytics table ${table}:`, err.message);
                                resolve(); // Continue with other tables
                            } else {
                                analyticsCleared += this.changes;
                                console.log(`✅ Deleted ${this.changes} analytics records from ${table}`);
                                resolve();
                            }
                        }
                    );
                });
            } catch (error) {
                console.warn(`⚠️ Error clearing analytics table ${table}:`, error.message);
            }
        }
        
        results.analytics_cleared = analyticsCleared;
        
        // Commit the transaction and re-enable foreign keys
        await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
                if (err) reject(err);
                else {
                    db.run('PRAGMA foreign_keys = ON', (err) => {
                        if (err) reject(err);
                        else {
                            console.log('✅ Transaction committed successfully and foreign keys re-enabled');
                            resolve();
                        }
                    });
                }
            });
        });
        
        // Clear cache to force dashboard refresh
        const cacheKey = CacheKeys.dashboardSummary(hostId);
        await cacheManager.del(cacheKey);
        console.log('✅ Cache cleared');
        
        res.json({
            success: true,
            message: `Data cleared successfully. Preserved ${results.invoices_preserved} invoices and ${results.transponder_mappings_preserved} transponder mappings.`,
            data: results
        });
        
    } catch (error) {
        console.error('❌ Error clearing data:', error);
        
        // Rollback transaction on error and re-enable foreign keys
        await new Promise((resolve) => {
            db.run('ROLLBACK', (err) => {
                if (err) {
                    console.error('❌ Error rolling back transaction:', err);
                }
                db.run('PRAGMA foreign_keys = ON', (err2) => {
                    if (err2) {
                        console.error('❌ Error re-enabling foreign keys:', err2);
                    } else if (!err) {
                        console.log('⚠️ Transaction rolled back and foreign keys re-enabled');
                    }
                    resolve();
                });
            });
        });
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create invoice for a trip
router.post('/trips/create-invoice', requireAuth, (req, res) => {
    const { tripId, totalAmount, tollCount } = req.body;
    const hostId = req.session.hostId;
    
    if (!tripId || totalAmount === undefined || tollCount === undefined) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: tripId, totalAmount, tollCount'
        });
    }
    
    // First verify the trip belongs to the host
    db.get(
        `SELECT id FROM trips WHERE id = ? AND host_id = ?`,
        [tripId, hostId],
        (err, trip) => {
            if (err) {
                console.error('Error verifying trip:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Database error'
                });
            }
            
            if (!trip) {
                return res.status(404).json({
                    success: false,
                    error: 'Trip not found or access denied'
                });
            }
            
            // Generate invoice number
            const invoiceNumber = `INV-${Date.now()}-${tripId}`;
            
            // Insert invoice record
            db.run(
                `INSERT INTO invoices (
                    trip_id, invoice_number, total_amount, status
                ) VALUES (?, ?, ?, 'pending')`,
                [tripId, invoiceNumber, totalAmount],
                function(err) {
                    if (err) {
                        console.error('Error creating invoice:', err);
                        return res.status(500).json({
                            success: false,
                            error: 'Failed to create invoice'
                        });
                    }
                    
                    // Update trip status to indicate invoice created
                    db.run(
                        `UPDATE trips SET invoice_status = 'created', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                        [tripId],
                        (updateErr) => {
                            if (updateErr) {
                                console.error('Error updating trip status:', updateErr);
                                // Don't fail the response, invoice was created successfully
                            }
                            
                            res.json({
                                success: true,
                                invoiceId: invoiceNumber,
                                message: 'Invoice created successfully'
                            });
                        }
                    );
                }
            );
        }
    );
});

// Test endpoint for SimpleTollMatcher with database data
router.post('/test-simple-matcher', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    console.log('🧪 Testing SimpleTollMatcher with database data...');
    
    try {
        const SimpleTollMatcher = require('../services/simple-toll-matcher');
        const matcher = new SimpleTollMatcher();
        
        // Get trips from database (exclude cancelled trips)
        const trips = await new Promise((resolve, reject) => {
            db.all(
                `SELECT id, turo_trip_id, renter_name, vehicle_plate, start_date, end_date 
                 FROM trips WHERE host_id = ? 
                 AND (trip_status IS NULL OR (trip_status NOT LIKE '%cancel%' AND trip_status NOT LIKE '%decline%' AND trip_status NOT LIKE '%expired%' AND trip_status NOT LIKE '%terminated%' AND trip_status NOT LIKE '%rejected%'))
                 ORDER BY start_date DESC LIMIT 20`,
                [hostId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results.map(trip => ({
                        turoTripId: trip.turo_trip_id,
                        guest: trip.renter_name,
                        vehiclePlate: trip.vehicle_plate,
                        startDate: trip.start_date,
                        endDate: trip.end_date,
                        id: trip.id
                    })));
                }
            );
        });
        
        // Get tolls from database  
        const tolls = await new Promise((resolve, reject) => {
            db.all(
                `SELECT tc.id, tc.transaction_id, tc.plate_number, tc.transponder_id, tc.toll_date, tc.toll_location, tc.toll_amount
                 FROM toll_charges tc
                 JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                 WHERE ta.host_id = ? AND tc.is_matched = 0 AND (tc.is_archived = 0 OR tc.is_archived IS NULL)
                 ORDER BY tc.toll_date DESC LIMIT 50`,
                [hostId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results.map(toll => ({
                        laneId: toll.transaction_id,
                        plateNumber: toll.plate_number,
                        transponderId: toll.transponder_id,
                        transactionDate: toll.toll_date,
                        location: toll.toll_location,
                        amount: toll.toll_amount,
                        id: toll.id
                    })));
                }
            );
        });
        
        console.log(`🧪 Test data: ${trips.length} trips, ${tolls.length} tolls`);
        
        // Run matcher
        const result = await matcher.matchTollsToTrips(hostId, trips, tolls);
        
        res.json({
            success: true,
            message: 'SimpleTollMatcher test completed',
            result: result,
            testData: {
                tripsCount: trips.length,
                tollsCount: tolls.length
            }
        });
        
    } catch (error) {
        console.error('❌ SimpleTollMatcher test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;