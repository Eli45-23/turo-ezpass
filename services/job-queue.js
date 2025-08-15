const Bull = require('bull');
const winston = require('winston');
const { db } = require('../config/database');

// Configure logger for job queue operations
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/jobs.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

/**
 * Background Job Queue Manager
 * Handles heavy operations like scraping, data processing, and notifications
 */
class JobQueueManager {
    constructor(options = {}) {
        this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
        this.queues = new Map();
        this.processors = new Map();
        this.metrics = {
            totalJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
            activeJobs: 0,
            queueMetrics: new Map()
        };
        
        this.defaultJobOptions = {
            removeOnComplete: 100, // Keep last 100 completed jobs
            removeOnFail: 50,      // Keep last 50 failed jobs
            attempts: 3,           // Retry failed jobs 3 times
            backoff: {
                type: 'exponential',
                delay: 2000
            }
        };
        
        this.initialize();
    }

    initialize() {
        // Create main job queues
        this.createQueue('toll-scraping', {
            defaultJobOptions: {
                ...this.defaultJobOptions,
                delay: 0,
                priority: 'high'
            },
            settings: {
                stalledInterval: 30000,
                maxStalledCount: 1,
                retryProcessDelay: 5000
            }
        });

        this.createQueue('toll-processing', {
            defaultJobOptions: {
                ...this.defaultJobOptions,
                delay: 0,
                priority: 'normal'
            }
        });

        this.createQueue('notifications', {
            defaultJobOptions: {
                ...this.defaultJobOptions,
                delay: 0,
                priority: 'high'
            }
        });

        this.createQueue('data-integrity', {
            defaultJobOptions: {
                ...this.defaultJobOptions,
                delay: 0,
                priority: 'low'
            }
        });

        this.createQueue('reporting', {
            defaultJobOptions: {
                ...this.defaultJobOptions,
                delay: 0,
                priority: 'low'
            }
        });

        this.createQueue('cleanup', {
            defaultJobOptions: {
                ...this.defaultJobOptions,
                delay: 0,
                priority: 'low'
            }
        });

        // Register job processors
        this.registerProcessors();
        
        // Start monitoring
        this.startMonitoring();
        
        logger.info('Job Queue Manager initialized with queues:', Array.from(this.queues.keys()));
    }

    createQueue(name, options = {}) {
        const queue = new Bull(name, this.redisUrl, {
            defaultJobOptions: options.defaultJobOptions || this.defaultJobOptions,
            settings: options.settings || {}
        });

        // Set up event handlers
        this.setupQueueEventHandlers(queue, name);
        
        this.queues.set(name, queue);
        this.metrics.queueMetrics.set(name, {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0
        });

        return queue;
    }

    setupQueueEventHandlers(queue, queueName) {
        queue.on('ready', () => {
            logger.info(`Queue ${queueName} is ready`);
        });

        queue.on('error', (error) => {
            logger.error(`Queue ${queueName} error:`, error);
        });

        queue.on('waiting', (jobId) => {
            logger.debug(`Job ${jobId} is waiting in ${queueName}`);
        });

        queue.on('active', (job, jobPromise) => {
            logger.info(`Job ${job.id} started in ${queueName}`, {
                jobId: job.id,
                type: job.name,
                data: job.data
            });
            this.metrics.activeJobs++;
        });

        queue.on('completed', (job, result) => {
            logger.info(`Job ${job.id} completed in ${queueName}`, {
                jobId: job.id,
                type: job.name,
                duration: Date.now() - job.processedOn,
                result
            });
            this.metrics.completedJobs++;
            this.metrics.activeJobs = Math.max(0, this.metrics.activeJobs - 1);
        });

        queue.on('failed', (job, error) => {
            logger.error(`Job ${job.id} failed in ${queueName}`, {
                jobId: job.id,
                type: job.name,
                error: error.message,
                attempts: job.attemptsMade,
                data: job.data
            });
            this.metrics.failedJobs++;
            this.metrics.activeJobs = Math.max(0, this.metrics.activeJobs - 1);
        });

        queue.on('stalled', (job) => {
            logger.warn(`Job ${job.id} stalled in ${queueName}`, {
                jobId: job.id,
                type: job.name
            });
        });

        queue.on('progress', (job, progress) => {
            logger.debug(`Job ${job.id} progress: ${progress}%`);
        });
    }

