const cron = require('node-cron');
const TuroIntegrationService = require('./turo-integration');
const NotificationManager = require('./notification-manager');
const { db } = require('../config/database');
const { supabaseAdmin } = require('../config/supabase');

/**
 * Scheduled Tasks Service
 * Handles automatic synchronization and matching
 */

class SchedulerService {
    constructor() {
        this.turoService = new TuroIntegrationService();
        this.notificationManager = new NotificationManager();
        this.jobs = [];
    }

    /**
     * Start all scheduled tasks
     */
    async start() {
        console.log('🕐 Starting scheduled tasks...');
        
        // Initialize notification manager
        try {
            await this.notificationManager.initialize();
        } catch (error) {
            console.error('❌ Failed to initialize notification manager:', error);
        }
        
        // DISABLED: Auto-match tolls globally - now only runs per-user on demand
        // This ensures data isolation - matching only happens within user sessions
        // const tollMatchingJob = cron.schedule('*/30 * * * *', async () => {
        //     console.log('🔄 Running automatic toll matching...');
        //     await this.runTollMatching();
        // });
        
        // Generate pending invoices daily at 9 AM
        const invoiceGenerationJob = cron.schedule('0 9 * * *', async () => {
            console.log('📄 Running daily invoice generation...');
            await this.runInvoiceGeneration();
        });
        
        // Sync toll data every 2 hours (for active accounts)
        const tollSyncJob = cron.schedule('0 */2 * * *', async () => {
            console.log('🎫 Running toll data synchronization...');
            await this.runTollSync();
        });
        
        // Cleanup old data weekly (Sundays at 2 AM)
        const cleanupJob = cron.schedule('0 2 * * 0', async () => {
            console.log('🧹 Running weekly data cleanup...');
            await this.runDataCleanup();
        });
        
        // Check upcoming trips every hour and move to active when appropriate
        const tripStatusJob = cron.schedule('0 * * * *', async () => {
            console.log('📅 Checking upcoming trip statuses...');
            await this.runTripStatusUpdate();
        });
        
        // Process notification queue every 15 minutes
        const notificationQueueJob = cron.schedule('*/15 * * * *', async () => {
            console.log('📬 Processing notification queue...');
            await this.processNotificationQueue();
        });
        
        // Send weekly summaries every Monday at 9 AM
        const weeklySummaryJob = cron.schedule('0 9 * * 1', async () => {
            console.log('📅 Sending weekly summaries...');
            await this.sendWeeklySummaries();
        });
        
        // Send monthly summaries on the 1st of each month at 9 AM
        const monthlySummaryJob = cron.schedule('0 9 1 * *', async () => {
            console.log('📊 Sending monthly summaries...');
            await this.sendMonthlySummaries();
        });
        
        this.jobs = [invoiceGenerationJob, tollSyncJob, cleanupJob, tripStatusJob, 
                     notificationQueueJob, weeklySummaryJob, monthlySummaryJob];
        console.log('✅ Scheduled tasks started successfully');
    }

    /**
     * Stop all scheduled tasks
     */
    stop() {
        this.jobs.forEach(job => job.stop());
        console.log('⏹️ All scheduled tasks stopped');
    }

    /**
     * Run automatic toll matching for all hosts
     */
    async runTollMatching() {
        try {
            const hosts = await this.getAllActiveHosts();
            let totalMatches = 0;
            
            for (const host of hosts) {
                const result = await this.turoService.autoMatchTolls(host.id);
                totalMatches += result.matchedCount;
                
                if (result.matchedCount > 0) {
                    console.log(`✅ Matched ${result.matchedCount} tolls for host ${host.email}`);
                }
            }
            
            console.log(`🎯 Total toll matches: ${totalMatches}`);
            
            // Log the activity
            await this.logActivity('toll_matching', {
                totalMatches,
                hostsProcessed: hosts.length
            });
            
        } catch (error) {
            console.error('❌ Error in toll matching job:', error);
        }
    }

