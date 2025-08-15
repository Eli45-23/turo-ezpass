const express = require('express');
const router = express.Router();
const TuroIntegrationService = require('../services/turo-integration');
const { db } = require('../config/database');

/**
 * ML-Enhanced Toll Matching API Routes
 * 
 * This router provides RESTful endpoints for the ML-enhanced toll matching system:
 * - Enhanced auto-matching with confidence scores
 * - Matching suggestions for manual review
 * - Training from user corrections
 * - Performance analytics and anomaly detection
 */

const turoService = new TuroIntegrationService();

/**
 * GET /api/ml-matching/auto-match/:hostId
 * Trigger ML-enhanced auto-matching for a host
 */
router.post('/auto-match/:hostId', async (req, res) => {
    try {
        const hostId = parseInt(req.params.hostId);
        const options = req.body || {};
        
        console.log(`🤖 Starting ML auto-match for host ${hostId}...`);
        const result = await turoService.autoMatchTolls(hostId, options);
        
        res.json({
            success: true,
            data: result,
            message: `Processed ${result.totalCharges} charges, matched ${result.matchedCount}`,
            mlEnhanced: result.mlEnhanced || false
        });
        
    } catch (error) {
        console.error('ML auto-match error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to perform ML-enhanced auto-matching'
        });
    }
});

/**
 * POST /api/ml-matching/run-matching
 * Run ML toll matching for the authenticated user with real-time progress updates
 */
router.post('/run-matching', async (req, res) => {
    console.log('🎯 API ROUTE HIT: /api/ml-matching/run-matching');
    console.log('🔐 Session data:', req.session);
    console.log('📋 Request body:', req.body);
    
    try {
        // Extract hostId from session
        const hostId = req.session?.hostId;
        console.log('👤 Extracted hostId from session:', hostId);
        
        if (!hostId) {
            console.log('❌ No hostId found in session, returning 401');
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        const options = req.body || {};
        
        console.log(`🤖 Running ML toll matching for host ${hostId}...`);
        
        // Create a matching session ID for WebSocket tracking
        const matchingSessionId = `matching_${hostId}_${Date.now()}`;
        console.log(`🎯 Created matching session: ${matchingSessionId}`);
        
        // Set up progress callback for real-time updates
        console.log('🔧 Setting up progress callback...');
        options.progressCallback = (progress) => {
            console.log('🔔 Progress callback triggered:', progress);
            
            // Broadcast progress to connected WebSocket clients
            const sendToHost = req.app.get('sendToHost');
            console.log('📡 sendToHost function available:', !!sendToHost);
            
            if (sendToHost) {
                const message = {
                    type: 'matching-progress',
                    sessionId: matchingSessionId,
                    hostId: hostId,
                    ...progress
                };
                console.log('📤 Sending WebSocket message to host', hostId, ':', message);
                const sent = sendToHost(hostId, message);
                console.log('📊 WebSocket message sent result:', sent);
            } else {
                console.error('❌ sendToHost function not available!');
            }
        };
        
        // Start the matching process
        console.log('🚀 About to call turoService.autoMatchTolls with options:', JSON.stringify(options, null, 2));
        const result = await turoService.autoMatchTolls(hostId, options);
        console.log('✅ autoMatchTolls completed with result:', result);
        
        // Send final completion event
        const sendToHost = req.app.get('sendToHost');
        if (sendToHost) {
            sendToHost(hostId, {
                type: 'matching-complete',
                sessionId: matchingSessionId,
                hostId: hostId,
                result: result
            });
        }
        
        res.json({
            success: true,
            sessionId: matchingSessionId,
            data: result,
            matchedCount: result.appliedMatches || result.matchedCount,
            totalCharges: result.totalCharges,
            matchRate: result.averageConfidence ? (parseFloat(result.averageConfidence) * 100).toFixed(1) + '%' : '0%',
            message: `ML matching completed: ${result.appliedMatches || result.matchedCount}/${result.totalCharges} charges matched`
        });
        
    } catch (error) {
        console.error('ML matching error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'ML toll matching failed'
        });
    }
});

/**
 * GET /api/ml-matching/suggestions/:chargeId
 * Get ML-powered matching suggestions for a specific toll charge
 */
