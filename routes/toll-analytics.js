const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

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

// Get toll overview analytics
router.get('/overview', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const { startDate, endDate } = req.query;
    
    try {
        // Get comprehensive toll analytics
        const analyticsData = await getTollAnalytics(hostId, startDate, endDate);
        
        res.json({
            success: true,
            data: analyticsData
        });
    } catch (error) {
        console.error('Error fetching toll analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch toll analytics'
        });
    }
});

// Get toll trends over time
router.get('/trends', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const { period = 'monthly', months = 6 } = req.query;
    
    try {
        const trendsData = await getTollTrends(hostId, period, months);
        
        res.json({
            success: true,
            data: trendsData
        });
    } catch (error) {
        console.error('Error fetching toll trends:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch toll trends'
        });
    }
});

// Get top toll locations
router.get('/locations', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const { limit = 10 } = req.query;
    
    try {
        const locationsData = await getTopTollLocations(hostId, limit);
        
        res.json({
            success: true,
            data: locationsData
        });
    } catch (error) {
        console.error('Error fetching toll locations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch toll locations'
        });
    }
});

// Get vehicle toll impact analysis
router.get('/vehicle-impact', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        const vehicleData = await getVehicleTollImpact(hostId);
        
        res.json({
            success: true,
            data: vehicleData
        });
    } catch (error) {
        console.error('Error fetching vehicle impact:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch vehicle impact data'
        });
    }
});

