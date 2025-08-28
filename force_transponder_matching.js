const { supabaseAdmin } = require('./config/supabase');

async function forceTransponderMatching() {
    console.log('🔧 Force matching transponder tolls to trips...');
    
    try {
        const hostId = 'ed988a4c-b72e-4605-8cf7-c2a4a69f61ba';
        
        // Step 1: Get transponder mappings
        const { data: mappings } = await supabaseAdmin
            .from('transponder_mappings')
            .select('*')
            .eq('host_id', hostId)
            .eq('is_active', true);
            
        console.log(`🔗 Found ${mappings.length} transponder mappings`);
        
        // Step 2: For each mapping, find tolls and match to trips
        let totalMatched = 0;
        
        for (const mapping of mappings) {
            console.log(`\n🔍 Processing transponder ${mapping.transponder_number} → ${mapping.vehicle_plate}`);
            
            // Get unmatched tolls with this transponder
            const { data: tolls } = await supabaseAdmin
                .from('toll_charges')
                .select('*')
                .eq('host_id', hostId)
                .eq('transponder_id', mapping.transponder_number)
                .is('trip_id', null);
                
            console.log(`  Found ${tolls?.length || 0} unmatched tolls`);
            
            if (!tolls || tolls.length === 0) continue;
            
            // Get trips for this vehicle plate
            const { data: trips } = await supabaseAdmin
                .from('trips')
                .select('*')
                .eq('host_id', hostId)
                .eq('vehicle_plate', mapping.vehicle_plate)
                .not('trip_status', 'in', '(canceled,cancelled,declined,expired,terminated,rejected)')
                .order('start_date', { ascending: false });
                
            console.log(`  Found ${trips?.length || 0} active trips for vehicle`);
            
            // Match each toll to a trip
            for (const toll of tolls) {
                const tollDate = new Date(toll.toll_date);
                
                // Find trip that contains this toll date
                const matchingTrip = trips.find(trip => {
                    const startDate = new Date(trip.start_date);
                    const endDate = new Date(trip.end_date);
                    return tollDate >= startDate && tollDate <= endDate;
                });
                
                if (matchingTrip) {
                    // Update toll with trip assignment
                    const { error } = await supabaseAdmin
                        .from('toll_charges')
                        .update({
                            trip_id: matchingTrip.id,
                            is_matched: true,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', toll.id);
                        
                    if (error) {
                        console.error(`    ❌ Error updating toll ${toll.id}:`, error);
                    } else {
                        console.log(`    ✅ Matched toll ${toll.id} ($${toll.toll_amount}) → Trip ${matchingTrip.turo_trip_id}`);
                        totalMatched++;
                    }
                } else {
                    console.log(`    ⚠️ No trip found for toll ${toll.id} on ${toll.toll_date.substring(0, 10)}`);
                }
            }
        }
        
        // Step 3: Show results
        console.log(`\n📊 Matching Results:`);
        console.log(`  - Total tolls matched: ${totalMatched}`);
        
        // Step 4: Verify by checking a specific case
        console.log(`\n🔍 Verification - checking LPJ3806 tolls on Aug 17:`);
        
        const { data: verificationTolls } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                id, transponder_id, toll_date, toll_amount, toll_location, trip_id,
                trips!trip_id(turo_trip_id, vehicle_plate)
            `)
            .eq('host_id', hostId)
            .eq('transponder_id', '08600713746')
            .gte('toll_date', '2025-08-17')
            .lt('toll_date', '2025-08-18')
            .order('toll_date');
            
        console.log(`Found ${verificationTolls?.length || 0} LPJ3806 transponder tolls on Aug 17:`);
        verificationTolls?.forEach(toll => {
            const tripInfo = toll.trips ? `→ Trip ${toll.trips.turo_trip_id}` : '(unmatched)';
            console.log(`  - ${toll.toll_date.substring(11, 16)}: $${toll.toll_amount} at ${toll.toll_location} ${tripInfo}`);
        });
        
        console.log('\n✅ Force matching complete!');
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
}

// Run the force matching
forceTransponderMatching();