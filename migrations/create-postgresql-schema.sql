-- Turo Toll Tracker - PostgreSQL Schema Migration
-- This file creates the complete database schema for PostgreSQL

-- Enable UUID extension for generating unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Hosts table
CREATE TABLE IF NOT EXISTS hosts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    turo_host_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Toll accounts table (E-ZPass, SunPass, etc.)
CREATE TABLE IF NOT EXISTS toll_accounts (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    provider VARCHAR(100) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_sync TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id)
);

-- Turo trips table
CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    turo_trip_id VARCHAR(100) UNIQUE NOT NULL,
    renter_name VARCHAR(255) NOT NULL,
    renter_email VARCHAR(255),
    vehicle_plate VARCHAR(20) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    trip_status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id)
);

-- Toll charges table
CREATE TABLE IF NOT EXISTS toll_charges (
    id SERIAL PRIMARY KEY,
    toll_account_id INTEGER NOT NULL,
    trip_id INTEGER,
    toll_date TIMESTAMP NOT NULL,
    toll_location TEXT NOT NULL,
    toll_amount DECIMAL(10,2) NOT NULL CHECK (toll_amount >= 0 AND toll_amount <= 200),
    plate_number VARCHAR(20),
    transaction_id VARCHAR(100) UNIQUE,
    is_matched BOOLEAN DEFAULT FALSE,
    match_timestamp TIMESTAMP,
    data_checksum TEXT,
    validation_status VARCHAR(50) DEFAULT 'pending',
    submitted_to_turo BOOLEAN DEFAULT FALSE,
    invoice_id INTEGER,
    submission_date TIMESTAMP,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (toll_account_id) REFERENCES toll_accounts(id),
    FOREIGN KEY (trip_id) REFERENCES trips(id)
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    processing_fee DECIMAL(10,2) DEFAULT 0 CHECK (processing_fee >= 0 AND processing_fee <= 25),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'paid', 'failed', 'cancelled')),
    sent_date TIMESTAMP,
    paid_date TIMESTAMP,
    turo_charge_id VARCHAR(100),
    data_checksum TEXT,
    validation_notes TEXT,
    toll_charge_ids TEXT,
    snapshot_data TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (trip_id) REFERENCES trips(id)
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL,
    toll_charge_id INTEGER NOT NULL,
    description TEXT,
    amount DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (toll_charge_id) REFERENCES toll_charges(id)
);

-- Transponder mappings table
CREATE TABLE IF NOT EXISTS transponder_mappings (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    transponder_number VARCHAR(50) NOT NULL,
    vehicle_plate VARCHAR(20) NOT NULL,
    vehicle_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id),
    UNIQUE(host_id, transponder_number)
);

-- Deleted transponder plates blacklist table
CREATE TABLE IF NOT EXISTS deleted_transponder_plates (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    vehicle_plate VARCHAR(20) NOT NULL,
    deleted_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id),
    UNIQUE(host_id, vehicle_plate)
);

-- Security audit logs table
CREATE TABLE IF NOT EXISTS security_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    details TEXT,
    severity VARCHAR(20) DEFAULT 'LOW',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Failed login attempts tracking
CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    attempt_time TIMESTAMP DEFAULT NOW(),
    success BOOLEAN DEFAULT FALSE,
    user_agent TEXT
);

