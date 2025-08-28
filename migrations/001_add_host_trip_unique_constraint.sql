-- Migration: Add host-scoped unique constraint to prevent cross-account data contamination
-- This is Phase 1 of the comprehensive fix outlined in the datacrossing analysis document

-- Step 1: Add composite unique constraint on (host_id, turo_trip_id)
-- This prevents the same Turo trip from existing multiple times across different hosts
ALTER TABLE trips 
ADD CONSTRAINT trips_host_turo_trip_unique 
UNIQUE (host_id, turo_trip_id);

-- Step 2: Add comment to document the constraint's purpose
COMMENT ON CONSTRAINT trips_host_turo_trip_unique ON trips 
IS 'Prevents duplicate Turo trip IDs within the same host account, ensuring proper multi-tenant data isolation';

-- Step 3: Enable Row-Level Security on trips table
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policy for trips table
-- This ensures users can only access their own trips
CREATE POLICY trips_host_isolation_policy ON trips
    FOR ALL
    USING (host_id = current_setting('app.host_id')::uuid)
    WITH CHECK (host_id = current_setting('app.host_id')::uuid);

-- Step 5: Enable RLS on toll_charges table
ALTER TABLE toll_charges ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policy for toll_charges table
CREATE POLICY toll_charges_host_isolation_policy ON toll_charges
    FOR ALL
    USING (host_id = current_setting('app.host_id')::uuid)
    WITH CHECK (host_id = current_setting('app.host_id')::uuid);

-- Step 7: Enable RLS on other critical tables
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transponder_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_accounts ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies for other tables
CREATE POLICY invoices_host_isolation_policy ON invoices
    FOR ALL
    USING (host_id = current_setting('app.host_id')::uuid)
    WITH CHECK (host_id = current_setting('app.host_id')::uuid);

CREATE POLICY invoice_items_host_isolation_policy ON invoice_items
    FOR ALL
    USING (host_id = current_setting('app.host_id')::uuid)
    WITH CHECK (host_id = current_setting('app.host_id')::uuid);

CREATE POLICY transponder_mappings_host_isolation_policy ON transponder_mappings
    FOR ALL
    USING (host_id = current_setting('app.host_id')::uuid)
    WITH CHECK (host_id = current_setting('app.host_id')::uuid);

CREATE POLICY toll_accounts_host_isolation_policy ON toll_accounts
    FOR ALL
    USING (host_id = current_setting('app.host_id')::uuid)
    WITH CHECK (host_id = current_setting('app.host_id')::uuid);