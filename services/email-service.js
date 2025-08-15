const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const { db } = require('../config/database');

/**
 * Email Service for Turo Toll Notifications
 * 
 * Provides comprehensive email functionality with multiple provider support,
 * professional templates, and delivery tracking.
 */

class EmailService {
    constructor() {
        this.transporters = new Map();
        this.templates = new Map();
        this.deliveryStats = {
            sent: 0,
            failed: 0,
            queued: 0
        };
    }

    /**
     * Initialize email service with multiple provider support
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Email Service...');
            
            // Load email providers configuration
            await this.setupEmailProviders();
            
            // Load email templates
            await this.loadEmailTemplates();
            
            // Verify email transporter connections
            await this.verifyConnections();
            
            console.log('✅ Email Service initialized successfully');
            
        } catch (error) {
            console.error('❌ Email Service initialization failed:', error);
            throw error;
        }
    }

    /**
     * Setup multiple email providers for redundancy
     */
    async setupEmailProviders() {
        const providers = [
            {
                name: 'primary',
                config: {
                    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
                    port: parseInt(process.env.EMAIL_PORT) || 587,
                    secure: false, // true for port 465, false for other ports
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASSWORD
                    },
                    pool: true, // Use connection pooling
                    maxConnections: 5,
                    maxMessages: 100
                }
            },
            {
                name: 'backup',
                config: {
                    host: process.env.BACKUP_EMAIL_HOST || 'smtp.mailgun.org',
                    port: parseInt(process.env.BACKUP_EMAIL_PORT) || 587,
                    secure: false,
                    auth: {
                        user: process.env.BACKUP_EMAIL_USER,
                        pass: process.env.BACKUP_EMAIL_PASSWORD
                    },
                    pool: true,
                    maxConnections: 3,
                    maxMessages: 50
                }
            }
        ];

        for (const provider of providers) {
            try {
                // Only create transporter if credentials are provided
                if (provider.config.auth.user && provider.config.auth.pass) {
                    const transporter = nodemailer.createTransport(provider.config);
                    this.transporters.set(provider.name, transporter);
                    console.log(`📧 Email provider '${provider.name}' configured`);
                } else {
                    console.log(`⚠️  Email provider '${provider.name}' skipped - no credentials`);
                }
            } catch (error) {
                console.warn(`⚠️  Failed to setup email provider '${provider.name}':`, error.message);
            }
        }

