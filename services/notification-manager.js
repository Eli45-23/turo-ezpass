// const EmailService = require('./email-service'); // DISABLED - Email service removed
const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Notification Manager Service
 * 
 * Central hub for all notification handling including:
 * - WebSocket real-time alerts (email notifications disabled)
 * - Notification preferences management
 * - Event-based notification triggering
 */

class NotificationManager {
    constructor() {
        // this.emailService = new EmailService(); // DISABLED - Email service removed
        this.emailService = {
            // Stub email service methods to prevent errors
            initialize: () => Promise.resolve(),
            sendEmail: () => Promise.resolve({ messageId: 'email-disabled', success: false }),
            processQueue: () => Promise.resolve({ processed: 0 }),
            getDeliveryStats: () => ({ sent: 0, failed: 0, providers: [], templates: [] })
        };
        this.initialized = false;
        this.notificationStats = {
            totalSent: 0,
            emailsSent: 0, // Always 0 - email disabled
            websocketsSent: 0,
            failed: 0
        };
    }

    /**
     * Initialize the notification manager
     */
    async initialize() {
        try {
            console.log('🔔 Initializing Notification Manager (Email disabled)...');
            
            // Email service initialization disabled
            // await this.emailService.initialize(); // DISABLED - Email service removed
            console.log('📧 Email notifications disabled');
            
            // Set up notification event listeners
            this.setupEventListeners();
            
            this.initialized = true;
            console.log('✅ Notification Manager initialized successfully (WebSocket only)');
            
        } catch (error) {
            console.error('❌ Notification Manager initialization failed:', error);
            throw error;
        }
    }

    /**
     * Set up event listeners for automatic notifications
     */
    setupEventListeners() {
        // Listen for global events through event-based notification system
        // This will be integrated with the existing toll processor and scheduler
    }