-- Data integrity checkpoints table
CREATE TABLE IF NOT EXISTS data_checkpoints (
    id SERIAL PRIMARY KEY,
    checkpoint_type VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_count INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Database backup logs
CREATE TABLE IF NOT EXISTS backup_logs (
    id SERIAL PRIMARY KEY,
    backup_type VARCHAR(50) NOT NULL CHECK (backup_type IN ('full', 'incremental', 'manual')),
    file_path TEXT NOT NULL,
    file_size BIGINT,
    status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failed', 'in_progress')),
    error_message TEXT,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Data validation errors log
CREATE TABLE IF NOT EXISTS validation_errors (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER,
    field_name VARCHAR(100),
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);

-- Transaction audit log
CREATE TABLE IF NOT EXISTS transaction_log (
    id SERIAL PRIMARY KEY,
    transaction_id UUID NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    checksum TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    email_notifications BOOLEAN DEFAULT TRUE,
    toll_alerts BOOLEAN DEFAULT TRUE,
    weekly_summaries BOOLEAN DEFAULT TRUE,
    monthly_summaries BOOLEAN DEFAULT TRUE,
    system_alerts BOOLEAN DEFAULT TRUE,
    trip_completion BOOLEAN DEFAULT TRUE,
    invoice_notifications BOOLEAN DEFAULT TRUE,
    real_time_alerts BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id)
);

-- Notification queue table
CREATE TABLE IF NOT EXISTS notification_queue (
    id SERIAL PRIMARY KEY,
    recipient VARCHAR(255) NOT NULL,
    template_name VARCHAR(100) NOT NULL,
    template_data JSONB NOT NULL,
    subject TEXT,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    scheduled_time TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed')),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP
);

-- Notification delivery logs table
CREATE TABLE IF NOT EXISTS notification_logs (
    id SERIAL PRIMARY KEY,
    recipient VARCHAR(255) NOT NULL,
    template_name VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed', 'bounced')),
    message_id VARCHAR(255),
    error_message TEXT,
    priority VARCHAR(20) DEFAULT 'normal',
    delivery_time INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Notification events table
CREATE TABLE IF NOT EXISTS notification_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id INTEGER NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_scheduled TIMESTAMP,
    notification_sent_at TIMESTAMP,
    event_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Analytics metrics table
CREATE TABLE IF NOT EXISTS analytics_metrics (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,4),
    metric_count INTEGER,
    date_period VARCHAR(20) NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id),
    UNIQUE(host_id, metric_type, metric_name, date_period, period_start)
);

-- Financial analytics table
CREATE TABLE IF NOT EXISTS financial_analytics (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    total_toll_costs DECIMAL(10,2) DEFAULT 0,
    processing_fees DECIMAL(10,2) DEFAULT 0,
    net_profit DECIMAL(10,2) DEFAULT 0,
    trip_count INTEGER DEFAULT 0,
    toll_charge_count INTEGER DEFAULT 0,
    average_toll_per_trip DECIMAL(10,2) DEFAULT 0,
    cost_per_mile DECIMAL(10,4) DEFAULT 0,
    total_miles DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id),
    UNIQUE(host_id, period_type, period_start)
);

-- Performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    host_id INTEGER,
    metric_category VARCHAR(50) NOT NULL CHECK (metric_category IN ('toll_matching', 'ezpass_scraping', 'system_performance', 'data_quality')),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,4),
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    accuracy_rate DECIMAL(5,2) DEFAULT 0,
    processing_time_ms INTEGER,
    error_details TEXT,
    measured_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id)
);

-- Business intelligence reports table
CREATE TABLE IF NOT EXISTS bi_reports (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('toll_locations', 'seasonal_trends', 'vehicle_utilization', 'renter_behavior', 'route_analysis')),
    report_name VARCHAR(255) NOT NULL,
    report_data JSONB NOT NULL,
    report_summary TEXT,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    generated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id)
);

-- Predictive analytics table
CREATE TABLE IF NOT EXISTS predictive_analytics (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    prediction_type VARCHAR(50) NOT NULL CHECK (prediction_type IN ('toll_forecast', 'revenue_forecast', 'seasonal_demand', 'route_optimization')),
    model_name VARCHAR(100) NOT NULL,
    prediction_data JSONB NOT NULL,
    confidence_score DECIMAL(5,2),
    forecast_period_start TIMESTAMP NOT NULL,
    forecast_period_end TIMESTAMP NOT NULL,
    actual_values JSONB,
    accuracy_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id)
);

-- Automated reports queue table
CREATE TABLE IF NOT EXISTS automated_reports (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('weekly_summary', 'monthly_financial', 'performance_report', 'trend_analysis')),
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly')),
    last_generated TIMESTAMP,
    next_scheduled TIMESTAMP,
    report_config JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    delivery_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id)
);

-- Toll location analytics table
CREATE TABLE IF NOT EXISTS toll_location_analytics (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    toll_location TEXT NOT NULL,
    normalized_location TEXT NOT NULL,
    total_charges DECIMAL(10,2) DEFAULT 0,
    charge_count INTEGER DEFAULT 0,
    average_charge DECIMAL(10,2) DEFAULT 0,
    peak_hours TEXT,
    seasonal_patterns TEXT,
    vehicle_types TEXT,
    first_seen TIMESTAMP,
    last_seen TIMESTAMP,
    month_year VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id),
    UNIQUE(host_id, normalized_location, month_year)
);

