const { supabaseAdmin } = require('./config/supabase');
const SimpleTollMatcher = require('./services/simple-toll-matcher');

async function runFixedMatcher() {
    console.log('🚀 Running SimpleTollMatcher with transponder fix...');
    
    const hostId = 'ed988a4c-b72e-4605-8cf7-c2a4a69f61ba';
    
    try {
        // Get all trips
        const { data: trips, error: tripsError } = await supabaseAdmin
            .from('trips')
            .select('*')
            .eq('host_id', hostId);
            
        if (tripsError) {
            console.error('❌ Error fetching trips:', tripsError);
            return;
        }
        
        // Get all unmatched tolls
        const { data: tolls, error: tollsError } = await supabaseAdmin
            .from('toll_charges')
            .select('*')
            .eq('host_id', hostId)
            .is('trip_id', null);
            
        if (tollsError) {
            console.error('❌ Error fetching tolls:', tollsError);
            return;
        }
        
        console.log(`📊 Data ready:`);
        console.log(`  - Trips: ${trips.length}`);
        console.log(`  - Unmatched tolls: ${tolls.length}`);
        
        // Show breakdown of tolls
        const transponderTolls = tolls.filter(t => t.transponder_id && t.plate_number === 'N/A');
        const plateTolls = tolls.filter(t => t.plate_number && t.plate_number !== 'N/A');
        console.log(`  - Transponder tolls (plate='N/A'): ${transponderTolls.length}`);
        console.log(`  - Plate tolls: ${plateTolls.length}`);
        
        if (transponderTolls.length > 0) {
            console.log(`🔍 Sample transponder tolls:`);
            transponderTolls.slice(0, 3).forEach(toll => {
                console.log(`    ID ${toll.id}: ${toll.transponder_id} ($${toll.toll_amount} at ${toll.toll_location})`);
            });
        }
        
        // Run the matcher
        const matcher = new SimpleTollMatcher();
        console.log('\\n🎯 Running SimpleTollMatcher.matchTollsToTrips()...');
        
        const result = await matcher.matchTollsToTrips(hostId, trips, tolls, (progress) => {
            if (progress.step === 'matching' && progress.tollDetails) {
                const detail = progress.tollDetails;
                if (detail.status === 'MATCHED') {
                    console.log(`✅ ${detail.location} ($${detail.amount}) → Trip ${detail.tripId}`);
                }
            }
        });
        
        console.log('\\n📊 Results:');
        console.log(`  - Total tolls processed: ${result.totalCharges || tolls.length}`);
        console.log(`  - Successfully matched: ${result.matchedCount || 0}`);
        console.log(`  - Average confidence: ${result.averageConfidence || 0}`);
        
        // Check final database state
        console.log('\\n🔍 Final database verification...');
        const { data: finalStats } = await supabaseAdmin
            .from('toll_charges')
            .select('id, transponder_id, trip_id')
            .eq('host_id', hostId);
            
        const totalMatched = finalStats.filter(t => t.trip_id).length;
        const transponderMatched = finalStats.filter(t => t.transponder_id && t.trip_id).length;
        
        console.log(`📈 Database state after matching:`);
        console.log(`  - Total matched tolls: ${totalMatched}`);
        console.log(`  - Transponder tolls matched: ${transponderMatched}`);
        
        if (transponderMatched > 0) {
            console.log('\\n✅ SUCCESS: Transponder tolls are now being matched!');
        } else {
            console.log('\\n⚠️ WARNING: Still no transponder tolls matched. Fix may need adjustment.');
        }
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
}

// Run the test
runFixedMatcher();