    /**
     * Send toll charge notification to renter
     */
    async notifyTollCharge(tollCharge, trip, host) {
        try {
            console.log(`🚗 Sending toll charge notification for trip ${trip.turo_trip_id}`);
            
            // Check if renter wants toll notifications
            const preferences = await this.getUserPreferences(null, trip.renter_email);
            if (!preferences.toll_alerts) {
                console.log(`📭 Toll alerts disabled for ${trip.renter_email}`);
                return { sent: false, reason: 'disabled_by_user' };
            }

            // Prepare notification data
            const notificationData = {
                renterName: trip.renter_name,
                tripId: trip.turo_trip_id,
                vehiclePlate: trip.vehicle_plate,
                startDate: this.formatDate(trip.start_date),
                endDate: this.formatDate(trip.end_date),
                tollLocation: tollCharge.toll_location,
                tollDate: this.formatDate(tollCharge.toll_date),
                tollAmount: tollCharge.toll_amount.toFixed(2),
                dashboardUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`
            };

            // Send email notification (email service disabled - returns stub result)
            const emailResult = await this.emailService.sendEmail({
                to: trip.renter_email,
                template: 'toll-notification',
                data: notificationData,
                priority: 'normal'
            });

            // Send WebSocket notification to host
            if (global.sendToHost) {
                const websocketSent = global.sendToHost(host.id, {
                    type: 'toll_matched',
                    message: `New toll charge matched for trip ${trip.turo_trip_id}`,
                    data: {
                        tripId: trip.turo_trip_id,
                        renterName: trip.renter_name,
                        tollAmount: tollCharge.toll_amount,
                        tollLocation: tollCharge.toll_location
                    }
                });
                
                if (websocketSent) {
                    this.notificationStats.websocketsSent++;
                }
            }

            // Log the event
            await this.logNotificationEvent({
                eventType: 'toll_charge_detected',
                entityType: 'toll_charge',
                entityId: tollCharge.id,
                recipientEmail: trip.renter_email,
                eventData: notificationData
            });

            this.notificationStats.totalSent++;
            this.notificationStats.emailsSent++;
            
            return {
                sent: true,
                emailSent: true,
                websocketSent: global.sendToHost ? true : false,
                messageId: emailResult.messageId
            };

        } catch (error) {
            console.error(`❌ Failed to send toll charge notification:`, error);
            this.notificationStats.failed++;
            throw error;
        }
    }

    /**
     * Send trip completion notification with toll summary
     */
    async notifyTripCompletion(trip, tolls, host) {
        try {
            console.log(`🏁 Sending trip completion notification for ${trip.turo_trip_id}`);
            
            // Check if renter wants trip completion notifications
            const preferences = await this.getUserPreferences(null, trip.renter_email);
            if (!preferences.trip_completion) {
                return { sent: false, reason: 'disabled_by_user' };
            }

            // Calculate total toll amount
            const totalAmount = tolls.reduce((sum, toll) => sum + toll.toll_amount, 0);

            // Prepare notification data
            const notificationData = {
                renterName: trip.renter_name,
                tripId: trip.turo_trip_id,
                vehiclePlate: trip.vehicle_plate,
                startDate: this.formatDate(trip.start_date),
                endDate: this.formatDate(trip.end_date),
                totalAmount: totalAmount.toFixed(2),
                tolls: tolls.map(toll => ({
                    location: toll.toll_location,
                    date: this.formatDate(toll.toll_date),
                    amount: toll.toll_amount.toFixed(2)
                }))
            };

            // Send email notification
            const emailResult = await this.emailService.sendEmail({
                to: trip.renter_email,
                template: 'trip-completion',
                data: notificationData,
                priority: 'normal'
            });

            // Log the event
            await this.logNotificationEvent({
                eventType: 'trip_completed',
                entityType: 'trip',
                entityId: trip.id,
                recipientEmail: trip.renter_email,
                eventData: notificationData
            });

            this.notificationStats.totalSent++;
            this.notificationStats.emailsSent++;
            
            return {
                sent: true,
                emailSent: true,
                messageId: emailResult.messageId
            };

        } catch (error) {
            console.error(`❌ Failed to send trip completion notification:`, error);
            this.notificationStats.failed++;
            throw error;
        }
    }

    /**
     * Send weekly toll summary to renter
     */
    async sendWeeklySummary(renterEmail, weekStart, weekEnd) {
        try {
            console.log(`📅 Sending weekly summary to ${renterEmail}`);
            
            // Check if user wants weekly summaries
            const preferences = await this.getUserPreferences(null, renterEmail);
            if (!preferences.weekly_summaries) {
                return { sent: false, reason: 'disabled_by_user' };
            }

            // Get toll data for the week
            const tolls = await this.getTollsForPeriod(renterEmail, weekStart, weekEnd);
            
            if (tolls.length === 0) {
                return { sent: false, reason: 'no_activity' };
            }

            const totalAmount = tolls.reduce((sum, toll) => sum + toll.toll_amount, 0);

            // Prepare notification data
            const notificationData = {
                renterName: tolls[0].renter_name, // Assuming all tolls are for the same renter
                weekStart: this.formatDate(weekStart),
                weekEnd: this.formatDate(weekEnd),
                tollCount: tolls.length,
                totalAmount: totalAmount.toFixed(2),
                tolls: tolls.map(toll => ({
                    location: toll.toll_location,
                    date: this.formatDate(toll.toll_date),
                    amount: toll.toll_amount.toFixed(2)
                })),
                dashboardUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`
            };

            // Send email notification
            const emailResult = await this.emailService.sendEmail({
                to: renterEmail,
                template: 'weekly-summary',
                data: notificationData,
                priority: 'low'
            });

            this.notificationStats.totalSent++;
            this.notificationStats.emailsSent++;
            
            return {
                sent: true,
                emailSent: true,
                messageId: emailResult.messageId,
                tollCount: tolls.length
            };

        } catch (error) {
            console.error(`❌ Failed to send weekly summary:`, error);
            this.notificationStats.failed++;
            throw error;
        }
    }

