const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const analyticsEngine = require('../services/analytics-engine');
const automatedReporting = require('../services/automated-reporting');

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

// Middleware to validate date parameters
const validateDateRange = (req, res, next) => {
    const { startDate, endDate } = req.query;
    
    if (startDate && !isValidDate(startDate)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid startDate format. Use YYYY-MM-DD' 
        });
    }
    
    if (endDate && !isValidDate(endDate)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid endDate format. Use YYYY-MM-DD' 
        });
    }
    
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({ 
            success: false, 
            error: 'startDate must be before endDate' 
        });
    }
    
    next();
};

function isValidDate(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    const date = new Date(dateString);
    return date.toISOString().substr(0, 10) === dateString;
}

/**
 * Financial Analytics Endpoints
 */

// Get comprehensive financial metrics
router.get('/financial', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { periodType = 'monthly', startDate, endDate } = req.query;
        
        const metrics = await analyticsEngine.calculateFinancialMetrics(
            hostId, periodType, startDate, endDate
        );
        
        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('Error fetching financial metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch financial metrics'
        });
    }
});

// Get revenue breakdown by vehicle
router.get('/financial/vehicles', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const metrics = await analyticsEngine.calculateFinancialMetrics(
            hostId, 'monthly', startDate, endDate
        );
        
        res.json({
            success: true,
            data: {
                vehicles: metrics.vehicles,
                summary: {
                    totalVehicles: metrics.vehicles.length,
                    totalRevenue: metrics.vehicles.reduce((sum, v) => sum + v.totalRevenue, 0),
                    totalCosts: metrics.vehicles.reduce((sum, v) => sum + v.totalTollCosts, 0),
                    averageProfitMargin: metrics.vehicles.length > 0 ? 
                        metrics.vehicles.reduce((sum, v) => sum + v.profitMargin, 0) / metrics.vehicles.length : 0
                }
            }
        });
    } catch (error) {
        console.error('Error fetching vehicle financial data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch vehicle financial data'
        });
    }
});

// Get profit/loss analysis
router.get('/financial/profitability', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const metrics = await analyticsEngine.calculateFinancialMetrics(
            hostId, 'monthly', startDate, endDate
        );
        
        // Get historical data for comparison
        const previousPeriod = await getPreviousPeriodMetrics(hostId, startDate, endDate);
        
        res.json({
            success: true,
            data: {
                current: metrics.profitability,
                previous: previousPeriod ? previousPeriod.profitability : null,
                trends: metrics.trends,
                breakdown: {
                    revenueStreams: [
                        { name: 'Trip Revenue', value: metrics.revenue.total, percentage: 100 }
                    ],
                    costBreakdown: [
                        { name: 'Toll Charges', value: metrics.costs.totalTolls, percentage: 0 },
                        { name: 'Processing Fees', value: metrics.costs.processingFees, percentage: 0 }
                    ]
                }
            }
        });
    } catch (error) {
        console.error('Error fetching profitability analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch profitability analysis'
        });
    }
});

/**
 * Performance Metrics Endpoints
 */

// Get comprehensive performance metrics
router.get('/performance', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        
        const metrics = await analyticsEngine.calculatePerformanceMetrics(hostId);
        
        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('Error fetching performance metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch performance metrics'
        });
    }
});

// Get toll matching accuracy trends
router.get('/performance/toll-matching', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { days = 30 } = req.query;
        
        const query = `
            SELECT 
                DATE(tc.created_at) as date,
                COUNT(*) as total_charges,
                COUNT(CASE WHEN tc.trip_id IS NOT NULL THEN 1 END) as matched_charges,
                ROUND(COUNT(CASE WHEN tc.trip_id IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 2) as accuracy_rate
            FROM toll_charges tc
            JOIN toll_accounts ta ON tc.toll_account_id = ta.id
            WHERE ta.host_id = ? 
            AND tc.created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY DATE(tc.created_at)
            ORDER BY date
        `;
        
        db.all(query, [hostId], (err, rows) => {
            if (err) {
                console.error('Error fetching toll matching trends:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch toll matching trends'
                });
            }
            
            res.json({
                success: true,
                data: {
                    trends: rows,
                    summary: {
                        averageAccuracy: rows.length > 0 ? 
                            rows.reduce((sum, row) => sum + row.accuracy_rate, 0) / rows.length : 0,
                        totalCharges: rows.reduce((sum, row) => sum + row.total_charges, 0),
                        totalMatched: rows.reduce((sum, row) => sum + row.matched_charges, 0)
                    }
                }
            });
        });
    } catch (error) {
        console.error('Error fetching toll matching trends:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch toll matching trends'
        });
    }
});

