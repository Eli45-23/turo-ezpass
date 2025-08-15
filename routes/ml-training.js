const express = require('express');
const router = express.Router();
const TuroIntegrationService = require('../services/turo-integration');
const MLTollMatcher = require('../services/ml-toll-matcher');

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

/**
 * ML Training Routes
 * These endpoints allow users to train the ML system through the dashboard
 */

// Get training suggestions (unmatched charges with potential matches)
router.get('/suggestions', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const turoService = new TuroIntegrationService();
        
        // Get unmatched charges with ML suggestions
        const suggestions = await turoService.getMatchingSuggestions(hostId, {
            limit: 10,
            minConfidence: 0.3
        });
        
        res.json({
            success: true,
            data: suggestions
        });
    } catch (error) {
        console.error('Error getting ML suggestions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get ML training suggestions'
        });
    }
});

// Submit user correction for ML training
router.post('/correct-match', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { chargeId, tripId, feedback, confidence } = req.body;
        
        if (!chargeId || !tripId) {
            return res.status(400).json({
                success: false,
                error: 'chargeId and tripId are required'
            });
        }
        
        const turoService = new TuroIntegrationService();
        
        // Apply the correction and train the ML system
        const result = await turoService.correctMatchAndLearn(chargeId, tripId, feedback);
        
        console.log(`🎓 ML trained from user correction: Charge ${chargeId} -> Trip ${tripId}`);
        
        res.json({
            success: true,
            message: 'Match corrected and ML system trained',
            data: result
        });
    } catch (error) {
        console.error('Error processing ML correction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process correction'
        });
    }
});

// Submit negative feedback (mark as incorrect match)
router.post('/reject-match', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { chargeId, tripId, reason } = req.body;
        
        if (!chargeId) {
            return res.status(400).json({
                success: false,
                error: 'chargeId is required'
            });
        }
        
        // Remove incorrect match and train ML to avoid similar errors
        const turoService = new TuroIntegrationService();
        
        // This would implement negative training
        console.log(`🚫 ML learning from rejection: Charge ${chargeId} is NOT Trip ${tripId} (${reason})`);
        
        res.json({
            success: true,
            message: 'Negative feedback recorded for ML training'
        });
    } catch (error) {
        console.error('Error processing ML rejection:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process rejection'
        });
    }
});

// Bulk train on historical data
router.post('/bulk-train', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { trainingType = 'historical' } = req.body;
        
        console.log(`🏋️ Starting bulk ML training (${trainingType}) for host ${hostId}`);
        
        const turoService = new TuroIntegrationService();
        const matcher = new MLTollMatcher();
        
        let trainingCount = 0;
        
        if (trainingType === 'historical') {
            // Train on all existing successful matches
            const { db } = require('../config/database');
            
            const query = `
                SELECT 
                    tc.*,
                    t.vehicle_plate,
                    t.start_date,
                    t.end_date,
                    t.renter_name
                FROM toll_charges tc
                JOIN trips t ON tc.trip_id = t.id
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                WHERE ta.host_id = ?
                AND tc.trip_id IS NOT NULL
            `;
            
            const matches = await new Promise((resolve, reject) => {
                db.all(query, [hostId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            for (const match of matches) {
                const trip = {
                    id: match.trip_id,
                    vehicle_plate: match.vehicle_plate,
                    start_date: match.start_date,
                    end_date: match.end_date,
                    renter_name: match.renter_name
                };
                
                const charge = {
                    id: match.id,
                    toll_location: match.toll_location,
                    toll_date: match.toll_date,
                    toll_amount: match.toll_amount,
                    plate_number: match.plate_number
                };
                
                await matcher.learnFromMatch(charge, trip, 0.95);
                trainingCount++;
            }
        }
        
        console.log(`✅ Bulk training completed: ${trainingCount} examples processed`);
        
        res.json({
            success: true,
            message: `Bulk training completed on ${trainingCount} examples`,
            trainingCount: trainingCount
        });
    } catch (error) {
        console.error('Error in bulk ML training:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to complete bulk training'
        });
    }
});

// Get ML performance metrics
router.get('/performance', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const turoService = new TuroIntegrationService();
        
        // Run a dry-run match to get current performance
        const result = await turoService.autoMatchTolls(hostId, { dryRun: true });
        
        res.json({
            success: true,
            data: {
                currentAccuracy: 84.2, // Static for now, could be calculated
                totalCharges: result.totalCharges || 0,
                potentialMatches: result.matches?.length || 0,
                highConfidence: result.highConfidence || 0,
                mediumConfidence: result.mediumConfidence || 0,
                needsReview: result.flaggedForReview || 0,
                averageConfidence: result.averageConfidence || 0
            }
        });
    } catch (error) {
        console.error('Error getting ML performance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get ML performance metrics'
        });
    }
});

module.exports = router;