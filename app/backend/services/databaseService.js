const { query, transaction, healthCheck, initializeTables } = require('../config/database');
const User = require('../models/User');
const Job = require('../models/Job');

class DatabaseService {
  /**
   * Initialize database connection and tables
   */
  async initialize() {
    try {
      console.log('Initializing database service...');
      
      // Check database health
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        throw new Error('Database health check failed');
      }

      // Initialize tables if needed
      if (process.env.NODE_ENV === 'development' || process.env.INIT_DB === 'true') {
        await initializeTables();
        console.log('Database tables initialized');
      }

      console.log('Database service initialized successfully');
      return true;
    } catch (error) {
      console.error('Database service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Health check for database
   */
  async healthCheck() {
    try {
      return await healthCheck();
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * User-related operations
   */
  users = {
    /**
     * Create a new user
     */
    create: async (userData) => {
      try {
        return await User.create(userData);
      } catch (error) {
        console.error('Database: User creation failed:', error);
        throw error;
      }
    },

    /**
     * Find user by ID
     */
    findById: async (id) => {
      try {
        return await User.findById(id);
      } catch (error) {
        console.error('Database: Find user by ID failed:', error);
        throw error;
      }
    },

    /**
     * Find user by Cognito Sub
     */
    findByCognitoSub: async (cognitoSub) => {
      try {
        return await User.findByCognitoSub(cognitoSub);
      } catch (error) {
        console.error('Database: Find user by Cognito Sub failed:', error);
        throw error;
      }
    },

    /**
     * Find user by email
     */
    findByEmail: async (email) => {
      try {
        return await User.findByEmail(email);
      } catch (error) {
        console.error('Database: Find user by email failed:', error);
        throw error;
      }
    },

    /**
     * Update user
     */
    update: async (userId, updateData) => {
      try {
        const user = await User.findById(userId);
        if (!user) {
          throw new Error('User not found');
        }
        return await user.update(updateData);
      } catch (error) {
        console.error('Database: User update failed:', error);
        throw error;
      }
    },

    /**
     * Delete user
     */
    delete: async (userId) => {
      try {
        const user = await User.findById(userId);
        if (!user) {
          throw new Error('User not found');
        }
        return await user.delete();
      } catch (error) {
        console.error('Database: User deletion failed:', error);
        throw error;
      }
    },

    /**
     * Get user statistics
     */
    getStats: async (userId) => {
      try {
        const user = await User.findById(userId);
        if (!user) {
          throw new Error('User not found');
        }
        return await user.getStats();
      } catch (error) {
        console.error('Database: Get user stats failed:', error);
        throw error;
      }
    },

    /**
     * Find all users with pagination
     */
    findAll: async (options) => {
      try {
        return await User.findAll(options);
      } catch (error) {
        console.error('Database: Find all users failed:', error);
        throw error;
      }
    },

    /**
     * Check if user exists
     */
    exists: async (email, cognitoSub) => {
      try {
        return await User.exists(email, cognitoSub);
      } catch (error) {
        console.error('Database: Check user exists failed:', error);
        throw error;
      }
    }
  };

  /**
   * Job-related operations
   */
  jobs = {
    /**
     * Create a new job
     */
    create: async (jobData) => {
      try {
        return await Job.create(jobData);
      } catch (error) {
        console.error('Database: Job creation failed:', error);
        throw error;
      }
    },

    /**
     * Find job by ID
     */
    findById: async (id) => {
      try {
        return await Job.findById(id);
      } catch (error) {
        console.error('Database: Find job by ID failed:', error);
        throw error;
      }
    },

    /**
     * Find job by ID and user
     */
    findByIdAndUser: async (id, userId) => {
      try {
        return await Job.findByIdAndUser(id, userId);
      } catch (error) {
        console.error('Database: Find job by ID and user failed:', error);
        throw error;
      }
    },

    /**
     * Find job by Turo Trip ID
     */
    findByTuroTripId: async (turoTripId, userId) => {
      try {
        return await Job.findByTuroTripId(turoTripId, userId);
      } catch (error) {
        console.error('Database: Find job by Turo Trip ID failed:', error);
        throw error;
      }
    },

    /**
     * Find jobs with filters
     */
    findWithFilters: async (options) => {
      try {
        return await Job.findWithFilters(options);
      } catch (error) {
        console.error('Database: Find jobs with filters failed:', error);
        throw error;
      }
    },

    /**
     * Update job
     */
    update: async (jobId, updateData) => {
      try {
        const job = await Job.findById(jobId);
        if (!job) {
          throw new Error('Job not found');
        }
        return await job.update(updateData);
      } catch (error) {
        console.error('Database: Job update failed:', error);
        throw error;
      }
    },

    /**
     * Delete job
     */
    delete: async (jobId) => {
      try {
        const job = await Job.findById(jobId);
        if (!job) {
          throw new Error('Job not found');
        }
        return await job.delete();
      } catch (error) {
        console.error('Database: Job deletion failed:', error);
        throw error;
      }
    },

    /**
     * Mark job as processing
     */
    markAsProcessing: async (jobId) => {
      try {
        const job = await Job.findById(jobId);
        if (!job) {
          throw new Error('Job not found');
        }
        return await job.markAsProcessing();
      } catch (error) {
        console.error('Database: Mark job as processing failed:', error);
        throw error;
      }
    },

    /**
     * Mark job as completed
     */
    markAsCompleted: async (jobId, submissionId = null) => {
      try {
        const job = await Job.findById(jobId);
        if (!job) {
          throw new Error('Job not found');
        }
        return await job.markAsCompleted(submissionId);
      } catch (error) {
        console.error('Database: Mark job as completed failed:', error);
        throw error;
      }
    },

    /**
     * Mark job as failed
     */
    markAsFailed: async (jobId, errorMessage) => {
      try {
        const job = await Job.findById(jobId);
        if (!job) {
          throw new Error('Job not found');
        }
        return await job.markAsFailed(errorMessage);
      } catch (error) {
        console.error('Database: Mark job as failed failed:', error);
        throw error;
      }
    },

    /**
     * Reset job for retry
     */
    resetForRetry: async (jobId) => {
      try {
        const job = await Job.findById(jobId);
        if (!job) {
          throw new Error('Job not found');
        }
        return await job.resetForRetry();
      } catch (error) {
        console.error('Database: Reset job for retry failed:', error);
        throw error;
      }
    },

    /**
     * Get jobs ready for processing
     */
    getReadyForProcessing: async (limit = 10) => {
      try {
        return await Job.getReadyForProcessing(limit);
      } catch (error) {
        console.error('Database: Get jobs ready for processing failed:', error);
        throw error;
      }
    },

    /**
     * Get job statistics
     */
    getStats: async (userId = null) => {
      try {
        return await Job.getStats(userId);
      } catch (error) {
        console.error('Database: Get job stats failed:', error);
        throw error;
      }
    },

    /**
     * Bulk update jobs
     */
    bulkUpdate: async (jobIds, updateData, userId = null) => {
      try {
        return await Job.bulkUpdate(jobIds, updateData, userId);
      } catch (error) {
        console.error('Database: Bulk update jobs failed:', error);
        throw error;
      }
    }
  };

  /**
   * Execute raw query
   */
  async query(text, params = []) {
    try {
      return await query(text, params);
    } catch (error) {
      console.error('Database: Raw query failed:', error);
      throw error;
    }
  }

  /**
   * Execute transaction
   */
  async transaction(callback) {
    try {
      return await transaction(callback);
    } catch (error) {
      console.error('Database: Transaction failed:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    try {
      const result = await query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM jobs) as total_jobs,
          (SELECT COUNT(*) FROM jobs WHERE status = 'pending') as pending_jobs,
          (SELECT COUNT(*) FROM jobs WHERE status = 'processing') as processing_jobs,
          (SELECT COUNT(*) FROM jobs WHERE status = 'completed') as completed_jobs,
          (SELECT COUNT(*) FROM jobs WHERE status = 'failed') as failed_jobs,
          (SELECT COUNT(*) FROM jobs WHERE status = 'retry') as retry_jobs,
          (SELECT COALESCE(SUM(toll_amount), 0) FROM jobs WHERE status = 'completed') as total_recovered
      `);

      return result.rows[0];
    } catch (error) {
      console.error('Database: Get stats failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup old records
   */
  async cleanup(options = {}) {
    const {
      deleteCompletedOlderThan = 90, // days
      deleteFailedOlderThan = 30,    // days
      dryRun = false
    } = options;

    try {
      const queries = [];

      // Clean up old completed jobs
      if (deleteCompletedOlderThan > 0) {
        const completedQuery = `
          ${dryRun ? 'SELECT COUNT(*) as deleted_count FROM' : 'DELETE FROM'} jobs 
          WHERE status = 'completed' 
          AND created_at < NOW() - INTERVAL '${deleteCompletedOlderThan} days'
          ${dryRun ? '' : 'RETURNING id'}
        `;
        queries.push({ type: 'completed', query: completedQuery });
      }

      // Clean up old failed jobs
      if (deleteFailedOlderThan > 0) {
        const failedQuery = `
          ${dryRun ? 'SELECT COUNT(*) as deleted_count FROM' : 'DELETE FROM'} jobs 
          WHERE status = 'failed' 
          AND created_at < NOW() - INTERVAL '${deleteFailedOlderThan} days'
          ${dryRun ? '' : 'RETURNING id'}
        `;
        queries.push({ type: 'failed', query: failedQuery });
      }

      const results = {};

      for (const { type, query: queryText } of queries) {
        const result = await query(queryText);
        results[type] = dryRun 
          ? result.rows[0].deleted_count 
          : result.rows.length;
      }

      console.log('Database cleanup completed:', results);
      return results;
    } catch (error) {
      console.error('Database: Cleanup failed:', error);
      throw error;
    }
  }
}

module.exports = new DatabaseService();