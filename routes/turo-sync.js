const express = require('express');
const router = express.Router();
const TuroIntegrationService = require('../services/turo-integration');
const { db } = require('../config/database');
const { createCSVUploadMiddleware, cleanupFile } = require('../middleware/csv-validation');


// Enhanced CSV upload middleware for Turo trips
const turoCSVUpload = createCSVUploadMiddleware({
    fieldName: 'csvFile',
    expectedHeaders: ['start', 'end', 'guest', 'vehicle', 'earnings'], // Common Turo CSV headers
    maxRows: 10000,
    maxFileSize: 5 * 1024 * 1024 // 5MB for trip data
});

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

const turoService = new TuroIntegrationService();

// Get available integration methods
router.get('/methods', requireAuth, (req, res) => {
    res.json({
        success: true,
        data: {
            methods: turoService.supportedMethods,
            instructions: {
                email_parsing: "Forward Turo confirmation emails for automatic trip creation",
                calendar_sync: "Sync trips from calendar integrations (coming soon)",
                csv_import: "Import trips from Turo host dashboard CSV export",
                manual_webhook: "Custom webhook integration for real-time updates"
            }
        }
    });
});

// Get email setup instructions
router.get('/email-setup', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const instructions = turoService.getEmailSetupInstructions(hostId);
    
    res.json({
        success: true,
        data: instructions
    });
});

// Parse Turo confirmation email
router.post('/parse-email', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const { emailContent } = req.body;
    
    if (!emailContent) {
        return res.status(400).json({
            success: false,
            error: 'Email content is required'
        });
    }
    
    try {
        const result = await turoService.parseConfirmationEmail(emailContent, hostId);
        
        if (result) {
            // Auto-match tolls after adding trip
            const matchResult = await turoService.autoMatchTolls(hostId);
            
            res.json({
                success: true,
                message: 'Trip data extracted and saved successfully',
                data: {
                    trip: result,
                    tollMatches: matchResult
                }
            });
        } else {
            res.json({
                success: false,
                error: 'Could not extract trip data from email. Please check the email format.'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error processing email: ' + error.message
        });
    }
});

// Import trips from CSV file
router.post('/import-csv', requireAuth, ...turoCSVUpload, async (req, res) => {
    const hostId = req.session.hostId;
    
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'CSV file is required'
        });
    }
    
    try {
        const fs = require('fs');
        const csvData = fs.readFileSync(req.file.path, 'utf8');
        
        const importResult = await turoService.importFromCSV(csvData, hostId);
        const results = importResult.results || importResult; // Handle both new and legacy formats
        
        // Auto-match tolls after importing trips
        const matchResult = await turoService.autoMatchTolls(hostId);
        
        // CSV import monitoring (subagent functionality removed)
        const successfulImports = results.filter(r => r.changes > 0);
        if (successfulImports.length > 0) {
            console.log(`✅ Successfully imported ${successfulImports.length} trip records`);
        }
        
        // CSV error rate monitoring (subagent functionality removed)
        const errorRate = ((results.length - successfulImports.length) / results.length) * 100;
        if (errorRate > 10) {
            console.warn(`⚠️ High CSV error rate: ${errorRate.toFixed(1)}% (${results.length - successfulImports.length}/${results.length})`);
        }
        
        // Clean up uploaded file safely
        cleanupFile(req.file.path);
        
        // CRITICAL: Clear dashboard cache after CSV import and matching
        try {
            const { CacheManager, CacheKeys } = require('../services/cache-manager');
            const cacheManager = global.cacheManager || new CacheManager();
            await cacheManager.delete(CacheKeys.dashboardSummary(hostId));
            console.log(`🧹 Cleared dashboard cache after CSV import - metrics will refresh`);
        } catch (cacheError) {
            console.error('⚠️ Failed to clear dashboard cache:', cacheError);
        }
        
        res.json({
            success: true,
            message: `Imported ${successfulImports.length} new trips from CSV`,
            data: {
                totalProcessed: results.length,
                newTrips: successfulImports.length,
                duplicates: results.length - successfulImports.length,
                tollMatches: matchResult
            }
        });
    } catch (error) {
        // Clean up file on error safely
        if (req.file) {
            cleanupFile(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: 'Error importing CSV: ' + error.message
        });
    }
});

// Webhook endpoint for custom Turo integrations
router.post('/webhook', async (req, res) => {
    const { hostId, webhookData, signature } = req.body;
    
    if (!hostId || !webhookData) {
        return res.status(400).json({
            success: false,
            error: 'Host ID and webhook data are required'
        });
    }
    
    // TODO: Verify webhook signature for security
    
    try {
        const result = await turoService.processWebhook(webhookData, hostId);
        
        res.json({
            success: true,
            message: 'Webhook processed successfully',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error processing webhook: ' + error.message
        });
    }
});

// Auto-sync trips and match tolls (manual trigger)
router.post('/auto-sync', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        // This would be enhanced to automatically fetch from multiple sources
        const matchResult = await turoService.autoMatchTolls(hostId);
        
        res.json({
            success: true,
            message: 'Auto-sync completed',
            data: matchResult
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error during auto-sync: ' + error.message
        });
    }
});

// Get sync status and statistics
router.get('/status', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    
    // Get sync statistics
    db.get(
        `SELECT 
            COUNT(DISTINCT t.id) as total_trips,
            COUNT(DISTINCT tc.id) as total_charges,
            COUNT(CASE WHEN tc.is_matched = 1 THEN tc.id END) as matched_charges,
            COUNT(CASE WHEN tc.is_matched = 0 THEN tc.id END) as unmatched_charges,
            MAX(t.created_at) as last_trip_sync,
            MAX(tc.created_at) as last_toll_sync
         FROM trips t
         LEFT JOIN toll_charges tc ON t.id = tc.trip_id
         LEFT JOIN toll_accounts ta ON tc.toll_account_id = ta.id
         WHERE t.host_id = ? OR ta.host_id = ?`,
        [hostId, hostId],
        (err, stats) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Error fetching sync status'
                });
            }
            
            res.json({
                success: true,
                data: {
                    totalTrips: stats.total_trips || 0,
                    totalCharges: stats.total_charges || 0,
                    matchedCharges: stats.matched_charges || 0,
                    unmatchedCharges: stats.unmatched_charges || 0,
                    matchRate: stats.total_charges > 0 ? 
                        ((stats.matched_charges / stats.total_charges) * 100).toFixed(1) : 0,
                    lastTripSync: stats.last_trip_sync,
                    lastTollSync: stats.last_toll_sync
                }
            });
        }
    );
});

// Test trip data extraction (for development)
router.post('/test-extraction', requireAuth, (req, res) => {
    const { testData, dataType } = req.body;
    
    try {
        let result;
        
        if (dataType === 'email') {
            result = turoService.extractTripDataFromEmail(testData);
        } else if (dataType === 'csv') {
            result = turoService.parseCSVData(testData);
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid data type. Use "email" or "csv"'
            });
        }
        
        res.json({
            success: true,
            message: 'Test extraction completed',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error during test extraction: ' + error.message
        });
    }
});

module.exports = router;