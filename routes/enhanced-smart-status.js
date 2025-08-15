const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const EnhancedSmartStatus = require('../services/enhanced-smart-status');
const TuroIntegrationService = require('../services/turo-integration');

// Initialize services
const enhancedSmartStatus = new EnhancedSmartStatus();
const turoIntegration = new TuroIntegrationService();

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

// Get intelligence summary for dashboard
router.get('/summary', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        const summary = await enhancedSmartStatus.getIntelligenceSummary(hostId);
        
        res.json({
            success: true,
            data: summary
        });
        
    } catch (error) {
        console.error('❌ Error getting intelligence summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get intelligence summary'
        });
    }
});

// Run bulk smart status analysis
router.post('/bulk-analyze', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const { limit } = req.body;
    
    try {
        const result = await turoIntegration.bulkSmartStatusUpdate(hostId, { limit });
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (error) {
        console.error('❌ Error running bulk analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to run bulk analysis'
        });
    }
});

// Get enhanced status for a specific trip
router.get('/trip/:tripId', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const tripId = parseInt(req.params.tripId);
    
    try {
        // Get trip data
        const trip = await new Promise((resolve) => {
            db.get(
                'SELECT * FROM trips WHERE id = ? AND host_id = ?',
                [tripId, hostId],
                (err, trip) => resolve(err ? null : trip)
            );
        });
        
        if (!trip) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }
        
        // Run enhanced analysis
        const smartAnalysis = await enhancedSmartStatus.getEnhancedSmartStatus(trip, hostId);
        
        res.json({
            success: true,
            data: {
                trip: trip,
                analysis: smartAnalysis
            }
        });
        
    } catch (error) {
        console.error('❌ Error analyzing trip:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze trip'
        });
    }
});

// Manual status override
router.post('/override/:tripId', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const tripId = parseInt(req.params.tripId);
    const { status, reason } = req.body;
    
    if (!status) {
        return res.status(400).json({
            success: false,
            error: 'Status is required'
        });
    }
    
    try {
        // Verify trip belongs to user
        const trip = await new Promise((resolve) => {
            db.get(
                'SELECT * FROM trips WHERE id = ? AND host_id = ?',
                [tripId, hostId],
                (err, trip) => resolve(err ? null : trip)
            );
        });
        
        if (!trip) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }
        
        // Update manual override
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT OR REPLACE INTO trip_status_intelligence 
                (trip_id, host_id, manual_override, manual_override_reason, manual_override_at, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [tripId, hostId, status, reason || 'Manual override'], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // Log status change
        await new Promise((resolve) => {
            db.run(`
                INSERT INTO trip_status_history 
                (trip_id, host_id, old_status, new_status, change_source, confidence_score, change_reason, changed_at)
                VALUES (?, ?, ?, ?, 'manual', 1.0, ?, CURRENT_TIMESTAMP)
            `, [tripId, hostId, trip.trip_status, status, reason || 'Manual override'], () => {
                resolve();
            });
        });
        
        res.json({
            success: true,
            message: 'Status override applied successfully'
        });
        
    } catch (error) {
        console.error('❌ Error applying status override:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to apply status override'
        });
    }
});

// Get trips that need review
router.get('/needs-review', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        const tripsNeedingReview = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.*,
                    tsi.overall_confidence,
                    tsi.final_status,
                    tsi.needs_review,
                    COUNT(tc.id) as toll_count,
                    COALESCE(SUM(tc.toll_amount), 0) as total_tolls
                FROM trips t
                JOIN trip_status_intelligence tsi ON t.id = tsi.trip_id
                LEFT JOIN toll_charges tc ON t.id = tc.trip_id
                WHERE t.host_id = ?
                AND tsi.needs_review = 1
                AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
                GROUP BY t.id
                ORDER BY tsi.overall_confidence ASC, t.start_date DESC
            `, [hostId], (err, trips) => {
                if (err) reject(err);
                else resolve(trips);
            });
        });
        
        res.json({
            success: true,
            data: tripsNeedingReview
        });
        
    } catch (error) {
        console.error('❌ Error getting trips needing review:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get trips needing review'
        });
    }
});

// Get user patterns and statistics
router.get('/patterns', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        const patterns = await new Promise((resolve) => {
            db.get(
                'SELECT * FROM user_trip_patterns WHERE host_id = ?',
                [hostId],
                (err, patterns) => resolve(err ? {} : patterns)
            );
        });
        
        // Get additional statistics
        const stats = await new Promise((resolve) => {
            db.get(`
                SELECT 
                    COUNT(*) as total_trips,
                    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM toll_charges tc WHERE tc.trip_id = t.id)) as trips_with_tolls,
                    AVG(CASE WHEN EXISTS (SELECT 1 FROM toll_charges tc WHERE tc.trip_id = t.id) 
                        THEN (SELECT COUNT(*) FROM toll_charges tc2 WHERE tc2.trip_id = t.id) 
                        ELSE 0 END) as avg_tolls_per_trip,
                    COUNT(*) FILTER (WHERE t.end_date < datetime('now')) as past_trips,
                    COUNT(*) FILTER (WHERE t.start_date > datetime('now')) as upcoming_trips
                FROM trips t
                WHERE t.host_id = ?
                AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
            `, [hostId], (err, stats) => resolve(err ? {} : stats));
        });
        
        res.json({
            success: true,
            data: {
                patterns: patterns,
                statistics: stats
            }
        });
        
    } catch (error) {
        console.error('❌ Error getting user patterns:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user patterns'
        });
    }
});

// Initialize database tables if not exist (migration endpoint)
router.post('/initialize', requireAuth, async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Read migration file
        const migrationPath = path.join(__dirname, '../migrations/add-smart-status-tables.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Execute migration
        await new Promise((resolve, reject) => {
            db.exec(migrationSQL, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({
            success: true,
            message: 'Enhanced Smart Status system initialized successfully'
        });
        
    } catch (error) {
        console.error('❌ Error initializing Enhanced Smart Status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initialize system'
        });
    }
});

module.exports = router;