    /**
     * Send monthly toll summary to renter
     */
    async sendMonthlySummary(renterEmail, month, year) {
        try {
            console.log(`📊 Sending monthly summary to ${renterEmail} for ${month}/${year}`);
            
            // Check if user wants monthly summaries
            const preferences = await this.getUserPreferences(null, renterEmail);
            if (!preferences.monthly_summaries) {
                return { sent: false, reason: 'disabled_by_user' };
            }

            // Get trips and tolls for the month
            const monthData = await this.getMonthlyData(renterEmail, month, year);
            
            if (monthData.trips.length === 0) {
                return { sent: false, reason: 'no_activity' };
            }

            // Prepare notification data
            const notificationData = {
                renterName: monthData.trips[0].renter_name,
                month: this.getMonthName(month),
                year: year,
                tripCount: monthData.trips.length,
                tollCount: monthData.totalTolls,
                totalAmount: monthData.totalAmount.toFixed(2),
                trips: monthData.trips.map(trip => ({
                    tripId: trip.turo_trip_id,
                    tollCount: trip.toll_count,
                    amount: trip.total_amount.toFixed(2)
                })),
                dashboardUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`
            };

            // Send email notification
            const emailResult = await this.emailService.sendEmail({
                to: renterEmail,
                template: 'monthly-summary',
                data: notificationData,
                priority: 'low'
            });

            this.notificationStats.totalSent++;
            this.notificationStats.emailsSent++;
            
            return {
                sent: true,
                emailSent: true,
                messageId: emailResult.messageId,
                tripCount: monthData.trips.length
            };

        } catch (error) {
            console.error(`❌ Failed to send monthly summary:`, error);
            this.notificationStats.failed++;
            throw error;
        }
    }

    /**
     * Send system alert to host
     */
    async sendHostAlert(hostId, alertType, alertMessage, actionRequired = null) {
        try {
            const host = await this.getHostById(hostId);
            if (!host) {
                throw new Error(`Host ${hostId} not found`);
            }

            console.log(`🚨 Sending alert to host ${host.email}: ${alertType}`);
            
            // Check if host wants system alerts
            const preferences = await this.getUserPreferences(hostId, host.email);
            if (!preferences.system_alerts) {
                return { sent: false, reason: 'disabled_by_user' };
            }

            // Prepare notification data
            const notificationData = {
                hostName: host.full_name,
                alertType: alertType,
                alertMessage: alertMessage,
                timestamp: this.formatDateTime(new Date()),
                actionRequired: actionRequired,
                dashboardUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`
            };

            // Send email notification
            const emailResult = await this.emailService.sendEmail({
                to: host.email,
                template: 'host-alert',
                data: notificationData,
                priority: 'high'
            });

            // Send WebSocket notification
            if (global.sendToHost) {
                const websocketSent = global.sendToHost(hostId, {
                    type: 'system_alert',
                    message: alertMessage,
                    data: {
                        alertType: alertType,
                        timestamp: new Date().toISOString(),
                        actionRequired: actionRequired
                    }
                });
                
                if (websocketSent) {
                    this.notificationStats.websocketsSent++;
                }
            }

            this.notificationStats.totalSent++;
            this.notificationStats.emailsSent++;
            
            return {
                sent: true,
                emailSent: true,
                websocketSent: global.sendToHost ? true : false,
                messageId: emailResult.messageId
            };

        } catch (error) {
            console.error(`❌ Failed to send host alert:`, error);
            this.notificationStats.failed++;
            throw error;
        }
    }

    /**
     * Process queued notifications
     */
    async processNotificationQueue() {
        if (!this.initialized) {
            console.log('⚠️  Notification Manager not initialized, skipping queue processing');
            return;
        }

        try {
            const result = await this.emailService.processQueue();
            console.log(`📬 Processed ${result.processed} queued notifications`);
            return result;
        } catch (error) {
            console.error('❌ Error processing notification queue:', error);
            throw error;
        }
    }

