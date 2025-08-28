const { supabaseAdmin } = require('./config/supabase');
const EnhancedTollMatcher = require('./services/enhanced-toll-matcher');

async function fixTollAccountMismatch() {
    console.log('🔧 Fixing toll account host_id mismatch...');
    
    try {
        const newHostId = 'df28be49-b5ea-4e8c-ba63-03fc47bd1c7c'; // nametwo@gmail.com
        const oldHostId = '5322cf92-98a4-49fb-aaa2-64daa5610a2e'; // emailone@gmail.com
        
        // Step 1: Check if nametwo already has a CSV toll account
        console.log('\n🔍 Step 1: Checking existing toll accounts...');
        
        const { data: existingAccount } = await supabaseAdmin
            .from('toll_accounts')
            .select('*')
            .eq('host_id', newHostId)
            .eq('provider', 'CSV Import')
            .single();
            
        let targetAccountId;
        
        if (existingAccount) {
            console.log(`✅ Found existing CSV toll account for nametwo: ${existingAccount.id}`);
            targetAccountId = existingAccount.id;
        } else {
            // Create new toll account for nametwo
            console.log('📝 Creating new CSV toll account for nametwo...');
            
            const { data: newAccount, error } = await supabaseAdmin
                .from('toll_accounts')
                .insert({
                    host_id: newHostId,
                    provider: 'CSV Import',
                    account_identifier: 'csv_import_nametwo',
                    is_active: true,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();
                
            if (error) {
                console.error('❌ Error creating toll account:', error);
                return;
            }
            
            console.log(`✅ Created new toll account: ${newAccount.id}`);
            targetAccountId = newAccount.id;
        }
        
        // Step 2: Update tolls to use the correct toll account
        console.log(`\n🔄 Step 2: Updating tolls to use toll account ${targetAccountId}...`);
        
        const { data, error, count } = await supabaseAdmin
            .from('toll_charges')
            .update({ 
                toll_account_id: targetAccountId,
                updated_at: new Date().toISOString()
            })
            .eq('host_id', newHostId)
            .eq('plate_number', 'LPJ3806')
            .select();
        
        if (error) {
            console.error('❌ Error updating toll account references:', error);
            return;
        }
        
        console.log(`✅ Updated ${count || data?.length || 0} tolls to use correct toll account`);
        
        // Step 3: Run the toll matching process
        console.log('\n🔄 Step 3: Running toll matching process...');
        
        const matcher = new EnhancedTollMatcher();
        const results = await matcher.enhancedAutoMatch(newHostId, {
            processAllTolls: false, // Process unmatched tolls
            confidenceThreshold: 0.6
        });
        
        console.log('✅ Matching process completed!');
        console.log('📊 Results:', {
            totalCharges: results.totalCharges || 0,
            matchedCount: results.matchedCount || 0,
            averageConfidence: results.averageConfidence ? Math.round(results.averageConfidence * 100) : 0
        });
        
        // Step 4: Verify the final state
        console.log('\n🔍 Step 4: Verifying final results...');
        
        const { data: finalTolls } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                id, toll_date, toll_location, toll_amount, plate_number, 
                trip_id, is_matched,
                trips!trip_id(turo_trip_id, start_date, end_date)
            `)
            .eq('host_id', newHostId)
            .eq('plate_number', 'LPJ3806')
            .order('toll_date');
            
        console.log(`\n📋 Final toll status (${finalTolls?.length || 0} total):`);
        
        const tollsByTrip = {};
        let unmatchedCount = 0;
        let unmatchedTotal = 0;
        
        finalTolls?.forEach(toll => {
            if (toll.trip_id && toll.trips) {
                const tripId = toll.trips.turo_trip_id;
                if (!tollsByTrip[tripId]) {
                    tollsByTrip[tripId] = { tolls: [], total: 0 };
                }
                tollsByTrip[tripId].tolls.push(toll);
                tollsByTrip[tripId].total += parseFloat(toll.toll_amount);
            } else {
                unmatchedCount++;
                unmatchedTotal += parseFloat(toll.toll_amount);
            }
        });
        
        console.log('\n💰 Summary by trip:');
        Object.keys(tollsByTrip).forEach(tripId => {
            const trip = tollsByTrip[tripId];
            console.log(`  - Trip ${tripId}: ${trip.tolls.length} tolls, $${trip.total.toFixed(2)}`);
            trip.tolls.forEach(toll => {
                console.log(`    • ${toll.toll_date.substring(5, 10)}: $${toll.toll_amount} at ${toll.toll_location}`);
            });
        });
        
        if (unmatchedCount > 0) {
            console.log(`  - Unmatched: ${unmatchedCount} tolls, $${unmatchedTotal.toFixed(2)}`);
        }
        
        console.log('\n🎉 Process complete! The dashboard should now show correct toll amounts instead of $0.00.');
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
}

// Run the fix
fixTollAccountMismatch();