// Helper function to get comprehensive toll analytics
async function getTollAnalytics(hostId, startDate, endDate) {
    return new Promise((resolve, reject) => {
        let dateFilter = '';
        const params = [hostId];
        
        if (startDate && endDate) {
            dateFilter = ' AND datetime(tc.toll_date/1000, \'unixepoch\') BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }
        
        const query = `
            SELECT 
                -- Total metrics
                COUNT(DISTINCT tc.id) as total_toll_charges,
                COALESCE(SUM(tc.toll_amount), 0) as total_toll_costs,
                COUNT(DISTINCT tc.toll_location) as unique_locations,
                COUNT(DISTINCT COALESCE(tr_turo.id, tr_id.id)) as trips_with_tolls,
                COUNT(DISTINCT COALESCE(tr_turo.vehicle_plate, tr_id.vehicle_plate)) as vehicles_used,
                
                -- Averages
                COALESCE(AVG(tc.toll_amount), 0) as avg_toll_amount,
                COALESCE(MAX(tc.toll_amount), 0) as highest_toll,
                
                -- Get highest toll details
                (SELECT toll_location FROM toll_charges tc2 
                 JOIN toll_accounts ta2 ON tc2.toll_account_id = ta2.id
                 WHERE ta2.host_id = ? ${dateFilter.replace('tc.', 'tc..')}
                 ORDER BY tc2.toll_amount DESC LIMIT 1) as highest_toll_location,
                
                -- Most used route
                (SELECT toll_location FROM toll_charges tc3
                 JOIN toll_accounts ta3 ON tc3.toll_account_id = ta3.id
                 WHERE ta3.host_id = ? ${dateFilter.replace('tc.', 'tc..')}
                 GROUP BY toll_location
                 ORDER BY COUNT(*) DESC LIMIT 1) as most_used_route,
                 
                (SELECT COUNT(*) FROM toll_charges tc4
                 JOIN toll_accounts ta4 ON tc4.toll_account_id = ta4.id
                 WHERE ta4.host_id = ? ${dateFilter.replace('tc.', 'tc..')}
                 AND toll_location = (
                     SELECT toll_location FROM toll_charges tc5
                     JOIN toll_accounts ta5 ON tc5.toll_account_id = ta5.id
                     WHERE ta5.host_id = ? ${dateFilter.replace('tc.', 'tc..')}
                     GROUP BY toll_location
                     ORDER BY COUNT(*) DESC LIMIT 1
                 )) as most_used_route_count,
                
                -- Time patterns (using toll_date converted to timestamp)
                (SELECT strftime('%H', datetime(tc6.toll_date/1000, 'unixepoch')) 
                 FROM toll_charges tc6
                 JOIN toll_accounts ta6 ON tc6.toll_account_id = ta6.id
                 WHERE ta6.host_id = ? ${dateFilter.replace('tc.', 'tc..')}
                 GROUP BY strftime('%H', datetime(tc6.toll_date/1000, 'unixepoch'))
                 ORDER BY COUNT(*) DESC LIMIT 1) as peak_hour,
                 
                -- Total trips for percentage calculation
                (SELECT COUNT(*) FROM trips WHERE host_id = ? AND (trip_status IS NULL OR trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))) as total_trips
                
            FROM toll_charges tc
            JOIN toll_accounts ta ON tc.toll_account_id = ta.id
            LEFT JOIN trips tr_turo ON tc.trip_id = tr_turo.turo_trip_id
                AND (tr_turo.trip_status IS NULL OR tr_turo.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
            LEFT JOIN trips tr_id ON tc.trip_id = tr_id.id
                AND (tr_id.trip_status IS NULL OR tr_id.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
            WHERE ta.host_id = ? ${dateFilter}
        `;
        
        // Build full parameter array for all subqueries
        // Main query params + 6 subqueries with params + 1 hostId for trips + main WHERE clause
        let fullParams = [];
        
        // Main SELECT (no params needed for aggregates)
        
        // Subquery 1: highest_toll_location
        fullParams.push(...params);
        
        // Subquery 2: most_used_route
        fullParams.push(...params);
        
        // Subquery 3: most_used_route_count (outer)
        fullParams.push(...params);
        
        // Subquery 4: most_used_route_count (inner)
        fullParams.push(...params);
        
        // Subquery 5: peak_hour
        fullParams.push(...params);
        
        // Subquery 6: total_trips
        fullParams.push(hostId);
        
        // Main WHERE clause
        fullParams.push(...params);
        
        db.get(query, fullParams, (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            
            // Calculate derived metrics
            const tollPerTrip = result.total_trips > 0 ? 
                result.total_toll_costs / result.total_trips : 0;
            
            // Estimate cost per mile (assuming avg 50 miles per trip)
            const estimatedMiles = result.total_trips * 50;
            const costPerMile = estimatedMiles > 0 ? 
                result.total_toll_costs / estimatedMiles : 0;
            
            // Calculate peak hour percentage
            const peakHourPercentage = result.total_toll_charges > 0 ?
                (result.total_toll_charges / 24) * 100 : 0; // Rough estimate
            
            resolve({
                totalTollCosts: result.total_toll_costs,
                totalCharges: result.total_toll_charges,
                uniqueLocations: result.unique_locations,
                tripsWithTolls: result.trips_with_tolls,
                vehiclesUsed: result.vehicles_used,
                avgTollAmount: result.avg_toll_amount,
                tollPerTrip: tollPerTrip,
                costPerMile: costPerMile,
                highestToll: {
                    amount: result.highest_toll,
                    location: result.highest_toll_location || 'Unknown'
                },
                mostUsedRoute: {
                    location: result.most_used_route || 'No data',
                    count: result.most_used_route_count || 0
                },
                peakTime: {
                    hour: result.peak_hour ? `${result.peak_hour}:00` : 'No data',
                    percentage: peakHourPercentage.toFixed(1)
                }
            });
        });
    });
}

// Get toll trends over time
async function getTollTrends(hostId, period, months) {
    return new Promise((resolve, reject) => {
        let groupBy, dateFormat;
        
        switch(period) {
            case 'daily':
                groupBy = "date(datetime(tc.toll_date/1000, 'unixepoch'))";
                dateFormat = "%Y-%m-%d";
                break;
            case 'weekly':
                groupBy = "strftime('%Y-%W', datetime(tc.toll_date/1000, 'unixepoch'))";
                dateFormat = "%Y-W%W";
                break;
            case 'monthly':
            default:
                groupBy = "strftime('%Y-%m', datetime(tc.toll_date/1000, 'unixepoch'))";
                dateFormat = "%Y-%m";
                break;
        }
        
        const query = `
            SELECT 
                strftime('${dateFormat}', datetime(tc.toll_date/1000, 'unixepoch')) as period,
                COUNT(*) as charge_count,
                COALESCE(SUM(tc.toll_amount), 0) as total_amount,
                COALESCE(AVG(tc.toll_amount), 0) as avg_amount
            FROM toll_charges tc
            JOIN toll_accounts ta ON tc.toll_account_id = ta.id
            WHERE ta.host_id = ?
            AND datetime(tc.toll_date/1000, 'unixepoch') >= datetime('now', '-${months} months')
            GROUP BY ${groupBy}
            ORDER BY period ASC
        `;
        
        db.all(query, [hostId], (err, results) => {
            if (err) {
                reject(err);
                return;
            }
            
            resolve(results);
        });
    });
}

// Get top toll locations
async function getTopTollLocations(hostId, limit) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                tc.toll_location as location,
                COUNT(*) as usage_count,
                COALESCE(SUM(tc.toll_amount), 0) as total_cost,
                COALESCE(AVG(tc.toll_amount), 0) as avg_cost,
                COUNT(DISTINCT t.vehicle_plate) as vehicles_used
            FROM toll_charges tc
            JOIN toll_accounts ta ON tc.toll_account_id = ta.id
            LEFT JOIN trips t ON tc.trip_id = t.turo_trip_id
            WHERE ta.host_id = ?
            GROUP BY tc.toll_location
            ORDER BY total_cost DESC
            LIMIT ?
        `;
        
        db.all(query, [hostId, limit], (err, results) => {
            if (err) {
                reject(err);
                return;
            }
            
            resolve(results);
        });
    });
}

// Get vehicle toll impact analysis
async function getVehicleTollImpact(hostId) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                t.vehicle_plate,
                COUNT(DISTINCT t.id) as total_trips,
                COUNT(DISTINCT CASE WHEN tc.id IS NOT NULL THEN t.id END) as trips_with_tolls,
                COALESCE(SUM(tc.toll_amount), 0) as total_toll_costs,
                COALESCE(AVG(tc.toll_amount), 0) as avg_toll_per_charge,
                COALESCE(SUM(tc.toll_amount) / NULLIF(COUNT(DISTINCT t.id), 0), 0) as avg_toll_per_trip,
                (SELECT toll_location 
                 FROM toll_charges tc2 
                 JOIN trips t2 ON tc2.trip_id = t2.turo_trip_id
                 WHERE t2.vehicle_plate = t.vehicle_plate AND (t2.trip_status IS NULL OR t2.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
                 GROUP BY toll_location
                 ORDER BY COUNT(*) DESC 
                 LIMIT 1) as most_used_route
            FROM trips t
            LEFT JOIN toll_charges tc ON t.turo_trip_id = tc.trip_id
            WHERE t.host_id = ? AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
            GROUP BY t.vehicle_plate
            ORDER BY total_toll_costs DESC
        `;
        
        db.all(query, [hostId], (err, results) => {
            if (err) {
                reject(err);
                return;
            }
            
            // Calculate toll impact percentage for each vehicle
            const vehiclesWithImpact = results.map(vehicle => {
                const impact = vehicle.total_trips > 0 ? 
                    (vehicle.trips_with_tolls / vehicle.total_trips * 100) : 0;
                
                return {
                    ...vehicle,
                    toll_impact_percentage: impact
                };
            });
            
            resolve(vehiclesWithImpact);
        });
    });
}

