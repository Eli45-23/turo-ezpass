const express = require('express');
const authMiddleware = require('../middleware/auth');
const jobService = require('../services/jobService');
const router = express.Router();

/**
 * @route   POST /api/submit/:jobId
 * @desc    Submit a toll job for processing via TuroBot flow
 * @access  Private
 */
router.post('/:jobId', authMiddleware, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userSub;

    // Validate job exists and belongs to user
    const job = await jobService.getJobById(jobId, userId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if job is in a submittable state
    if (job.status === 'processing') {
      return res.status(400).json({
        success: false,
        message: 'Job is already being processed'
      });
    }

    if (job.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Job has already been completed'
      });
    }

    // Update job status to processing
    await jobService.updateJob(jobId, userId, {
      status: 'processing',
      lastSubmissionDate: new Date(),
      submissionAttempts: (job.submissionAttempts || 0) + 1
    });

    // TODO: Integrate with TuroBot workflow
    // This is where the actual Turo submission logic will be implemented
    
    // For now, simulate the submission process
    const submissionResult = await simulateTuroSubmission(job);

    // Update job based on submission result
    const updateData = {
      status: submissionResult.success ? 'completed' : 'failed',
      lastSubmissionDate: new Date(),
      ...(submissionResult.submissionId && { submissionId: submissionResult.submissionId }),
      ...(submissionResult.errorMessage && { errorMessage: submissionResult.errorMessage })
    };

    const updatedJob = await jobService.updateJob(jobId, userId, updateData);

    res.json({
      success: true,
      message: submissionResult.success 
        ? 'Job submitted successfully' 
        : 'Job submission failed',
      data: {
        job: updatedJob,
        submissionResult: {
          success: submissionResult.success,
          submissionId: submissionResult.submissionId,
          message: submissionResult.message,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    // If there's an error, update job status to failed
    try {
      await jobService.updateJob(req.params.jobId, req.user.userSub, {
        status: 'failed',
        errorMessage: error.message,
        lastSubmissionDate: new Date()
      });
    } catch (updateError) {
      console.error('Failed to update job status after error:', updateError);
    }
    
    next(error);
  }
});

/**
 * @route   POST /api/submit/bulk
 * @desc    Submit multiple jobs for processing
 * @access  Private
 */
router.post('/bulk', authMiddleware, async (req, res, next) => {
  try {
    const { jobIds } = req.body;
    const userId = req.user.userSub;

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Job IDs array is required'
      });
    }

    if (jobIds.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 10 jobs can be submitted at once'
      });
    }

    const results = [];

    // Process each job
    for (const jobId of jobIds) {
      try {
        const job = await jobService.getJobById(jobId, userId);
        
        if (!job) {
          results.push({
            jobId,
            success: false,
            message: 'Job not found'
          });
          continue;
        }

        if (job.status === 'processing' || job.status === 'completed') {
          results.push({
            jobId,
            success: false,
            message: `Job is already ${job.status}`
          });
          continue;
        }

        // Update to processing
        await jobService.updateJob(jobId, userId, {
          status: 'processing',
          lastSubmissionDate: new Date(),
          submissionAttempts: (job.submissionAttempts || 0) + 1
        });

        // Simulate submission
        const submissionResult = await simulateTuroSubmission(job);

        // Update based on result
        await jobService.updateJob(jobId, userId, {
          status: submissionResult.success ? 'completed' : 'failed',
          lastSubmissionDate: new Date(),
          ...(submissionResult.submissionId && { submissionId: submissionResult.submissionId }),
          ...(submissionResult.errorMessage && { errorMessage: submissionResult.errorMessage })
        });

        results.push({
          jobId,
          success: submissionResult.success,
          message: submissionResult.message,
          submissionId: submissionResult.submissionId
        });

      } catch (error) {
        results.push({
          jobId,
          success: false,
          message: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.json({
      success: true,
      message: `Bulk submission completed: ${successCount} successful, ${failureCount} failed`,
      data: {
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/submit/status/:jobId
 * @desc    Get submission status for a specific job
 * @access  Private
 */
router.get('/status/:jobId', authMiddleware, async (req, res, next) => {
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
      data: {
        jobId: job.id,
        status: job.status,
        submissionAttempts: job.submissionAttempts || 0,
        lastSubmissionDate: job.lastSubmissionDate,
        submissionId: job.submissionId,
        errorMessage: job.errorMessage,
        canRetry: job.status === 'failed' || job.status === 'retry'
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * Simulate Turo submission process
 * TODO: Replace with actual TuroBot integration
 */
async function simulateTuroSubmission(job) {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Simulate success/failure (80% success rate for demo)
  const success = Math.random() > 0.2;

  if (success) {
    return {
      success: true,
      submissionId: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: 'Toll reimbursement submitted successfully to Turo'
    };
  } else {
    const errorMessages = [
      'Turo API timeout - please try again',
      'Invalid trip data provided',
      'Toll amount exceeds trip duration',
      'Duplicate submission detected',
      'Turo host interface temporarily unavailable'
    ];
    
    return {
      success: false,
      errorMessage: errorMessages[Math.floor(Math.random() * errorMessages.length)],
      message: 'Submission failed - please review and try again'
    };
  }
}

module.exports = router;