    registerProcessors() {
        // Toll scraping processor
        this.registerProcessor('toll-scraping', 'scrape-ezpass', async (job) => {
            const { hostId, accountId, credentials } = job.data;
            
            try {
                job.progress(10);
                
                const EZPassScraper = require('./ezpass-scraper');
                const scraper = new EZPassScraper();
                
                job.progress(20);
                
                if (!await scraper.initialize()) {
                    throw new Error('Failed to initialize scraper');
                }
                
                job.progress(30);
                
                const loginSuccess = await scraper.login(credentials.username, credentials.password);
                if (!loginSuccess) {
                    throw new Error('Failed to authenticate with EZ-Pass');
                }
                
                job.progress(50);
                
                const charges = await scraper.scrapeCharges();
                
                job.progress(80);
                
                // Process and store charges
                let processedCount = 0;
                for (const charge of charges) {
                    await this.storeCharge(accountId, charge);
                    processedCount++;
                    
                    // Update progress
                    const progressPct = 80 + (processedCount / charges.length) * 15;
                    job.progress(Math.round(progressPct));
                }
                
                await scraper.shutdown();
                job.progress(100);
                
                return {
                    chargesFound: charges.length,
                    chargesProcessed: processedCount,
                    hostId,
                    accountId
                };
                
            } catch (error) {
                logger.error('EZ-Pass scraping job failed:', error);
                throw error;
            }
        });

        // Toll processing processor
        this.registerProcessor('toll-processing', 'match-tolls', async (job) => {
            const { hostId, tollChargeIds } = job.data;
            
            try {
                const TollProcessor = require('./enhanced-toll-processor');
                const processor = new TollProcessor();
                
                let matchedCount = 0;
                for (let i = 0; i < tollChargeIds.length; i++) {
                    const tollChargeId = tollChargeIds[i];
                    
                    const result = await processor.matchTollCharge(tollChargeId);
                    if (result.matched) {
                        matchedCount++;
                    }
                    
                    // Update progress
                    const progressPct = Math.round(((i + 1) / tollChargeIds.length) * 100);
                    job.progress(progressPct);
                }
                
                return {
                    totalProcessed: tollChargeIds.length,
                    matched: matchedCount,
                    hostId
                };
                
            } catch (error) {
                logger.error('Toll matching job failed:', error);
                throw error;
            }
        });

        // Notification processor
        this.registerProcessor('notifications', 'send-notification', async (job) => {
            const { type, recipient, data, template } = job.data;
            
            try {
                const NotificationManager = require('./notification-manager');
                const notificationManager = new NotificationManager();
                
                job.progress(25);
                
                const result = await notificationManager.sendNotification({
                    type,
                    recipient,
                    data,
                    template
                });
                
                job.progress(100);
                
                return result;
                
            } catch (error) {
                logger.error('Notification job failed:', error);
                throw error;
            }
        });

        // Data integrity processor
        this.registerProcessor('data-integrity', 'integrity-check', async (job) => {
            const { hostId, checkType, params } = job.data;
            
            try {
                const DataIntegrityManager = require('./data-integrity-manager');
                const integrityManager = new DataIntegrityManager();
                
                job.progress(20);
                
                let result;
                switch (checkType) {
                    case 'full-audit':
                        result = await integrityManager.performFullAudit(hostId);
                        break;
                    case 'duplicate-check':
                        result = await integrityManager.checkDuplicates(hostId);
                        break;
                    case 'data-validation':
                        result = await integrityManager.validateData(hostId, params);
                        break;
                    default:
                        throw new Error(`Unknown integrity check type: ${checkType}`);
                }
                
                job.progress(100);
                
                return result;
                
            } catch (error) {
                logger.error('Data integrity job failed:', error);
                throw error;
            }
        });

        // Reporting processor
        this.registerProcessor('reporting', 'generate-report', async (job) => {
            const { hostId, reportType, period, params } = job.data;
            
            try {
                const AnalyticsEngine = require('./analytics-engine');
                const analytics = new AnalyticsEngine();
                
                job.progress(25);
                
                let report;
                switch (reportType) {
                    case 'weekly-summary':
                        report = await analytics.generateWeeklySummary(hostId, period);
                        break;
                    case 'monthly-financial':
                        report = await analytics.generateMonthlyFinancial(hostId, period);
                        break;
                    case 'performance-report':
                        report = await analytics.generatePerformanceReport(hostId, period);
                        break;
                    default:
                        throw new Error(`Unknown report type: ${reportType}`);
                }
                
                job.progress(75);
                
                // Store report
                await this.storeReport(hostId, reportType, report);
                
                job.progress(100);
                
                return {
                    reportType,
                    hostId,
                    period,
                    reportId: report.id
                };
                
            } catch (error) {
                logger.error('Report generation job failed:', error);
                throw error;
            }
        });

        // Cleanup processor
        this.registerProcessor('cleanup', 'cleanup-old-data', async (job) => {
            const { type, retention } = job.data;
            
            try {
                let result;
                switch (type) {
                    case 'logs':
                        result = await this.cleanupLogs(retention);
                        break;
                    case 'temp-files':
                        result = await this.cleanupTempFiles(retention);
                        break;
                    case 'old-notifications':
                        result = await this.cleanupNotifications(retention);
                        break;
                    default:
                        throw new Error(`Unknown cleanup type: ${type}`);
                }
                
                job.progress(100);
                
                return result;
                
            } catch (error) {
                logger.error('Cleanup job failed:', error);
                throw error;
            }
        });
    }

