const { supabaseAdmin } = require('./config/supabase');
const EnhancedTollMatcher = require('./services/enhanced-toll-matcher');

async function fixMatchingInconsistency() {
    console.log('🔧 Fixing toll matching inconsistency...');
    
    try {
        const hostId = 'df28be49-b5ea-4e8c-ba63-03fc47bd1c7c'; // nametwo@gmail.com
        
        // Step 1: Fix inconsistent is_matched flags
        console.log('\n🔄 Step 1: Fixing inconsistent is_matched flags...');
        
        const { data, error, count } = await supabaseAdmin
            .from('toll_charges')
            .update({ 
                is_matched: false,
                updated_at: new Date().toISOString()
            })
            .eq('host_id', hostId)
            .eq('plate_number', 'LPJ3806')
            .is('trip_id', null)
            .eq('is_matched', true) // Fix tolls marked as matched but with no trip_id
            .select();
        
        if (error) {
            console.error('❌ Error fixing is_matched flags:', error);
            return;
        }
        
        console.log(`✅ Fixed ${count || data?.length || 0} inconsistent toll records`);
        
        // Step 2: Run the toll matching process
        console.log('\n🔄 Step 2: Running toll matching process...');
        
        const matcher = new EnhancedTollMatcher();
        const results = await matcher.enhancedAutoMatch(hostId, {
            processAllTolls: false, // Process unmatched tolls only (now that we've fixed the flags)
            confidenceThreshold: 0.6 // Reasonable confidence threshold
        });
        
        console.log('✅ Matching process completed!');
        console.log('📊 Results:', {
            totalCharges: results.totalCharges || 0,
            matchedCount: results.matchedCount || 0,
            averageConfidence: results.averageConfidence || 0
        });
        
        // Step 3: Verify the results
        console.log('\n🔍 Step 3: Verifying results...');
        
        const { data: updatedTolls } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                id, toll_date, toll_location, toll_amount, plate_number, 
                trip_id, is_matched,
                trips!trip_id(turo_trip_id, start_date, end_date)
            `)
            .eq('host_id', hostId)
            .eq('plate_number', 'LPJ3806')
            .order('toll_date');
            
        console.log(`\n📋 Final toll status (${updatedTolls?.length || 0} total):`);
        updatedTolls?.forEach(toll => {
            const tripInfo = toll.trips ? `→ Trip ${toll.trips.turo_trip_id}` : '(unmatched)';
            console.log(`  - ${toll.toll_date.substring(0, 10)}: $${toll.toll_amount} at ${toll.toll_location} ${tripInfo}`);
        });
        
        // Show summary by trip
        const tollsByTrip = {};
        let unmatchedTotal = 0;
        
        updatedTolls?.forEach(toll => {
            if (toll.trip_id && toll.trips) {
                const tripId = toll.trips.turo_trip_id;
                if (!tollsByTrip[tripId]) {
                    tollsByTrip[tripId] = { count: 0, total: 0 };
                }
                tollsByTrip[tripId].count++;
                tollsByTrip[tripId].total += parseFloat(toll.toll_amount);
            } else {
                unmatchedTotal += parseFloat(toll.toll_amount);
            }
        });
        
        console.log('\n💰 Summary by trip:');
        Object.keys(tollsByTrip).forEach(tripId => {
            const trip = tollsByTrip[tripId];
            console.log(`  - Trip ${tripId}: ${trip.count} tolls, $${trip.total.toFixed(2)}`);
        });
        
        if (unmatchedTotal > 0) {
            console.log(`  - Unmatched tolls: $${unmatchedTotal.toFixed(2)}`);
        }
        
        console.log('\n🎉 Process complete! Check the dashboard to verify $0.00 is fixed.');
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
}

// Run the fix
fixMatchingInconsistency();