    /**
     * Run toll matching for a specific host only (per-user isolation)
     * This replaces the global matching to ensure data isolation
     */
    async runTollMatchingForHost(hostId, options = {}) {
        try {
            console.log(`🎯 Running toll matching for host: ${hostId}`);
            
            // Verify host exists and is active
            const { data: host, error: hostError } = await supabaseAdmin
                .from('hosts')
                .select('id, email, full_name')
                .eq('id', hostId)
                .single();
            
            if (hostError || !host) {
                console.error(`❌ Host ${hostId} not found or inactive`);
                return { success: false, error: 'Host not found' };
            }
            
            // Run toll matching only for this host
            const result = await this.turoService.autoMatchTolls(hostId, options);
            
            console.log(`✅ Host ${host.email}: ${result.matchedCount}/${result.totalCharges} tolls matched`);
            
            // Log the activity for this specific host
            await this.logActivity('toll_matching_per_user', {
                hostId,
                hostEmail: host.email,
                matchedCount: result.matchedCount,
                totalCharges: result.totalCharges,
                personalTollsCount: result.personalTollsCount || 0
            });
            
            return {
                success: true,
                hostId,
                hostEmail: host.email,
                matchedCount: result.matchedCount,
                totalCharges: result.totalCharges,
                personalTollsCount: result.personalTollsCount || 0,
                confidence: result.confidence || {}
            };
            
        } catch (error) {
            console.error(`❌ Error in per-user toll matching for host ${hostId}:`, error);
            return {
                success: false,
                error: error.message,
                hostId
            };
        }
    }

    /**
     * Run automatic invoice generation for completed trips
     */
    async runInvoiceGeneration() {
        try {
            const tripsWithTolls = await this.getTripsReadyForInvoicing();
            let invoicesGenerated = 0;
            
            for (const trip of tripsWithTolls) {
                // Check if invoice already exists
                const existingInvoice = await this.checkExistingInvoice(trip.id);
                
                if (!existingInvoice && trip.toll_count > 0) {
                    const invoice = await this.generateInvoiceForTrip(trip);
                    if (invoice) {
                        invoicesGenerated++;
                        console.log(`📄 Generated invoice for trip ${trip.turo_trip_id}`);
                    }
                }
            }
            
            console.log(`📊 Generated ${invoicesGenerated} invoices`);
            
            // Log the activity
            await this.logActivity('invoice_generation', {
                invoicesGenerated,
                tripsProcessed: tripsWithTolls.length
            });
            
        } catch (error) {
            console.error('❌ Error in invoice generation job:', error);
        }
    }

    /**
     * Run toll data synchronization for active accounts
     */
    async runTollSync() {
        try {
            const accounts = await this.getActiveTollAccounts();
            let accountsSynced = 0;
            
            for (const account of accounts) {
                // Mock toll sync - in production, this would call real APIs
                const newCharges = await this.syncTollAccount(account.id);
                if (newCharges > 0) {
                    accountsSynced++;
                    console.log(`🎫 Synced ${newCharges} new charges for ${account.provider} account`);
                }
            }
            
            console.log(`🔄 Synced ${accountsSynced} toll accounts`);
            
            // Log the activity
            await this.logActivity('toll_sync', {
                accountsSynced,
                totalAccounts: accounts.length
            });
            
        } catch (error) {
            console.error('❌ Error in toll sync job:', error);
        }
    }

    /**
     * Run weekly data cleanup
     */
    async runDataCleanup() {
        try {
            // Clean up old unmatched charges (older than 90 days)
            const oldChargesRemoved = await this.cleanupOldCharges();
            
            // Archive completed trips (older than 6 months)
            const tripsArchived = await this.archiveOldTrips();
            
            console.log(`🧹 Cleanup completed: ${oldChargesRemoved} charges removed, ${tripsArchived} trips archived`);
            
            // Log the activity
            await this.logActivity('data_cleanup', {
                chargesRemoved: oldChargesRemoved,
                tripsArchived
            });
            
        } catch (error) {
            console.error('❌ Error in cleanup job:', error);
        }
    }

