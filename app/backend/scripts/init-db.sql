-- Turo EZPass Database Initialization Script
-- This script creates the initial database schema and seed data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cognito_sub VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    turo_host_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_trip_dates ON jobs(trip_start_date, trip_end_date);
CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert seed data for development (optional)
-- Uncomment the following lines to add test data

-- INSERT INTO users (cognito_sub, email, name, turo_host_id) VALUES
-- ('test-cognito-sub-1', 'testuser@example.com', 'Test User', 'HOST123')
-- ON CONFLICT (email) DO NOTHING;

-- INSERT INTO jobs (user_id, turo_trip_id, toll_amount, toll_location, trip_start_date, trip_end_date, status) VALUES
-- ((SELECT id FROM users WHERE email = 'testuser@example.com' LIMIT 1), 'TRIP001', 16.00, 'Holland Tunnel', '2024-01-15 10:00:00+00', '2024-01-15 18:00:00+00', 'pending')
-- ON CONFLICT DO NOTHING;