// Get system uptime and reliability metrics
router.get('/performance/system', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        
        const query = `
            SELECT 
                ta.provider,
                ta.last_sync,
                COUNT(tc.id) as total_synced_charges,
                AVG(
                    CASE WHEN ta.last_sync IS NOT NULL THEN
                        (julianday('now') - julianday(ta.last_sync)) * 24
                    ELSE NULL END
                ) as hours_since_last_sync
            FROM toll_accounts ta
            LEFT JOIN toll_charges tc ON ta.id = tc.toll_account_id 
                AND tc.created_at >= datetime('now', '-7 days')
            WHERE ta.host_id = ? AND ta.is_active = 1
            GROUP BY ta.id, ta.provider
        `;
        
        db.all(query, [hostId], (err, rows) => {
            if (err) {
                console.error('Error fetching system metrics:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch system metrics'
                });
            }
            
            const systemHealth = rows.map(row => ({
                provider: row.provider,
                lastSync: row.last_sync,
                hoursSinceLastSync: row.hours_since_last_sync,
                totalSyncedCharges: row.total_synced_charges,
                status: row.hours_since_last_sync < 24 ? 'healthy' : 
                       row.hours_since_last_sync < 48 ? 'warning' : 'critical'
            }));
            
            const overallHealth = systemHealth.length > 0 ? 
                systemHealth.filter(s => s.status === 'healthy').length / systemHealth.length * 100 : 0;
            
            res.json({
                success: true,
                data: {
                    accounts: systemHealth,
                    overallHealth: overallHealth,
                    status: overallHealth >= 80 ? 'healthy' : overallHealth >= 60 ? 'warning' : 'critical'
                }
            });
        });
    } catch (error) {
        console.error('Error fetching system metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch system metrics'
        });
    }
});

/**
 * Business Intelligence Endpoints
 */

// Get toll location analysis
router.get('/business-intelligence/toll-locations', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const report = await analyticsEngine.generateBusinessIntelligence(
            hostId, 'toll_locations', startDate, endDate
        );
        
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Error fetching toll location analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch toll location analysis'
        });
    }
});

// Get seasonal trends analysis
router.get('/business-intelligence/seasonal-trends', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const report = await analyticsEngine.generateBusinessIntelligence(
            hostId, 'seasonal_trends', startDate, endDate
        );
        
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Error fetching seasonal trends:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch seasonal trends'
        });
    }
});

// Get vehicle utilization analysis
router.get('/business-intelligence/vehicle-utilization', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const report = await analyticsEngine.generateBusinessIntelligence(
            hostId, 'vehicle_utilization', startDate, endDate
        );
        
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Error fetching vehicle utilization analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch vehicle utilization analysis'
        });
    }
});

// Get renter behavior analysis
router.get('/business-intelligence/renter-behavior', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const report = await analyticsEngine.generateBusinessIntelligence(
            hostId, 'renter_behavior', startDate, endDate
        );
        
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Error fetching renter behavior analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch renter behavior analysis'
        });
    }
});

// Get route analysis
router.get('/business-intelligence/route-analysis', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const report = await analyticsEngine.generateBusinessIntelligence(
            hostId, 'route_analysis', startDate, endDate
        );
        
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Error fetching route analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch route analysis'
        });
    }
});

/**
 * Predictive Analytics Endpoints
 */

// Get toll cost forecast
router.get('/predictive/toll-forecast', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { days = 30 } = req.query;
        
        const forecast = await analyticsEngine.generatePredictiveAnalytics(
            hostId, 'toll_forecast', parseInt(days)
        );
        
        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        console.error('Error generating toll forecast:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate toll forecast'
        });
    }
});

// Get revenue forecast
router.get('/predictive/revenue-forecast', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { days = 30 } = req.query;
        
        const forecast = await analyticsEngine.generatePredictiveAnalytics(
            hostId, 'revenue_forecast', parseInt(days)
        );
        
        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        console.error('Error generating revenue forecast:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate revenue forecast'
        });
    }
});

