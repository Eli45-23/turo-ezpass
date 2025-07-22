/**
 * Scraper Index Module
 * 
 * This module provides a unified interface for all scrapers
 * and includes utility functions for coordinating scraping operations.
 */

const EZPassScraper = require('./ezpass');
const TuroScraper = require('./turo');

class ScraperManager {
  constructor() {
    this.ezPassScraper = new EZPassScraper();
    this.turoScraper = new TuroScraper();
    this.isInitialized = false;
  }

  /**
   * Initialize all scrapers
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        return;
      }

      console.log('Initializing scraper manager...');

      await Promise.all([
        this.ezPassScraper.initialize(),
        this.turoScraper.initialize()
      ]);

      this.isInitialized = true;
      console.log('Scraper manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize scraper manager:', error);
      throw error;
    }
  }

  /**
   * Process a toll reimbursement job
   * 
   * @param {Object} job - Job data from database
   * @param {Object} userCredentials - User credentials for scraping
   * @returns {Object} Processing result
   */
  async processTollJob(job, userCredentials) {
    try {
      console.log('Processing toll job...', {
        jobId: job.id,
        tripId: job.turo_trip_id,
        amount: job.toll_amount
      });

      // Step 1: Login to Turo and get trip details
      await this.turoScraper.login(
        userCredentials.turo.email,
        userCredentials.turo.password
      );

      const tripDetails = await this.turoScraper.getTripDetails(job.turo_trip_id);

      // Step 2: Login to EZPass and find matching toll transaction
      await this.ezPassScraper.login(
        userCredentials.ezpass.username,
        userCredentials.ezpass.password,
        userCredentials.ezpass.state
      );

      const tollTransaction = await this.ezPassScraper.findTollTransaction({
        date: job.trip_start_date,
        location: job.toll_location,
        amount: job.toll_amount
      });

      if (!tollTransaction) {
        throw new Error('Matching toll transaction not found');
      }

      // Step 3: Download toll receipt
      const receiptBuffer = await this.ezPassScraper.downloadReceipt(
        tollTransaction.id
      );

      // Step 4: Submit claim to Turo
      const claimResult = await this.turoScraper.submitTollClaim({
        tripId: job.turo_trip_id,
        amount: job.toll_amount,
        location: job.toll_location,
        proofImageUrl: job.proof_image_url,
        description: `Toll charge for ${job.toll_location} during trip ${job.turo_trip_id}`
      });

      const result = {
        success: true,
        jobId: job.id,
        tripDetails: tripDetails,
        tollTransaction: tollTransaction,
        claimResult: claimResult,
        receiptDownloaded: !!receiptBuffer,
        processedAt: new Date()
      };

      console.log('Toll job processed successfully:', {
        jobId: job.id,
        claimId: claimResult.claimId
      });

      return result;
    } catch (error) {
      console.error('Failed to process toll job:', error);
      
      const result = {
        success: false,
        jobId: job.id,
        error: error.message,
        processedAt: new Date()
      };

      return result;
    }
  }

  /**
   * Batch process multiple toll jobs
   * 
   * @param {Array} jobs - Array of job data
   * @param {Object} userCredentials - User credentials
   * @returns {Array} Processing results
   */
  async batchProcessJobs(jobs, userCredentials) {
    try {
      console.log(`Starting batch processing of ${jobs.length} jobs...`);

      const results = [];

      for (const job of jobs) {
        try {
          const result = await this.processTollJob(job, userCredentials);
          results.push(result);

          // Add delay between jobs to be respectful
          await this._sleep(2000);
        } catch (error) {
          console.error(`Failed to process job ${job.id}:`, error);
          results.push({
            success: false,
            jobId: job.id,
            error: error.message,
            processedAt: new Date()
          });
        }
      }

      console.log(`Batch processing completed. ${results.filter(r => r.success).length}/${results.length} successful`);
      return results;
    } catch (error) {
      console.error('Batch processing failed:', error);
      throw error;
    }
  }

  /**
   * Validate user credentials for all services
   * 
   * @param {Object} userCredentials - User credentials
   * @returns {Object} Validation results
   */
  async validateCredentials(userCredentials) {
    try {
      console.log('Validating user credentials...');

      const results = {
        turo: false,
        ezpass: false,
        overall: false
      };

      // Validate Turo credentials
      try {
        await this.turoScraper.login(
          userCredentials.turo.email,
          userCredentials.turo.password
        );
        results.turo = true;
        console.log('Turo credentials valid');
      } catch (error) {
        console.log('Turo credentials invalid:', error.message);
      }

      // Validate EZPass credentials
      try {
        await this.ezPassScraper.login(
          userCredentials.ezpass.username,
          userCredentials.ezpass.password,
          userCredentials.ezpass.state
        );
        results.ezpass = true;
        console.log('EZPass credentials valid');
      } catch (error) {
        console.log('EZPass credentials invalid:', error.message);
      }

      results.overall = results.turo && results.ezpass;

      console.log('Credential validation completed:', results);
      return results;
    } catch (error) {
      console.error('Credential validation failed:', error);
      throw error;
    }
  }

  /**
   * Get account summaries from all services
   * 
   * @param {Object} userCredentials - User credentials
   * @returns {Object} Account summaries
   */
  async getAccountSummaries(userCredentials) {
    try {
      console.log('Getting account summaries...');

      const summaries = {};

      // Get Turo dashboard summary
      try {
        await this.turoScraper.login(
          userCredentials.turo.email,
          userCredentials.turo.password
        );
        summaries.turo = await this.turoScraper.getDashboardSummary();
      } catch (error) {
        console.error('Failed to get Turo summary:', error);
        summaries.turo = { error: error.message };
      }

      // Get EZPass account balance
      try {
        await this.ezPassScraper.login(
          userCredentials.ezpass.username,
          userCredentials.ezpass.password,
          userCredentials.ezpass.state
        );
        summaries.ezpass = await this.ezPassScraper.getAccountBalance();
      } catch (error) {
        console.error('Failed to get EZPass summary:', error);
        summaries.ezpass = { error: error.message };
      }

      console.log('Account summaries retrieved');
      return summaries;
    } catch (error) {
      console.error('Failed to get account summaries:', error);
      throw error;
    }
  }

  /**
   * Health check for all scrapers
   * 
   * @returns {Object} Health status
   */
  async healthCheck() {
    try {
      console.log('Performing scraper health check...');

      const health = {
        ezpass: false,
        turo: false,
        overall: false,
        timestamp: new Date()
      };

      try {
        health.ezpass = await this.ezPassScraper.healthCheck();
      } catch (error) {
        console.error('EZPass health check failed:', error);
      }

      try {
        health.turo = await this.turoScraper.healthCheck();
      } catch (error) {
        console.error('Turo health check failed:', error);
      }

      health.overall = health.ezpass && health.turo;

      console.log('Scraper health check completed:', health);
      return health;
    } catch (error) {
      console.error('Scraper health check failed:', error);
      return {
        ezpass: false,
        turo: false,
        overall: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Cleanup all scrapers
   */
  async cleanup() {
    try {
      console.log('Cleaning up scrapers...');

      await Promise.all([
        this.ezPassScraper.cleanup(),
        this.turoScraper.cleanup()
      ]);

      this.isInitialized = false;
      console.log('Scrapers cleaned up successfully');
    } catch (error) {
      console.error('Error during scraper cleanup:', error);
    }
  }

  /**
   * Utility function to add delays
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export individual scrapers and manager
module.exports = {
  EZPassScraper,
  TuroScraper,
  ScraperManager,
  
  // Export singleton instance
  scraperManager: new ScraperManager()
};