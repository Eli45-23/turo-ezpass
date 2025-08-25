-- ===================================================================
-- COMPREHENSIVE MIGRATION TO FIX MULTI-USER DATA ISOLATION
-- ===================================================================
-- This migration fixes the current broken multi-user isolation by:
-- 1. Removing redundant user_id columns from all tables except hosts
-- 2. Adding proper foreign key constraints
-- 3. Creating proper cascading RLS policies
-- 4. Adding performance indexes
-- ===================================================================

-- STEP 1: BACKUP CURRENT STATE AND DISABLE RLS TEMPORARILY
-- ===================================================================

-- Create backup tables before making changes
CREATE TABLE backup_current_policies AS 
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Temporarily disable RLS to perform schema changes
ALTER TABLE hosts DISABLE ROW LEVEL SECURITY;
ALTER TABLE toll_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE toll_charges DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE transponder_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_transponder_plates DISABLE ROW LEVEL SECURITY;
ALTER TABLE late_tolls_detected DISABLE ROW LEVEL SECURITY;

-- STEP 2: DROP ALL EXISTING INCORRECT RLS POLICIES
-- ===================================================================

-- Drop all current policies
DROP POLICY IF EXISTS "rls_hosts_select" ON hosts;
DROP POLICY IF EXISTS "rls_hosts_update" ON hosts;

DROP POLICY IF EXISTS "rls_toll_accounts_select" ON toll_accounts;
DROP POLICY IF EXISTS "rls_toll_accounts_insert" ON toll_accounts;
DROP POLICY IF EXISTS "rls_toll_accounts_update" ON toll_accounts;
DROP POLICY IF EXISTS "rls_toll_accounts_delete" ON toll_accounts;

DROP POLICY IF EXISTS "rls_trips_select" ON trips;
DROP POLICY IF EXISTS "rls_trips_insert" ON trips;
DROP POLICY IF EXISTS "rls_trips_update" ON trips;
DROP POLICY IF EXISTS "rls_trips_delete" ON trips;

DROP POLICY IF EXISTS "rls_toll_charges_select" ON toll_charges;
DROP POLICY IF EXISTS "rls_toll_charges_insert" ON toll_charges;
DROP POLICY IF EXISTS "rls_toll_charges_update" ON toll_charges;
DROP POLICY IF EXISTS "rls_toll_charges_delete" ON toll_charges;

DROP POLICY IF EXISTS "rls_invoices_select" ON invoices;
DROP POLICY IF EXISTS "rls_invoices_insert" ON invoices;
DROP POLICY IF EXISTS "rls_invoices_update" ON invoices;
DROP POLICY IF EXISTS "rls_invoices_delete" ON invoices;

DROP POLICY IF EXISTS "rls_invoice_items_select" ON invoice_items;
DROP POLICY IF EXISTS "rls_invoice_items_insert" ON invoice_items;
DROP POLICY IF EXISTS "rls_invoice_items_update" ON invoice_items;
DROP POLICY IF EXISTS "rls_invoice_items_delete" ON invoice_items;

DROP POLICY IF EXISTS "rls_transponder_mappings_select" ON transponder_mappings;
DROP POLICY IF EXISTS "rls_transponder_mappings_insert" ON transponder_mappings;
DROP POLICY IF EXISTS "rls_transponder_mappings_update" ON transponder_mappings;
DROP POLICY IF EXISTS "rls_transponder_mappings_delete" ON transponder_mappings;

DROP POLICY IF EXISTS "rls_deleted_transponder_plates_select" ON deleted_transponder_plates;
DROP POLICY IF EXISTS "rls_deleted_transponder_plates_insert" ON deleted_transponder_plates;
DROP POLICY IF EXISTS "rls_deleted_transponder_plates_update" ON deleted_transponder_plates;
DROP POLICY IF EXISTS "rls_deleted_transponder_plates_delete" ON deleted_transponder_plates;

DROP POLICY IF EXISTS "rls_late_tolls_detected_select" ON late_tolls_detected;
DROP POLICY IF EXISTS "rls_late_tolls_detected_insert" ON late_tolls_detected;
DROP POLICY IF EXISTS "rls_late_tolls_detected_update" ON late_tolls_detected;
DROP POLICY IF EXISTS "rls_late_tolls_detected_delete" ON late_tolls_detected;

