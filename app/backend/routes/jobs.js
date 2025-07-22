const express = require('express');
const authMiddleware = require('../middleware/auth');
const jobService = require('../services/jobService');
const { validateJobQuery } = require('../middleware/validation');
const router = express.Router();

/**
 * @route   GET /api/jobs
 * @desc    Get toll submission jobs with filtering and pagination
 * @access  Private
 */
router.get('/', authMiddleware, validateJobQuery, async (req, res, next) => {
  try {
    const userId = req.user.userSub;
    const {
      status = 'pending',
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      startDate,
      endDate,
      tollLocation,
      minAmount,
      maxAmount
    } = req.query;

    // Build filter options
    const filters = {
      userId,
      status,
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
      ...(tollLocation && { tollLocation }),
      ...(minAmount && { minAmount: parseFloat(minAmount) }),
      ...(maxAmount && { maxAmount: parseFloat(maxAmount) })
    };

    // Pagination options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder: sortOrder.toLowerCase()
    };

    // Get jobs from database
    const result = await jobService.getJobs(filters, options);

    res.json({
      success: true,
      data: {
        jobs: result.jobs,
        pagination: {
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          totalItems: result.totalItems,
          itemsPerPage: result.itemsPerPage,
          hasNextPage: result.hasNextPage,
          hasPrevPage: result.hasPrevPage
        },
        filters: {
          status,
          startDate,
          endDate,
          tollLocation,
          minAmount,
          maxAmount
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/jobs/:jobId
 * @desc    Get a specific job by ID
 * @access  Private
 */
router.get('/:jobId', authMiddleware, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userSub;

    const job = await jobService.getJobById(jobId, userId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/jobs/stats/summary
 * @desc    Get job statistics summary for the user
 * @access  Private
 */
router.get('/stats/summary', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.userSub;
    const { timeRange = '30d' } = req.query;

    const stats = await jobService.getJobStats(userId, timeRange);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/jobs
 * @desc    Create a new toll job (usually called by automated scraping)
 * @access  Private
 */
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.userSub;
    const jobData = {
      ...req.body,
      userId
    };

    const job = await jobService.createJob(jobData);

    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/jobs/:jobId
 * @desc    Update a job (status, error message, etc.)
 * @access  Private
 */
router.put('/:jobId', authMiddleware, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userSub;
    const updateData = req.body;

    const job = await jobService.updateJob(jobId, userId, updateData);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    res.json({
      success: true,
      message: 'Job updated successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/jobs/:jobId
 * @desc    Delete a job
 * @access  Private
 */
router.delete('/:jobId', authMiddleware, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userSub;

    const deleted = await jobService.deleteJob(jobId, userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    res.json({
      success: true,
      message: 'Job deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/jobs/bulk-update
 * @desc    Update multiple jobs at once
 * @access  Private
 */
router.post('/bulk-update', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.userSub;
    const { jobIds, updateData } = req.body;

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Job IDs array is required'
      });
    }

    const result = await jobService.bulkUpdateJobs(jobIds, userId, updateData);

    res.json({
      success: true,
      message: `Updated ${result.updatedCount} jobs successfully`,
      data: {
        updatedCount: result.updatedCount,
        jobIds: result.updatedJobIds
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;