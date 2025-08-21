-- Supabase Database Schema for Turo Toll Tracker
-- This schema is compatible with the existing SQLite structure
-- but uses PostgreSQL features and Supabase Auth integration

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================
-- HOSTS TABLE (Modified for Supabase Auth)
-- ==============================================
-- This table extends Supabase auth.users with additional host-specific data
CREATE TABLE hosts (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    turo_host_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policy for hosts
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own host data" ON hosts 
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own host data" ON hosts 
    FOR UPDATE USING (auth.uid() = id);

-- ==============================================
-- TOLL ACCOUNTS TABLE
-- ==============================================
CREATE TABLE toll_accounts (
    id BIGSERIAL PRIMARY KEY,
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    account_number TEXT NOT NULL,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_sync TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policy for toll_accounts
ALTER TABLE toll_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own toll accounts" ON toll_accounts 
    FOR ALL USING (auth.uid() = host_id);

-- ==============================================
-- TRIPS TABLE
-- ==============================================
CREATE TABLE trips (
    id BIGSERIAL PRIMARY KEY,
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    turo_trip_id TEXT UNIQUE NOT NULL,
    renter_name TEXT NOT NULL,
    renter_email TEXT,
    vehicle_plate TEXT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    trip_status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_trip_dates CHECK (start_date < end_date)
);

-- RLS policy for trips
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own trips" ON trips 
    FOR ALL USING (auth.uid() = host_id);

-- ==============================================
-- TOLL CHARGES TABLE
-- ==============================================
CREATE TABLE toll_charges (
    id BIGSERIAL PRIMARY KEY,
    toll_account_id BIGINT NOT NULL REFERENCES toll_accounts(id) ON DELETE CASCADE,
    trip_id BIGINT REFERENCES trips(id) ON DELETE SET NULL,
    toll_date TIMESTAMPTZ NOT NULL,
    toll_location TEXT NOT NULL,
    toll_amount DECIMAL(10,2) NOT NULL CHECK (toll_amount >= 0 AND toll_amount <= 200),
    plate_number TEXT,
    transponder_id TEXT,
    transaction_id TEXT UNIQUE,
    is_matched BOOLEAN DEFAULT FALSE,
    match_timestamp TIMESTAMPTZ,
    data_checksum TEXT,
    validation_status TEXT DEFAULT 'pending',
    submitted_to_turo BOOLEAN DEFAULT FALSE,
    invoice_id BIGINT,
    submission_date TIMESTAMPTZ,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policy for toll_charges (through toll_account relationship)
ALTER TABLE toll_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage toll charges for own accounts" ON toll_charges 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM toll_accounts 
            WHERE toll_accounts.id = toll_charges.toll_account_id 
            AND toll_accounts.host_id = auth.uid()
        )
    );

-- ==============================================
-- INVOICES TABLE
-- ==============================================
CREATE TABLE invoices (
    id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    invoice_number TEXT UNIQUE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    processing_fee DECIMAL(10,2) DEFAULT 0 CHECK (processing_fee >= 0 AND processing_fee <= 25),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'paid', 'failed', 'cancelled')),
    sent_date TIMESTAMPTZ,
    paid_date TIMESTAMPTZ,
    turo_charge_id TEXT,
    data_checksum TEXT,
    validation_notes TEXT,
    toll_charge_ids TEXT, -- JSON array of toll charge IDs
    snapshot_data TEXT, -- JSON snapshot of toll data at invoice creation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policy for invoices (through trip relationship)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage invoices for own trips" ON invoices 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = invoices.trip_id 
            AND trips.host_id = auth.uid()
        )
    );

-- ==============================================
-- INVOICE ITEMS TABLE
-- ==============================================
CREATE TABLE invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    toll_charge_id BIGINT NOT NULL REFERENCES toll_charges(id) ON DELETE CASCADE,
    description TEXT,
    amount DECIMAL(10,2) NOT NULL
);

-- RLS policy for invoice_items (through invoice relationship)
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage invoice items for own invoices" ON invoice_items 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM invoices 
            JOIN trips ON trips.id = invoices.trip_id
            WHERE invoices.id = invoice_items.invoice_id 
            AND trips.host_id = auth.uid()
        )
    );

-- ==============================================
-- TRANSPONDER MAPPINGS TABLE
-- ==============================================
CREATE TABLE transponder_mappings (
    id BIGSERIAL PRIMARY KEY,
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    transponder_number TEXT NOT NULL,
    vehicle_plate TEXT NOT NULL,
    vehicle_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(host_id, transponder_number)
);

-- RLS policy for transponder_mappings
ALTER TABLE transponder_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own transponder mappings" ON transponder_mappings 
    FOR ALL USING (auth.uid() = host_id);

-- ==============================================
-- DELETED TRANSPONDER PLATES TABLE
-- ==============================================
CREATE TABLE deleted_transponder_plates (
    id BIGSERIAL PRIMARY KEY,
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    vehicle_plate TEXT NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(host_id, vehicle_plate)
);

-- RLS policy for deleted_transponder_plates
ALTER TABLE deleted_transponder_plates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own deleted plates" ON deleted_transponder_plates 
    FOR ALL USING (auth.uid() = host_id);

-- ==============================================
-- LATE TOLLS DETECTED TABLE
-- ==============================================
CREATE TABLE late_tolls_detected (
    id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    toll_charge_id BIGINT NOT NULL REFERENCES toll_charges(id) ON DELETE CASCADE,
    original_invoice_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    detection_date TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved', 'waived')),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(trip_id, toll_charge_id)
);