router.get('/suggestions/:chargeId', async (req, res) => {
    try {
        const chargeId = parseInt(req.params.chargeId);
        const limit = parseInt(req.query.limit) || 5;
        
        const suggestions = await turoService.getMatchingSuggestions(chargeId, limit);
        
        res.json({
            success: true,
            data: suggestions,
            count: suggestions.length,
            message: `Found ${suggestions.length} matching suggestions`
        });
        
    } catch (error) {
        console.error('Get suggestions error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get matching suggestions'
        });
    }
});

/**
 * POST /api/ml-matching/train
 * Train the ML system from user corrections
 */
router.post('/train', async (req, res) => {
    try {
        const { chargeId, tripId, feedback } = req.body;
        
        if (!chargeId || !tripId) {
            return res.status(400).json({
                success: false,
                message: 'Both chargeId and tripId are required'
            });
        }
        
        await turoService.trainFromCorrection(chargeId, tripId, feedback);
        
        res.json({
            success: true,
            message: 'ML system trained from user correction',
            data: { chargeId, tripId, feedback }
        });
        
    } catch (error) {
        console.error('Training error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to train ML system'
        });
    }
});

/**
 * GET /api/ml-matching/performance/:hostId
 * Get matching performance analytics
 */
router.get('/performance/:hostId', async (req, res) => {
    try {
        const hostId = parseInt(req.params.hostId);
        const days = parseInt(req.query.days) || 30;
        
        const performance = await turoService.analyzeMatchingPerformance(hostId, days);
        
        res.json({
            success: true,
            data: performance,
            period: `${days} days`,
            message: `Performance analysis for last ${days} days`
        });
        
    } catch (error) {
        console.error('Performance analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to analyze performance'
        });
    }
});

/**
 * GET /api/ml-matching/anomalies/:hostId
 * Detect anomalous toll transactions
 */
router.get('/anomalies/:hostId', async (req, res) => {
    try {
        const hostId = parseInt(req.params.hostId);
        
        const anomalies = await turoService.detectAnomalies(hostId);
        
        res.json({
            success: true,
            data: anomalies,
            count: anomalies.length,
            message: `Found ${anomalies.length} potential anomalies`
        });
        
    } catch (error) {
        console.error('Anomaly detection error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to detect anomalies'
        });
    }
});

/**
 * GET /api/ml-matching/unmatched/:hostId
 * Get unmatched charges with confidence analysis
 */
router.get('/unmatched/:hostId', async (req, res) => {
    try {
        const hostId = parseInt(req.params.hostId);
        const limit = parseInt(req.query.limit) || 20;
        
        const unmatched = await getUnmatchedWithAnalysis(hostId, limit);
        
        res.json({
            success: true,
            data: unmatched,
            count: unmatched.length,
            message: `Found ${unmatched.length} unmatched charges`
        });
        
    } catch (error) {
        console.error('Get unmatched error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get unmatched charges'
        });
    }
});

/**
 * POST /api/ml-matching/manual-match
 * Apply a manual match with ML learning
 */
router.post('/manual-match', async (req, res) => {
    try {
        const { chargeId, tripId, confidence } = req.body;
        
        if (!chargeId || !tripId) {
            return res.status(400).json({
                success: false,
                message: 'Both chargeId and tripId are required'
            });
        }
        
        // Apply the manual match
        await applyManualMatch(chargeId, tripId, confidence || 1.0);
        
        // Train the ML system from this manual match
        await turoService.trainFromCorrection(chargeId, tripId, {
            type: 'manual_match',
            userConfidence: confidence || 1.0,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Manual match applied and ML system trained',
            data: { chargeId, tripId, confidence }
        });
        
    } catch (error) {
        console.error('Manual match error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to apply manual match'
        });
    }
});

/**
 * GET /api/ml-matching/features
 * Get current ML feature configuration
 */
router.get('/features', (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                features: turoService.mlFeatures,
                confidenceThresholds: {
                    high: 0.85,
                    medium: 0.65,
                    low: 0.45
                },
                supportedMethods: turoService.supportedMethods
            },
            message: 'ML feature configuration retrieved'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get feature configuration'
        });
    }
});

/**
 * PUT /api/ml-matching/features
 * Update ML feature configuration
 */
