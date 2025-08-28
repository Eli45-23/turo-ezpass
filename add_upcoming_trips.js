const { supabaseAdmin } = require('./config/supabase');

async function addUpcomingTrips() {
    console.log('🚗 Adding upcoming trips from CSV export...');
    
    const hostId = 'ed988a4c-b72e-4605-8cf7-c2a4a69f61ba';
    
    // Upcoming trips from CSV analysis
    const upcomingTrips = [
        {
            turo_trip_id: '48195822',
            renter_name: 'Collin S.',
            renter_email: 'Collin S.',
            vehicle_plate: 'LPJ3806',
            start_date: '2025-08-30T13:00:00+00:00', // 9:00 AM EDT = 13:00 UTC
            end_date: '2025-09-02T00:00:00+00:00',   // 8:00 PM EDT = 00:00 UTC next day
            trip_status: 'Booked'
        },
        {
            turo_trip_id: '48018884',
            renter_name: 'Monty N.',
            renter_email: 'Monty N.',
            vehicle_plate: 'LLL1078',
            start_date: '2025-09-20T13:00:00+00:00', // 9:00 AM EDT = 13:00 UTC
            end_date: '2025-09-22T19:00:00+00:00',   // 3:00 PM EDT = 19:00 UTC
            trip_status: 'Booked'
        },
        {
            turo_trip_id: '48384389',
            renter_name: 'Evan M.',
            renter_email: 'Evan M.',
            vehicle_plate: 'LPJ3806',
            start_date: '2025-09-26T14:00:00+00:00', // 10:00 AM EDT = 14:00 UTC
            end_date: '2025-09-29T00:00:00+00:00',   // 8:00 PM EDT = 00:00 UTC next day
            trip_status: 'Booked'
        }
    ];
    
    // Also update Anna B.'s trip to in-progress status
    const inProgressTrip = {
        turo_trip_id: '47765845',
        renter_name: 'Anna B.',
        renter_email: 'Anna B.',
        vehicle_plate: 'LLL1078',
        start_date: '2025-08-17T15:00:00+00:00', // 11:00 AM EDT = 15:00 UTC
        end_date: '2025-09-13T20:00:00+00:00',   // 4:00 PM EDT = 20:00 UTC
        trip_status: 'In-progress'
    };
    
    try {
        console.log('📝 Adding upcoming trips...');
        
        // Add upcoming trips
        for (const trip of upcomingTrips) {
            console.log(`\n🔄 Processing ${trip.renter_name} (${trip.turo_trip_id})...`);
            
            // Check if trip already exists
            const { data: existingTrip, error: checkError } = await supabaseAdmin
                .from('trips')
                .select('id, turo_trip_id')
                .eq('host_id', hostId)
                .eq('turo_trip_id', trip.turo_trip_id)
                .single();
            
            if (existingTrip) {
                console.log(`  ✅ Trip already exists in database (ID: ${existingTrip.id})`);
                continue;
            }
            
            if (checkError && checkError.code !== 'PGRST116') {
                console.error(`  ❌ Error checking for existing trip: ${checkError.message}`);
                continue;
            }
            
            // Insert new trip
            const tripData = {
                host_id: hostId,
                ...trip,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            const { data: newTrip, error: insertError } = await supabaseAdmin
                .from('trips')
                .insert(tripData)
                .select()
                .single();
            
            if (insertError) {
                console.error(`  ❌ Failed to insert ${trip.renter_name}: ${insertError.message}`);
                continue;
            }
            
            console.log(`  ✅ Added ${trip.renter_name} trip (ID: ${newTrip.id})`);
            console.log(`     Vehicle: ${trip.vehicle_plate}`);
            console.log(`     Dates: ${trip.start_date} to ${trip.end_date}`);
            console.log(`     Status: ${trip.trip_status}`);
        }
        
        // Update Anna B.'s trip status
        console.log(`\n🔄 Updating Anna B.'s trip status to in-progress...`);
        
        const { data: existingAnnaTrip, error: annaCheckError } = await supabaseAdmin
            .from('trips')
            .select('id, trip_status')
            .eq('host_id', hostId)
            .eq('turo_trip_id', inProgressTrip.turo_trip_id)
            .single();
        
        if (annaCheckError && annaCheckError.code !== 'PGRST116') {
            console.error(`❌ Error checking Anna's trip: ${annaCheckError.message}`);
        } else if (!existingAnnaTrip) {
            // Insert Anna's trip if it doesn't exist
            const tripData = {
                host_id: hostId,
                ...inProgressTrip,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            const { data: newAnnaTrip, error: insertError } = await supabaseAdmin
                .from('trips')
                .insert(tripData)
                .select()
                .single();
            
            if (insertError) {
                console.error(`❌ Failed to insert Anna's trip: ${insertError.message}`);
            } else {
                console.log(`✅ Added Anna B.'s in-progress trip (ID: ${newAnnaTrip.id})`);
            }
        } else {
            // Update existing trip status
            const { error: updateError } = await supabaseAdmin
                .from('trips')
                .update({ 
                    trip_status: 'In-progress',
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingAnnaTrip.id);
            
            if (updateError) {
                console.error(`❌ Failed to update Anna's trip status: ${updateError.message}`);
            } else {
                console.log(`✅ Updated Anna B.'s trip to in-progress status (ID: ${existingAnnaTrip.id})`);
            }
        }
        
        // Verify all trips are now in database
        console.log('\n🔍 Verifying trips in database...');
        const { data: allTrips, error: verifyError } = await supabaseAdmin
            .from('trips')
            .select('id, turo_trip_id, renter_name, vehicle_plate, start_date, trip_status')
            .eq('host_id', hostId)
            .in('turo_trip_id', ['48195822', '48018884', '48384389', '47765845'])
            .order('start_date', { ascending: true });
        
        if (verifyError) {
            console.error(`❌ Error verifying trips: ${verifyError.message}`);
        } else {
            console.log('\n📊 Final trip status:');
            allTrips.forEach(trip => {
                console.log(`  ${trip.renter_name} (${trip.turo_trip_id}): ${trip.vehicle_plate} - ${trip.trip_status}`);
                console.log(`    Start: ${trip.start_date}`);
            });
        }
        
        console.log('\n🎉 All upcoming trips have been processed successfully!');
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
}

// Run the script
addUpcomingTrips();