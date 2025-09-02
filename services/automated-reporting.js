const cron = require('node-cron');
const { db } = require('../config/database');
const analyticsEngine = require('./analytics-engine');
// const emailService = require('./email-service'); // DISABLED - Email service removed
const path = require('path');
const fs = require('fs').promises;

class AutomatedReportingService {
    constructor() {
        this.scheduledJobs = new Map();
        this.isInitialized = false;
        // Stub emailService to prevent errors
        this.emailService = {
            sendEmail: () => Promise.resolve({ messageId: 'email-disabled', success: false })
        };
    }

    async initialize() {
        if (this.isInitialized) return;
        
        console.log('🤖 Initializing Automated Reporting Service...');
        
        // Schedule default reports
        await this.scheduleDefaultReports();
        
        // Start periodic cleanup
        this.scheduleCleanup();
        
        this.isInitialized = true;
        console.log('✅ Automated Reporting Service initialized');
    }

    async scheduleDefaultReports() {
        // Daily performance summary (runs at 7 AM)
        cron.schedule('0 7 * * *', () => {
            this.generateDailyReports();
        });

        // Weekly financial summary (runs Mondays at 8 AM)
        cron.schedule('0 8 * * 1', () => {
            this.generateWeeklyReports();
        });

        // Monthly comprehensive report (runs 1st of month at 9 AM)
        cron.schedule('0 9 1 * *', () => {
            this.generateMonthlyReports();
        });

        // Quarterly business intelligence (runs 1st of quarter at 10 AM)
        cron.schedule('0 10 1 1,4,7,10 *', () => {
            this.generateQuarterlyReports();
        });
    }

    async generateDailyReports() {
        console.log('📊 Generating daily reports...');
        
        try {
            const hosts = await this.getActiveHosts();
            
            for (const host of hosts) {
                if (await this.shouldGenerateReport(host.id, 'daily_summary')) {
                    await this.generateDailySummary(host);
                }
            }
        } catch (error) {
            console.error('Error generating daily reports:', error);
        }
    }

    async generateWeeklyReports() {
        console.log('📈 Generating weekly reports...');
        
        try {
            const hosts = await this.getActiveHosts();
            
            for (const host of hosts) {
                if (await this.shouldGenerateReport(host.id, 'weekly_summary')) {
                    await this.generateWeeklySummary(host);
                }
            }
        } catch (error) {
            console.error('Error generating weekly reports:', error);
        }
    }

    async generateMonthlyReports() {
        console.log('📋 Generating monthly reports...');
        
        try {
            const hosts = await this.getActiveHosts();
            
            for (const host of hosts) {
                if (await this.shouldGenerateReport(host.id, 'monthly_financial')) {
                    await this.generateMonthlyFinancialReport(host);
                }
            }
        } catch (error) {
            console.error('Error generating monthly reports:', error);
        }
    }

    async generateQuarterlyReports() {
        console.log('🔍 Generating quarterly business intelligence reports...');
        
        try {
            const hosts = await this.getActiveHosts();
            
            for (const host of hosts) {
                if (await this.shouldGenerateReport(host.id, 'quarterly_bi')) {
                    await this.generateQuarterlyBIReport(host);
                }
            }
        } catch (error) {
            console.error('Error generating quarterly reports:', error);
        }
    }

