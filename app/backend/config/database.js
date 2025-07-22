const { Pool } = require('pg');
const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ACCESS_KEY_ID && { 
    accessKeyId: process.env.AWS_ACCESS_KEY_ID 
  }),
  ...(process.env.AWS_SECRET_ACCESS_KEY && { 
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY 
  })
});

const secretsManager = new AWS.SecretsManager();

let dbConfig = null;
let pool = null;

/**
 * Get database configuration from AWS Secrets Manager or environment variables
 */
const getDatabaseConfig = async () => {
  if (dbConfig) {
    return dbConfig;
  }

  try {
    // Try to get config from AWS Secrets Manager first
    if (process.env.DB_CREDENTIALS_SECRET_NAME) {
      console.log('Loading database credentials from AWS Secrets Manager...');
      
      const secretValue = await secretsManager.getSecretValue({
        SecretId: process.env.DB_CREDENTIALS_SECRET_NAME
      }).promise();

      const secret = JSON.parse(secretValue.SecretString);
      
      dbConfig = {
        host: secret.host,
        port: secret.port,
        database: secret.dbname,
        user: secret.username,
        password: secret.password,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };
    } else {
      // Fallback to environment variables
      console.log('Loading database credentials from environment variables...');
      
      dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'turoezpass',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };

      // Use DATABASE_URL if provided (common in deployment environments)
      if (process.env.DATABASE_URL) {
        dbConfig.connectionString = process.env.DATABASE_URL;
      }
    }

    console.log('Database configuration loaded successfully');
    return dbConfig;

  } catch (error) {
    console.error('Failed to load database configuration:', error);
    throw new Error('Database configuration failed');
  }
};

/**
 * Create and return database connection pool
 */
const getPool = async () => {
  if (pool) {
    return pool;
  }

  try {
    const config = await getDatabaseConfig();
    
    pool = new Pool(config);

    // Handle pool errors
    pool.on('error', (err, client) => {
      console.error('Database pool error:', err);
    });

    pool.on('connect', () => {
      console.log('New database client connected');
    });

    pool.on('remove', () => {
      console.log('Database client removed from pool');
    });

    // Test the connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    
    console.log('Database connection established at:', result.rows[0].now);
    return pool;

  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
};

/**
 * Execute a query with automatic connection management
 */
const query = async (text, params = []) => {
  const pool = await getPool();
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (process.env.LOG_LEVEL === 'debug') {
      console.log('Query executed:', { 
        text: text.substring(0, 100) + '...', 
        duration: `${duration}ms`, 
        rows: result.rowCount 
      });
    }
    
    return result;
  } catch (error) {
    console.error('Database query error:', {
      query: text.substring(0, 100) + '...',
      params: params,
      error: error.message
    });
    throw error;
  }
};

/**
 * Execute a transaction
 */
const transaction = async (callback) => {
  const pool = await getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check database health
 */
const healthCheck = async () => {
  try {
    const result = await query('SELECT 1 as healthy');
    return result.rows[0].healthy === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

/**
 * Close database connection pool
 */
const close = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    dbConfig = null;
    console.log('Database connection pool closed');
  }
};

/**
 * Initialize database tables (for development)
 */
const initializeTables = async () => {
  try {
    console.log('Initializing database tables...');
    
    // Users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cognito_sub VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        turo_host_id VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Jobs table
    await query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        turo_trip_id VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retry')),
        toll_amount DECIMAL(10,2) NOT NULL,
        toll_location VARCHAR(255) NOT NULL,
        trip_start_date TIMESTAMP WITH TIME ZONE NOT NULL,
        trip_end_date TIMESTAMP WITH TIME ZONE NOT NULL,
        proof_image_url TEXT,
        submission_attempts INTEGER DEFAULT 0,
        last_submission_date TIMESTAMP WITH TIME ZONE,
        submission_id VARCHAR(255),
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes for better performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_trip_dates ON jobs(trip_start_date, trip_end_date);
      CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // Create updated_at trigger function
    await query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for updated_at
    await query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
      CREATE TRIGGER update_jobs_updated_at
        BEFORE UPDATE ON jobs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    throw error;
  }
};

// Graceful shutdown
process.on('SIGINT', close);
process.on('SIGTERM', close);

module.exports = {
  query,
  transaction,
  getPool,
  healthCheck,
  close,
  initializeTables
};