    registerProcessor(queueName, jobType, processor, concurrency = 1) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        // Wrap processor with error handling and metrics
        const wrappedProcessor = async (job) => {
            const startTime = Date.now();
            
            try {
                // Track performance metrics
                if (global.performanceMonitor) {
                    global.performanceMonitor.trackBusinessOperation(
                        `job:${queueName}:${jobType}`,
                        startTime,
                        startTime, // Will be updated on completion
                        true
                    );
                }
                
                const result = await processor(job);
                
                // Update performance tracking
                if (global.performanceMonitor) {
                    global.performanceMonitor.trackBusinessOperation(
                        `job:${queueName}:${jobType}`,
                        startTime,
                        Date.now(),
                        true,
                        { result }
                    );
                }
                
                return result;
                
            } catch (error) {
                // Update performance tracking for failure
                if (global.performanceMonitor) {
                    global.performanceMonitor.trackBusinessOperation(
                        `job:${queueName}:${jobType}`,
                        startTime,
                        Date.now(),
                        false,
                        { error: error.message }
                    );
                }
                
                throw error;
            }
        };

        queue.process(jobType, concurrency, wrappedProcessor);
        
        this.processors.set(`${queueName}:${jobType}`, {
            processor: wrappedProcessor,
            concurrency
        });