-- STEP 3: REMOVE REDUNDANT USER_ID COLUMNS
-- ===================================================================

-- Remove user_id from toll_accounts (keep host_id)
ALTER TABLE toll_accounts DROP COLUMN IF EXISTS user_id;

-- Remove user_id from trips (keep host_id)  
ALTER TABLE trips DROP COLUMN IF EXISTS user_id;

-- Remove user_id from toll_charges (access via toll_accounts)
ALTER TABLE toll_charges DROP COLUMN IF EXISTS user_id;

-- Remove user_id from invoices (access via trips)
ALTER TABLE invoices DROP COLUMN IF EXISTS user_id;

-- Remove user_id from invoice_items (access via invoices)
ALTER TABLE invoice_items DROP COLUMN IF EXISTS user_id;

-- Remove user_id from transponder_mappings (keep host_id)
ALTER TABLE transponder_mappings DROP COLUMN IF EXISTS user_id;

-- Remove user_id from deleted_transponder_plates (keep host_id)
ALTER TABLE deleted_transponder_plates DROP COLUMN IF EXISTS user_id;

-- Remove user_id from late_tolls_detected (access via trips)
ALTER TABLE late_tolls_detected DROP COLUMN IF EXISTS user_id;

-- STEP 4: ADD PROPER FOREIGN KEY CONSTRAINTS
-- ===================================================================

-- hosts.id references auth.users(id)
ALTER TABLE hosts ADD CONSTRAINT hosts_id_fkey 
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- toll_accounts.host_id references hosts(id)
ALTER TABLE toll_accounts ADD CONSTRAINT toll_accounts_host_id_fkey 
    FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE;

-- trips.host_id references hosts(id)
ALTER TABLE trips ADD CONSTRAINT trips_host_id_fkey 
    FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE;

-- toll_charges.toll_account_id references toll_accounts(id)
ALTER TABLE toll_charges ADD CONSTRAINT toll_charges_toll_account_id_fkey 
    FOREIGN KEY (toll_account_id) REFERENCES toll_accounts(id) ON DELETE CASCADE;

-- toll_charges.trip_id references trips(id) (optional)
ALTER TABLE toll_charges ADD CONSTRAINT toll_charges_trip_id_fkey 
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL;

-- invoices.trip_id references trips(id)
ALTER TABLE invoices ADD CONSTRAINT invoices_trip_id_fkey 
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;

-- invoice_items.invoice_id references invoices(id)
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey 
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

-- invoice_items.toll_charge_id references toll_charges(id)
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_toll_charge_id_fkey 
    FOREIGN KEY (toll_charge_id) REFERENCES toll_charges(id) ON DELETE CASCADE;

-- transponder_mappings.host_id references hosts(id)
ALTER TABLE transponder_mappings ADD CONSTRAINT transponder_mappings_host_id_fkey 
    FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE;

-- deleted_transponder_plates.host_id references hosts(id)
ALTER TABLE deleted_transponder_plates ADD CONSTRAINT deleted_transponder_plates_host_id_fkey 
    FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE;

-- late_tolls_detected.trip_id references trips(id)
ALTER TABLE late_tolls_detected ADD CONSTRAINT late_tolls_detected_trip_id_fkey 
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;

-- late_tolls_detected.toll_charge_id references toll_charges(id)
ALTER TABLE late_tolls_detected ADD CONSTRAINT late_tolls_detected_toll_charge_id_fkey 
    FOREIGN KEY (toll_charge_id) REFERENCES toll_charges(id) ON DELETE CASCADE;