// Route export endpoint
router.get('/routes/export', (req, res) => {
    try {
        const query = `
            SELECT 
                tc.toll_location as location,
                COUNT(*) as usage_count,
                ROUND(SUM(tc.toll_amount), 2) as total_cost,
                ROUND(AVG(tc.toll_amount), 2) as avg_cost,
                COUNT(DISTINCT COALESCE(tr_turo.vehicle_id, tr_id.vehicle_id)) as vehicles_used,
                GROUP_CONCAT(DISTINCT date(datetime(tc.toll_date/1000, 'unixepoch'))) as usage_dates
            FROM toll_charges tc
            LEFT JOIN trips tr_turo ON tc.trip_id = tr_turo.turo_trip_id
            LEFT JOIN trips tr_id ON tc.trip_id = tr_id.id
            WHERE tc.toll_location IS NOT NULL
            GROUP BY tc.toll_location
            ORDER BY usage_count DESC
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('Error fetching route export data:', err);
                return res.status(500).json({ success: false, error: 'Database error' });
            }
            
            // Convert to CSV format
            const csvHeader = 'Route,Usage Count,Total Cost,Average Cost,Vehicles Used,Usage Dates\n';
            const csvRows = rows.map(row => 
                `"${row.location}",${row.usage_count},$${row.total_cost},$${row.avg_cost},${row.vehicles_used},"${row.usage_dates || ''}"`
            ).join('\n');
            
            const csv = csvHeader + csvRows;
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="route-analysis-${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csv);
        });
    } catch (error) {
        console.error('Error in route export:', error);
        res.status(500).json({ success: false, error: 'Export failed' });
    }
});

// Time analysis endpoint
router.get('/time-analysis', (req, res) => {
    try {
        // Query for hourly patterns
        const hourlyQuery = `
            SELECT 
                CAST(strftime('%H', datetime(toll_date/1000, 'unixepoch')) as INTEGER) as hour,
                COUNT(*) as count,
                ROUND(SUM(toll_amount), 2) as amount,
                ROUND(AVG(toll_amount), 2) as avg_amount
            FROM toll_charges 
            WHERE toll_date IS NOT NULL
            GROUP BY hour
            ORDER BY hour
        `;
        
        // Query for daily patterns
        const dailyQuery = `
            SELECT 
                CASE 
                    WHEN CAST(strftime('%w', datetime(toll_date/1000, 'unixepoch')) as INTEGER) = 0 THEN 'Sunday'
                    WHEN CAST(strftime('%w', datetime(toll_date/1000, 'unixepoch')) as INTEGER) = 1 THEN 'Monday'
                    WHEN CAST(strftime('%w', datetime(toll_date/1000, 'unixepoch')) as INTEGER) = 2 THEN 'Tuesday'
                    WHEN CAST(strftime('%w', datetime(toll_date/1000, 'unixepoch')) as INTEGER) = 3 THEN 'Wednesday'
                    WHEN CAST(strftime('%w', datetime(toll_date/1000, 'unixepoch')) as INTEGER) = 4 THEN 'Thursday'
                    WHEN CAST(strftime('%w', datetime(toll_date/1000, 'unixepoch')) as INTEGER) = 5 THEN 'Friday'
                    WHEN CAST(strftime('%w', datetime(toll_date/1000, 'unixepoch')) as INTEGER) = 6 THEN 'Saturday'
                END as day_name,
                CAST(strftime('%w', datetime(toll_date/1000, 'unixepoch')) as INTEGER) as day_of_week,
                COUNT(*) as count,
                ROUND(SUM(toll_amount), 2) as total_amount,
                ROUND(AVG(toll_amount), 2) as avg_amount
            FROM toll_charges 
            WHERE toll_date IS NOT NULL
            GROUP BY day_of_week, day_name
            ORDER BY day_of_week
        `;
        
        db.all(hourlyQuery, [], (err, hourlyResults) => {
            if (err) {
                console.error('Error fetching hourly data:', err);
                return res.status(500).json({ success: false, error: 'Database error' });
            }
            
            // Fill in missing hours with 0 values
            const completeHourly = [];
            for (let hour = 0; hour < 24; hour++) {
                const existing = hourlyResults.find(h => h.hour === hour);
                completeHourly.push(existing || { hour, count: 0, amount: 0, avg_amount: 0 });
            }
            
            db.all(dailyQuery, [], (err, dailyResults) => {
                if (err) {
                    console.error('Error fetching daily data:', err);
                    return res.status(500).json({ success: false, error: 'Database error' });
                }
                
                res.json({
                    success: true,
                    data: {
                        hourly: completeHourly,
                        daily: dailyResults
                    }
                });
            });
        });
    } catch (error) {
        console.error('Error in time analysis:', error);
        res.status(500).json({ success: false, error: 'Analysis failed' });
    }
});

module.exports = router;