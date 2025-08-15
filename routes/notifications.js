const express = require('express');
const router = express.Router();
const NotificationManager = require('../services/notification-manager');
const { db } = require('../config/database');

// Initialize notification manager
const notificationManager = new NotificationManager();
let notificationManagerReady = false;

// Initialize notification manager when the module loads
notificationManager.initialize()
    .then(() => {
        notificationManagerReady = true;
        console.log('✅ Notification Manager ready for API requests');
    })
    .catch(error => {
        console.error('❌ Failed to initialize Notification Manager for API:', error);
    });

/**
 * Middleware to check if user is authenticated
 */
function requireAuth(req, res, next) {
    if (!req.session.hostId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

/**
 * Middleware to check if notification manager is ready
 */
function requireNotificationManager(req, res, next) {
    if (!notificationManagerReady) {
        return res.status(503).json({ error: 'Notification service not ready' });
    }
    next();
}

/**
 * Get user notification preferences
 */
router.get('/preferences', requireAuth, async (req, res) => {
    try {
        const preferences = await notificationManager.getUserPreferences(req.session.hostId);
        res.json({
            success: true,
            preferences
        });
    } catch (error) {
        console.error('Error getting notification preferences:', error);
        res.status(500).json({ error: 'Failed to get notification preferences' });
    }
});

/**
 * Update user notification preferences
 */
router.put('/preferences', requireAuth, async (req, res) => {
    try {
        const {
            email_notifications,
            toll_alerts,
            weekly_summaries,
            monthly_summaries,
            system_alerts,
            trip_completion,
            invoice_notifications,
            real_time_alerts
        } = req.body;

        const preferences = {
            email_notifications: !!email_notifications,
            toll_alerts: !!toll_alerts,
            weekly_summaries: !!weekly_summaries,
            monthly_summaries: !!monthly_summaries,
            system_alerts: !!system_alerts,
            trip_completion: !!trip_completion,
            invoice_notifications: !!invoice_notifications,
            real_time_alerts: !!real_time_alerts
        };

        await notificationManager.updatePreferences(req.session.hostId, preferences);
        
        res.json({
            success: true,
            message: 'Notification preferences updated successfully'
        });
    } catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({ error: 'Failed to update notification preferences' });
    }
});

/**
 * Send test notification
 */
router.post('/test', requireAuth, requireNotificationManager, async (req, res) => {
    try {
        const { type = 'test-alert' } = req.body;
        
        // Get host info
        const host = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM hosts WHERE id = ?', [req.session.hostId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!host) {
            return res.status(404).json({ error: 'Host not found' });
        }

        let result;
        
        switch (type) {
            case 'system-alert':
                result = await notificationManager.sendHostAlert(
                    req.session.hostId,
                    'TEST_ALERT',
                    'This is a test system alert to verify your notification settings.',
                    'No action required - this is just a test.'
                );
                break;
                
            case 'email-test':
                // Send a basic test email using the email service
                result = await notificationManager.emailService.sendEmail({
                    to: host.email,
                    template: 'host-alert',
                    data: {
                        hostName: host.full_name,
                        alertType: 'EMAIL_TEST',
                        alertMessage: 'This is a test email to verify your email notification settings are working correctly.',
                        timestamp: new Date().toLocaleString(),
                        actionRequired: null,
                        dashboardUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`
                    },
                    priority: 'normal'
                });
                break;
                
            default:
                return res.status(400).json({ error: 'Invalid test type' });
        }

        res.json({
            success: true,
            message: 'Test notification sent successfully',
            result
        });
        
    } catch (error) {
        console.error('Error sending test notification:', error);
        res.status(500).json({ error: 'Failed to send test notification' });
    }
});

/**
 * Get notification statistics
 */
router.get('/stats', requireAuth, requireNotificationManager, async (req, res) => {
    try {
        const stats = notificationManager.getStats();
        
        // Get additional database stats
        const dbStats = await new Promise((resolve, reject) => {
            const queries = [
                'SELECT COUNT(*) as count FROM notification_logs WHERE created_at >= datetime("now", "-7 days")',
                'SELECT COUNT(*) as count FROM notification_queue WHERE status = "queued"',
                'SELECT COUNT(*) as count FROM notification_events WHERE created_at >= datetime("now", "-24 hours")'
            ];
            
            Promise.all(queries.map(query => 
                new Promise((res, rej) => {
                    db.get(query, (err, row) => {
                        if (err) rej(err);
                        else res(row.count);
                    });
                })
            )).then(results => {
                resolve({
                    weeklyDeliveries: results[0],
                    queuedNotifications: results[1],
                    dailyEvents: results[2]
                });
            }).catch(reject);
        });

        res.json({
            success: true,
            stats: {
                ...stats,
                database: dbStats
            }
        });
        
    } catch (error) {
        console.error('Error getting notification stats:', error);
        res.status(500).json({ error: 'Failed to get notification statistics' });
    }
});

/**
 * Get notification history for the host
 */
router.get('/history', requireAuth, async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;
        
        // Get host email
        const host = await new Promise((resolve, reject) => {
            db.get('SELECT email FROM hosts WHERE id = ?', [req.session.hostId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!host) {
            return res.status(404).json({ error: 'Host not found' });
        }

        // Get notification logs for this host
        const notifications = await new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM notification_logs 
                WHERE recipient = ? 
                ORDER BY created_at DESC 
                LIMIT ? OFFSET ?
            `, [host.email, limit, offset], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        // Get total count
        const totalCount = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COUNT(*) as count FROM notification_logs 
                WHERE recipient = ?
            `, [host.email], (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        res.json({
            success: true,
            notifications,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                pages: Math.ceil(totalCount / limit)
            }
        });
        
    } catch (error) {
        console.error('Error getting notification history:', error);
        res.status(500).json({ error: 'Failed to get notification history' });
    }
});

/**
 * Queue a notification for later delivery
 */
router.post('/queue', requireAuth, requireNotificationManager, async (req, res) => {
    try {
        const {
            recipient,
            template,
            data,
            subject,
            priority = 'normal',
            scheduleTime
        } = req.body;

        // Validate required fields
        if (!recipient || !template || !data) {
            return res.status(400).json({ 
                error: 'Missing required fields: recipient, template, data' 
            });
        }

        // Queue the notification
        const queueId = await notificationManager.emailService.queueEmail({
            to: recipient,
            template,
            data,
            subject,
            priority,
            scheduleTime: scheduleTime ? new Date(scheduleTime).toISOString() : undefined
        });

        res.json({
            success: true,
            message: 'Notification queued successfully',
            queueId
        });
        
    } catch (error) {
        console.error('Error queuing notification:', error);
        res.status(500).json({ error: 'Failed to queue notification' });
    }
});

/**
 * Get available notification templates
 */
router.get('/templates', requireAuth, (req, res) => {
    try {
        const templates = [
            {
                name: 'toll-notification',
                description: 'Notification sent when a new toll charge is detected',
                variables: ['renterName', 'tripId', 'vehiclePlate', 'tollLocation', 'tollAmount', 'tollDate']
            },
            {
                name: 'weekly-summary',
                description: 'Weekly summary of toll charges for a renter',
                variables: ['renterName', 'weekStart', 'weekEnd', 'tollCount', 'totalAmount', 'tolls']
            },
            {
                name: 'monthly-summary',
                description: 'Monthly summary of all trips and tolls',
                variables: ['renterName', 'month', 'year', 'tripCount', 'tollCount', 'totalAmount', 'trips']
            },
            {
                name: 'host-alert',
                description: 'System alerts for hosts',
                variables: ['hostName', 'alertType', 'alertMessage', 'timestamp', 'actionRequired']
            },
            {
                name: 'trip-completion',
                description: 'Trip completion notification with toll breakdown',
                variables: ['renterName', 'tripId', 'vehiclePlate', 'totalAmount', 'tolls']
            },
            {
                name: 'system-maintenance',
                description: 'System maintenance notifications',
                variables: ['maintenanceStart', 'maintenanceEnd', 'duration']
            },
            {
                name: 'invoice-generated',
                description: 'Invoice generation notification',
                variables: ['renterName', 'invoiceNumber', 'tripId', 'totalAmount', 'processingFee', 'finalTotal']
            }
        ];

        res.json({
            success: true,
            templates
        });
        
    } catch (error) {
        console.error('Error getting notification templates:', error);
        res.status(500).json({ error: 'Failed to get notification templates' });
    }
});

/**
 * Trigger immediate notification processing
 */
router.post('/process-queue', requireAuth, requireNotificationManager, async (req, res) => {
    try {
        const result = await notificationManager.processNotificationQueue();
        
        res.json({
            success: true,
            message: 'Notification queue processed successfully',
            processed: result.processed
        });
        
    } catch (error) {
        console.error('Error processing notification queue:', error);
        res.status(500).json({ error: 'Failed to process notification queue' });
    }
});

/**
 * Send manual notification (for testing or special cases)
 */
router.post('/send', requireAuth, requireNotificationManager, async (req, res) => {
    try {
        const {
            recipient,
            template,
            data,
            subject,
            priority = 'normal'
        } = req.body;

        // Validate required fields
        if (!recipient || !template || !data) {
            return res.status(400).json({ 
                error: 'Missing required fields: recipient, template, data' 
            });
        }

        // Send the notification immediately
        const result = await notificationManager.emailService.sendEmail({
            to: recipient,
            template,
            data,
            subject,
            priority
        });

        res.json({
            success: true,
            message: 'Notification sent successfully',
            result
        });
        
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

module.exports = router;