-- Vehicle performance analytics
CREATE TABLE IF NOT EXISTS vehicle_analytics (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    vehicle_plate VARCHAR(20) NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    trip_count INTEGER DEFAULT 0,
    total_toll_costs DECIMAL(10,2) DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    average_toll_per_trip DECIMAL(10,2) DEFAULT 0,
    utilization_rate DECIMAL(5,2) DEFAULT 0,
    profit_margin DECIMAL(5,2) DEFAULT 0,
    top_toll_locations TEXT,
    performance_score DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id),
    UNIQUE(host_id, vehicle_plate, period_start)
);

-- Late tolls detected table
CREATE TABLE IF NOT EXISTS late_tolls_detected (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL,
    toll_charge_id INTEGER NOT NULL,
    original_invoice_id INTEGER,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    detection_date TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved', 'waived')),
    resolution_notes TEXT,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (trip_id) REFERENCES trips(id),
    FOREIGN KEY (toll_charge_id) REFERENCES toll_charges(id),
    FOREIGN KEY (original_invoice_id) REFERENCES invoices(id),
    UNIQUE(trip_id, toll_charge_id)
);

-- Additional tables that may be referenced in the application
CREATE TABLE IF NOT EXISTS trip_status_history (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_at TIMESTAMP DEFAULT NOW(),
    changed_by VARCHAR(100),
    FOREIGN KEY (trip_id) REFERENCES trips(id)
);

CREATE TABLE IF NOT EXISTS trip_status_intelligence (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL,
    predicted_status VARCHAR(50),
    confidence_score DECIMAL(5,2),
    factors JSONB,
    prediction_date TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (trip_id) REFERENCES trips(id)
);

CREATE TABLE IF NOT EXISTS user_trip_patterns (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    pattern_type VARCHAR(50) NOT NULL,
    pattern_data JSONB NOT NULL,
    confidence_score DECIMAL(5,2),
    last_updated TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id)
);

CREATE TABLE IF NOT EXISTS ml_timing_patterns (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL,
    pattern_name VARCHAR(100) NOT NULL,
    pattern_data JSONB NOT NULL,
    accuracy_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (host_id) REFERENCES hosts(id)
);

-- Create all indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_trips_dates ON trips(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_trips_host_status ON trips(host_id, trip_status, start_date);
CREATE INDEX IF NOT EXISTS idx_trips_plate_dates ON trips(vehicle_plate, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_toll_charges_date ON toll_charges(toll_date);
CREATE INDEX IF NOT EXISTS idx_toll_charges_trip ON toll_charges(trip_id);
CREATE INDEX IF NOT EXISTS idx_toll_charges_transaction ON toll_charges(transaction_id);
CREATE INDEX IF NOT EXISTS idx_toll_charges_checksum ON toll_charges(data_checksum);
CREATE INDEX IF NOT EXISTS idx_toll_charges_account_date ON toll_charges(toll_account_id, toll_date);
CREATE INDEX IF NOT EXISTS idx_toll_charges_matched ON toll_charges(is_matched, toll_date);
CREATE INDEX IF NOT EXISTS idx_toll_charges_plate_date ON toll_charges(plate_number, toll_date);
CREATE INDEX IF NOT EXISTS idx_toll_charges_location ON toll_charges(toll_location, toll_date);
CREATE INDEX IF NOT EXISTS idx_toll_charges_submitted ON toll_charges(submitted_to_turo);
CREATE INDEX IF NOT EXISTS idx_toll_charges_invoice_id ON toll_charges(invoice_id);

CREATE INDEX IF NOT EXISTS idx_hosts_email ON hosts(email);
CREATE INDEX IF NOT EXISTS idx_toll_accounts_host_active ON toll_accounts(host_id, is_active);
CREATE INDEX IF NOT EXISTS idx_toll_accounts_provider ON toll_accounts(provider, host_id);

CREATE INDEX IF NOT EXISTS idx_invoices_trip_status ON invoices(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_status_date ON invoices(status, created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_toll ON invoice_items(toll_charge_id);

CREATE INDEX IF NOT EXISTS idx_security_logs_type ON security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_logs_date ON security_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempt_time);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_toll_charges_updated_at BEFORE UPDATE ON toll_charges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hosts_updated_at BEFORE UPDATE ON hosts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transponder_mappings_updated_at BEFORE UPDATE ON transponder_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create constraint to validate trip dates
ALTER TABLE trips ADD CONSTRAINT check_trip_dates CHECK (start_date < end_date);

COMMIT;