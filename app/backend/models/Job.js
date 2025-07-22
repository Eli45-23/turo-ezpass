const { query, transaction } = require('../config/database');

class Job {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.turo_trip_id = data.turo_trip_id;
    this.status = data.status;
    this.toll_amount = data.toll_amount;
    this.toll_location = data.toll_location;
    this.trip_start_date = data.trip_start_date;
    this.trip_end_date = data.trip_end_date;
    this.proof_image_url = data.proof_image_url;
    this.submission_attempts = data.submission_attempts;
    this.last_submission_date = data.last_submission_date;
    this.submission_id = data.submission_id;
    this.error_message = data.error_message;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Create a new job
   */
  static async create({
    userId,
    turoTripId,
    tollAmount,
    tollLocation,
    tripStartDate,
    tripEndDate,
    proofImageUrl,
    status = 'pending'
  }) {
    try {
      const result = await query(`
        INSERT INTO jobs (
          user_id, turo_trip_id, toll_amount, toll_location,
          trip_start_date, trip_end_date, proof_image_url, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        userId, turoTripId, tollAmount, tollLocation,
        tripStartDate, tripEndDate, proofImageUrl, status
      ]);

      return new Job(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Job with this Turo Trip ID already exists for this user');
      }
      if (error.code === '23503') { // Foreign key violation
        throw new Error('User not found');
      }
      throw error;
    }
  }

  /**
   * Find job by ID
   */
  static async findById(id) {
    const result = await query('SELECT * FROM jobs WHERE id = $1', [id]);
    return result.rows.length > 0 ? new Job(result.rows[0]) : null;
  }

  /**
   * Find job by ID with user verification
   */
  static async findByIdAndUser(id, userId) {
    const result = await query(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows.length > 0 ? new Job(result.rows[0]) : null;
  }

  /**
   * Find job by Turo Trip ID
   */
  static async findByTuroTripId(turoTripId, userId) {
    const result = await query(
      'SELECT * FROM jobs WHERE turo_trip_id = $1 AND user_id = $2',
      [turoTripId, userId]
    );
    return result.rows.length > 0 ? new Job(result.rows[0]) : null;
  }

  /**
   * Find jobs with filters
   */
  static async findWithFilters(options = {}) {
    const {
      userId,
      status,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      startDate,
      endDate,
      tollLocation,
      minAmount,
      maxAmount
    } = options;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 1;

    if (userId) {
      whereConditions.push(`user_id = $${paramCount}`);
      queryParams.push(userId);
      paramCount++;
    }

    if (status) {
      whereConditions.push(`status = $${paramCount}`);
      queryParams.push(status);
      paramCount++;
    }

    if (startDate) {
      whereConditions.push(`trip_start_date >= $${paramCount}`);
      queryParams.push(startDate);
      paramCount++;
    }

    if (endDate) {
      whereConditions.push(`trip_end_date <= $${paramCount}`);
      queryParams.push(endDate);
      paramCount++;
    }

    if (tollLocation) {
      whereConditions.push(`toll_location ILIKE $${paramCount}`);
      queryParams.push(`%${tollLocation}%`);
      paramCount++;
    }

    if (minAmount !== undefined) {
      whereConditions.push(`toll_amount >= $${paramCount}`);
      queryParams.push(minAmount);
      paramCount++;
    }

    if (maxAmount !== undefined) {
      whereConditions.push(`toll_amount <= $${paramCount}`);
      queryParams.push(maxAmount);
      paramCount++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    const orderBy = `${sortBy} ${sortOrder.toUpperCase()}`;

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total FROM jobs ${whereClause}
    `, queryParams);

    // Get jobs
    const jobsResult = await query(`
      SELECT j.*, u.email as user_email, u.name as user_name
      FROM jobs j
      LEFT JOIN users u ON j.user_id = u.id
      ${whereClause}
      ORDER BY j.${orderBy}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, [...queryParams, limit, offset]);

    const jobs = jobsResult.rows.map(row => {
      const job = new Job(row);
      job.user_email = row.user_email;
      job.user_name = row.user_name;
      return job;
    });

    const total = parseInt(countResult.rows[0].total);

    return {
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }

  /**
   * Update job
   */
  async update(updateData) {
    const allowedFields = [
      'status', 'toll_amount', 'toll_location', 'trip_start_date',
      'trip_end_date', 'proof_image_url', 'submission_attempts',
      'last_submission_date', 'submission_id', 'error_message'
    ];

    const updates = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key) && updateData[key] !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        values.push(updateData[key]);
        paramCount++;
      }
    });

    if (updates.length === 0) {
      throw new Error('No valid fields provided for update');
    }

    values.push(this.id);

    const result = await query(`
      UPDATE jobs 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Job not found');
    }

    Object.assign(this, result.rows[0]);
    return this;
  }

  /**
   * Delete job
   */
  async delete() {
    const result = await query('DELETE FROM jobs WHERE id = $1 RETURNING *', [this.id]);
    
    if (result.rows.length === 0) {
      throw new Error('Job not found');
    }

    return true;
  }

  /**
   * Mark job as processing
   */
  async markAsProcessing() {
    await this.update({
      status: 'processing',
      last_submission_date: new Date(),
      submission_attempts: (this.submission_attempts || 0) + 1
    });
    return this;
  }

  /**
   * Mark job as completed
   */
  async markAsCompleted(submissionId = null) {
    await this.update({
      status: 'completed',
      submission_id: submissionId,
      error_message: null
    });
    return this;
  }

  /**
   * Mark job as failed
   */
  async markAsFailed(errorMessage) {
    const newAttempts = (this.submission_attempts || 0) + 1;
    const shouldRetry = newAttempts < 3;

    await this.update({
      status: shouldRetry ? 'retry' : 'failed',
      error_message: errorMessage,
      submission_attempts: newAttempts
    });
    return this;
  }

  /**
   * Reset job for retry
   */
  async resetForRetry() {
    await this.update({
      status: 'pending',
      error_message: null
    });
    return this;
  }

  /**
   * Get jobs ready for processing
   */
  static async getReadyForProcessing(limit = 10) {
    const result = await query(`
      SELECT * FROM jobs 
      WHERE status IN ('pending', 'retry')
      AND (last_submission_date IS NULL OR last_submission_date < NOW() - INTERVAL '1 hour')
      ORDER BY 
        CASE status 
          WHEN 'retry' THEN 1 
          WHEN 'pending' THEN 2 
        END,
        created_at ASC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => new Job(row));
  }

  /**
   * Get job statistics
   */
  static async getStats(userId = null) {
    let whereClause = '';
    let queryParams = [];

    if (userId) {
      whereClause = 'WHERE user_id = $1';
      queryParams = [userId];
    }

    const result = await query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_jobs,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        COUNT(CASE WHEN status = 'retry' THEN 1 END) as retry_jobs,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN toll_amount END), 0) as total_recovered,
        COALESCE(AVG(CASE WHEN status = 'completed' THEN toll_amount END), 0) as avg_toll_amount,
        COALESCE(AVG(submission_attempts), 0) as avg_attempts
      FROM jobs 
      ${whereClause}
    `, queryParams);

    return result.rows[0];
  }

  /**
   * Bulk update jobs
   */
  static async bulkUpdate(jobIds, updateData, userId = null) {
    return await transaction(async (client) => {
      let whereClause = 'id = ANY($1)';
      let queryParams = [jobIds];

      if (userId) {
        whereClause += ' AND user_id = $2';
        queryParams.push(userId);
      }

      const allowedFields = ['status', 'error_message', 'submission_id'];
      const updates = [];
      const values = [...queryParams];
      let paramCount = queryParams.length + 1;

      Object.keys(updateData).forEach(key => {
        if (allowedFields.includes(key) && updateData[key] !== undefined) {
          updates.push(`${key} = $${paramCount}`);
          values.push(updateData[key]);
          paramCount++;
        }
      });

      if (updates.length === 0) {
        throw new Error('No valid fields provided for update');
      }

      const result = await client.query(`
        UPDATE jobs 
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE ${whereClause}
        RETURNING *
      `, values);

      return result.rows.map(row => new Job(row));
    });
  }

  /**
   * Check if job can be retried
   */
  canRetry() {
    return this.status === 'failed' && (this.submission_attempts || 0) < 3;
  }

  /**
   * Get time until next retry (if applicable)
   */
  getRetryTime() {
    if (!this.last_submission_date || this.status !== 'retry') {
      return null;
    }

    const nextRetry = new Date(this.last_submission_date);
    nextRetry.setHours(nextRetry.getHours() + 1); // 1 hour cooldown

    return nextRetry > new Date() ? nextRetry : null;
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.user_id,
      turoTripId: this.turo_trip_id,
      status: this.status,
      tollAmount: parseFloat(this.toll_amount),
      tollLocation: this.toll_location,
      tripStartDate: this.trip_start_date,
      tripEndDate: this.trip_end_date,
      proofImageUrl: this.proof_image_url,
      submissionAttempts: this.submission_attempts || 0,
      lastSubmissionDate: this.last_submission_date,
      submissionId: this.submission_id,
      errorMessage: this.error_message,
      createdAt: this.created_at,
      updatedAt: this.updated_at,
      canRetry: this.canRetry(),
      retryTime: this.getRetryTime(),
      ...(this.user_email && { userEmail: this.user_email }),
      ...(this.user_name && { userName: this.user_name })
    };
  }
}

module.exports = Job;