        logger.info(`Registered processor for ${queueName}:${jobType} with concurrency ${concurrency}`);
    }

    /**
     * Add job to queue
     */
    async addJob(queueName, jobType, data, options = {}) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        const job = await queue.add(jobType, data, options);
        this.metrics.totalJobs++;
        
        logger.info(`Added job ${job.id} to ${queueName}`, {
            jobId: job.id,
            type: jobType,
            data
        });
        
        return job;
    }

    /**
     * Schedule recurring job
     */
    async scheduleRecurringJob(queueName, jobType, data, cronPattern, options = {}) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        const jobOptions = {
            ...options,
            repeat: { cron: cronPattern }
        };

        const job = await queue.add(jobType, data, jobOptions);
        
        logger.info(`Scheduled recurring job in ${queueName}`, {
            type: jobType,
            cron: cronPattern,
            data
        });
        
        return job;
    }

    /**
     * High-level job creation methods
     */
    async scheduleEZPassScraping(hostId, accountId, credentials, options = {}) {
        return await this.addJob('toll-scraping', 'scrape-ezpass', {
            hostId,
            accountId,
            credentials
        }, {
            priority: options.priority || 'high',
            delay: options.delay || 0,
            ...options
        });
    }

    async scheduleTollMatching(hostId, tollChargeIds, options = {}) {
        return await this.addJob('toll-processing', 'match-tolls', {
            hostId,
            tollChargeIds
        }, {
            priority: options.priority || 'normal',
            ...options
        });
    }

    async scheduleNotification(type, recipient, data, template, options = {}) {
        return await this.addJob('notifications', 'send-notification', {
            type,
            recipient,
            data,
            template
        }, {
            priority: options.priority || 'high',
            delay: options.delay || 0,
            ...options
        });
    }

    async scheduleIntegrityCheck(hostId, checkType, params = {}, options = {}) {
        return await this.addJob('data-integrity', 'integrity-check', {
            hostId,
            checkType,
            params
        }, {
            priority: options.priority || 'low',
            ...options
        });
    }

    async scheduleReport(hostId, reportType, period, params = {}, options = {}) {
        return await this.addJob('reporting', 'generate-report', {
            hostId,
            reportType,
            period,
            params
        }, {
            priority: options.priority || 'low',
            ...options
        });
    }

    async scheduleCleanup(type, retention, options = {}) {
        return await this.addJob('cleanup', 'cleanup-old-data', {
            type,
            retention
        }, {
            priority: options.priority || 'low',
            ...options
        });
    }

    /**
     * Queue management
     */
    async getQueueStatus(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaiting(),
            queue.getActive(),
            queue.getCompleted(),
            queue.getFailed(),
            queue.getDelayed()
        ]);

        return {
            name: queueName,
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            delayed: delayed.length,
            isPaused: await queue.isPaused()
        };
    }

    async getAllQueueStatuses() {
        const statuses = {};
        
        for (const queueName of this.queues.keys()) {
            statuses[queueName] = await this.getQueueStatus(queueName);
        }
        
        return statuses;
    }

    async pauseQueue(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        await queue.pause();
        logger.info(`Paused queue: ${queueName}`);
    }

    async resumeQueue(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        await queue.resume();
        logger.info(`Resumed queue: ${queueName}`);
    }

    async clearQueue(queueName, status = 'all') {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        let count;
        switch (status) {
            case 'waiting':
                count = await queue.clean(0, 'waiting');
                break;
            case 'completed':
                count = await queue.clean(0, 'completed');
                break;
            case 'failed':
                count = await queue.clean(0, 'failed');
                break;
            case 'all':
                await queue.empty();
                count = 'all';
                break;
            default:
                throw new Error(`Invalid status: ${status}`);
        }

        logger.info(`Cleared ${count} jobs from ${queueName} (${status})`);
        return count;
    }

    /**
     * Utility methods for processors
     */
    async storeCharge(accountId, charge) {
        return new Promise((resolve, reject) => {
            db.run(`
                INSERT OR IGNORE INTO toll_charges (
                    toll_account_id, toll_date, toll_location, toll_amount,
                    plate_number, transaction_id, data_checksum, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                accountId,
                charge.date,
                charge.location,
                charge.amount,
                charge.plate,
                charge.transactionId,
                charge.checksum,
                new Date().toISOString()
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    }

    async storeReport(hostId, reportType, report) {
        return new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO bi_reports (
                    host_id, report_type, report_name, report_data,
                    report_summary, period_start, period_end
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                hostId,
                reportType,
                report.name,
                JSON.stringify(report.data),
                report.summary,
                report.periodStart,
                report.periodEnd
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async cleanupLogs(retentionDays) {
        // Implementation for log cleanup
        logger.info(`Cleaning up logs older than ${retentionDays} days`);
        return { cleaned: 0 };
    }

    async cleanupTempFiles(retentionHours) {
        // Implementation for temp file cleanup
        logger.info(`Cleaning up temp files older than ${retentionHours} hours`);
        return { cleaned: 0 };
    }

    async cleanupNotifications(retentionDays) {
        return new Promise((resolve, reject) => {
            const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
            
            db.run(`
                DELETE FROM notification_logs 
                WHERE created_at < ? AND status = 'sent'
            `, [cutoffDate.toISOString()], function(err) {
                if (err) {
                    reject(err);
                } else {
                    logger.info(`Cleaned up ${this.changes} old notifications`);
                    resolve({ cleaned: this.changes });
                }
            });
        });
    }

    startMonitoring() {
        setInterval(async () => {
            try {
                const statuses = await this.getAllQueueStatuses();
                
                // Update metrics
                let totalActive = 0;
                for (const [queueName, status] of Object.entries(statuses)) {
                    totalActive += status.active;
                    this.metrics.queueMetrics.set(queueName, status);
                }
                this.metrics.activeJobs = totalActive;
                
                logger.info('Job queue metrics:', {
                    ...this.metrics,
                    queueStatuses: statuses
                });
                
            } catch (error) {
                logger.error('Error collecting job metrics:', error);
            }
        }, 60000); // Every minute
    }

    getMetrics() {
        return {
            ...this.metrics,
            queueStatuses: Object.fromEntries(this.metrics.queueMetrics)
        };
    }

    async shutdown() {
        logger.info('Shutting down job queue manager...');
        
        const shutdownPromises = [];
        
        for (const [name, queue] of this.queues) {
            logger.info(`Closing queue: ${name}`);
            shutdownPromises.push(queue.close());
        }
        
        await Promise.all(shutdownPromises);
        
        this.queues.clear();
        this.processors.clear();
        
        logger.info('Job queue manager shut down successfully');
    }
}

module.exports = JobQueueManager;