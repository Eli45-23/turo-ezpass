const { db } = require('../config/database');

class AnalyticsEngine {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Financial Analytics - Revenue tracking, profit/loss analysis, cost per mile
     */
    async calculateFinancialMetrics(hostId, periodType = 'monthly', startDate = null, endDate = null) {
        const cacheKey = `financial_${hostId}_${periodType}_${startDate}_${endDate}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            // Set default date range if not provided
            if (!startDate || !endDate) {
                const dates = this.getDefaultDateRange(periodType);
                startDate = dates.start;
                endDate = dates.end;
            }

            const metrics = {
                period: { type: periodType, start: startDate, end: endDate },
                revenue: await this.calculateRevenue(hostId, startDate, endDate),
                costs: await this.calculateCosts(hostId, startDate, endDate),
                profitability: {},
                vehicles: await this.calculateVehiclePerformance(hostId, startDate, endDate),
                trends: await this.calculateTrends(hostId, periodType, startDate, endDate)
            };

            // Calculate profitability metrics
            metrics.profitability = {
                grossRevenue: metrics.revenue.total,
                totalCosts: metrics.costs.totalTolls + metrics.costs.processingFees,
                netProfit: metrics.revenue.total - (metrics.costs.totalTolls + metrics.costs.processingFees),
                profitMargin: metrics.revenue.total > 0 ? 
                    ((metrics.revenue.total - (metrics.costs.totalTolls + metrics.costs.processingFees)) / metrics.revenue.total * 100) : 0,
                costPerMile: metrics.costs.totalMiles > 0 ? metrics.costs.totalTolls / metrics.costs.totalMiles : 0,
                averageRevenuePerTrip: metrics.revenue.tripCount > 0 ? metrics.revenue.total / metrics.revenue.tripCount : 0
            };

            // Store in financial analytics table
            await this.storeFinancialMetrics(hostId, periodType, startDate, endDate, metrics);

            // Cache the result
            this.cache.set(cacheKey, { data: metrics, timestamp: Date.now() });

            return metrics;
        } catch (error) {
            console.error('Error calculating financial metrics:', error);
            throw error;
        }
    }

    async calculateRevenue(hostId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(DISTINCT t.id) as trip_count,
                    SUM(i.total_amount) as total_revenue,
                    AVG(i.total_amount) as avg_revenue_per_trip,
                    COUNT(DISTINCT t.vehicle_plate) as vehicle_count,
                    COUNT(DISTINCT t.renter_name) as unique_renters
                FROM trips t
                LEFT JOIN invoices i ON t.id = i.trip_id
                WHERE t.host_id = ? AND t.start_date >= ? AND t.end_date <= ?
                AND t.trip_status NOT LIKE '%canceled%' 
                AND t.trip_status NOT LIKE '%cancelled%'
                AND i.status IN ('sent', 'paid')
            `;

            db.get(query, [hostId, startDate, endDate], (err, result) => {
                if (err) return reject(err);
                resolve({
                    total: result.total_revenue || 0,
                    tripCount: result.trip_count || 0,
                    averagePerTrip: result.avg_revenue_per_trip || 0,
                    vehicleCount: result.vehicle_count || 0,
                    uniqueRenters: result.unique_renters || 0
                });
            });
        });
    }

    async calculateCosts(hostId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    SUM(tc.toll_amount) as total_tolls,
                    COUNT(tc.id) as toll_count,
                    AVG(tc.toll_amount) as avg_toll_amount,
                    SUM(i.processing_fee) as processing_fees,
                    COUNT(DISTINCT tc.toll_location) as unique_locations
                FROM toll_charges tc
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                LEFT JOIN trips t ON tc.trip_id = t.turo_trip_id
                LEFT JOIN invoices i ON t.id = i.trip_id
                WHERE ta.host_id = ? AND tc.toll_date >= ? AND tc.toll_date <= ?
            `;

            db.get(query, [hostId, startDate, endDate], (err, result) => {
                if (err) return reject(err);
                resolve({
                    totalTolls: result.total_tolls || 0,
                    tollCount: result.toll_count || 0,
                    averageToll: result.avg_toll_amount || 0,
                    processingFees: result.processing_fees || 0,
                    uniqueLocations: result.unique_locations || 0,
                    totalMiles: 0 // Will be calculated separately if trip distance data is available
                });
            });
        });
    }

    async calculateVehiclePerformance(hostId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    t.vehicle_plate,
                    COUNT(t.id) as trip_count,
                    SUM(COALESCE(tc.toll_amount, 0)) as total_toll_costs,
                    SUM(COALESCE(i.total_amount, 0)) as total_revenue,
                    AVG(COALESCE(tc.toll_amount, 0)) as avg_toll_per_trip,
                    COUNT(DISTINCT t.renter_name) as unique_renters
                FROM trips t
                LEFT JOIN toll_charges tc ON t.turo_trip_id = tc.trip_id
                LEFT JOIN invoices i ON t.id = i.trip_id AND i.status IN ('sent', 'paid')
                WHERE t.host_id = ? AND t.start_date >= ? AND t.end_date <= ?
                AND t.trip_status NOT LIKE '%canceled%'
                GROUP BY t.vehicle_plate
                ORDER BY total_revenue DESC
            `;

            db.all(query, [hostId, startDate, endDate], (err, rows) => {
                if (err) return reject(err);
                
                const vehicles = rows.map(row => ({
                    vehiclePlate: row.vehicle_plate,
                    tripCount: row.trip_count,
                    totalTollCosts: row.total_toll_costs,
                    totalRevenue: row.total_revenue,
                    netProfit: row.total_revenue - row.total_toll_costs,
                    profitMargin: row.total_revenue > 0 ? ((row.total_revenue - row.total_toll_costs) / row.total_revenue * 100) : 0,
                    averageTollPerTrip: row.avg_toll_per_trip,
                    uniqueRenters: row.unique_renters,
                    utilizationRate: 0 // Could be calculated based on available days vs booked days
                }));

                resolve(vehicles);
            });
        });
    }

    async calculateTrends(hostId, periodType, startDate, endDate) {
        const periodLength = this.getPeriodLength(periodType);
        const periods = this.generatePeriods(startDate, endDate, periodType);
        
        const trends = [];
        for (const period of periods) {
            const periodMetrics = await this.calculatePeriodMetrics(hostId, period.start, period.end);
            trends.push({
                period: period.label,
                start: period.start,
                end: period.end,
                ...periodMetrics
            });
        }

        return trends;
    }

    async calculatePeriodMetrics(hostId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(DISTINCT t.id) as trips,
                    SUM(COALESCE(tc.toll_amount, 0)) as toll_costs,
                    SUM(COALESCE(i.total_amount, 0)) as revenue,
                    COUNT(tc.id) as toll_count
                FROM trips t
                LEFT JOIN toll_charges tc ON t.turo_trip_id = tc.trip_id
                LEFT JOIN invoices i ON t.id = i.trip_id AND i.status IN ('sent', 'paid')
                WHERE t.host_id = ? AND t.start_date >= ? AND t.end_date <= ?
                AND t.trip_status NOT LIKE '%canceled%'
            `;

            db.get(query, [hostId, startDate, endDate], (err, result) => {
                if (err) return reject(err);
                resolve({
                    trips: result.trips || 0,
                    tollCosts: result.toll_costs || 0,
                    revenue: result.revenue || 0,
                    tollCount: result.toll_count || 0,
                    netProfit: (result.revenue || 0) - (result.toll_costs || 0)
                });
            });
        });
    }

    /**
     * Performance Metrics - Toll matching accuracy, system performance
     */
    async calculatePerformanceMetrics(hostId) {
        try {
            const tollMatchingAccuracy = await this.calculateTollMatchingAccuracy(hostId);
            const systemPerformance = await this.calculateSystemPerformance(hostId);
            const dataQuality = await this.calculateDataQuality(hostId);

            const metrics = {
                tollMatching: tollMatchingAccuracy,
                system: systemPerformance,
                dataQuality: dataQuality,
                overall: {
                    healthScore: this.calculateOverallHealthScore([
                        tollMatchingAccuracy.accuracy,
                        systemPerformance.reliability,
                        dataQuality.completeness
                    ])
                }
            };

            // Store performance metrics
            await this.storePerformanceMetrics(hostId, metrics);

            return metrics;
        } catch (error) {
            console.error('Error calculating performance metrics:', error);
            throw error;
        }
    }

    async calculateTollMatchingAccuracy(hostId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total_charges,
                    COUNT(CASE WHEN trip_id IS NOT NULL THEN 1 END) as matched_charges,
                    COUNT(CASE WHEN trip_id IS NULL THEN 1 END) as unmatched_charges,
                    COUNT(CASE WHEN validation_status = 'verified' THEN 1 END) as verified_charges
                FROM toll_charges tc
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                WHERE ta.host_id = ?
                AND tc.created_at >= datetime('now', '-30 days')
            `;

            db.get(query, [hostId], (err, result) => {
                if (err) return reject(err);
                
                const accuracy = result.total_charges > 0 ? 
                    (result.matched_charges / result.total_charges * 100) : 0;
                const verificationRate = result.total_charges > 0 ?
                    (result.verified_charges / result.total_charges * 100) : 0;

                resolve({
                    totalCharges: result.total_charges,
                    matchedCharges: result.matched_charges,
                    unmatchedCharges: result.unmatched_charges,
                    accuracy: accuracy,
                    verificationRate: verificationRate,
                    status: accuracy >= 90 ? 'excellent' : accuracy >= 75 ? 'good' : 'needs_improvement'
                });
            });
        });
    }

    async calculateSystemPerformance(hostId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total_syncs,
                    COUNT(CASE WHEN last_sync IS NOT NULL THEN 1 END) as successful_syncs,
                    AVG(CASE WHEN last_sync IS NOT NULL THEN 
                        (julianday('now') - julianday(last_sync)) * 24 * 60 
                    END) as avg_sync_interval_minutes
                FROM toll_accounts ta
                WHERE ta.host_id = ? AND ta.is_active = 1
            `;

            db.get(query, [hostId], (err, result) => {
                if (err) return reject(err);
                
                const reliability = result.total_syncs > 0 ?
                    (result.successful_syncs / result.total_syncs * 100) : 0;

                resolve({
                    totalSyncs: result.total_syncs,
                    successfulSyncs: result.successful_syncs,
                    reliability: reliability,
                    averageSyncInterval: result.avg_sync_interval_minutes || 0,
                    status: reliability >= 95 ? 'excellent' : reliability >= 85 ? 'good' : 'needs_attention'
                });
            });
        });
    }

    async calculateDataQuality(hostId) {
        return new Promise((resolve, reject) => {
            // First get trip data
            const tripQuery = `
                SELECT 
                    COUNT(DISTINCT t.id) as total_trips,
                    COUNT(CASE WHEN t.renter_email IS NOT NULL AND t.renter_email != '' THEN 1 END) as trips_with_email
                FROM trips t
                WHERE t.host_id = ?
                AND t.created_at >= datetime('now', '-30 days')
            `;

            db.get(tripQuery, [hostId], (err, tripResult) => {
                if (err) return reject(err);
                
                // Then get toll charge data
                const chargeQuery = `
                    SELECT 
                        COUNT(CASE WHEN tc.data_checksum IS NOT NULL THEN 1 END) as charges_with_checksum,
                        COUNT(DISTINCT tc.id) as total_charges
                    FROM toll_charges tc
                    JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                    WHERE ta.host_id = ?
                    AND tc.created_at >= datetime('now', '-30 days')
                `;

                db.get(chargeQuery, [hostId], (chargeErr, chargeResult) => {
                    if (chargeErr) return reject(chargeErr);
                    
                    const emailCompleteness = tripResult.total_trips > 0 ?
                        (tripResult.trips_with_email / tripResult.total_trips * 100) : 0;
                    const dataIntegrity = chargeResult.total_charges > 0 ?
                        (chargeResult.charges_with_checksum / chargeResult.total_charges * 100) : 0;
                    const completeness = (emailCompleteness + dataIntegrity) / 2;

                    resolve({
                        totalTrips: tripResult.total_trips,
                        emailCompleteness: emailCompleteness,
                        dataIntegrity: dataIntegrity,
                        completeness: completeness,
                        status: completeness >= 90 ? 'excellent' : completeness >= 75 ? 'good' : 'needs_improvement'
                    });
                });
            });
        });
    }

    /**
     * Business Intelligence - Toll locations, seasonal trends, renter behavior
     */
    async generateBusinessIntelligence(hostId, reportType, startDate, endDate) {
        try {
            let report;
            switch (reportType) {
                case 'toll_locations':
                    report = await this.analyzeTollLocations(hostId, startDate, endDate);
                    break;
                case 'seasonal_trends':
                    report = await this.analyzeSeasonalTrends(hostId, startDate, endDate);
                    break;
                case 'vehicle_utilization':
                    report = await this.analyzeVehicleUtilization(hostId, startDate, endDate);
                    break;
                case 'renter_behavior':
                    report = await this.analyzeRenterBehavior(hostId, startDate, endDate);
                    break;
                case 'route_analysis':
                    report = await this.analyzeRoutes(hostId, startDate, endDate);
                    break;
                default:
                    throw new Error('Unknown report type: ' + reportType);
            }

            // Store the report
            await this.storeBIReport(hostId, reportType, report, startDate, endDate);

            return report;
        } catch (error) {
            console.error('Error generating business intelligence report:', error);
            throw error;
        }
    }

    async analyzeTollLocations(hostId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    tc.toll_location,
                    COUNT(*) as charge_count,
                    SUM(tc.toll_amount) as total_amount,
                    AVG(tc.toll_amount) as average_amount,
                    COUNT(DISTINCT t.vehicle_plate) as vehicle_count,
                    MIN(tc.toll_date) as first_seen,
                    MAX(tc.toll_date) as last_seen,
                    COUNT(DISTINCT strftime('%H', tc.toll_date)) as active_hours
                FROM toll_charges tc
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                LEFT JOIN trips t ON tc.trip_id = t.turo_trip_id
                WHERE ta.host_id = ? AND tc.toll_date >= ? AND tc.toll_date <= ?
                GROUP BY tc.toll_location
                ORDER BY total_amount DESC
                LIMIT 50
            `;

            db.all(query, [hostId, startDate, endDate], (err, rows) => {
                if (err) return reject(err);

                const locations = rows.map(row => ({
                    location: row.toll_location,
                    chargeCount: row.charge_count,
                    totalAmount: row.total_amount,
                    averageAmount: row.average_amount,
                    vehicleCount: row.vehicle_count,
                    firstSeen: row.first_seen,
                    lastSeen: row.last_seen,
                    activeHours: row.active_hours,
                    costRank: rows.indexOf(row) + 1
                }));

                const summary = {
                    topLocation: locations[0]?.location,
                    totalLocations: locations.length,
                    totalSpent: locations.reduce((sum, loc) => sum + loc.totalAmount, 0),
                    averagePerLocation: locations.length > 0 ? 
                        locations.reduce((sum, loc) => sum + loc.totalAmount, 0) / locations.length : 0
                };

                resolve({ locations, summary });
            });
        });
    }

    async analyzeSeasonalTrends(hostId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    strftime('%Y-%m', tc.toll_date) as month,
                    strftime('%w', tc.toll_date) as day_of_week,
                    strftime('%H', tc.toll_date) as hour_of_day,
                    COUNT(*) as charge_count,
                    SUM(tc.toll_amount) as total_amount,
                    AVG(tc.toll_amount) as average_amount
                FROM toll_charges tc
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                WHERE ta.host_id = ? AND tc.toll_date >= ? AND tc.toll_date <= ?
                GROUP BY strftime('%Y-%m', tc.toll_date), strftime('%w', tc.toll_date), strftime('%H', tc.toll_date)
                ORDER BY month, day_of_week, hour_of_day
            `;

            db.all(query, [hostId, startDate, endDate], (err, rows) => {
                if (err) return reject(err);

                // Aggregate by month
                const monthlyTrends = {};
                const dailyTrends = {};
                const hourlyTrends = {};

                rows.forEach(row => {
                    // Monthly trends
                    if (!monthlyTrends[row.month]) {
                        monthlyTrends[row.month] = { charges: 0, amount: 0 };
                    }
                    monthlyTrends[row.month].charges += row.charge_count;
                    monthlyTrends[row.month].amount += row.total_amount;

                    // Daily trends (0=Sunday, 6=Saturday)
                    if (!dailyTrends[row.day_of_week]) {
                        dailyTrends[row.day_of_week] = { charges: 0, amount: 0 };
                    }
                    dailyTrends[row.day_of_week].charges += row.charge_count;
                    dailyTrends[row.day_of_week].amount += row.total_amount;

                    // Hourly trends
                    if (!hourlyTrends[row.hour_of_day]) {
                        hourlyTrends[row.hour_of_day] = { charges: 0, amount: 0 };
                    }
                    hourlyTrends[row.hour_of_day].charges += row.charge_count;
                    hourlyTrends[row.hour_of_day].amount += row.total_amount;
                });

                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                
                resolve({
                    monthly: Object.keys(monthlyTrends).map(month => ({
                        month,
                        charges: monthlyTrends[month].charges,
                        amount: monthlyTrends[month].amount
                    })),
                    daily: Object.keys(dailyTrends).map(day => ({
                        dayOfWeek: parseInt(day),
                        dayName: dayNames[day],
                        charges: dailyTrends[day].charges,
                        amount: dailyTrends[day].amount
                    })),
                    hourly: Object.keys(hourlyTrends).map(hour => ({
                        hour: parseInt(hour),
                        charges: hourlyTrends[hour].charges,
                        amount: hourlyTrends[hour].amount
                    }))
                });
            });
        });
    }

    async analyzeRenterBehavior(hostId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    t.renter_name,
                    t.renter_email,
                    COUNT(t.id) as trip_count,
                    SUM(COALESCE(tc.toll_amount, 0)) as total_toll_costs,
                    AVG(COALESCE(tc.toll_amount, 0)) as avg_toll_per_trip,
                    COUNT(DISTINCT t.vehicle_plate) as vehicles_used,
                    COUNT(DISTINCT tc.toll_location) as unique_toll_locations,
                    MIN(t.start_date) as first_trip,
                    MAX(t.end_date) as last_trip
                FROM trips t
                LEFT JOIN toll_charges tc ON t.turo_trip_id = tc.trip_id
                WHERE t.host_id = ? AND t.start_date >= ? AND t.end_date <= ?
                AND t.trip_status NOT LIKE '%canceled%'
                GROUP BY t.renter_name, t.renter_email
                HAVING trip_count > 0
                ORDER BY total_toll_costs DESC
                LIMIT 100
            `;

            db.all(query, [hostId, startDate, endDate], (err, rows) => {
                if (err) return reject(err);

                const renters = rows.map(row => ({
                    name: row.renter_name,
                    email: row.renter_email,
                    tripCount: row.trip_count,
                    totalTollCosts: row.total_toll_costs,
                    averageTollPerTrip: row.avg_toll_per_trip,
                    vehiclesUsed: row.vehicles_used,
                    uniqueTollLocations: row.unique_toll_locations,
                    firstTrip: row.first_trip,
                    lastTrip: row.last_trip,
                    isRepeatCustomer: row.trip_count > 1
                }));

                const summary = {
                    totalRenters: renters.length,
                    repeatCustomers: renters.filter(r => r.isRepeatCustomer).length,
                    averageTripsPerRenter: renters.length > 0 ? 
                        renters.reduce((sum, r) => sum + r.tripCount, 0) / renters.length : 0,
                    topSpender: renters[0]?.name,
                    repeatCustomerRate: renters.length > 0 ? 
                        (renters.filter(r => r.isRepeatCustomer).length / renters.length * 100) : 0
                };

                resolve({ renters, summary });
            });
        });
    }

    async analyzeVehicleUtilization(hostId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                WITH vehicle_stats AS (
                    SELECT 
                        t.vehicle_plate,
                        COUNT(t.id) as trip_count,
                        SUM(COALESCE(tc.toll_amount, 0)) as total_toll_costs,
                        AVG(COALESCE(tc.toll_amount, 0)) as avg_toll_per_trip,
                        COUNT(DISTINCT tc.toll_location) as unique_toll_locations,
                        MIN(t.start_date) as first_trip,
                        MAX(t.end_date) as last_trip,
                        COUNT(DISTINCT t.renter_name) as unique_renters
                    FROM trips t
                    LEFT JOIN toll_charges tc ON t.turo_trip_id = tc.trip_id
                    WHERE t.host_id = ? AND t.start_date >= ? AND t.end_date <= ?
                    AND t.trip_status NOT LIKE '%canceled%'
                    GROUP BY t.vehicle_plate
                    HAVING trip_count > 0
                )
                SELECT 
                    vehicle_plate,
                    trip_count,
                    total_toll_costs,
                    avg_toll_per_trip,
                    unique_toll_locations,
                    first_trip,
                    last_trip,
                    unique_renters,
                    ROUND((julianday(last_trip) - julianday(first_trip)) + 1, 0) as active_days,
                    ROUND(trip_count / ((julianday(last_trip) - julianday(first_trip)) + 1), 2) as trips_per_day
                FROM vehicle_stats
                ORDER BY total_toll_costs DESC
            `;

            db.all(query, [hostId, startDate, endDate], (err, rows) => {
                if (err) return reject(err);

                const vehicles = rows.map(row => ({
                    vehiclePlate: row.vehicle_plate,
                    tripCount: row.trip_count,
                    totalTollCosts: row.total_toll_costs,
                    avgTollPerTrip: row.avg_toll_per_trip,
                    uniqueTollLocations: row.unique_toll_locations,
                    firstTrip: row.first_trip,
                    lastTrip: row.last_trip,
                    uniqueRenters: row.unique_renters,
                    activeDays: row.active_days,
                    tripsPerDay: row.trips_per_day,
                    utilizationScore: Math.min((row.trips_per_day * 100), 100)
                }));

                const summary = {
                    totalVehicles: vehicles.length,
                    totalTrips: vehicles.reduce((sum, v) => sum + v.tripCount, 0),
                    totalTollCosts: vehicles.reduce((sum, v) => sum + v.totalTollCosts, 0),
                    avgTripsPerVehicle: vehicles.length > 0 ? 
                        vehicles.reduce((sum, v) => sum + v.tripCount, 0) / vehicles.length : 0,
                    avgUtilizationScore: vehicles.length > 0 ? 
                        vehicles.reduce((sum, v) => sum + v.utilizationScore, 0) / vehicles.length : 0,
                    topPerformer: vehicles[0] || null,
                    underutilizedVehicles: vehicles.filter(v => v.utilizationScore < 20).length
                };

                resolve({ vehicles, summary });
            });
        });
    }

    async analyzeRoutes(hostId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                WITH route_analysis AS (
                    SELECT 
                        tc.toll_location,
                        t.vehicle_plate,
                        COUNT(*) as frequency,
                        SUM(tc.toll_amount) as total_cost,
                        AVG(tc.toll_amount) as avg_cost,
                        COUNT(DISTINCT t.id) as unique_trips,
                        COUNT(DISTINCT t.renter_name) as unique_renters
                    FROM toll_charges tc
                    JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                    JOIN trips t ON tc.trip_id = t.turo_trip_id
                    WHERE ta.host_id = ? AND tc.toll_date >= ? AND tc.toll_date <= ?
                    AND t.trip_status NOT LIKE '%canceled%'
                    GROUP BY tc.toll_location, t.vehicle_plate
                ),
                location_patterns AS (
                    SELECT 
                        toll_location,
                        COUNT(DISTINCT vehicle_plate) as vehicle_count,
                        SUM(frequency) as total_frequency,
                        SUM(total_cost) as location_total_cost,
                        AVG(avg_cost) as location_avg_cost
                    FROM route_analysis
                    GROUP BY toll_location
                )
                SELECT 
                    lp.*,
                    ROUND(lp.total_frequency / lp.vehicle_count, 2) as avg_frequency_per_vehicle
                FROM location_patterns lp
                ORDER BY lp.location_total_cost DESC
            `;

            db.all(query, [hostId, startDate, endDate], (err, rows) => {
                if (err) return reject(err);

                const routes = rows.map(row => ({
                    location: row.toll_location,
                    vehicleCount: row.vehicle_count,
                    totalFrequency: row.total_frequency,
                    totalCost: row.location_total_cost,
                    avgCost: row.location_avg_cost,
                    avgFrequencyPerVehicle: row.avg_frequency_per_vehicle
                }));

                const summary = {
                    totalLocations: routes.length,
                    totalCost: routes.reduce((sum, r) => sum + r.totalCost, 0),
                    mostExpensiveRoute: routes[0] || null,
                    avgCostPerLocation: routes.length > 0 ? 
                        routes.reduce((sum, r) => sum + r.totalCost, 0) / routes.length : 0,
                    highTrafficLocations: routes.filter(r => r.totalFrequency > 10).length,
                    optimizationOpportunities: routes.filter(r => r.avgCost > 5).length
                };

                resolve({ routes, summary });
            });
        });
    }

    /**
     * Predictive Analytics - Forecasting and optimization
     */
    async generatePredictiveAnalytics(hostId, predictionType, forecastPeriod = 30) {
        try {
            let prediction;
            const forecastStart = new Date();
            const forecastEnd = new Date();
            forecastEnd.setDate(forecastEnd.getDate() + forecastPeriod);

            switch (predictionType) {
                case 'toll_forecast':
                    prediction = await this.forecastTollCosts(hostId, forecastPeriod);
                    break;
                case 'revenue_forecast':
                    prediction = await this.forecastRevenue(hostId, forecastPeriod);
                    break;
                case 'seasonal_demand':
                    prediction = await this.predictSeasonalDemand(hostId, forecastPeriod);
                    break;
                case 'route_optimization':
                    prediction = await this.optimizeRoutes(hostId);
                    break;
                default:
                    throw new Error('Unknown prediction type: ' + predictionType);
            }

            // Store prediction
            await this.storePrediction(hostId, predictionType, prediction, forecastStart, forecastEnd);

            return prediction;
        } catch (error) {
            console.error('Error generating predictive analytics:', error);
            throw error;
        }
    }

    async forecastTollCosts(hostId, days) {
        // Simple linear regression based on historical data
        const historical = await this.getHistoricalTollData(hostId, 90); // 90 days of history
        
        if (historical.length < 7) {
            return { error: 'Insufficient historical data for forecasting' };
        }

        const { slope, intercept, r2 } = this.calculateLinearRegression(historical);
        const dailyForecast = [];
        
        for (let i = 1; i <= days; i++) {
            const predictedValue = Math.max(0, slope * (historical.length + i) + intercept);
            dailyForecast.push({
                day: i,
                date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                predictedTollCosts: predictedValue,
                confidenceInterval: {
                    lower: predictedValue * 0.8,
                    upper: predictedValue * 1.2
                }
            });
        }

        return {
            forecast: dailyForecast,
            totalForecast: dailyForecast.reduce((sum, day) => sum + day.predictedTollCosts, 0),
            confidence: Math.min(r2 * 100, 95), // Cap at 95%
            model: 'linear_regression',
            historicalPeriod: historical.length
        };
    }

    async getHistoricalTollData(hostId, days) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    DATE(tc.toll_date) as date,
                    SUM(tc.toll_amount) as daily_total
                FROM toll_charges tc
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                WHERE ta.host_id = ? 
                AND tc.toll_date >= datetime('now', '-${days} days')
                GROUP BY DATE(tc.toll_date)
                ORDER BY date
            `;

            db.all(query, [hostId], (err, rows) => {
                if (err) return reject(err);
                resolve(rows.map((row, index) => ({ x: index, y: row.daily_total })));
            });
        });
    }

    calculateLinearRegression(data) {
        const n = data.length;
        const sumX = data.reduce((sum, point) => sum + point.x, 0);
        const sumY = data.reduce((sum, point) => sum + point.y, 0);
        const sumXY = data.reduce((sum, point) => sum + point.x * point.y, 0);
        const sumXX = data.reduce((sum, point) => sum + point.x * point.x, 0);
        const sumYY = data.reduce((sum, point) => sum + point.y * point.y, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Calculate R-squared
        const yMean = sumY / n;
        const totalSumSquares = data.reduce((sum, point) => sum + Math.pow(point.y - yMean, 2), 0);
        const residualSumSquares = data.reduce((sum, point) => {
            const predicted = slope * point.x + intercept;
            return sum + Math.pow(point.y - predicted, 2);
        }, 0);
        const r2 = totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;

        return { slope, intercept, r2 };
    }

    async optimizeRoutes(hostId) {
        // Simple route optimization based on cost analysis
        try {
            const routeAnalysis = await this.analyzeRoutes(hostId, null, null);
            const tollLocations = await this.analyzeTollLocations(hostId, null, null);
            
            return {
                recommendations: [
                    {
                        type: 'cost_reduction',
                        title: 'High-Cost Route Alternatives',
                        description: 'Consider alternative routes for frequently used high-cost toll locations',
                        potentialSavings: routeAnalysis.summary.totalCost * 0.15,
                        routes: routeAnalysis.routes.slice(0, 3).map(r => r.location)
                    },
                    {
                        type: 'frequency_optimization', 
                        title: 'Route Frequency Optimization',
                        description: 'Optimize scheduling for high-frequency routes',
                        potentialSavings: routeAnalysis.summary.totalCost * 0.1,
                        routes: tollLocations.locations.slice(0, 5).map(l => l.location)
                    }
                ],
                summary: {
                    totalPotentialSavings: routeAnalysis.summary.totalCost * 0.25,
                    optimizationOpportunities: routeAnalysis.routes.length,
                    confidence: 0.75
                }
            };
        } catch (error) {
            console.error('Error in route optimization:', error);
            return {
                recommendations: [],
                summary: { totalPotentialSavings: 0, optimizationOpportunities: 0, confidence: 0 }
            };
        }
    }

    /**
     * Utility methods
     */
    getDefaultDateRange(periodType) {
        const end = new Date();
        const start = new Date();

        switch (periodType) {
            case 'daily':
                start.setDate(end.getDate() - 30);
                break;
            case 'weekly':
                start.setDate(end.getDate() - 12 * 7);
                break;
            case 'monthly':
                start.setMonth(end.getMonth() - 12);
                break;
            case 'quarterly':
                start.setMonth(end.getMonth() - 12);
                break;
            case 'yearly':
                start.setFullYear(end.getFullYear() - 3);
                break;
        }

        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        };
    }

    getPeriodLength(periodType) {
        switch (periodType) {
            case 'daily': return 1;
            case 'weekly': return 7;
            case 'monthly': return 30;
            case 'quarterly': return 90;
            case 'yearly': return 365;
            default: return 30;
        }
    }

    generatePeriods(startDate, endDate, periodType) {
        const periods = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        let current = new Date(start);
        
        while (current < end) {
            const periodEnd = new Date(current);
            
            switch (periodType) {
                case 'daily':
                    periodEnd.setDate(periodEnd.getDate() + 1);
                    break;
                case 'weekly':
                    periodEnd.setDate(periodEnd.getDate() + 7);
                    break;
                case 'monthly':
                    periodEnd.setMonth(periodEnd.getMonth() + 1);
                    break;
            }
            
            if (periodEnd > end) periodEnd.setTime(end.getTime());
            
            periods.push({
                start: current.toISOString().split('T')[0],
                end: periodEnd.toISOString().split('T')[0],
                label: this.formatPeriodLabel(current, periodType)
            });
            
            current = new Date(periodEnd);
        }
        
        return periods;
    }

    formatPeriodLabel(date, periodType) {
        switch (periodType) {
            case 'daily':
                return date.toISOString().split('T')[0];
            case 'weekly':
                return `Week of ${date.toISOString().split('T')[0]}`;
            case 'monthly':
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            default:
                return date.toISOString().split('T')[0];
        }
    }

    calculateOverallHealthScore(scores) {
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    }

    /**
     * Storage methods
     */
    async storeFinancialMetrics(hostId, periodType, startDate, endDate, metrics) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT OR REPLACE INTO financial_analytics 
                (host_id, period_type, period_start, period_end, total_revenue, total_toll_costs, 
                 processing_fees, net_profit, trip_count, toll_charge_count, average_toll_per_trip, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `;

            const values = [
                hostId, periodType, startDate, endDate,
                metrics.revenue.total, metrics.costs.totalTolls,
                metrics.costs.processingFees, metrics.profitability.netProfit,
                metrics.revenue.tripCount, metrics.costs.tollCount,
                metrics.profitability.averageRevenuePerTrip
            ];

            db.run(query, values, function(err) {
                if (err) return reject(err);
                resolve(this.lastID);
            });
        });
    }

    async storePerformanceMetrics(hostId, metrics) {
        const queries = [
            {
                category: 'toll_matching',
                name: 'accuracy_rate',
                value: metrics.tollMatching.accuracy,
                success_count: metrics.tollMatching.matchedCharges,
                total_count: metrics.tollMatching.totalCharges
            },
            {
                category: 'system_performance',
                name: 'reliability_rate', 
                value: metrics.system.reliability,
                success_count: metrics.system.successfulSyncs,
                total_count: metrics.system.totalSyncs
            },
            {
                category: 'data_quality',
                name: 'completeness_rate',
                value: metrics.dataQuality.completeness,
                total_count: metrics.dataQuality.totalTrips
            }
        ];

        for (const metric of queries) {
            await this.storePerformanceMetric(hostId, metric);
        }
    }

    async storePerformanceMetric(hostId, metric) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO performance_metrics 
                (host_id, metric_category, metric_name, metric_value, success_count, total_count, accuracy_rate)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(query, [
                hostId, metric.category, metric.name, metric.value,
                metric.success_count || 0, metric.total_count || 0, metric.value
            ], function(err) {
                if (err) return reject(err);
                resolve(this.lastID);
            });
        });
    }

    async storeBIReport(hostId, reportType, reportData, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO bi_reports 
                (host_id, report_type, report_name, report_data, report_summary, period_start, period_end)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            const reportName = this.getReportName(reportType);
            const reportSummary = this.generateReportSummary(reportType, reportData);
            
            // Provide default dates if not provided
            const defaultStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const defaultEndDate = endDate || new Date().toISOString().split('T')[0];

            db.run(query, [
                hostId, reportType, reportName, JSON.stringify(reportData),
                reportSummary, defaultStartDate, defaultEndDate
            ], function(err) {
                if (err) return reject(err);
                resolve(this.lastID);
            });
        });
    }

    async storePrediction(hostId, predictionType, predictionData, forecastStart, forecastEnd) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO predictive_analytics 
                (host_id, prediction_type, model_name, prediction_data, confidence_score, 
                 forecast_period_start, forecast_period_end)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(query, [
                hostId, predictionType, predictionData.model || 'default',
                JSON.stringify(predictionData), predictionData.confidence || 0,
                forecastStart.toISOString(), forecastEnd.toISOString()
            ], function(err) {
                if (err) return reject(err);
                resolve(this.lastID);
            });
        });
    }

    /**
     * Personal Driving Analytics Methods
     */

    async getPersonalVsRentalRatio(hostId, startDate = null, endDate = null) {
        const cacheKey = `personal_rental_ratio_${hostId}_${startDate}_${endDate}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        const cache = this.cache; // Preserve context
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    COALESCE(SUM(CASE WHEN tc.is_matched = 0 OR tc.trip_id IS NULL THEN tc.toll_amount ELSE 0 END), 0) as personal_total,
                    COALESCE(SUM(CASE WHEN tc.is_matched = 1 AND tc.trip_id IS NOT NULL THEN tc.toll_amount ELSE 0 END), 0) as rental_total,
                    COALESCE(COUNT(CASE WHEN tc.is_matched = 0 OR tc.trip_id IS NULL THEN 1 END), 0) as personal_count,
                    COALESCE(COUNT(CASE WHEN tc.is_matched = 1 AND tc.trip_id IS NOT NULL THEN 1 END), 0) as rental_count,
                    COALESCE(COUNT(*), 0) as total_count,
                    COALESCE(SUM(tc.toll_amount), 0) as total_amount
                FROM toll_charges tc 
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                WHERE ta.host_id = ?
            `;
            
            const params = [hostId];
            
            if (startDate && endDate) {
                query += ` AND tc.toll_date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            }

            db.get(query, params, (err, result) => {
                if (err) {
                    console.error('Error in getPersonalVsRentalRatio:', err);
                    return reject(err);
                }
                
                if (!result) {
                    result = {
                        personal_total: 0,
                        rental_total: 0,
                        personal_count: 0,
                        rental_count: 0,
                        total_count: 0,
                        total_amount: 0
                    };
                }
                
                const personalTotal = parseFloat(result.personal_total) || 0;
                const rentalTotal = parseFloat(result.rental_total) || 0;
                const totalAmount = personalTotal + rentalTotal;
                
                const data = {
                    personal: {
                        amount: personalTotal,
                        count: result.personal_count || 0,
                        percentage: totalAmount > 0 ? (personalTotal / totalAmount * 100).toFixed(1) : 0
                    },
                    rental: {
                        amount: rentalTotal,
                        count: result.rental_count || 0,
                        percentage: totalAmount > 0 ? (rentalTotal / totalAmount * 100).toFixed(1) : 0
                    },
                    total: {
                        amount: totalAmount,
                        count: result.total_count || 0
                    },
                    businessExpenseDeduction: personalTotal // For tax purposes
                };

                cache.set(cacheKey, { data, timestamp: Date.now() });
                resolve(data);
            });
        });
    }

    async getTopPersonalDrivingRoutes(hostId, startDate = null, endDate = null, limit = 10) {
        const cacheKey = `personal_routes_${hostId}_${startDate}_${endDate}_${limit}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        const cache = this.cache; // Preserve context
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    COALESCE(tc.toll_location, 'Unknown Location') as toll_location,
                    COUNT(*) as usage_count,
                    COALESCE(SUM(tc.toll_amount), 0) as total_cost,
                    COALESCE(AVG(tc.toll_amount), 0) as average_cost,
                    MIN(tc.toll_date) as first_used,
                    MAX(tc.toll_date) as last_used,
                    COUNT(DISTINCT tc.plate_number) as vehicle_count
                FROM toll_charges tc 
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                WHERE ta.host_id = ? 
                AND (tc.is_matched = 0 OR tc.trip_id IS NULL)
            `;
            
            const params = [hostId];
            
            if (startDate && endDate) {
                query += ` AND tc.toll_date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            }
            
            query += `
                GROUP BY tc.toll_location 
                ORDER BY total_cost DESC 
                LIMIT ?
            `;
            params.push(limit);

            db.all(query, params, (err, results) => {
                if (err) {
                    console.error('Error in getTopPersonalDrivingRoutes:', err);
                    return reject(err);
                }
                
                const routes = (results || []).map(row => ({
                    location: row.toll_location || 'Unknown Location',
                    usageCount: row.usage_count || 0,
                    totalCost: parseFloat(row.total_cost) || 0,
                    averageCost: parseFloat(row.average_cost) || 0,
                    firstUsed: row.first_used,
                    lastUsed: row.last_used,
                    vehicleCount: row.vehicle_count || 0
                }));

                const data = {
                    routes,
                    summary: {
                        totalRoutes: routes.length,
                        totalCost: routes.reduce((sum, route) => sum + route.totalCost, 0),
                        mostExpensive: routes[0] || null
                    }
                };

                cache.set(cacheKey, { data, timestamp: Date.now() });
                resolve(data);
            });
        });
    }

    async getPersonalDrivingTrends(hostId, startDate = null, endDate = null, period = 'monthly') {
        const cacheKey = `personal_trends_${hostId}_${startDate}_${endDate}_${period}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        const cache = this.cache; // Preserve context
        return new Promise((resolve, reject) => {
            const dateFormat = period === 'weekly' ? '%Y-%W' : '%Y-%m';
            
            let query = `
                SELECT 
                    strftime('${dateFormat}', tc.toll_date) as period,
                    COALESCE(SUM(tc.toll_amount), 0) as total_cost,
                    COUNT(*) as toll_count,
                    COALESCE(AVG(tc.toll_amount), 0) as average_cost,
                    COUNT(DISTINCT tc.toll_location) as unique_locations,
                    COUNT(DISTINCT tc.plate_number) as unique_vehicles
                FROM toll_charges tc 
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                WHERE ta.host_id = ? 
                AND (tc.is_matched = 0 OR tc.trip_id IS NULL)
            `;
            
            const params = [hostId];
            
            if (startDate && endDate) {
                query += ` AND tc.toll_date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            }
            
            query += `
                GROUP BY strftime('${dateFormat}', tc.toll_date)
                ORDER BY period ASC
            `;

            db.all(query, params, (err, results) => {
                if (err) {
                    console.error('Error in getPersonalDrivingTrends:', err);
                    return reject(err);
                }
                
                const trends = (results || []).map(row => ({
                    period: row.period || '',
                    totalCost: parseFloat(row.total_cost) || 0,
                    tollCount: row.toll_count || 0,
                    averageCost: parseFloat(row.average_cost) || 0,
                    uniqueLocations: row.unique_locations || 0,
                    uniqueVehicles: row.unique_vehicles || 0
                }));

                // Calculate month-over-month changes
                const trendsWithChanges = trends.map((trend, index) => {
                    if (index === 0) return { ...trend, changePercent: 0 };
                    
                    const previousCost = trends[index - 1].totalCost;
                    const changePercent = previousCost > 0 ? 
                        ((trend.totalCost - previousCost) / previousCost * 100).toFixed(1) : 0;
                    
                    return { ...trend, changePercent: parseFloat(changePercent) };
                });

                const data = {
                    trends: trendsWithChanges,
                    summary: {
                        totalPeriods: trends.length,
                        averageMonthlyCost: trends.length > 0 ? 
                            trends.reduce((sum, t) => sum + t.totalCost, 0) / trends.length : 0,
                        highestCostPeriod: trends.reduce((max, t) => 
                            t.totalCost > (max?.totalCost || 0) ? t : max, null)
                    }
                };

                cache.set(cacheKey, { data, timestamp: Date.now() });
                resolve(data);
            });
        });
    }

    async getVehiclePersonalCosts(hostId, startDate = null, endDate = null) {
        const cacheKey = `vehicle_personal_costs_${hostId}_${startDate}_${endDate}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        const cache = this.cache; // Preserve context
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    COALESCE(tc.plate_number, 'Unknown') as vehicle_plate,
                    COALESCE(tm.vehicle_description, 'Unknown Vehicle') as vehicle_description,
                    COALESCE(SUM(tc.toll_amount), 0) as total_personal_cost,
                    COUNT(*) as personal_toll_count,
                    COALESCE(AVG(tc.toll_amount), 0) as average_cost_per_toll,
                    COUNT(DISTINCT tc.toll_location) as unique_locations,
                    MIN(tc.toll_date) as first_personal_toll,
                    MAX(tc.toll_date) as last_personal_toll
                FROM toll_charges tc 
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                LEFT JOIN transponder_mappings tm ON tc.plate_number = tm.vehicle_plate 
                    AND tm.host_id = ta.host_id AND tm.is_active = 1
                WHERE ta.host_id = ? 
                AND (tc.is_matched = 0 OR tc.trip_id IS NULL)
            `;
            
            const params = [hostId];
            
            if (startDate && endDate) {
                query += ` AND tc.toll_date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            }
            
            query += `
                GROUP BY tc.plate_number, tm.vehicle_description
                ORDER BY total_personal_cost DESC
            `;

            db.all(query, params, (err, results) => {
                if (err) {
                    console.error('Error in getVehiclePersonalCosts:', err);
                    return reject(err);
                }
                
                const vehicles = (results || []).map(row => ({
                    vehiclePlate: row.vehicle_plate || 'Unknown',
                    vehicleDescription: row.vehicle_description || 'Unknown Vehicle',
                    totalPersonalCost: parseFloat(row.total_personal_cost) || 0,
                    personalTollCount: row.personal_toll_count,
                    averageCostPerToll: parseFloat(row.average_cost_per_toll),
                    uniqueLocations: row.unique_locations,
                    firstPersonalToll: row.first_personal_toll,
                    lastPersonalToll: row.last_personal_toll
                }));

                const data = {
                    vehicles,
                    summary: {
                        totalVehicles: vehicles.length,
                        totalPersonalCosts: vehicles.reduce((sum, v) => sum + v.totalPersonalCost, 0),
                        mostExpensiveVehicle: vehicles[0] || null,
                        averageCostPerVehicle: vehicles.length > 0 ? 
                            vehicles.reduce((sum, v) => sum + v.totalPersonalCost, 0) / vehicles.length : 0
                    }
                };

                this.cache.set(cacheKey, { data, timestamp: Date.now() });
                resolve(data);
            });
        });
    }

    getReportName(reportType) {
        const names = {
            'toll_locations': 'Top Toll Locations Analysis',
            'seasonal_trends': 'Seasonal Trends Report',
            'vehicle_utilization': 'Vehicle Utilization Analysis',
            'renter_behavior': 'Renter Behavior Analysis',
            'route_analysis': 'Route Optimization Report'
        };
        return names[reportType] || reportType;
    }

    generateReportSummary(reportType, reportData) {
        switch (reportType) {
            case 'toll_locations':
                return `Analyzed ${reportData.summary?.totalLocations || 0} toll locations. Top location: ${reportData.summary?.topLocation || 'N/A'}. Total spent: $${(reportData.summary?.totalSpent || 0).toFixed(2)}.`;
            case 'renter_behavior':
                return `Analyzed ${reportData.summary?.totalRenters || 0} renters. ${reportData.summary?.repeatCustomers || 0} repeat customers (${(reportData.summary?.repeatCustomerRate || 0).toFixed(1)}% rate).`;
            default:
                return `Generated ${reportType} report with comprehensive analysis.`;
        }
    }
}

module.exports = new AnalyticsEngine();