-- late_tolls_detected.original_invoice_id references invoices(id) (optional)
ALTER TABLE late_tolls_detected ADD CONSTRAINT late_tolls_detected_original_invoice_id_fkey 
    FOREIGN KEY (original_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- STEP 5: ADD PERFORMANCE INDEXES
-- ===================================================================

-- Create indexes for RLS policy performance
CREATE INDEX IF NOT EXISTS idx_toll_accounts_host_id ON toll_accounts(host_id);
CREATE INDEX IF NOT EXISTS idx_trips_host_id ON trips(host_id);
CREATE INDEX IF NOT EXISTS idx_toll_charges_toll_account_id ON toll_charges(toll_account_id);
CREATE INDEX IF NOT EXISTS idx_toll_charges_trip_id ON toll_charges(trip_id);
CREATE INDEX IF NOT EXISTS idx_invoices_trip_id ON invoices(trip_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_toll_charge_id ON invoice_items(toll_charge_id);
CREATE INDEX IF NOT EXISTS idx_transponder_mappings_host_id ON transponder_mappings(host_id);
CREATE INDEX IF NOT EXISTS idx_deleted_transponder_plates_host_id ON deleted_transponder_plates(host_id);
CREATE INDEX IF NOT EXISTS idx_late_tolls_detected_trip_id ON late_tolls_detected(trip_id);
CREATE INDEX IF NOT EXISTS idx_late_tolls_detected_toll_charge_id ON late_tolls_detected(toll_charge_id);

-- STEP 6: CREATE PROPER RLS POLICIES
-- ===================================================================

-- Re-enable RLS on all tables
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transponder_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_transponder_plates ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_tolls_detected ENABLE ROW LEVEL SECURITY;

-- HOSTS TABLE POLICIES (direct auth.uid() check)
-- ===================================================================
CREATE POLICY "Users can view their own host data" ON hosts 
    FOR SELECT TO authenticated 
    USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update their own host data" ON hosts 
    FOR UPDATE TO authenticated 
    USING ((SELECT auth.uid()) = id)
    WITH CHECK ((SELECT auth.uid()) = id);

-- TOLL ACCOUNTS POLICIES (check host_id)
-- ===================================================================
CREATE POLICY "Users can view their own toll accounts" ON toll_accounts 
    FOR SELECT TO authenticated 
    USING ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can create their own toll accounts" ON toll_accounts 
    FOR INSERT TO authenticated 
    WITH CHECK ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can update their own toll accounts" ON toll_accounts 
    FOR UPDATE TO authenticated 
    USING ((SELECT auth.uid()) = host_id)
    WITH CHECK ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can delete their own toll accounts" ON toll_accounts 
    FOR DELETE TO authenticated 
    USING ((SELECT auth.uid()) = host_id);

-- TRIPS POLICIES (check host_id)
-- ===================================================================
CREATE POLICY "Users can view their own trips" ON trips 
    FOR SELECT TO authenticated 
    USING ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can create their own trips" ON trips 
    FOR INSERT TO authenticated 
    WITH CHECK ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can update their own trips" ON trips 
    FOR UPDATE TO authenticated 
    USING ((SELECT auth.uid()) = host_id)
    WITH CHECK ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can delete their own trips" ON trips 
    FOR DELETE TO authenticated 
    USING ((SELECT auth.uid()) = host_id);

-- TOLL CHARGES POLICIES (check through toll_accounts)
-- ===================================================================
CREATE POLICY "Users can view toll charges for their accounts" ON toll_charges 
    FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM toll_accounts 
            WHERE toll_accounts.id = toll_charges.toll_account_id 
            AND toll_accounts.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can create toll charges for their accounts" ON toll_charges 
    FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM toll_accounts 
            WHERE toll_accounts.id = toll_charges.toll_account_id 
            AND toll_accounts.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can update toll charges for their accounts" ON toll_charges 
    FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM toll_accounts 
            WHERE toll_accounts.id = toll_charges.toll_account_id 
            AND toll_accounts.host_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM toll_accounts 
            WHERE toll_accounts.id = toll_charges.toll_account_id 
            AND toll_accounts.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can delete toll charges for their accounts" ON toll_charges 
    FOR DELETE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM toll_accounts 
            WHERE toll_accounts.id = toll_charges.toll_account_id 
            AND toll_accounts.host_id = (SELECT auth.uid())
        )
    );

-- INVOICES POLICIES (check through trips)
-- ===================================================================
CREATE POLICY "Users can view invoices for their trips" ON invoices 
    FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = invoices.trip_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can create invoices for their trips" ON invoices 
    FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = invoices.trip_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can update invoices for their trips" ON invoices 
    FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = invoices.trip_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = invoices.trip_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can delete invoices for their trips" ON invoices 
    FOR DELETE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = invoices.trip_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

