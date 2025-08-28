const { supabaseAdmin } = require('./config/supabase');
const EnhancedTollMatcher = require('./services/enhanced-toll-matcher');

async function runTransponderMatching() {
    console.log('🎯 Running toll matcher with transponder support...');
    
    try {
        const hostId = 'ed988a4c-b72e-4605-8cf7-c2a4a69f61ba'; // Host with transponder data
        
        // Step 1: Check current state
        console.log('\n🔍 Step 1: Pre-matching state...');
        
        const { data: beforeStats } = await supabaseAdmin
            .from('toll_charges')
            .select('id, transponder_id, trip_id, is_matched, toll_amount')
            .eq('host_id', hostId);
            
        const totalTolls = beforeStats?.length || 0;
        const transponderedTolls = beforeStats?.filter(t => t.transponder_id).length || 0;
        const matchedTolls = beforeStats?.filter(t => t.trip_id).length || 0;
        const unmatchedAmount = beforeStats?.filter(t => !t.trip_id).reduce((sum, t) => sum + parseFloat(t.toll_amount), 0) || 0;
        
        console.log(`📊 Before matching:`);
        console.log(`  - Total tolls: ${totalTolls}`);
        console.log(`  - Tolls with transponder_id: ${transponderedTolls}`);
        console.log(`  - Already matched tolls: ${matchedTolls}`);
        console.log(`  - Unmatched toll value: $${unmatchedAmount.toFixed(2)}`);
        
        // Step 2: Run the enhanced toll matcher
        console.log('\n🔄 Step 2: Running enhanced toll matcher...');
        
        const matcher = new EnhancedTollMatcher();
        const results = await matcher.enhancedAutoMatch(hostId, {
            processAllTolls: false, // Process only unmatched tolls
            confidenceThreshold: 0.6
        });
        
        console.log('✅ Matching process completed!');
        console.log('📊 Matcher Results:', results);
        
        // Step 3: Check the results
        console.log('\n🔍 Step 3: Post-matching verification...');
        
        const { data: afterStats } = await supabaseAdmin
            .from('toll_charges')
            .select('id, transponder_id, trip_id, is_matched, toll_amount')
            .eq('host_id', hostId);
            
        const newMatchedTolls = afterStats?.filter(t => t.trip_id).length || 0;
        const newUnmatchedAmount = afterStats?.filter(t => !t.trip_id).reduce((sum, t) => sum + parseFloat(t.toll_amount), 0) || 0;
        
        console.log(`📊 After matching:`);
        console.log(`  - Matched tolls: ${newMatchedTolls} (was ${matchedTolls})`);
        console.log(`  - Newly matched: ${newMatchedTolls - matchedTolls}`);
        console.log(`  - Unmatched toll value: $${newUnmatchedAmount.toFixed(2)} (was $${unmatchedAmount.toFixed(2)})`);
        console.log(`  - Value matched: $${(unmatchedAmount - newUnmatchedAmount).toFixed(2)}`);
        
        // Step 4: Show some examples of newly matched tolls
        console.log('\n🔍 Step 4: Sample newly matched transponder tolls...');
        
        const { data: newlyMatched } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                id, transponder_id, toll_date, toll_amount, toll_location,
                trips!trip_id(turo_trip_id, vehicle_plate)
            `)
            .eq('host_id', hostId)
            .not('transponder_id', 'is', null)
            .not('trip_id', 'is', null)
            .limit(10);
            
        console.log('📋 Sample transponder → trip matches:');
        newlyMatched?.forEach(toll => {
            if (toll.trips) {
                console.log(`  - Transponder ${toll.transponder_id}: $${toll.toll_amount} at ${toll.toll_location} → Trip ${toll.trips.turo_trip_id} (${toll.trips.vehicle_plate})`);
            }
        });
        
        console.log('\n🎉 Transponder matching complete!');
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
}

// Run the matching
runTransponderMatching();