        // Create test transporter if no real providers configured
        if (this.transporters.size === 0) {
            console.log('🧪 No email providers configured, creating test transporter');
            const testTransporter = nodemailer.createTransport({
                jsonTransport: true
            });
            this.transporters.set('test', testTransporter);
        }
    }

    /**
     * Load and compile email templates
     */
    async loadEmailTemplates() {
        const templateDir = path.join(__dirname, '../templates/email');
        
        try {
            // Create template directory if it doesn't exist
            await fs.mkdir(templateDir, { recursive: true });
        } catch (error) {
            // Directory might already exist, continue
        }

        const templates = [
            { name: 'toll-notification', subject: 'New Toll Charge Detected for Your Trip' },
            { name: 'weekly-summary', subject: 'Weekly Toll Summary' },
            { name: 'monthly-summary', subject: 'Monthly Toll Summary' },
            { name: 'host-alert', subject: 'Turo Toll Tracker - System Alert' },
            { name: 'trip-completion', subject: 'Trip Complete - Toll Breakdown Available' },
            { name: 'system-maintenance', subject: 'Turo Toll Tracker - Scheduled Maintenance' },
            { name: 'invoice-generated', subject: 'Your Toll Invoice is Ready' }
        ];

        for (const template of templates) {
            try {
                const templatePath = path.join(templateDir, `${template.name}.hbs`);
                
                // Check if template file exists, create basic one if not
                let templateContent;
                try {
                    await fs.access(templatePath);
                    templateContent = await fs.readFile(templatePath, 'utf8');
                } catch (error) {
                    // Template doesn't exist, create a basic one
                    templateContent = await this.createBasicTemplate(template.name);
                    await fs.writeFile(templatePath, templateContent);
                    console.log(`📝 Created basic template: ${template.name}.hbs`);
                }

                const compiledTemplate = handlebars.compile(templateContent);
                
                this.templates.set(template.name, {
                    compile: compiledTemplate,
                    subject: template.subject
                });
                
                console.log(`📄 Loaded email template: ${template.name}`);
                
            } catch (error) {
                console.warn(`⚠️  Failed to load template ${template.name}:`, error.message);
            }
        }
    }

    /**
     * Create basic email template
     */
    async createBasicTemplate(templateName) {
        const baseTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{subject}}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #007bff; color: white; padding: 20px; margin: -20px -20px 20px -20px; border-radius: 8px 8px 0 0; text-align: center; }
        .logo { font-size: 24px; font-weight: bold; }
        .content { margin: 20px 0; }
        .highlight { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #007bff; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
        .toll-item { background: #f8f9fa; padding: 10px; margin: 10px 0; border-radius: 5px; display: flex; justify-content: space-between; }
        .amount { font-weight: bold; color: #007bff; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🚗 Turo Toll Tracker</div>
            <p>Professional Toll Management for Turo Hosts</p>
        </div>
        <div class="content">
            ${this.getTemplateContent(templateName)}
        </div>
        <div class="footer">
            <p>This email was sent by Turo Toll Tracker automated system.</p>
            <p>© {{year}} Turo Toll Tracker. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
        
        return baseTemplate;
    }

    /**
     * Get specific template content based on type
     */
    getTemplateContent(templateName) {
        const templates = {
            'toll-notification': `
                <h2>New Toll Charge Detected</h2>
                <p>Hello {{renterName}},</p>
                <p>We've detected a new toll charge from your recent Turo trip:</p>
                <div class="highlight">
                    <strong>Trip Details:</strong>
                    <br>Trip ID: {{tripId}}
                    <br>Vehicle: {{vehiclePlate}}
                    <br>Trip Dates: {{startDate}} to {{endDate}}
                </div>
                <div class="toll-item">
                    <span>{{tollLocation}} - {{tollDate}}</span>
                    <span class="amount">\\${{tollAmount}}</span>
                </div>
                <p>This charge has been automatically matched to your trip. You'll receive a detailed invoice once your trip is complete.</p>
                <a href="{{dashboardUrl}}" class="button">View Trip Details</a>
            `,
            'weekly-summary': `
                <h2>Weekly Toll Summary</h2>
                <p>Hello {{renterName}},</p>
                <p>Here's your toll activity summary for the week of {{weekStart}} to {{weekEnd}}:</p>
                <div class="highlight">
                    <strong>Total Tolls: {{tollCount}}</strong>
                    <br><strong>Total Amount: \\${{totalAmount}}</strong>
                </div>
                {{#each tolls}}
                <div class="toll-item">
                    <span>{{location}} - {{date}}</span>
                    <span class="amount">\\${{amount}}</span>
                </div>
                {{/each}}
                <a href="{{dashboardUrl}}" class="button">View Full Details</a>
            `,
            'monthly-summary': `
                <h2>Monthly Toll Summary</h2>
                <p>Hello {{renterName}},</p>
                <p>Here's your toll activity summary for {{month}} {{year}}:</p>
                <div class="highlight">
                    <strong>Total Trips: {{tripCount}}</strong>
                    <br><strong>Total Tolls: {{tollCount}}</strong>
                    <br><strong>Total Amount: \\${{totalAmount}}</strong>
                </div>
                {{#each trips}}
                <div class="toll-item">
                    <span>Trip {{tripId}} ({{tollCount}} tolls)</span>
                    <span class="amount">\\${{amount}}</span>
                </div>
                {{/each}}
                <a href="{{dashboardUrl}}" class="button">View Detailed Report</a>
            `,
            'host-alert': `
                <h2>System Alert</h2>
                <p>Hello {{hostName}},</p>
                <div class="highlight">
                    <strong>Alert: {{alertType}}</strong>
                    <br>{{alertMessage}}
                </div>
                <p>Timestamp: {{timestamp}}</p>
                {{#if actionRequired}}
                <p><strong>Action Required:</strong> {{actionRequired}}</p>
                <a href="{{dashboardUrl}}" class="button">Take Action</a>
                {{/if}}
            `,
            'trip-completion': `
                <h2>Trip Complete - Toll Summary</h2>
                <p>Hello {{renterName}},</p>
                <p>Your Turo trip has been completed. Here's your final toll breakdown:</p>
                <div class="highlight">
                    <strong>Trip: {{tripId}}</strong>
                    <br>Vehicle: {{vehiclePlate}}
                    <br>Dates: {{startDate}} to {{endDate}}
                    <br><strong>Total Tolls: \\${{totalAmount}}</strong>
                </div>
                {{#each tolls}}
                <div class="toll-item">
                    <span>{{location}} - {{date}}</span>
                    <span class="amount">\\${{amount}}</span>
                </div>
                {{/each}}
                <p>An invoice will be processed through Turo within 1-2 business days.</p>
            `,
            'system-maintenance': `
                <h2>Scheduled System Maintenance</h2>
                <p>Hello,</p>
                <p>We'll be performing scheduled maintenance on the Turo Toll Tracker system:</p>
                <div class="highlight">
                    <strong>Maintenance Window:</strong>
                    <br>Start: {{maintenanceStart}}
                    <br>End: {{maintenanceEnd}}
                    <br>Duration: {{duration}}
                </div>
                <p>During this time, you may experience limited functionality. All data will remain secure and intact.</p>
                <p>Thank you for your patience!</p>
            `,
            'invoice-generated': `
                <h2>Your Toll Invoice is Ready</h2>
                <p>Hello {{renterName}},</p>
                <p>Your toll invoice has been generated and is ready for processing:</p>
                <div class="highlight">
                    <strong>Invoice #{{invoiceNumber}}</strong>
                    <br>Trip: {{tripId}}
                    <br>Total Amount: \\${{totalAmount}}
                    <br>Processing Fee: \\${{processingFee}}
                    <br><strong>Final Total: \\${{finalTotal}}</strong>
                </div>
                <p>This amount will be processed through your Turo payment method within 1-2 business days.</p>
                <a href="{{invoiceUrl}}" class="button">View Invoice</a>
            `
        };

        return templates[templateName] || '<p>{{message}}</p>';
    }

    /**
     * Verify email provider connections
     */
    async verifyConnections() {
        const verificationPromises = [];

        for (const [name, transporter] of this.transporters) {
            if (name !== 'test') {
                verificationPromises.push(
                    transporter.verify()
                        .then(() => console.log(`✅ Email provider '${name}' connection verified`))
                        .catch(error => console.warn(`⚠️  Email provider '${name}' verification failed:`, error.message))
                );
            } else {
                console.log(`🧪 Test email provider ready`);
            }
        }

        await Promise.all(verificationPromises);
    }

    /**
     * Send email with automatic provider failover
     */
    async sendEmail(options) {
        const {
            to,
            template,
            data,
            subject,
            priority = 'normal'
        } = options;

        try {
            // Get template
            const emailTemplate = this.templates.get(template);
            if (!emailTemplate) {
                throw new Error(`Email template '${template}' not found`);
            }

            // Compile template with data
            const htmlContent = emailTemplate.compile({
                ...data,
                year: new Date().getFullYear()
            });

            const mailOptions = {
                from: process.env.EMAIL_FROM || 'noreply@turotolls.com',
                to: Array.isArray(to) ? to.join(', ') : to,
                subject: subject || emailTemplate.subject,
                html: htmlContent,
                priority: priority,
                headers: {
                    'X-Service': 'Turo-Toll-Tracker',
                    'X-Template': template,
                    'X-Priority': priority
                }
            };

            // Try primary transporter first, then fallback
            let result;
            const transporterNames = Array.from(this.transporters.keys());
            
            for (const transporterName of transporterNames) {
                try {
                    const transporter = this.transporters.get(transporterName);
                    result = await transporter.sendMail(mailOptions);
                    
                    // Log successful delivery
                    await this.logDelivery({
                        to: mailOptions.to,
                        template,
                        provider: transporterName,
                        status: 'sent',
                        messageId: result.messageId,
                        priority
                    });

                    this.deliveryStats.sent++;
                    console.log(`📧 Email sent successfully via ${transporterName} to ${mailOptions.to}`);
                    
                    return {
                        success: true,
                        messageId: result.messageId,
                        provider: transporterName,
                        response: result.response || result
                    };

                } catch (error) {
                    console.warn(`⚠️  Failed to send via ${transporterName}:`, error.message);
                    
                    // If this is the last transporter, throw the error
                    if (transporterName === transporterNames[transporterNames.length - 1]) {
                        throw error;
                    }
                    // Otherwise, try the next transporter
                    continue;
                }
            }

        } catch (error) {
            // Log failed delivery
            await this.logDelivery({
                to: Array.isArray(to) ? to.join(', ') : to,
                template,
                provider: 'failed',
                status: 'failed',
                error: error.message,
                priority
            });

            this.deliveryStats.failed++;
            console.error(`❌ Failed to send email to ${to}:`, error);
            
            throw error;
        }
    }

    /**
     * Send bulk emails with rate limiting
     */
    async sendBulkEmails(emails) {
        console.log(`📮 Sending ${emails.length} bulk emails...`);
        
        const results = [];
        const batchSize = 5; // Process in batches to avoid overwhelming servers
        const delay = 1000; // 1 second delay between batches

        for (let i = 0; i < emails.length; i += batchSize) {
            const batch = emails.slice(i, i + batchSize);
            const batchPromises = batch.map(email => 
                this.sendEmail(email)
                    .then(result => ({ success: true, ...result, email: email.to }))
                    .catch(error => ({ success: false, error: error.message, email: email.to }))
            );

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Delay between batches (except for the last batch)
            if (i + batchSize < emails.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(`📊 Bulk email results: ${successful} sent, ${failed} failed`);
        
        return {
            total: emails.length,
            successful,
            failed,
            results
        };
    }

    /**
     * Log email delivery for audit trail
     */
    async logDelivery(details) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO notification_logs 
                (recipient, template_name, provider, status, message_id, error_message, priority, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            
            db.run(query, [
                details.to,
                details.template,
                details.provider,
                details.status,
                details.messageId || null,
                details.error || null,
                details.priority || 'normal'
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
     * Get delivery statistics
     */
    getDeliveryStats() {
        return {
            ...this.deliveryStats,
            providers: Array.from(this.transporters.keys()),
            templates: Array.from(this.templates.keys())
        };
    }

    /**
     * Queue email for later delivery
     */
    async queueEmail(options) {
        const {
            to,
            template,
            data,
            subject,
            priority = 'normal',
            scheduleTime
        } = options;

        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO notification_queue 
                (recipient, template_name, template_data, subject, priority, scheduled_time, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'queued', CURRENT_TIMESTAMP)
            `;
            
            db.run(query, [
                Array.isArray(to) ? to.join(', ') : to,
                template,
                JSON.stringify(data),
                subject,
                priority,
                scheduleTime || new Date().toISOString()
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    console.log(`📥 Email queued for ${Array.isArray(to) ? to.join(', ') : to}`);
                    resolve(this.lastID);
                }
            });
        });
    }

    /**
     * Process queued emails
     */
    async processQueue() {
        try {
            // Get queued emails ready for sending
            const queuedEmails = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT * FROM notification_queue 
                    WHERE status = 'queued' 
                    AND scheduled_time <= CURRENT_TIMESTAMP 
                    ORDER BY priority DESC, created_at ASC 
                    LIMIT 20
                `, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            if (queuedEmails.length === 0) {
                return { processed: 0 };
            }

            console.log(`📬 Processing ${queuedEmails.length} queued emails...`);

            let processed = 0;
            
            for (const queuedEmail of queuedEmails) {
                try {
                    // Mark as processing
                    await new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE notification_queue SET status = "processing" WHERE id = ?',
                            [queuedEmail.id],
                            (err) => err ? reject(err) : resolve()
                        );
                    });

                    // Send email
                    await this.sendEmail({
                        to: queuedEmail.recipient.split(', '),
                        template: queuedEmail.template_name,
                        data: JSON.parse(queuedEmail.template_data),
                        subject: queuedEmail.subject,
                        priority: queuedEmail.priority
                    });

                    // Mark as sent
                    await new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE notification_queue SET status = "sent", sent_at = CURRENT_TIMESTAMP WHERE id = ?',
                            [queuedEmail.id],
                            (err) => err ? reject(err) : resolve()
                        );
                    });

                    processed++;

                } catch (error) {
                    console.error(`❌ Failed to process queued email ${queuedEmail.id}:`, error);
                    
                    // Mark as failed
                    await new Promise((resolve) => {
                        db.run(
                            'UPDATE notification_queue SET status = "failed", error_message = ? WHERE id = ?',
                            [error.message, queuedEmail.id],
                            () => resolve()
                        );
                    });
                }
            }

            console.log(`✅ Processed ${processed} queued emails`);
            return { processed };

        } catch (error) {
            console.error('❌ Error processing email queue:', error);
            throw error;
        }
    }
}

module.exports = EmailService;