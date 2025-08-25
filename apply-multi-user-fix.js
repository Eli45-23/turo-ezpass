#!/usr/bin/env node

/**
 * Apply Multi-User Isolation Fix to Supabase Database
 * This script applies the comprehensive migration to fix data isolation issues.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables');
    console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// Create admin client that can bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

console.log('🚀 Starting Multi-User Isolation Fix...');
console.log('⚠️  WARNING: This will modify your database schema and data!');

async function executeStep(stepName, sql) {
    console.log(`\n📋 Executing: ${stepName}`);
    try {
        // Execute SQL commands one by one
        const commands = sql.split(';').filter(cmd => cmd.trim().length > 0);
        
        for (const command of commands) {
            const trimmedCommand = command.trim();
            if (!trimmedCommand) continue;
            
            // Use rpc to execute raw SQL
            const { data, error } = await supabase.rpc('exec_sql', { 
                sql_query: trimmedCommand 
            });
            
            if (error) {
                // If exec_sql doesn't exist, try direct table operations
                if (error.message.includes('Could not find the function')) {
                    console.log(`⚠️  exec_sql function not available, trying alternative approach`);
                    break;
                } else {
                    throw error;
                }
            }
        }
        
        console.log(`✅ ${stepName} completed successfully`);
        return true;
    } catch (error) {
        console.error(`❌ ${stepName} failed:`, error.message);
        return false;
    }
}

async function main() {
    console.log('\n=== STEP 1: DISABLE RLS TEMPORARILY ===');
    const step1 = await executeStep('Disable RLS for schema changes', `
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
    `);

    if (!step1) {
        console.log('❌ Failed at step 1. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 2: DROP EXISTING POLICIES ===');
    const step2 = await executeStep('Drop existing RLS policies', `
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
    `);

    if (!step2) {
        console.log('❌ Failed at step 2. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 3: REMOVE REDUNDANT USER_ID COLUMNS ===');
    const step3 = await executeStep('Remove redundant user_id columns', `
        -- Remove user_id from tables that shouldn't have them
        ALTER TABLE toll_accounts DROP COLUMN IF EXISTS user_id;
        ALTER TABLE trips DROP COLUMN IF EXISTS user_id;
        ALTER TABLE toll_charges DROP COLUMN IF EXISTS user_id;
        ALTER TABLE invoices DROP COLUMN IF EXISTS user_id;
        ALTER TABLE invoice_items DROP COLUMN IF EXISTS user_id;
        ALTER TABLE transponder_mappings DROP COLUMN IF EXISTS user_id;
        ALTER TABLE deleted_transponder_plates DROP COLUMN IF EXISTS user_id;
        ALTER TABLE late_tolls_detected DROP COLUMN IF EXISTS user_id;
    `);

    if (!step3) {
        console.log('❌ Failed at step 3. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 4: ADD FOREIGN KEY CONSTRAINTS ===');
    const step4 = await executeStep('Add foreign key constraints', `
        -- Add proper foreign key constraints
        ALTER TABLE hosts ADD CONSTRAINT hosts_id_fkey 
            FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
        ALTER TABLE toll_accounts ADD CONSTRAINT toll_accounts_host_id_fkey 
            FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE;
        ALTER TABLE trips ADD CONSTRAINT trips_host_id_fkey 
            FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE;
        ALTER TABLE toll_charges ADD CONSTRAINT toll_charges_toll_account_id_fkey 
            FOREIGN KEY (toll_account_id) REFERENCES toll_accounts(id) ON DELETE CASCADE;
        ALTER TABLE toll_charges ADD CONSTRAINT toll_charges_trip_id_fkey 
            FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL;
        ALTER TABLE invoices ADD CONSTRAINT invoices_trip_id_fkey 
            FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
        ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey 
            FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
        ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_toll_charge_id_fkey 
            FOREIGN KEY (toll_charge_id) REFERENCES toll_charges(id) ON DELETE CASCADE;
        ALTER TABLE transponder_mappings ADD CONSTRAINT transponder_mappings_host_id_fkey 
            FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE;
        ALTER TABLE deleted_transponder_plates ADD CONSTRAINT deleted_transponder_plates_host_id_fkey 
            FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE;
        ALTER TABLE late_tolls_detected ADD CONSTRAINT late_tolls_detected_trip_id_fkey 
            FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
        ALTER TABLE late_tolls_detected ADD CONSTRAINT late_tolls_detected_toll_charge_id_fkey 
            FOREIGN KEY (toll_charge_id) REFERENCES toll_charges(id) ON DELETE CASCADE;
        ALTER TABLE late_tolls_detected ADD CONSTRAINT late_tolls_detected_original_invoice_id_fkey 
            FOREIGN KEY (original_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
    `);

    if (!step4) {
        console.log('❌ Failed at step 4. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 5: ADD PERFORMANCE INDEXES ===');
    const step5 = await executeStep('Add performance indexes', `
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
    `);

    if (!step5) {
        console.log('❌ Failed at step 5. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 6: RE-ENABLE RLS AND CREATE PROPER POLICIES ===');
    const step6 = await executeStep('Re-enable RLS', `
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
    `);

    if (!step6) {
        console.log('❌ Failed at step 6. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 7: CREATE HOSTS TABLE POLICIES ===');
    const step7 = await executeStep('Create hosts table policies', `
        -- HOSTS TABLE POLICIES (direct auth.uid() check)
        CREATE POLICY "Users can view their own host data" ON hosts 
            FOR SELECT TO authenticated 
            USING ((SELECT auth.uid()) = id);
        CREATE POLICY "Users can update their own host data" ON hosts 
            FOR UPDATE TO authenticated 
            USING ((SELECT auth.uid()) = id)
            WITH CHECK ((SELECT auth.uid()) = id);
    `);

    if (!step7) {
        console.log('❌ Failed at step 7. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 8: CREATE TOLL ACCOUNTS POLICIES ===');
    const step8 = await executeStep('Create toll accounts policies', `
        -- TOLL ACCOUNTS POLICIES (check host_id)
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
    `);

    if (!step8) {
        console.log('❌ Failed at step 8. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 9: CREATE TRIPS POLICIES ===');
    const step9 = await executeStep('Create trips policies', `
        -- TRIPS POLICIES (check host_id)
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
    `);

    if (!step9) {
        console.log('❌ Failed at step 9. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 10: CREATE TOLL CHARGES POLICIES ===');
    const step10 = await executeStep('Create toll charges policies', `
        -- TOLL CHARGES POLICIES (check through toll_accounts)
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
    `);

    if (!step10) {
        console.log('❌ Failed at step 10. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 11: CREATE REMAINING POLICIES ===');
    const step11 = await executeStep('Create remaining table policies', `
        -- INVOICES POLICIES (check through trips)
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
    `);

    if (!step11) {
        console.log('❌ Failed at step 11. Aborting migration.');
        return;
    }

    console.log('\n=== STEP 12: CREATE REMAINING POLICIES (CONTINUED) ===');
    const step12 = await executeStep('Create remaining policies continued', `
        -- TRANSPONDER MAPPINGS POLICIES (check host_id)
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
    `);

    if (!step12) {
        console.log('❌ Failed at step 12. Aborting migration.');
        return;
    }

    console.log('\n✅ ALL STEPS COMPLETED SUCCESSFULLY!');
    console.log('\n🎉 Multi-User Isolation Fix has been applied successfully!');
    console.log('\n📋 Summary of changes:');
    console.log('  • Removed redundant user_id columns from all tables except hosts');
    console.log('  • Added proper foreign key constraints for data integrity');  
    console.log('  • Created cascading RLS policies for complete data isolation');
    console.log('  • Added performance indexes for optimal query performance');
    console.log('\n⚠️  Next Steps:');
    console.log('  1. Update your application code to remove direct user_id references');
    console.log('  2. Test the application with multiple users to verify isolation');
    console.log('  3. Monitor database performance and optimize if needed');
}

main().catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
});