-- INVOICE ITEMS POLICIES (check through invoices->trips)
-- ===================================================================
CREATE POLICY "Users can view invoice items for their invoices" ON invoice_items 
    FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM invoices 
            JOIN trips ON trips.id = invoices.trip_id
            WHERE invoices.id = invoice_items.invoice_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can create invoice items for their invoices" ON invoice_items 
    FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM invoices 
            JOIN trips ON trips.id = invoices.trip_id
            WHERE invoices.id = invoice_items.invoice_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can update invoice items for their invoices" ON invoice_items 
    FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM invoices 
            JOIN trips ON trips.id = invoices.trip_id
            WHERE invoices.id = invoice_items.invoice_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM invoices 
            JOIN trips ON trips.id = invoices.trip_id
            WHERE invoices.id = invoice_items.invoice_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can delete invoice items for their invoices" ON invoice_items 
    FOR DELETE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM invoices 
            JOIN trips ON trips.id = invoices.trip_id
            WHERE invoices.id = invoice_items.invoice_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

-- TRANSPONDER MAPPINGS POLICIES (check host_id)
-- ===================================================================
CREATE POLICY "Users can view their own transponder mappings" ON transponder_mappings 
    FOR SELECT TO authenticated 
    USING ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can create their own transponder mappings" ON transponder_mappings 
    FOR INSERT TO authenticated 
    WITH CHECK ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can update their own transponder mappings" ON transponder_mappings 
    FOR UPDATE TO authenticated 
    USING ((SELECT auth.uid()) = host_id)
    WITH CHECK ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can delete their own transponder mappings" ON transponder_mappings 
    FOR DELETE TO authenticated 
    USING ((SELECT auth.uid()) = host_id);

-- DELETED TRANSPONDER PLATES POLICIES (check host_id)
-- ===================================================================
CREATE POLICY "Users can view their own deleted plates" ON deleted_transponder_plates 
    FOR SELECT TO authenticated 
    USING ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can create their own deleted plates" ON deleted_transponder_plates 
    FOR INSERT TO authenticated 
    WITH CHECK ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can update their own deleted plates" ON deleted_transponder_plates 
    FOR UPDATE TO authenticated 
    USING ((SELECT auth.uid()) = host_id)
    WITH CHECK ((SELECT auth.uid()) = host_id);

CREATE POLICY "Users can delete their own deleted plates" ON deleted_transponder_plates 
    FOR DELETE TO authenticated 
    USING ((SELECT auth.uid()) = host_id);

-- LATE TOLLS DETECTED POLICIES (check through trips)
-- ===================================================================
CREATE POLICY "Users can view late tolls for their trips" ON late_tolls_detected 
    FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = late_tolls_detected.trip_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can create late tolls for their trips" ON late_tolls_detected 
    FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = late_tolls_detected.trip_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can update late tolls for their trips" ON late_tolls_detected 
    FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = late_tolls_detected.trip_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = late_tolls_detected.trip_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can delete late tolls for their trips" ON late_tolls_detected 
    FOR DELETE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM trips 
            WHERE trips.id = late_tolls_detected.trip_id 
            AND trips.host_id = (SELECT auth.uid())
        )
    );

-- STEP 7: VERIFICATION AND CLEANUP
-- ===================================================================

-- Create a verification function to test the new setup
CREATE OR REPLACE FUNCTION verify_rls_setup() 
RETURNS TABLE (
    table_name TEXT, 
    rls_enabled BOOLEAN, 
    policy_count INTEGER
) 
LANGUAGE SQL 
SECURITY DEFINER 
AS $$
    SELECT 
        t.relname::TEXT as table_name,
        t.relrowsecurity as rls_enabled,
        COUNT(p.policyname)::INTEGER as policy_count
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_policies p ON p.tablename = t.relname AND p.schemaname = n.nspname
    WHERE n.nspname = 'public' 
    AND t.relkind = 'r'
    GROUP BY t.relname, t.relrowsecurity
    ORDER BY t.relname;
$$;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Multi-user isolation migration completed successfully!';
    RAISE NOTICE 'Removed redundant user_id columns from all tables except hosts';
    RAISE NOTICE 'Added proper foreign key constraints for data integrity';
    RAISE NOTICE 'Created cascading RLS policies for complete data isolation';
    RAISE NOTICE 'Added performance indexes for optimal query performance';
    RAISE NOTICE 'Run SELECT * FROM verify_rls_setup(); to verify the setup';
END;
$$;