router.put('/features', (req, res) => {
    try {
        const { features } = req.body;
        
        if (features) {
            // Update only provided features
            Object.keys(features).forEach(feature => {
                if (turoService.mlFeatures.hasOwnProperty(feature)) {
                    if (feature === 'accuracyLevel') {
                        // Validate accuracy level (1-10)
                        const level = parseInt(features[feature]);
                        if (level >= 1 && level <= 10) {
                            turoService.mlFeatures[feature] = level;
                        }
                    } else {
                        turoService.mlFeatures[feature] = Boolean(features[feature]);
                    }
                }
            });
        }
        
        res.json({
            success: true,
            data: { features: turoService.mlFeatures },
            message: 'ML features updated successfully'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to update ML features'
        });
    }
});

/**
 * PUT /api/ml-matching/accuracy-level
 * Set matching accuracy level (1-10)
 */
router.put('/accuracy-level', (req, res) => {
    try {
        const { level } = req.body;
        
        if (!level || level < 1 || level > 10) {
            return res.status(400).json({
                success: false,
                message: 'Accuracy level must be between 1 and 10'
            });
        }
        
        turoService.mlFeatures.accuracyLevel = parseInt(level);
        
        res.json({
            success: true,
            data: { 
                accuracyLevel: turoService.mlFeatures.accuracyLevel,
                description: level <= 3 ? 'Fast (low accuracy)' : 
                           level <= 6 ? 'Balanced' : 
                           level <= 8 ? 'Accurate (slower)' : 
                           'Maximum accuracy (very slow)'
            },
            message: `Accuracy level set to ${level}`
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to update accuracy level'
        });
    }
});

/**
 * GET /api/ml-matching/stats/:hostId
 * Get comprehensive ML matching statistics
 */
router.get('/stats/:hostId', async (req, res) => {
    try {
        const hostId = parseInt(req.params.hostId);
        
        const [performance, anomalies, unmatched] = await Promise.all([
            turoService.analyzeMatchingPerformance(hostId, 30),
            turoService.detectAnomalies(hostId),
            getUnmatchedCount(hostId)
        ]);
        
        res.json({
            success: true,
            data: {
                performance,
                anomalies: {
                    count: anomalies.length,
                    high_severity: anomalies.filter(a => a.severity === 'HIGH').length,
                    medium_severity: anomalies.filter(a => a.severity === 'MEDIUM').length,
                    low_severity: anomalies.filter(a => a.severity === 'LOW').length
                },
                unmatched: {
                    count: unmatched,
                    needsAttention: unmatched > 10
                }
            },
            message: 'ML matching statistics retrieved'
        });
        
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get ML statistics'
        });
    }
});

// Helper functions

async function getUnmatchedWithAnalysis(hostId, limit) {
    return new Promise((resolve) => {
        db.all(`
            SELECT tc.*, ta.account_number, ta.provider,
                   COUNT(t.id) as potential_trips,
                   MIN(ABS(julianday(tc.toll_date) - julianday(t.start_date))) as closest_trip_days
            FROM toll_charges tc
            JOIN toll_accounts ta ON tc.toll_account_id = ta.id
            LEFT JOIN trips t ON t.host_id = ta.host_id 
                AND julianday(tc.toll_date) BETWEEN 
                    julianday(t.start_date) - 2 AND julianday(t.end_date) + 2
            WHERE ta.host_id = ? AND tc.is_matched = 0
            GROUP BY tc.id
            ORDER BY tc.toll_date DESC
            LIMIT ?
        `, [hostId, limit], (err, charges) => {
            resolve(err ? [] : charges);
        });
    });
}

async function getUnmatchedCount(hostId) {
    return new Promise((resolve) => {
        db.get(`
            SELECT COUNT(*) as count
            FROM toll_charges tc
            JOIN toll_accounts ta ON tc.toll_account_id = ta.id
            WHERE ta.host_id = ? AND tc.is_matched = 0
        `, [hostId], (err, result) => {
            resolve(err ? 0 : result.count);
        });
    });
}

async function applyManualMatch(chargeId, tripId, confidence) {
    return new Promise((resolve, reject) => {
        db.run(`
            UPDATE toll_charges 
            SET trip_id = ?, 
                is_matched = 1, 
                match_timestamp = CURRENT_TIMESTAMP,
                validation_status = 'manual_match'
            WHERE id = ?
        `, [tripId, chargeId], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

module.exports = router;