    async generateDailySummary(host) {
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const startDate = yesterday.toISOString().split('T')[0];
            const endDate = startDate;

            // Get performance metrics
            const performance = await analyticsEngine.calculatePerformanceMetrics(host.id);
            
            // Get daily financial data
            const financial = await analyticsEngine.calculateFinancialMetrics(
                host.id, 'daily', startDate, endDate
            );

            const report = {
                type: 'daily_summary',
                host: host,
                date: startDate,
                performance: performance,
                financial: financial,
                alerts: await this.generateAlerts(host.id, performance, financial)
            };

            // Send email if enabled
            if (host.email_notifications && host.daily_summaries) {
                await this.sendDailySummaryEmail(host, report);
            }

            // Store report
            await this.storeAutomatedReport(host.id, 'daily_summary', report);
            
            console.log(`✅ Daily summary generated for ${host.email}`);
        } catch (error) {
            console.error(`Error generating daily summary for ${host.email}:`, error);
        }
    }

    async generateWeeklySummary(host) {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 7);

            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];

            // Get comprehensive weekly data
            const financial = await analyticsEngine.calculateFinancialMetrics(
                host.id, 'weekly', startDateStr, endDateStr
            );

            const tollLocations = await analyticsEngine.generateBusinessIntelligence(
                host.id, 'toll_locations', startDateStr, endDateStr
            );

            const performance = await analyticsEngine.calculatePerformanceMetrics(host.id);

            const report = {
                type: 'weekly_summary',
                host: host,
                period: { start: startDateStr, end: endDateStr },
                financial: financial,
                tollLocations: tollLocations,
                performance: performance,
                insights: await this.generateWeeklyInsights(financial, tollLocations),
                recommendations: await this.generateRecommendations(host.id, financial, tollLocations)
            };

            // Send email if enabled
            if (host.email_notifications && host.weekly_summaries) {
                await this.sendWeeklySummaryEmail(host, report);
            }

            // Store report
            await this.storeAutomatedReport(host.id, 'weekly_summary', report);
            
            console.log(`✅ Weekly summary generated for ${host.email}`);
        } catch (error) {
            console.error(`Error generating weekly summary for ${host.email}:`, error);
        }
    }

    async generateMonthlyFinancialReport(host) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1);
            
            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];

            // Comprehensive financial analysis
            const financial = await analyticsEngine.calculateFinancialMetrics(
                host.id, 'monthly', startDateStr, endDateStr
            );

            const vehicleAnalysis = await analyticsEngine.generateBusinessIntelligence(
                host.id, 'vehicle_utilization', startDateStr, endDateStr
            );

            const renterBehavior = await analyticsEngine.generateBusinessIntelligence(
                host.id, 'renter_behavior', startDateStr, endDateStr
            );

            const seasonalTrends = await analyticsEngine.generateBusinessIntelligence(
                host.id, 'seasonal_trends', startDateStr, endDateStr
            );

            // Generate forecast for next month
            const forecast = await analyticsEngine.generatePredictiveAnalytics(
                host.id, 'revenue_forecast', 30
            );

            const report = {
                type: 'monthly_financial',
                host: host,
                period: { start: startDateStr, end: endDateStr },
                financial: financial,
                vehicleAnalysis: vehicleAnalysis,
                renterBehavior: renterBehavior,
                seasonalTrends: seasonalTrends,
                forecast: forecast,
                insights: await this.generateMonthlyInsights(financial, vehicleAnalysis, renterBehavior),
                actionItems: await this.generateActionItems(host.id, financial, vehicleAnalysis)
            };

            // Send email if enabled
            if (host.email_notifications && host.monthly_summaries) {
                await this.sendMonthlyReportEmail(host, report);
            }

            // Store report
            await this.storeAutomatedReport(host.id, 'monthly_financial', report);
            
            console.log(`✅ Monthly financial report generated for ${host.email}`);
        } catch (error) {
            console.error(`Error generating monthly financial report for ${host.email}:`, error);
        }
    }

    async generateQuarterlyBIReport(host) {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 3);
            
            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];

            // Comprehensive business intelligence
            const tollLocations = await analyticsEngine.generateBusinessIntelligence(
                host.id, 'toll_locations', startDateStr, endDateStr
            );

            const routeAnalysis = await analyticsEngine.generateBusinessIntelligence(
                host.id, 'route_analysis', startDateStr, endDateStr
            );

            const seasonalTrends = await analyticsEngine.generateBusinessIntelligence(
                host.id, 'seasonal_trends', startDateStr, endDateStr
            );

            const predictiveAnalytics = await analyticsEngine.generatePredictiveAnalytics(
                host.id, 'seasonal_demand', 90
            );

            const report = {
                type: 'quarterly_bi',
                host: host,
                period: { start: startDateStr, end: endDateStr },
                tollLocations: tollLocations,
                routeAnalysis: routeAnalysis,
                seasonalTrends: seasonalTrends,
                predictiveAnalytics: predictiveAnalytics,
                strategicInsights: await this.generateStrategicInsights(
                    tollLocations, routeAnalysis, seasonalTrends
                ),
                optimizationOpportunities: await this.generateOptimizationOpportunities(
                    host.id, tollLocations, routeAnalysis
                )
            };

            // Send email if enabled
            if (host.email_notifications) {
                await this.sendQuarterlyBIEmail(host, report);
            }

            // Store report
            await this.storeAutomatedReport(host.id, 'quarterly_bi', report);
            
            console.log(`✅ Quarterly BI report generated for ${host.email}`);
        } catch (error) {
            console.error(`Error generating quarterly BI report for ${host.email}:`, error);
        }
    }

    async generateAlerts(hostId, performance, financial) {
        const alerts = [];

        // Performance alerts
        if (performance.tollMatching.accuracy < 75) {
            alerts.push({
                type: 'warning',
                category: 'performance',
                title: 'Low Toll Matching Accuracy',
                message: `Toll matching accuracy is ${performance.tollMatching.accuracy.toFixed(1)}%. Consider updating transponder mappings.`,
                action: 'Check transponder configuration'
            });
        }

        if (performance.system.reliability < 85) {
            alerts.push({
                type: 'warning',
                category: 'system',
                title: 'Sync Reliability Issues',
                message: `EZ-Pass sync reliability is ${performance.system.reliability.toFixed(1)}%. Check account credentials.`,
                action: 'Verify EZ-Pass account settings'
            });
        }

        // Financial alerts
        if (financial.profitability.netProfit < 0) {
            alerts.push({
                type: 'critical',
                category: 'financial',
                title: 'Negative Profit Margin',
                message: `Net profit is negative: $${financial.profitability.netProfit.toFixed(2)}. Toll costs exceed revenue.`,
                action: 'Review pricing strategy'
            });
        }

        if (financial.profitability.profitMargin < 10) {
            alerts.push({
                type: 'warning',
                category: 'financial',
                title: 'Low Profit Margin',
                message: `Profit margin is ${financial.profitability.profitMargin.toFixed(1)}%. Consider optimizing routes or adjusting pricing.`,
                action: 'Analyze high-toll routes'
            });
        }

        return alerts;
    }

    async generateWeeklyInsights(financial, tollLocations) {
        const insights = [];

        // Revenue insights
        if (financial.revenue.total > 0) {
            const costRatio = (financial.costs.totalTolls / financial.revenue.total) * 100;
            insights.push({
                type: 'financial',
                title: 'Toll Cost Ratio',
                value: `${costRatio.toFixed(1)}%`,
                description: `Toll costs represent ${costRatio.toFixed(1)}% of total revenue this week.`,
                benchmark: costRatio < 15 ? 'excellent' : costRatio < 25 ? 'good' : 'needs_improvement'
            });
        }

        // Location insights
        if (tollLocations.summary && tollLocations.summary.totalLocations > 0) {
            insights.push({
                type: 'operational',
                title: 'Top Toll Location',
                value: tollLocations.summary.topLocation,
                description: `Your highest toll cost location this week. Total spent: $${tollLocations.summary.totalSpent.toFixed(2)} across ${tollLocations.summary.totalLocations} locations.`,
                benchmark: 'info'
            });
        }

        return insights;
    }

    async generateMonthlyInsights(financial, vehicleAnalysis, renterBehavior) {
        const insights = [];

        // Profitability insight
        insights.push({
            type: 'financial',
            title: 'Monthly Profitability',
            value: `$${financial.profitability.netProfit.toFixed(2)}`,
            description: `Net profit for the month with ${financial.profitability.profitMargin.toFixed(1)}% margin.`,
            benchmark: financial.profitability.netProfit > 0 ? 'good' : 'needs_improvement',
            trend: 'up' // Would compare to previous month
        });

        // Vehicle performance insight
        if (financial.vehicles && financial.vehicles.length > 0) {
            const topVehicle = financial.vehicles[0];
            insights.push({
                type: 'operational',
                title: 'Top Performing Vehicle',
                value: topVehicle.vehiclePlate,
                description: `Generated $${topVehicle.totalRevenue.toFixed(2)} revenue with ${topVehicle.tripCount} trips.`,
                benchmark: 'info'
            });
        }

        // Customer insights
        if (renterBehavior.summary) {
            insights.push({
                type: 'customer',
                title: 'Repeat Customer Rate',
                value: `${renterBehavior.summary.repeatCustomerRate.toFixed(1)}%`,
                description: `${renterBehavior.summary.repeatCustomers} out of ${renterBehavior.summary.totalRenters} customers were repeat renters.`,
                benchmark: renterBehavior.summary.repeatCustomerRate > 30 ? 'excellent' : 
                          renterBehavior.summary.repeatCustomerRate > 15 ? 'good' : 'needs_improvement'
            });
        }

        return insights;
    }

    async generateRecommendations(hostId, financial, tollLocations) {
        const recommendations = [];

        // Cost optimization recommendations
        if (financial.profitability.profitMargin < 20) {
            recommendations.push({
                type: 'cost_optimization',
                priority: 'high',
                title: 'Optimize High-Toll Routes',
                description: 'Consider providing renters with alternative route suggestions to avoid high-toll areas.',
                expectedImpact: 'Could reduce toll costs by 15-25%',
                actionSteps: [
                    'Identify top 5 most expensive toll locations',
                    'Research alternative routes',
                    'Create route guidance for renters',
                    'Monitor toll cost reduction'
                ]
            });
        }

        // Revenue enhancement recommendations
        if (financial.revenue.tripCount > 0 && financial.profitability.averageRevenuePerTrip < 50) {
            recommendations.push({
                type: 'revenue_enhancement',
                priority: 'medium',
                title: 'Implement Dynamic Pricing',
                description: 'Adjust pricing based on expected toll costs and demand patterns.',
                expectedImpact: 'Could increase revenue per trip by 10-20%',
                actionSteps: [
                    'Analyze seasonal demand patterns',
                    'Implement toll-aware pricing',
                    'A/B test pricing strategies',
                    'Monitor revenue improvements'
                ]
            });
        }

        return recommendations;
    }

    async generateActionItems(hostId, financial, vehicleAnalysis) {
        const actionItems = [];

        // Performance action items
        if (financial.profitability.netProfit < 0) {
            actionItems.push({
                priority: 'critical',
                category: 'financial',
                task: 'Address Negative Profitability',
                description: 'Immediate attention required for negative profit margins',
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                owner: 'host',
                status: 'pending'
            });
        }

        // Optimization action items
        if (financial.vehicles && financial.vehicles.length > 1) {
            const underperforming = financial.vehicles.filter(v => v.profitMargin < 5);
            if (underperforming.length > 0) {
                actionItems.push({
                    priority: 'medium',
                    category: 'optimization',
                    task: 'Review Underperforming Vehicles',
                    description: `${underperforming.length} vehicle(s) have profit margins below 5%`,
                    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                    owner: 'host',
                    status: 'pending'
                });
            }
        }

        return actionItems;
    }

    async generateStrategicInsights(tollLocations, routeAnalysis, seasonalTrends) {
        const insights = [];

        // Market insights
        if (tollLocations.summary) {
            insights.push({
                type: 'market',
                title: 'Toll Infrastructure Impact',
                analysis: `Your fleet encounters tolls at ${tollLocations.summary.totalLocations} different locations, with an average cost of $${tollLocations.summary.averagePerLocation.toFixed(2)} per location.`,
                implication: 'Consider geographic positioning of vehicles relative to major toll corridors',
                opportunity: 'Potential to reduce costs through strategic vehicle placement'
            });
        }

        // Seasonal insights
        if (seasonalTrends.monthly && seasonalTrends.monthly.length > 0) {
            const highestMonth = seasonalTrends.monthly.reduce((max, month) => 
                month.amount > max.amount ? month : max
            );
            
            insights.push({
                type: 'seasonal',
                title: 'Peak Toll Season',
                analysis: `${highestMonth.month} shows the highest toll costs at $${highestMonth.amount.toFixed(2)}`,
                implication: 'Seasonal patterns affect operational costs significantly',
                opportunity: 'Adjust pricing and availability during peak toll periods'
            });
        }

        return insights;
    }

    async generateOptimizationOpportunities(hostId, tollLocations, routeAnalysis) {
        const opportunities = [];

        // Route optimization
        if (tollLocations.locations && tollLocations.locations.length > 0) {
            const highCostLocations = tollLocations.locations.filter(loc => loc.averageAmount > 10);
            
            if (highCostLocations.length > 0) {
                opportunities.push({
                    type: 'route_optimization',
                    title: 'High-Cost Toll Avoidance',
                    description: `${highCostLocations.length} locations have average tolls above $10`,
                    potential_savings: `$${highCostLocations.reduce((sum, loc) => sum + loc.totalAmount, 0) * 0.3}`,
                    implementation: 'Provide renters with toll-free route alternatives',
                    complexity: 'medium',
                    timeframe: '1-3 months'
                });
            }
        }

        // Technology optimization
        opportunities.push({
            type: 'technology',
            title: 'Predictive Toll Alerts',
            description: 'Implement real-time toll cost prediction for renters',
            potential_savings: 'Up to 20% reduction in toll costs through route awareness',
            implementation: 'Integrate toll prediction API with rental platform',
            complexity: 'high',
            timeframe: '3-6 months'
        });

        return opportunities;
    }

    // Email generation methods
    async sendDailySummaryEmail(host, report) {
        const subject = `Daily Summary - ${report.date}`;
        const templateData = {
            hostName: host.full_name,
            date: report.date,
            performance: report.performance,
            financial: report.financial,
            alerts: report.alerts
        };

        try {
            await this.emailService.sendEmail({
                to: host.email,
                subject: subject,
                template: 'daily-summary',
                data: templateData
            });
        } catch (error) {
            console.error('Error sending daily summary email:', error);
        }
    }

    async sendWeeklySummaryEmail(host, report) {
        const subject = `Weekly Summary - ${report.period.start} to ${report.period.end}`;
        const templateData = {
            hostName: host.full_name,
            period: report.period,
            financial: report.financial,
            insights: report.insights,
            recommendations: report.recommendations
        };

        try {
            await this.emailService.sendEmail({
                to: host.email,
                subject: subject,
                template: 'weekly-summary',
                data: templateData
            });
        } catch (error) {
            console.error('Error sending weekly summary email:', error);
        }
    }

    async sendMonthlyReportEmail(host, report) {
        const subject = `Monthly Financial Report - ${report.period.start} to ${report.period.end}`;
        
        // Generate PDF report
        const pdfPath = await this.generateMonthlyPDF(host, report);
        
        const templateData = {
            hostName: host.full_name,
            period: report.period,
            financial: report.financial,
            insights: report.insights,
            actionItems: report.actionItems,
            pdfAttached: true
        };

        try {
            await this.emailService.sendEmail({
                to: host.email,
                subject: subject,
                template: 'monthly-report',
                data: templateData,
                attachments: pdfPath ? [{
                    filename: `monthly-report-${report.period.start}.pdf`,
                    path: pdfPath
                }] : []
            });

            // Clean up PDF file after sending
            if (pdfPath) {
                setTimeout(() => fs.unlink(pdfPath).catch(console.error), 60000);
            }
        } catch (error) {
            console.error('Error sending monthly report email:', error);
        }
    }

    async sendQuarterlyBIEmail(host, report) {
        const subject = `Quarterly Business Intelligence Report - Q${Math.ceil(new Date().getMonth() / 3)}`;
        const templateData = {
            hostName: host.full_name,
            period: report.period,
            strategicInsights: report.strategicInsights,
            optimizationOpportunities: report.optimizationOpportunities
        };

        try {
            await this.emailService.sendEmail({
                to: host.email,
                subject: subject,
                template: 'quarterly-bi',
                data: templateData
            });
        } catch (error) {
            console.error('Error sending quarterly BI email:', error);
        }
    }

    async generateMonthlyPDF(host, report) {
        // This would integrate with a PDF generation library
        // For now, we'll return null to indicate no PDF generated
        // In a real implementation, you'd use libraries like puppeteer, jsPDF, or PDFKit
        console.log('📄 PDF generation not implemented yet');
        return null;
    }

    // Utility methods
    async getActiveHosts() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT h.*, np.email_notifications, np.weekly_summaries, np.monthly_summaries
                FROM hosts h
                LEFT JOIN notification_preferences np ON h.id = np.host_id
                WHERE h.id IN (
                    SELECT DISTINCT host_id FROM toll_accounts WHERE is_active = 1
                )
            `;

            db.all(query, [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }

    async shouldGenerateReport(hostId, reportType) {
        // Check if report was already generated today
        return new Promise((resolve, reject) => {
            const query = `
                SELECT last_generated 
                FROM automated_reports 
                WHERE host_id = ? AND report_type = ?
            `;

            db.get(query, [hostId, reportType], (err, row) => {
                if (err) return reject(err);
                
                if (!row) {
                    // No previous report, should generate
                    resolve(true);
                    return;
                }

                const lastGenerated = new Date(row.last_generated);
                const now = new Date();
                const hoursSinceLastReport = (now - lastGenerated) / (1000 * 60 * 60);
                
                // Generate if more than 20 hours since last report (allows for some flexibility)
                resolve(hoursSinceLastReport > 20);
            });
        });
    }

    async storeAutomatedReport(hostId, reportType, reportData) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT OR REPLACE INTO automated_reports 
                (host_id, report_type, last_generated, report_config)
                VALUES (?, ?, datetime('now'), ?)
            `;

            db.run(query, [hostId, reportType, JSON.stringify(reportData)], function(err) {
                if (err) return reject(err);
                resolve(this.lastID);
            });
        });
    }

    scheduleCleanup() {
        // Clean up old reports and cached data every Sunday at midnight
        cron.schedule('0 0 * * 0', () => {
            this.performCleanup();
        });
    }

    async performCleanup() {
        console.log('🧹 Performing automated reporting cleanup...');
        
        try {
            // Clean up old cached reports (keep last 90 days)
            await this.cleanupOldReports();
            
            // Clear analytics cache
            this.clearCache();
            
            console.log('✅ Automated reporting cleanup completed');
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    async cleanupOldReports() {
        return new Promise((resolve, reject) => {
            const query = `
                DELETE FROM bi_reports 
                WHERE generated_at < datetime('now', '-90 days')
            `;

            db.run(query, [], function(err) {
                if (err) return reject(err);
                console.log(`🗑️ Cleaned up ${this.changes} old BI reports`);
                resolve(this.changes);
            });
        });
    }

    clearCache() {
        if (this.cache) {
            this.cache.clear();
            console.log('🧹 Analytics cache cleared');
        }
    }

    // Public API methods
    async generateCustomReport(hostId, reportConfig) {
        try {
            const { type, period, parameters } = reportConfig;
            
            switch (type) {
                case 'financial_summary':
                    return await this.generateCustomFinancialReport(hostId, period, parameters);
                case 'performance_analysis':
                    return await this.generateCustomPerformanceReport(hostId, period, parameters);
                case 'business_intelligence':
                    return await this.generateCustomBIReport(hostId, period, parameters);
                default:
                    throw new Error('Unknown custom report type');
            }
        } catch (error) {
            console.error('Error generating custom report:', error);
            throw error;
        }
    }

    async generateCustomFinancialReport(hostId, period, parameters) {
        const financial = await analyticsEngine.calculateFinancialMetrics(
            hostId, period.type, period.start, period.end
        );

        return {
            type: 'custom_financial',
            period: period,
            parameters: parameters,
            data: financial,
            generated_at: new Date().toISOString()
        };
    }
}

module.exports = new AutomatedReportingService();