-- RLS policy for late_tolls_detected (through trip relationship)
ALTER TABLE late_tolls_detected ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage late tolls for own trips" ON late_tolls_detected 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = late_tolls_detected.trip_id 
            AND trips.host_id = auth.uid()
        )
    );

-- ==============================================
-- PERFORMANCE INDEXES
-- ==============================================

-- Core performance indexes
CREATE INDEX idx_trips_dates ON trips(start_date, end_date);
CREATE INDEX idx_trips_host_status ON trips(host_id, trip_status, start_date);
CREATE INDEX idx_trips_plate_dates ON trips(vehicle_plate, start_date, end_date);

-- Toll charges performance indexes
CREATE INDEX idx_toll_charges_date ON toll_charges(toll_date);
CREATE INDEX idx_toll_charges_trip ON toll_charges(trip_id);
CREATE INDEX idx_toll_charges_transaction ON toll_charges(transaction_id);
CREATE INDEX idx_toll_charges_account_date ON toll_charges(toll_account_id, toll_date);
CREATE INDEX idx_toll_charges_matched ON toll_charges(is_matched, toll_date);
CREATE INDEX idx_toll_charges_plate_date ON toll_charges(plate_number, toll_date);
CREATE INDEX idx_toll_charges_location ON toll_charges(toll_location, toll_date);

-- Invoice performance indexes
CREATE INDEX idx_invoices_trip_status ON invoices(trip_id, status);
CREATE INDEX idx_invoices_status_date ON invoices(status, created_at);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_toll ON invoice_items(toll_charge_id);

-- Transponder mapping indexes
CREATE INDEX idx_transponder_mappings_host ON transponder_mappings(host_id);
CREATE INDEX idx_transponder_mappings_transponder ON transponder_mappings(transponder_number);
CREATE INDEX idx_transponder_mappings_plate ON transponder_mappings(vehicle_plate, host_id);
CREATE INDEX idx_transponder_mappings_active ON transponder_mappings(is_active, host_id);

-- Toll memory tracking system indexes
CREATE INDEX idx_toll_charges_submitted ON toll_charges(submitted_to_turo);
CREATE INDEX idx_toll_charges_invoice_id ON toll_charges(invoice_id);
CREATE INDEX idx_toll_charges_submission_date ON toll_charges(submission_date);
CREATE INDEX idx_late_tolls_status ON late_tolls_detected(status);
CREATE INDEX idx_late_tolls_detection_date ON late_tolls_detected(detection_date);

-- ==============================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- ==============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER update_hosts_updated_at BEFORE UPDATE ON hosts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_toll_charges_updated_at BEFORE UPDATE ON toll_charges 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transponder_mappings_updated_at BEFORE UPDATE ON transponder_mappings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- FUNCTIONS FOR DATA MIGRATION
-- ==============================================

-- Function to migrate a SQLite host to Supabase auth user
CREATE OR REPLACE FUNCTION migrate_host_to_auth(
    p_email TEXT,
    p_full_name TEXT,
    p_turo_host_id TEXT DEFAULT NULL,
    p_password TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
BEGIN
    -- Insert into hosts table (Supabase auth will handle user creation)
    INSERT INTO hosts (id, email, full_name, turo_host_id, created_at, updated_at)
    VALUES (gen_random_uuid(), p_email, p_full_name, p_turo_host_id, NOW(), NOW())
    RETURNING id INTO new_user_id;
    
    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================
-- ADMIN FUNCTIONS (Disable RLS for data migration)
-- ==============================================

-- Function to temporarily disable RLS for data migration
CREATE OR REPLACE FUNCTION disable_rls_for_migration()
RETURNS VOID AS $$
BEGIN
    ALTER TABLE hosts DISABLE ROW LEVEL SECURITY;
    ALTER TABLE toll_accounts DISABLE ROW LEVEL SECURITY;
    ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
    ALTER TABLE toll_charges DISABLE ROW LEVEL SECURITY;
    ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
    ALTER TABLE invoice_items DISABLE ROW LEVEL SECURITY;
    ALTER TABLE transponder_mappings DISABLE ROW LEVEL SECURITY;
    ALTER TABLE deleted_transponder_plates DISABLE ROW LEVEL SECURITY;
    ALTER TABLE late_tolls_detected DISABLE ROW LEVEL SECURITY;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to re-enable RLS after migration
CREATE OR REPLACE FUNCTION enable_rls_after_migration()
RETURNS VOID AS $$
BEGIN
    ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE toll_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
    ALTER TABLE toll_charges ENABLE ROW LEVEL SECURITY;
    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE transponder_mappings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE deleted_transponder_plates ENABLE ROW LEVEL SECURITY;
    ALTER TABLE late_tolls_detected ENABLE ROW LEVEL SECURITY;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================
-- REAL-TIME SUBSCRIPTIONS SETUP
-- ==============================================

-- Enable real-time for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE toll_charges;
ALTER PUBLICATION supabase_realtime ADD TABLE trips;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE transponder_mappings;

-- ==============================================
-- SETUP COMPLETE MESSAGE
-- ==============================================

-- This will appear in the Supabase logs
DO $$
BEGIN
    RAISE NOTICE 'Turo Toll Tracker schema setup complete!';
    RAISE NOTICE 'Remember to:';
    RAISE NOTICE '1. Update SUPABASE_URL and keys in your .env file';
    RAISE NOTICE '2. Run the data migration script';
    RAISE NOTICE '3. Test authentication flows';
    RAISE NOTICE '4. Enable email confirmations in Supabase Auth settings if needed';
END;
$$;