    /**
     * Check upcoming trips and update their status when they become active
     */
    async runTripStatusUpdate() {
        try {
            const now = new Date().toISOString();
            let tripsActivated = 0;
            let tripsCompleted = 0;
            
            // Check upcoming trips that have started (move to active status)
            const upcomingTripsStarted = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM trips 
                     WHERE start_date <= ? 
                     AND end_date >= ?
                     AND (trip_status = 'upcoming' OR trip_status = 'confirmed')
                     AND trip_status NOT LIKE '%canceled%'
                     AND trip_status NOT LIKE '%cancelled%'
                     AND trip_status NOT LIKE '%declined%'`,
                    [now, now],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            
            // Update trips to active status
            for (const trip of upcomingTripsStarted) {
                await new Promise((resolve) => {
                    db.run(
                        `UPDATE trips SET trip_status = 'active' WHERE id = ?`,
                        [trip.id],
                        function(err) {
                            if (!err && this.changes > 0) {
                                tripsActivated++;
                                console.log(`🔄 Trip ${trip.turo_trip_id} (${trip.renter_name}) moved to active status`);
                            }
                            resolve();
                        }
                    );
                });
            }
            
            // Check active trips that have ended (move to completed status)
            const activeTripsEnded = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM trips 
                     WHERE end_date < ? 
                     AND trip_status = 'active'`,
                    [now],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            
            // Update trips to completed status
            for (const trip of activeTripsEnded) {
                await new Promise((resolve) => {
                    db.run(
                        `UPDATE trips SET trip_status = 'completed' WHERE id = ?`,
                        [trip.id],
                        function(err) {
                            if (!err && this.changes > 0) {
                                tripsCompleted++;
                                console.log(`✅ Trip ${trip.turo_trip_id} (${trip.renter_name}) moved to completed status`);
                            }
                            resolve();
                        }
                    );
                });
            }
            
            if (tripsActivated > 0 || tripsCompleted > 0) {
                console.log(`📅 Trip status update: ${tripsActivated} trips activated, ${tripsCompleted} trips completed`);
            }
            
            // Log the activity
            await this.logActivity('trip_status_update', {
                tripsActivated,
                tripsCompleted,
                totalTripsChecked: upcomingTripsStarted.length + activeTripsEnded.length
            });
            
        } catch (error) {
            console.error('❌ Error in trip status update job:', error);
        }
    }

    /**
     * Helper methods
     */

