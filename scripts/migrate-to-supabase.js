const { db } = require('../config/supabase');
const { exportAllData } = require('./export-sqlite-data');
const fs = require('fs');
const path = require('path');

// Migration script to move data from SQLite to Supabase
async function migrateToSupabase() {
    console.log('🚀 Starting migration to Supabase...');
    
    try {
        // Step 1: Export data from SQLite
        console.log('📤 Exporting SQLite data...');
        const exportResult = await exportAllData();
        const data = JSON.parse(fs.readFileSync(exportResult.jsonFile, 'utf8'));
        
        // Step 2: Test Supabase connection
        console.log('🔗 Testing Supabase connection...');
        const { data: testData, error: testError } = await db.adminFrom('hosts').select('count').single();
        if (testError && !testError.message.includes('JSON object requested')) {
            throw new Error(`Supabase connection failed: ${testError.message}`);
        }
        console.log('✅ Supabase connection successful');
        
        // Step 3: Disable RLS for migration
        console.log('🛡️ Temporarily disabling RLS for migration...');
        const { error: rlsError } = await db.rpc('disable_rls_for_migration');
        if (rlsError) {
            console.warn('⚠️ Could not disable RLS:', rlsError.message);
        }
        
        // Step 4: Create UUID mapping for hosts
        console.log('👥 Migrating hosts and creating UUID mapping...');
        const hostUuidMapping = {};
        
        for (const host of data.hosts) {
            // Generate new UUID for Supabase auth compatibility
            const newUuid = crypto.randomUUID();
            hostUuidMapping[host.id] = newUuid;
            
            const { data: insertedHost, error: hostError } = await db.adminFrom('hosts').insert({
                id: newUuid,
                email: host.email,
                full_name: host.full_name,
                turo_host_id: host.turo_host_id,
                created_at: host.created_at,
                updated_at: host.updated_at
            }).select().single();
            
            if (hostError) {
                console.error(`❌ Failed to migrate host ${host.email}:`, hostError.message);
                continue;
            }
            
            console.log(`✅ Migrated host: ${host.email} (${host.id} → ${newUuid})`);
        }
        
        // Step 5: Migrate toll accounts
        console.log('💳 Migrating toll accounts...');
        const tollAccountMapping = {};
        
        for (const account of data.toll_accounts) {
            const newHostId = hostUuidMapping[account.host_id];
            if (!newHostId) {
                console.warn(`⚠️ Skipping toll account - host not found: ${account.host_id}`);
                continue;
            }
            
            const { data: insertedAccount, error: accountError } = await db.adminFrom('toll_accounts').insert({
                host_id: newHostId,
                provider: account.provider,
                account_number: account.account_number,
                username: account.username,
                password_encrypted: account.password_encrypted,
                is_active: account.is_active === 1,
                last_sync: account.last_sync,
                created_at: account.created_at
            }).select().single();
            
            if (accountError) {
                console.error(`❌ Failed to migrate toll account:`, accountError.message);
                continue;
            }
            
            tollAccountMapping[account.id] = insertedAccount.id;
            console.log(`✅ Migrated toll account: ${account.provider} for host ${newHostId}`);
        }
        
        // Step 6: Migrate trips
        console.log('🚗 Migrating trips...');
        const tripMapping = {};
        
        for (const trip of data.trips) {
            const newHostId = hostUuidMapping[trip.host_id];
            if (!newHostId) {
                console.warn(`⚠️ Skipping trip - host not found: ${trip.host_id}`);
                continue;
            }
            
            const { data: insertedTrip, error: tripError } = await db.adminFrom('trips').insert({
                host_id: newHostId,
                turo_trip_id: trip.turo_trip_id,
                renter_name: trip.renter_name,
                renter_email: trip.renter_email,
                vehicle_plate: trip.vehicle_plate,
                start_date: trip.start_date,
                end_date: trip.end_date,
                trip_status: trip.trip_status,
                created_at: trip.created_at
            }).select().single();
            
            if (tripError) {
                console.error(`❌ Failed to migrate trip ${trip.turo_trip_id}:`, tripError.message);
                continue;
            }
            
            tripMapping[trip.id] = insertedTrip.id;
            console.log(`✅ Migrated trip: ${trip.turo_trip_id}`);
        }
        
        // Step 7: Migrate transponder mappings
        console.log('📡 Migrating transponder mappings...');
        for (const mapping of data.transponder_mappings) {
            const newHostId = hostUuidMapping[mapping.host_id];
            if (!newHostId) {
                console.warn(`⚠️ Skipping transponder mapping - host not found: ${mapping.host_id}`);
                continue;
            }
            
            const { error: mappingError } = await db.adminFrom('transponder_mappings').insert({
                host_id: newHostId,
                transponder_number: mapping.transponder_number,
                vehicle_plate: mapping.vehicle_plate,
                vehicle_description: mapping.vehicle_description,
                is_active: mapping.is_active === 1,
                created_at: mapping.created_at,
                updated_at: mapping.updated_at
            });
            
            if (mappingError) {
                console.error(`❌ Failed to migrate transponder mapping:`, mappingError.message);
                continue;
            }
            
            console.log(`✅ Migrated transponder: ${mapping.transponder_number} → ${mapping.vehicle_plate}`);
        }
        
        // Step 8: Migrate toll charges
        console.log('💰 Migrating toll charges...');
        const tollChargeMapping = {};
        
        for (const charge of data.toll_charges) {
            const newTollAccountId = tollAccountMapping[charge.toll_account_id];
            const newTripId = charge.trip_id ? tripMapping[charge.trip_id] : null;
            
            if (!newTollAccountId) {
                console.warn(`⚠️ Skipping toll charge - account not found: ${charge.toll_account_id}`);
                continue;
            }
            
            const { data: insertedCharge, error: chargeError } = await db.adminFrom('toll_charges').insert({
                toll_account_id: newTollAccountId,
                trip_id: newTripId,
                toll_date: charge.toll_date,
                toll_location: charge.toll_location,
                toll_amount: charge.toll_amount,
                plate_number: charge.plate_number,
                transponder_id: charge.transponder_id,
                transaction_id: charge.transaction_id,
                is_matched: charge.is_matched === 1,
                match_timestamp: charge.match_timestamp,
                data_checksum: charge.data_checksum,
                validation_status: charge.validation_status,
                submitted_to_turo: charge.submitted_to_turo === 1,
                invoice_id: charge.invoice_id,
                submission_date: charge.submission_date,
                is_archived: charge.is_archived === 1,
                created_at: charge.created_at,
                updated_at: charge.updated_at
            }).select().single();
            
            if (chargeError) {
                console.error(`❌ Failed to migrate toll charge:`, chargeError.message);
                continue;
            }
            
            tollChargeMapping[charge.id] = insertedCharge.id;
        }
        
        console.log(`✅ Migrated ${Object.keys(tollChargeMapping).length} toll charges`);
        
        // Step 9: Migrate invoices
        console.log('📄 Migrating invoices...');
        const invoiceMapping = {};
        
        for (const invoice of data.invoices) {
            const newTripId = tripMapping[invoice.trip_id];
            if (!newTripId) {
                console.warn(`⚠️ Skipping invoice - trip not found: ${invoice.trip_id}`);
                continue;
            }
            
            const { data: insertedInvoice, error: invoiceError } = await db.adminFrom('invoices').insert({
                trip_id: newTripId,
                invoice_number: invoice.invoice_number,
                total_amount: invoice.total_amount,
                processing_fee: invoice.processing_fee,
                status: invoice.status,
                sent_date: invoice.sent_date,
                paid_date: invoice.paid_date,
                turo_charge_id: invoice.turo_charge_id,
                data_checksum: invoice.data_checksum,
                validation_notes: invoice.validation_notes,
                toll_charge_ids: invoice.toll_charge_ids,
                snapshot_data: invoice.snapshot_data,
                created_at: invoice.created_at,
                updated_at: invoice.updated_at
            }).select().single();
            
            if (invoiceError) {
                console.error(`❌ Failed to migrate invoice ${invoice.invoice_number}:`, invoiceError.message);
                continue;
            }
            
            invoiceMapping[invoice.id] = insertedInvoice.id;
        }
        
        console.log(`✅ Migrated ${Object.keys(invoiceMapping).length} invoices`);
        
        // Step 10: Migrate invoice items
        console.log('📝 Migrating invoice items...');
        for (const item of data.invoice_items) {
            const newInvoiceId = invoiceMapping[item.invoice_id];
            const newTollChargeId = tollChargeMapping[item.toll_charge_id];
            
            if (!newInvoiceId || !newTollChargeId) {
                console.warn(`⚠️ Skipping invoice item - missing references`);
                continue;
            }
            
            const { error: itemError } = await db.adminFrom('invoice_items').insert({
                invoice_id: newInvoiceId,
                toll_charge_id: newTollChargeId,
                description: item.description,
                amount: item.amount
            });
            
            if (itemError) {
                console.error(`❌ Failed to migrate invoice item:`, itemError.message);
            }
        }
        
        console.log(`✅ Migrated invoice items`);
        
        // Step 11: Re-enable RLS
        console.log('🛡️ Re-enabling RLS...');
        const { error: enableRlsError } = await db.rpc('enable_rls_after_migration');
        if (enableRlsError) {
            console.warn('⚠️ Could not re-enable RLS:', enableRlsError.message);
        }
        
        // Step 12: Save migration mapping
        const mappingData = {
            hosts: hostUuidMapping,
            toll_accounts: tollAccountMapping,
            trips: tripMapping,
            toll_charges: tollChargeMapping,
            invoices: invoiceMapping,
            timestamp: new Date().toISOString()
        };
        
        const mappingFile = path.join(__dirname, '..', 'exports', `migration-mapping-${Date.now()}.json`);
        fs.writeFileSync(mappingFile, JSON.stringify(mappingData, null, 2));
        
        console.log('✅ Migration completed successfully!');
        console.log(`📋 Migration mapping saved to: ${mappingFile}`);
        console.log('');
        console.log('📊 Migration Summary:');
        console.log(`   Hosts: ${Object.keys(hostUuidMapping).length}`);
        console.log(`   Toll Accounts: ${Object.keys(tollAccountMapping).length}`);
        console.log(`   Trips: ${Object.keys(tripMapping).length}`);
        console.log(`   Toll Charges: ${Object.keys(tollChargeMapping).length}`);
        console.log(`   Invoices: ${Object.keys(invoiceMapping).length}`);
        console.log('');
        console.log('⚠️  IMPORTANT: Users will need to reset their passwords in Supabase Auth');
        console.log('📧 Consider sending password reset emails to all users');
        
        return mappingData;
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    migrateToSupabase()
        .then(() => {
            console.log('✅ Migration script completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateToSupabase };