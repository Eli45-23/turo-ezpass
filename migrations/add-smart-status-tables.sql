-- Enhanced Smart Status System Database Tables
-- Run this migration to add intelligence tracking

-- Trip status intelligence table
CREATE TABLE IF NOT EXISTS trip_status_intelligence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    host_id INTEGER NOT NULL,
    
    -- Status analysis results
    time_based_status VARCHAR(20),
    toll_based_status VARCHAR(20),
    pattern_based_status VARCHAR(20),
    final_status VARCHAR(20),
    
    -- Confidence scores (0.0 - 1.0)
    time_confidence DECIMAL(3,2),
    toll_confidence DECIMAL(3,2),
    pattern_confidence DECIMAL(3,2),
    overall_confidence DECIMAL(3,2),
    
    -- Analysis details
    toll_count INTEGER DEFAULT 0,
    toll_date_range_days INTEGER DEFAULT 0,
    has_toll_activity BOOLEAN DEFAULT 0,
    needs_review BOOLEAN DEFAULT 0,
    
    -- Manual overrides
    manual_override VARCHAR(20) NULL,
    manual_override_reason TEXT NULL,
    manual_override_at TIMESTAMP NULL,
    
    -- Timestamps
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
);

-- User pattern learning table
CREATE TABLE IF NOT EXISTS user_trip_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id INTEGER NOT NULL,
    
    -- Pattern statistics
    total_trips INTEGER DEFAULT 0,
    canceled_trips INTEGER DEFAULT 0,
    extended_trips INTEGER DEFAULT 0,
    early_return_trips INTEGER DEFAULT 0,
    
    -- Average behaviors
    avg_extension_hours DECIMAL(5,2) DEFAULT 0,
    avg_early_return_hours DECIMAL(5,2) DEFAULT 0,
    
    -- Toll patterns
    avg_tolls_per_trip DECIMAL(5,2) DEFAULT 0,
    trips_with_tolls INTEGER DEFAULT 0,
    
    -- Confidence in patterns
    pattern_confidence DECIMAL(3,2) DEFAULT 0.5,
    data_points INTEGER DEFAULT 0,
    
    -- Timestamps
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
);

-- Status change history for learning
CREATE TABLE IF NOT EXISTS trip_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    host_id INTEGER NOT NULL,
    
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    change_source VARCHAR(50), -- 'auto', 'manual', 'csv_import', 'toll_analysis'
    confidence_score DECIMAL(3,2),
    
    change_reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_status_intelligence_trip_id ON trip_status_intelligence(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_status_intelligence_host_id ON trip_status_intelligence(host_id);
CREATE INDEX IF NOT EXISTS idx_user_trip_patterns_host_id ON user_trip_patterns(host_id);
CREATE INDEX IF NOT EXISTS idx_trip_status_history_trip_id ON trip_status_history(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_status_history_host_id ON trip_status_history(host_id);