// Get seasonal demand prediction
router.get('/predictive/seasonal-demand', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { days = 90 } = req.query;
        
        const prediction = await analyticsEngine.generatePredictiveAnalytics(
            hostId, 'seasonal_demand', parseInt(days)
        );
        
        res.json({
            success: true,
            data: prediction
        });
    } catch (error) {
        console.error('Error predicting seasonal demand:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to predict seasonal demand'
        });
    }
});

// Get route optimization recommendations
router.get('/predictive/route-optimization', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        
        const optimization = await analyticsEngine.generatePredictiveAnalytics(
            hostId, 'route_optimization'
        );
        
        res.json({
            success: true,
            data: optimization
        });
    } catch (error) {
        console.error('Error generating route optimization:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate route optimization'
        });
    }
});

/**
 * Dashboard Summary Endpoints
 */

// Get analytics dashboard summary
router.get('/dashboard-summary', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        
        // Get financial overview
        const financial = await analyticsEngine.calculateFinancialMetrics(hostId, 'monthly');
        
        // Get performance metrics
        const performance = await analyticsEngine.calculatePerformanceMetrics(hostId);
        
        // Get top toll locations (last 30 days)
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const tollLocations = await analyticsEngine.generateBusinessIntelligence(
            hostId, 'toll_locations', startDate, endDate
        );
        
        // Get recent trends
        const trends = financial.trends.slice(-7); // Last 7 periods
        
        const summary = {
            financial: {
                totalRevenue: financial.revenue.total,
                totalCosts: financial.costs.totalTolls,
                netProfit: financial.profitability.netProfit,
                profitMargin: financial.profitability.profitMargin,
                tripCount: financial.revenue.tripCount
            },
            performance: {
                tollMatchingAccuracy: performance.tollMatching.accuracy,
                systemReliability: performance.system.reliability,
                dataQualityScore: performance.dataQuality.completeness,
                overallHealthScore: performance.overall.healthScore
            },
            insights: {
                topTollLocation: tollLocations.summary?.topLocation,
                totalTollLocations: tollLocations.summary?.totalLocations,
                averageTollPerTrip: financial.profitability.averageRevenuePerTrip,
                costPerMile: financial.profitability.costPerMile
            },
            trends: trends,
            alerts: await generateDashboardAlerts(hostId, financial, performance)
        };
        
        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('Error fetching analytics dashboard summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics dashboard summary'
        });
    }
});

/**
 * Report Management Endpoints
 */

// Get available reports
router.get('/reports', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        
        const query = `
            SELECT 
                report_type,
                report_name,
                report_summary,
                period_start,
                period_end,
                generated_at
            FROM bi_reports
            WHERE host_id = ?
            ORDER BY generated_at DESC
            LIMIT 50
        `;
        
        db.all(query, [hostId], (err, rows) => {
            if (err) {
                console.error('Error fetching reports:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch reports'
                });
            }
            
            res.json({
                success: true,
                data: rows
            });
        });
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch reports'
        });
    }
});

// Generate custom report
router.post('/reports/custom', requireAuth, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { reportType, period, parameters } = req.body;
        
        if (!reportType || !period) {
            return res.status(400).json({
                success: false,
                error: 'reportType and period are required'
            });
        }
        
        const report = await automatedReporting.generateCustomReport(hostId, {
            type: reportType,
            period: period,
            parameters: parameters || {}
        });
        
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Error generating custom report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate custom report'
        });
    }
});

/**
 * Export Endpoints
 */

// Export financial data to CSV
router.get('/export/financial/csv', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const financial = await analyticsEngine.calculateFinancialMetrics(
            hostId, 'monthly', startDate, endDate
        );
        
        const csvData = generateFinancialCSV(financial);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="financial-report-${startDate}-${endDate}.csv"`);
        res.send(csvData);
    } catch (error) {
        console.error('Error exporting financial data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export financial data'
        });
    }
});

// Export toll location data to CSV
router.get('/export/toll-locations/csv', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const report = await analyticsEngine.generateBusinessIntelligence(
            hostId, 'toll_locations', startDate, endDate
        );
        
        const csvData = generateTollLocationsCSV(report.locations);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="toll-locations-${startDate}-${endDate}.csv"`);
        res.send(csvData);
    } catch (error) {
        console.error('Error exporting toll location data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export toll location data'
        });
    }
});

