const databaseService = require('./databaseService');
const awsService = require('./awsService');
const { publishEvent } = require('../config/aws');

class JobService {
  /**
   * Create a new job
   */
  async createJob(userId, jobData) {
    try {
      // Validate user exists
      const user = await databaseService.users.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if job with same Turo Trip ID already exists for this user
      const existingJob = await databaseService.jobs.findByTuroTripId(
        jobData.turoTripId, 
        userId
      );

      if (existingJob) {
        throw new Error('Job with this Turo Trip ID already exists');
      }

      // Create the job
      const job = await databaseService.jobs.create({
        userId,
        ...jobData
      });

      console.log('Job created successfully:', {
        jobId: job.id,
        userId: userId,
        turoTripId: jobData.turoTripId
      });

      // Publish job created event
      await this._publishJobEvent('job.created', job, user);

      return job;
    } catch (error) {
      console.error('JobService: Create job failed:', error);
      throw error;
    }
  }

  /**
   * Get jobs for a user with filters
   */
  async getUserJobs(userId, filters = {}) {
    try {
      // Ensure we only get jobs for this user
      const options = {
        ...filters,
        userId
      };

      const result = await databaseService.jobs.findWithFilters(options);

      console.log('Retrieved user jobs:', {
        userId: userId,
        count: result.jobs.length,
        total: result.pagination.total
      });

      return result;
    } catch (error) {
      console.error('JobService: Get user jobs failed:', error);
      throw error;
    }
  }

