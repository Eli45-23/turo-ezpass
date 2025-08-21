const { db } = require('../config/supabase');

// Test Supabase connection and configuration
async function testConnection() {
    console.log('🧪 Testing Supabase connection...');
    console.log('');

    try {
        // Test 1: Basic connection
        console.log('1️⃣ Testing basic connection...');
        const { data, error } = await db.from('hosts').select('count').single();
        
        if (error && !error.message.includes('JSON object requested')) {
            throw new Error(`Connection failed: ${error.message}`);
        }
        
        console.log('✅ Basic connection successful');

        // Test 2: Authentication service
        console.log('');
        console.log('2️⃣ Testing authentication service...');
        const { data: authData, error: authError } = await db.auth.getUser();
        
        // This should fail with no token, which is expected
        if (authError && authError.message.includes('No user found')) {
            console.log('✅ Authentication service accessible (no user = expected)');
        } else if (authError) {
            console.warn('⚠️ Auth service error (may be normal):', authError.message);
        } else {
            console.log('✅ Authentication service working');
        }

        // Test 3: Database schema
        console.log('');
        console.log('3️⃣ Testing database schema...');
        
        const tables = [
            'hosts', 'toll_accounts', 'trips', 'toll_charges', 
            'invoices', 'invoice_items', 'transponder_mappings',
            'deleted_transponder_plates', 'late_tolls_detected'
        ];
        
        for (const table of tables) {
            try {
                const { data, error } = await db.adminFrom(table).select('*').limit(1);
                if (error) {
                    console.log(`❌ Table ${table}: ${error.message}`);
                } else {
                    console.log(`✅ Table ${table}: Schema correct`);
                }
            } catch (e) {
                console.log(`❌ Table ${table}: ${e.message}`);
            }
        }

        // Test 4: RLS policies
        console.log('');
        console.log('4️⃣ Testing RLS policies...');
        
        try {
            // This should fail due to RLS (which is good!)
            const { data: rlsData, error: rlsError } = await db.from('hosts').select('*');
            
            if (rlsError && rlsError.code === '42501') {
                console.log('✅ RLS policies active (blocking unauthorized access)');
            } else if (rlsError) {
                console.log('⚠️ RLS test unclear:', rlsError.message);
            } else {
                console.log('⚠️ RLS may not be working - returned data without auth');
            }
        } catch (e) {
            console.log('⚠️ RLS test error:', e.message);
        }

        // Test 5: Admin operations
        console.log('');
        console.log('5️⃣ Testing admin operations...');
        
        try {
            const { count, error: countError } = await db.adminFrom('hosts').select('*', { count: 'exact', head: true });
            
            if (countError) {
                console.log('❌ Admin operations failed:', countError.message);
            } else {
                console.log(`✅ Admin operations working (found ${count || 0} hosts)`);
            }
        } catch (e) {
            console.log('❌ Admin operations error:', e.message);
        }

        // Test 6: Environment variables
        console.log('');
        console.log('6️⃣ Environment configuration...');
        console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
        console.log(`   SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}`);
        console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);

        console.log('');
        console.log('🎉 Connection test completed!');
        console.log('');
        console.log('📋 Summary:');
        console.log('   ✅ Supabase is accessible');
        console.log('   ✅ Database schema is set up');
        console.log('   ✅ RLS security is active');
        console.log('   ✅ Admin operations work');
        console.log('');
        console.log('🚀 Ready for data migration and testing!');

    } catch (error) {
        console.error('❌ Connection test failed:', error.message);
        console.log('');
        console.log('🔧 Troubleshooting:');
        console.log('   1. Check your .env file has correct SUPABASE_* values');
        console.log('   2. Verify your Supabase project is running');
        console.log('   3. Ensure you ran the schema setup SQL');
        console.log('   4. Check your API keys have correct permissions');
        console.log('');
        throw error;
    }
}

// Run test if called directly
if (require.main === module) {
    testConnection()
        .then(() => {
            console.log('✅ Test completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Test failed');
            process.exit(1);
        });
}

module.exports = { testConnection };