// Export route analytics data
router.get('/routes/export', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const report = await analyticsEngine.generateBusinessIntelligence(
            hostId, 'route_analysis', startDate, endDate
        );
        
        // Generate CSV format route data
        const csvData = generateRoutesCSV(report.routes);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="route-analytics-${startDate}-${endDate}.csv"`);
        res.send(csvData);
    } catch (error) {
        console.error('Error exporting route analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export route analytics data'
        });
    }
});

// Personal Driving Analytics Endpoints

// Personal vs Rental Ratio Analysis
router.get('/personal-driving/ratio', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const ratioData = await analyticsEngine.getPersonalVsRentalRatio(
            hostId, startDate, endDate
        );
        
        res.json({
            success: true,
            data: ratioData
        });
    } catch (error) {
        console.error('Error generating personal vs rental ratio:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate ratio analysis'
        });
    }
});

// Top Personal Driving Routes Analysis
router.get('/personal-driving/routes', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate, limit = 10 } = req.query;
        
        const routesData = await analyticsEngine.getTopPersonalDrivingRoutes(
            hostId, startDate, endDate, parseInt(limit)
        );
        
        res.json({
            success: true,
            data: routesData
        });
    } catch (error) {
        console.error('Error generating personal driving routes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate routes analysis'
        });
    }
});

// Personal Driving Cost Trends
router.get('/personal-driving/trends', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate, period = 'monthly' } = req.query;
        
        const trendsData = await analyticsEngine.getPersonalDrivingTrends(
            hostId, startDate, endDate, period
        );
        
        res.json({
            success: true,
            data: trendsData
        });
    } catch (error) {
        console.error('Error generating personal driving trends:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate trends analysis'
        });
    }
});

// Vehicle Personal Driving Costs
router.get('/personal-driving/vehicles', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        const vehicleCosts = await analyticsEngine.getVehiclePersonalCosts(
            hostId, startDate, endDate
        );
        
        res.json({
            success: true,
            data: vehicleCosts
        });
    } catch (error) {
        console.error('Error generating vehicle personal costs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate vehicle costs analysis'
        });
    }
});

// Export personal driving data to CSV
router.get('/personal-driving/export', requireAuth, validateDateRange, async (req, res) => {
    try {
        const hostId = req.session.hostId;
        const { startDate, endDate } = req.query;
        
        // Get all personal driving data
        const [ratioData, routesData, trendsData, vehicleData] = await Promise.all([
            analyticsEngine.getPersonalVsRentalRatio(hostId, startDate, endDate),
            analyticsEngine.getTopPersonalDrivingRoutes(hostId, startDate, endDate, 50),
            analyticsEngine.getPersonalDrivingTrends(hostId, startDate, endDate, 'monthly'),
            analyticsEngine.getVehiclePersonalCosts(hostId, startDate, endDate)
        ]);
        
        // Generate CSV format personal driving data
        const csvData = generatePersonalDrivingCSV({
            ratio: ratioData,
            routes: routesData,
            trends: trendsData,
            vehicles: vehicleData
        });
        
        const filename = `personal-driving-report-${startDate || 'all'}-${endDate || new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvData);
    } catch (error) {
        console.error('Error exporting personal driving data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export personal driving data'
        });
    }
});

/**
 * Utility Functions
 */

async function getPreviousPeriodMetrics(hostId, startDate, endDate) {
    // Calculate previous period dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodLength = end - start;
    
    const previousEnd = new Date(start);
    const previousStart = new Date(start - periodLength);
    
    try {
        return await analyticsEngine.calculateFinancialMetrics(
            hostId, 'monthly', 
            previousStart.toISOString().split('T')[0],
            previousEnd.toISOString().split('T')[0]
        );
    } catch (error) {
        console.error('Error fetching previous period metrics:', error);
        return null;
    }
}

async function generateDashboardAlerts(hostId, financial, performance) {
    const alerts = [];
    
    // Financial alerts
    if (financial.profitability.profitMargin < 10) {
        alerts.push({
            type: 'warning',
            category: 'financial',
            title: 'Low Profit Margin',
            message: `Profit margin is only ${financial.profitability.profitMargin.toFixed(1)}%`
        });
    }
    
    // Performance alerts
    if (performance.tollMatching.accuracy < 80) {
        alerts.push({
            type: 'warning',
            category: 'performance',
            title: 'Toll Matching Issues',
            message: `Toll matching accuracy is ${performance.tollMatching.accuracy.toFixed(1)}%`
        });
    }
    
    return alerts;
}