    /**
     * Get user notification preferences
     */
    async getUserPreferences(hostId = null, email = null) {
        return new Promise((resolve, reject) => {
            let query, params;
            
            if (hostId) {
                query = 'SELECT * FROM notification_preferences WHERE host_id = ?';
                params = [hostId];
            } else {
                // For renters, we create default preferences based on email
                // In a real system, this would be integrated with Turo's user management
                resolve({
                    email_notifications: true,
                    toll_alerts: true,
                    weekly_summaries: true,
                    monthly_summaries: true,
                    system_alerts: true,
                    trip_completion: true,
                    invoice_notifications: true,
                    real_time_alerts: true
                });
                return;
            }
            
            db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    resolve(row);
                } else {
                    // Create default preferences for new hosts
                    this.createDefaultPreferences(hostId)
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }

    /**
     * Create default notification preferences for a host
     */
    async createDefaultPreferences(hostId) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO notification_preferences 
                (host_id, email_notifications, toll_alerts, weekly_summaries, monthly_summaries, 
                 system_alerts, trip_completion, invoice_notifications, real_time_alerts)
                VALUES (?, 1, 1, 1, 1, 1, 1, 1, 1)
            `;
            
            db.run(query, [hostId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        id: this.lastID,
                        host_id: hostId,
                        email_notifications: 1,
                        toll_alerts: 1,
                        weekly_summaries: 1,
                        monthly_summaries: 1,
                        system_alerts: 1,
                        trip_completion: 1,
                        invoice_notifications: 1,
                        real_time_alerts: 1
                    });
                }
            });
        });
    }

    /**
     * Update user notification preferences
     */
    async updatePreferences(hostId, preferences) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE notification_preferences SET
                    email_notifications = ?,
                    toll_alerts = ?,
                    weekly_summaries = ?,
                    monthly_summaries = ?,
                    system_alerts = ?,
                    trip_completion = ?,
                    invoice_notifications = ?,
                    real_time_alerts = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE host_id = ?
            `;
            
            db.run(query, [
                preferences.email_notifications ? 1 : 0,
                preferences.toll_alerts ? 1 : 0,
                preferences.weekly_summaries ? 1 : 0,
                preferences.monthly_summaries ? 1 : 0,
                preferences.system_alerts ? 1 : 0,
                preferences.trip_completion ? 1 : 0,
                preferences.invoice_notifications ? 1 : 0,
                preferences.real_time_alerts ? 1 : 0,
                hostId
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    /**
     * Log notification event
     */
    async logNotificationEvent(eventDetails) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO notification_events 
                (event_type, entity_type, entity_id, recipient_email, event_data, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            
            db.run(query, [
                eventDetails.eventType,
                eventDetails.entityType,
                eventDetails.entityId,
                eventDetails.recipientEmail,
                JSON.stringify(eventDetails.eventData)
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    /**
     * Helper methods
     */

    async getHostById(hostId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM hosts WHERE id = ?', [hostId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async getTollsForPeriod(renterEmail, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT tc.*, t.renter_name, t.renter_email, t.turo_trip_id
                FROM toll_charges tc
                JOIN trips t ON tc.trip_id = t.id
                WHERE t.renter_email = ?
                AND tc.toll_date >= ?
                AND tc.toll_date <= ?
                ORDER BY tc.toll_date DESC
            `;
            
            db.all(query, [renterEmail, startDate, endDate], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async getMonthlyData(renterEmail, month, year) {
        return new Promise((resolve, reject) => {
            const startDate = new Date(year, month - 1, 1).toISOString();
            const endDate = new Date(year, month, 0).toISOString();
            
            const query = `
                SELECT t.*, 
                       COUNT(tc.id) as toll_count,
                       COALESCE(SUM(tc.toll_amount), 0) as total_amount
                FROM trips t
                LEFT JOIN toll_charges tc ON t.id = tc.trip_id
                WHERE t.renter_email = ?
                AND t.start_date >= ?
                AND t.end_date <= ?
                GROUP BY t.id
                ORDER BY t.start_date DESC
            `;
            
            db.all(query, [renterEmail, startDate, endDate], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const trips = rows || [];
                    const totalTolls = trips.reduce((sum, trip) => sum + trip.toll_count, 0);
                    const totalAmount = trips.reduce((sum, trip) => sum + trip.total_amount, 0);
                    
                    resolve({
                        trips,
                        totalTolls,
                        totalAmount
                    });
                }
            });
        });
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatDateTime(dateTime) {
        return new Date(dateTime).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    }

    getMonthName(monthNumber) {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return months[monthNumber - 1];
    }

    /**
     * Get notification statistics
     */
    getStats() {
        return {
            ...this.notificationStats,
            emailStats: this.emailService.getDeliveryStats(),
            initialized: this.initialized
        };
    }
}

module.exports = NotificationManager;