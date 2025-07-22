const { query, transaction } = require('../config/database');

class User {
  constructor(data) {
    this.id = data.id;
    this.cognito_sub = data.cognito_sub;
    this.email = data.email;
    this.name = data.name;
    this.turo_host_id = data.turo_host_id;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Create a new user
   */
  static async create({ cognitoSub, email, name, turoHostId }) {
    try {
      const result = await query(`
        INSERT INTO users (cognito_sub, email, name, turo_host_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [cognitoSub, email, name, turoHostId]);

      return new User(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        if (error.constraint === 'users_email_key') {
          throw new Error('User with this email already exists');
        }
        if (error.constraint === 'users_cognito_sub_key') {
          throw new Error('User with this Cognito ID already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows.length > 0 ? new User(result.rows[0]) : null;
  }

  /**
   * Find user by Cognito Sub
   */
  static async findByCognitoSub(cognitoSub) {
    const result = await query('SELECT * FROM users WHERE cognito_sub = $1', [cognitoSub]);
    return result.rows.length > 0 ? new User(result.rows[0]) : null;
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows.length > 0 ? new User(result.rows[0]) : null;
  }

  /**
   * Find user by Turo Host ID
   */
  static async findByTuroHostId(turoHostId) {
    const result = await query('SELECT * FROM users WHERE turo_host_id = $1', [turoHostId]);
    return result.rows.length > 0 ? new User(result.rows[0]) : null;
  }

  /**
   * Update user information
   */
  async update(updateData) {
    const allowedFields = ['email', 'name', 'turo_host_id'];
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

    try {
      const result = await query(`
        UPDATE users 
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      Object.assign(this, result.rows[0]);
      return this;
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        if (error.constraint === 'users_email_key') {
          throw new Error('Email already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Delete user and all associated data
   */
  async delete() {
    await transaction(async (client) => {
      // Delete user's jobs first (due to foreign key constraint)
      await client.query('DELETE FROM jobs WHERE user_id = $1', [this.id]);
      
      // Delete user
      const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING *', [this.id]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
    });

    return true;
  }

  /**
   * Get user's jobs
   */
  async getJobs(options = {}) {
    const {
      status,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    let whereConditions = ['user_id = $1'];
    let queryParams = [this.id];
    let paramCount = 2;

    if (status) {
      whereConditions.push(`status = $${paramCount}`);
      queryParams.push(status);
      paramCount++;
    }

    const offset = (page - 1) * limit;
    const orderBy = `${sortBy} ${sortOrder.toUpperCase()}`;

    const countResult = await query(`
      SELECT COUNT(*) as total 
      FROM jobs 
      WHERE ${whereConditions.join(' AND ')}
    `, queryParams);

    const jobsResult = await query(`
      SELECT * FROM jobs 
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, [...queryParams, limit, offset]);

    const Job = require('./Job');
    const jobs = jobsResult.rows.map(row => new Job(row));
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
   * Get user statistics
   */
  async getStats() {
    const result = await query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_jobs,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN toll_amount END), 0) as total_recovered,
        COALESCE(AVG(CASE WHEN status = 'completed' THEN toll_amount END), 0) as avg_toll_amount,
        MAX(created_at) as last_job_date
      FROM jobs 
      WHERE user_id = $1
    `, [this.id]);

    return result.rows[0];
  }

  /**
   * Check if user exists by email or Cognito Sub
   */
  static async exists(email, cognitoSub) {
    const result = await query(
      'SELECT id FROM users WHERE email = $1 OR cognito_sub = $2 LIMIT 1',
      [email, cognitoSub]
    );
    return result.rows.length > 0;
  }

  /**
   * Get all users with pagination
   */
  static async findAll(options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      search
    } = options;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 1;

    if (search) {
      whereConditions.push(`(email ILIKE $${paramCount} OR name ILIKE $${paramCount} OR turo_host_id ILIKE $${paramCount})`);
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    const orderBy = `${sortBy} ${sortOrder.toUpperCase()}`;

    const countResult = await query(`
      SELECT COUNT(*) as total FROM users ${whereClause}
    `, queryParams);

    const usersResult = await query(`
      SELECT * FROM users 
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, [...queryParams, limit, offset]);

    const users = usersResult.rows.map(row => new User(row));
    const total = parseInt(countResult.rows[0].total);

    return {
      users,
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
   * Convert to JSON (excluding sensitive data)
   */
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      turoHostId: this.turo_host_id,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }
}

module.exports = User;