function generateFinancialCSV(financial) {
    let csv = 'Metric,Value,Unit\n';
    csv += `Total Revenue,${financial.revenue.total},USD\n`;
    csv += `Total Costs,${financial.costs.totalTolls},USD\n`;
    csv += `Net Profit,${financial.profitability.netProfit},USD\n`;
    csv += `Profit Margin,${financial.profitability.profitMargin},Percent\n`;
    csv += `Trip Count,${financial.revenue.tripCount},Count\n`;
    csv += `Average Revenue Per Trip,${financial.profitability.averageRevenuePerTrip},USD\n`;
    csv += `Cost Per Mile,${financial.profitability.costPerMile},USD\n`;
    
    return csv;
}

function generateTollLocationsCSV(locations) {
    let csv = 'Location,Charge Count,Total Amount,Average Amount,Vehicle Count,First Seen,Last Seen\n';
    
    locations.forEach(location => {
        csv += `"${location.location}",${location.chargeCount},${location.totalAmount},${location.averageAmount},${location.vehicleCount},"${location.firstSeen}","${location.lastSeen}"\n`;
    });
    
    return csv;
}

function generateRoutesCSV(routes) {
    let csv = 'Route,Trip Count,Total Toll Amount,Average Toll,Start Location,End Location,Distance (miles),Avg Duration (hours)\n';
    
    if (routes && routes.length > 0) {
        routes.forEach(route => {
            csv += `"${route.route}",${route.tripCount || 0},${route.totalTollAmount || 0},${route.averageToll || 0},"${route.startLocation || 'Unknown'}","${route.endLocation || 'Unknown'}",${route.distance || 0},${route.avgDuration || 0}\n`;
        });
    }
    
    return csv;
}

function generatePersonalDrivingCSV(data) {
    let csv = '';
    
    // Summary section
    csv += 'PERSONAL DRIVING ANALYTICS REPORT\n';
    csv += `Generated: ${new Date().toISOString().split('T')[0]}\n`;
    csv += '\n';
    
    // Ratio Analysis
    csv += 'PERSONAL VS RENTAL RATIO\n';
    csv += 'Category,Amount (USD),Percentage\n';
    if (data.ratio && data.ratio.personalTotal !== undefined) {
        const total = data.ratio.personalTotal + data.ratio.rentalTotal;
        const personalPercent = total > 0 ? ((data.ratio.personalTotal / total) * 100).toFixed(1) : '0.0';
        const rentalPercent = total > 0 ? ((data.ratio.rentalTotal / total) * 100).toFixed(1) : '0.0';
        
        csv += `Personal Driving,${data.ratio.personalTotal.toFixed(2)},${personalPercent}%\n`;
        csv += `Rental Business,${data.ratio.rentalTotal.toFixed(2)},${rentalPercent}%\n`;
        csv += `Total,${total.toFixed(2)},100.0%\n`;
    }
    csv += '\n';
    
    // Routes Analysis
    csv += 'TOP PERSONAL DRIVING ROUTES\n';
    csv += 'Route/Location,Usage Count,Total Cost (USD),Average Cost (USD),Business Impact\n';
    if (data.routes && data.routes.routes) {
        data.routes.routes.forEach(route => {
            csv += `"${route.location}",${route.usageCount || 0},${(route.totalCost || 0).toFixed(2)},${(route.averageCost || 0).toFixed(2)},${route.businessImpact || 'Low'}\n`;
        });
    }
    csv += '\n';
    
    // Vehicle Costs
    csv += 'PERSONAL DRIVING COSTS BY VEHICLE\n';
    csv += 'Vehicle,Personal Cost (USD),Total Trips,Average per Trip (USD)\n';
    if (data.vehicles && data.vehicles.vehicles) {
        data.vehicles.vehicles.forEach(vehicle => {
            csv += `"${vehicle.vehicleDescription || vehicle.vehiclePlate}",${(vehicle.totalPersonalCost || 0).toFixed(2)},${vehicle.personalTrips || 0},${(vehicle.averagePersonalCost || 0).toFixed(2)}\n`;
        });
    }
    csv += '\n';
    
    // Monthly Trends
    csv += 'MONTHLY TRENDS\n';
    csv += 'Month,Personal Driving Cost (USD),Change from Previous Month\n';
    if (data.trends && data.trends.trends) {
        data.trends.trends.forEach(trend => {
            csv += `"${trend.month}",${(trend.personalCost || 0).toFixed(2)},${trend.changePercent ? trend.changePercent.toFixed(1) + '%' : 'N/A'}\n`;
        });
    }
    
    return csv;
}

module.exports = router;