    async getAllActiveHosts() {
        try {
            // Use Supabase to get hosts with proper UUID format
            const { data: hosts, error } = await supabaseAdmin
                .from('hosts')
                .select('id, email')
                .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString());
            
            if (error) throw error;
            return hosts || [];
        } catch (error) {
            console.error('❌ Error getting active hosts:', error);
            return [];
        }
    }

    async getTripsReadyForInvoicing() {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT t.*, COUNT(tc.id) as toll_count, SUM(tc.toll_amount) as total_amount
                 FROM trips t
                 LEFT JOIN toll_charges tc ON t.id = tc.trip_id
                 WHERE t.end_date < datetime('now', '-1 day')
                   AND t.trip_status = 'active'
                 GROUP BY t.id
                 HAVING toll_count > 0`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async checkExistingInvoice(tripId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT id FROM invoices WHERE trip_id = ?`,
                [tripId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async generateInvoiceForTrip(trip) {
        return new Promise((resolve, reject) => {
            const invoiceNumber = 'AUTO-' + Date.now() + '-' + trip.id;
            const processingFee = 2.99;
            const totalAmount = trip.total_amount + processingFee;
            
            db.run(
                `INSERT INTO invoices (trip_id, invoice_number, total_amount, processing_fee)
                 VALUES (?, ?, ?, ?)`,
                [trip.id, invoiceNumber, totalAmount, processingFee],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, invoiceNumber });
                }
            );
        });
    }

    async getActiveTollAccounts() {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM toll_accounts WHERE is_active = 1`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async syncTollAccount(accountId) {
        // CSV-only mode: No automatic toll data generation
        // Tolls are only imported through CSV upload workflow
        console.log(`Account ${accountId}: Using CSV-only mode - no automatic toll generation`);
        
        let mockNewCharges = 0;
        
        // Update last sync time
        db.run(
            `UPDATE toll_accounts SET last_sync = CURRENT_TIMESTAMP WHERE id = ?`,
            [accountId]
        );
        
        return mockNewCharges;
    }

    async cleanupOldCharges() {
        return new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM toll_charges 
                 WHERE is_matched = 0 
                   AND toll_date < datetime('now', '-90 days')`,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    async archiveOldTrips() {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE trips 
                 SET trip_status = 'archived' 
                 WHERE end_date < datetime('now', '-6 months')
                   AND trip_status = 'active'`,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    async logActivity(activityType, data) {
        // Simple logging - in production, use proper logging service
        console.log(`📝 Activity Log: ${activityType}`, data);
    }

    /**
     * Process notification queue
     */
    async processNotificationQueue() {
        try {
            const result = await this.notificationManager.processNotificationQueue();
            console.log(`📬 Processed ${result.processed} notifications from queue`);
        } catch (error) {
            console.error('❌ Error processing notification queue:', error);
        }
    }

    /**
     * Send weekly summaries to active renters
     */
    async sendWeeklySummaries() {
        try {
            const weekEnd = new Date();
            const weekStart = new Date(weekEnd.getTime() - (7 * 24 * 60 * 60 * 1000));
            
            // Get all unique renter emails from the past week
            const renters = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT DISTINCT t.renter_email, t.renter_name
                    FROM trips t
                    JOIN toll_charges tc ON t.id = tc.trip_id
                    WHERE tc.toll_date >= ? AND tc.toll_date <= ?
                    AND t.renter_email IS NOT NULL
                `, [weekStart.toISOString(), weekEnd.toISOString()], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            let summariesSent = 0;
            for (const renter of renters) {
                try {
                    const result = await this.notificationManager.sendWeeklySummary(
                        renter.renter_email,
                        weekStart.toISOString(),
                        weekEnd.toISOString()
                    );
                    
                    if (result.sent) {
                        summariesSent++;
                    }
                } catch (error) {
                    console.error(`❌ Failed to send weekly summary to ${renter.renter_email}:`, error);
                }
            }

            console.log(`📧 Sent ${summariesSent} weekly summaries`);
            
        } catch (error) {
            console.error('❌ Error sending weekly summaries:', error);
        }
    }

    /**
     * Send monthly summaries to active renters
     */
    async sendMonthlySummaries() {
        try {
            const now = new Date();
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const month = lastMonth.getMonth() + 1; // JavaScript months are 0-indexed
            const year = lastMonth.getFullYear();
            
            // Get all unique renter emails from last month
            const renters = await new Promise((resolve, reject) => {
                const monthStart = new Date(year, month - 1, 1).toISOString();
                const monthEnd = new Date(year, month, 0).toISOString();
                
                db.all(`
                    SELECT DISTINCT t.renter_email, t.renter_name
                    FROM trips t
                    WHERE t.start_date >= ? AND t.end_date <= ?
                    AND t.renter_email IS NOT NULL
                `, [monthStart, monthEnd], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            let summariesSent = 0;
            for (const renter of renters) {
                try {
                    const result = await this.notificationManager.sendMonthlySummary(
                        renter.renter_email,
                        month,
                        year
                    );
                    
                    if (result.sent) {
                        summariesSent++;
                    }
                } catch (error) {
                    console.error(`❌ Failed to send monthly summary to ${renter.renter_email}:`, error);
                }
            }

            console.log(`📧 Sent ${summariesSent} monthly summaries`);
            
        } catch (error) {
            console.error('❌ Error sending monthly summaries:', error);
        }
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            running: this.jobs.length > 0,
            jobCount: this.jobs.length,
            jobs: [
                { name: 'Toll Matching', schedule: 'Every 30 minutes' },
                { name: 'Invoice Generation', schedule: 'Daily at 9 AM' },
                { name: 'Toll Sync', schedule: 'Every 2 hours' },
                { name: 'Data Cleanup', schedule: 'Weekly on Sundays at 2 AM' },
                { name: 'Trip Status Update', schedule: 'Every hour' },
                { name: 'Notification Queue Processing', schedule: 'Every 15 minutes' },
                { name: 'Weekly Summaries', schedule: 'Mondays at 9 AM' },
                { name: 'Monthly Summaries', schedule: '1st of month at 9 AM' }
            ],
            notificationStats: this.notificationManager.getStats()
        };
    }
}

module.exports = SchedulerService;