  /**
   * Get job by ID (with user verification)
   */
  async getJobById(jobId, userId) {
    try {
      const job = await databaseService.jobs.findByIdAndUser(jobId, userId);
      
      if (!job) {
        throw new Error('Job not found or access denied');
      }

      return job;
    } catch (error) {
      console.error('JobService: Get job by ID failed:', error);
      throw error;
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId, userId, status, additionalData = {}) {
    try {
      const job = await this.getJobById(jobId, userId);

      const updateData = {
        status,
        ...additionalData
      };

      if (status === 'processing') {
        updateData.last_submission_date = new Date();
        updateData.submission_attempts = (job.submission_attempts || 0) + 1;
      } else if (status === 'completed') {
        updateData.error_message = null;
      }

      const updatedJob = await job.update(updateData);

      console.log('Job status updated:', {
        jobId: jobId,
        oldStatus: job.status,
        newStatus: status,
        userId: userId
      });

      // Publish job status change event
      const user = await databaseService.users.findById(userId);
      await this._publishJobEvent('job.status_changed', updatedJob, user, {
        oldStatus: job.status,
        newStatus: status
      });

      return updatedJob;
    } catch (error) {
      console.error('JobService: Update job status failed:', error);
      throw error;
    }
  }

  /**
   * Submit job for processing
   */
  async submitJob(jobId, userId) {
    try {
      const job = await this.getJobById(jobId, userId);

      if (job.status !== 'pending' && job.status !== 'retry') {
        throw new Error(`Job cannot be submitted in status: ${job.status}`);
      }

      // Mark job as processing
      const updatedJob = await this.updateJobStatus(jobId, userId, 'processing');

      // Get user details
      const user = await databaseService.users.findById(userId);

      // Publish job submission event for external processing
      await this._publishJobEvent('job.submitted', updatedJob, user);

      console.log('Job submitted for processing:', {
        jobId: jobId,
        userId: userId,
        attempts: updatedJob.submission_attempts
      });

      return updatedJob;
    } catch (error) {
      console.error('JobService: Submit job failed:', error);
      
      // If submission failed, mark job as failed
      try {
        await this.markJobAsFailed(jobId, userId, error.message);
      } catch (updateError) {
        console.error('JobService: Failed to mark job as failed:', updateError);
      }
      
      throw error;
    }
  }

  /**
   * Mark job as completed
   */
  async markJobAsCompleted(jobId, userId, submissionId = null) {
    try {
      const updatedJob = await this.updateJobStatus(jobId, userId, 'completed', {
        submission_id: submissionId,
        error_message: null
      });

      console.log('Job marked as completed:', {
        jobId: jobId,
        userId: userId,
        submissionId: submissionId
      });

      return updatedJob;
    } catch (error) {
      console.error('JobService: Mark job as completed failed:', error);
      throw error;
    }
  }

  /**
   * Mark job as failed
   */
  async markJobAsFailed(jobId, userId, errorMessage) {
    try {
      const job = await this.getJobById(jobId, userId);
      const newAttempts = (job.submission_attempts || 0) + 1;
      const shouldRetry = newAttempts < 3;

      const updatedJob = await this.updateJobStatus(jobId, userId, shouldRetry ? 'retry' : 'failed', {
        error_message: errorMessage,
        submission_attempts: newAttempts
      });

      console.log('Job marked as failed:', {
        jobId: jobId,
        userId: userId,
        attempts: newAttempts,
        willRetry: shouldRetry,
        error: errorMessage
      });

      return updatedJob;
    } catch (error) {
      console.error('JobService: Mark job as failed failed:', error);
      throw error;
    }
  }

  /**
   * Retry job
   */
  async retryJob(jobId, userId) {
    try {
      const job = await this.getJobById(jobId, userId);

      if (!job.canRetry()) {
        throw new Error('Job cannot be retried');
      }

      // Check retry cooldown
      const retryTime = job.getRetryTime();
      if (retryTime && retryTime > new Date()) {
        throw new Error(`Job can be retried after ${retryTime.toISOString()}`);
      }

      const updatedJob = await this.updateJobStatus(jobId, userId, 'pending', {
        error_message: null
      });

      console.log('Job reset for retry:', {
        jobId: jobId,
        userId: userId,
        attempts: job.submission_attempts
      });

      return updatedJob;
    } catch (error) {
      console.error('JobService: Retry job failed:', error);
      throw error;
    }
  }

  /**
   * Delete job
   */
  async deleteJob(jobId, userId) {
    try {
      const job = await this.getJobById(jobId, userId);

      if (job.status === 'processing') {
        throw new Error('Cannot delete job that is currently processing');
      }

      await job.delete();

      console.log('Job deleted:', {
        jobId: jobId,
        userId: userId
      });

      // Publish job deleted event
      const user = await databaseService.users.findById(userId);
      await this._publishJobEvent('job.deleted', job, user);

      return true;
    } catch (error) {
      console.error('JobService: Delete job failed:', error);
      throw error;
    }
  }

  /**
   * Get jobs ready for processing (admin function)
   */
  async getJobsReadyForProcessing(limit = 10) {
    try {
      const jobs = await databaseService.jobs.getReadyForProcessing(limit);

      console.log('Retrieved jobs ready for processing:', {
        count: jobs.length,
        limit: limit
      });

      return jobs;
    } catch (error) {
      console.error('JobService: Get jobs ready for processing failed:', error);
      throw error;
    }
  }

  /**
   * Process pending jobs (background task)
   */
  async processPendingJobs() {
    try {
      const jobs = await this.getJobsReadyForProcessing(5);

      if (jobs.length === 0) {
        console.log('No jobs ready for processing');
        return { processed: 0, total: 0 };
      }

      let processed = 0;

      for (const job of jobs) {
        try {
          // Mark as processing
          await databaseService.jobs.update(job.id, {
            status: 'processing',
            last_submission_date: new Date(),
            submission_attempts: (job.submission_attempts || 0) + 1
          });

          // Get user details
          const user = await databaseService.users.findById(job.user_id);

          // Publish job for external processing
          await this._publishJobEvent('job.submitted', job, user);

          processed++;

          console.log('Job submitted for processing:', {
            jobId: job.id,
            userId: job.user_id,
            attempts: job.submission_attempts + 1
          });
        } catch (error) {
          console.error('Failed to process job:', {
            jobId: job.id,
            error: error.message
          });

          // Mark job as failed
          await databaseService.jobs.markAsFailed(job.id, error.message);
        }
      }

      console.log('Batch job processing completed:', {
        processed: processed,
        total: jobs.length
      });

      return { processed, total: jobs.length };
    } catch (error) {
      console.error('JobService: Process pending jobs failed:', error);
      throw error;
    }
  }

  /**
   * Get job statistics
   */
  async getJobStats(userId = null) {
    try {
      const stats = await databaseService.jobs.getStats(userId);

      console.log('Retrieved job statistics:', {
        userId: userId || 'global',
        totalJobs: stats.total_jobs
      });

      return {
        totalJobs: parseInt(stats.total_jobs),
        pendingJobs: parseInt(stats.pending_jobs),
        processingJobs: parseInt(stats.processing_jobs),
        completedJobs: parseInt(stats.completed_jobs),
        failedJobs: parseInt(stats.failed_jobs),
        retryJobs: parseInt(stats.retry_jobs),
        totalRecovered: parseFloat(stats.total_recovered),
        avgTollAmount: parseFloat(stats.avg_toll_amount),
        avgAttempts: parseFloat(stats.avg_attempts)
      };
    } catch (error) {
      console.error('JobService: Get job stats failed:', error);
      throw error;
    }
  }

  /**
   * Bulk update jobs
   */
  async bulkUpdateJobs(jobIds, updateData, userId = null) {
    try {
      const updatedJobs = await databaseService.jobs.bulkUpdate(jobIds, updateData, userId);

      console.log('Bulk job update completed:', {
        jobIds: jobIds,
        userId: userId,
        updatedCount: updatedJobs.length
      });

      return updatedJobs;
    } catch (error) {
      console.error('JobService: Bulk update jobs failed:', error);
      throw error;
    }
  }

  /**
   * Publish job-related events to EventBridge
   */
  async _publishJobEvent(eventType, job, user, additionalData = {}) {
    try {
      const eventDetail = {
        job: job.toJSON(),
        user: user.toJSON(),
        timestamp: new Date().toISOString(),
        ...additionalData
      };

      await publishEvent(
        process.env.EVENT_BUS_NAME || 'default',
        'turo-ezpass.jobs',
        eventType,
        eventDetail
      );

      console.log('Job event published:', {
        eventType: eventType,
        jobId: job.id,
        userId: user.id
      });
    } catch (error) {
      console.error('Failed to publish job event:', {
        eventType: eventType,
        jobId: job.id,
        error: error.message
      });
      // Don't throw here - event publishing failure shouldn't break the main operation
    }
  }
}

module.exports = new JobService();