const { supabaseAdmin } = require('./config/supabase');

async function fixUpcomingTrips() {
    console.log('🔧 Fixing upcoming trips insertion with better error handling...');
    
    const hostId = 'ed988a4c-b72e-4605-8cf7-c2a4a69f61ba';
    
    const upcomingTrips = [
        {
            turo_trip_id: '48195822',
            renter_name: 'Collin S.',
            renter_email: 'Collin S.',
            vehicle_plate: 'LPJ3806',
            start_date: '2025-08-30T13:00:00+00:00', // 9:00 AM EDT
            end_date: '2025-09-02T00:00:00+00:00',   // 8:00 PM EDT next day
            trip_status: 'Booked'
        },
        {
            turo_trip_id: '48018884',
            renter_name: 'Monty N.',
            renter_email: 'Monty N.',
            vehicle_plate: 'LLL1078',
            start_date: '2025-09-20T13:00:00+00:00', // 9:00 AM EDT
            end_date: '2025-09-22T19:00:00+00:00',   // 3:00 PM EDT
            trip_status: 'Booked'
        },
        {
            turo_trip_id: '48384389',
            renter_name: 'Evan M.',
            renter_email: 'Evan M.',
            vehicle_plate: 'LPJ3806',
            start_date: '2025-09-26T14:00:00+00:00', // 10:00 AM EDT
            end_date: '2025-09-29T00:00:00+00:00',   // 8:00 PM EDT next day
            trip_status: 'Booked'
        }
    ];
    
    try {
        for (const [index, trip] of upcomingTrips.entries()) {
            console.log(`\n🔄 Step ${index + 1}: Processing ${trip.renter_name} (${trip.turo_trip_id})...`);
            
            // Step 1: Check if trip already exists
            console.log('  🔍 Checking if trip exists...');
            const { data: existingTrip, error: checkError } = await supabaseAdmin
                .from('trips')
                .select('id, turo_trip_id, host_id')
                .eq('turo_trip_id', trip.turo_trip_id)
                .single();
            
            if (checkError && checkError.code !== 'PGRST116') {
                console.error(`  ❌ Database error during check: ${checkError.message}`);
                console.error(`  ❌ Error details:`, checkError);
                continue;
            }
            
            if (existingTrip) {
                console.log(`  ✅ Trip already exists (ID: ${existingTrip.id}, Host: ${existingTrip.host_id})`);
                continue;
            }
            
            console.log('  ✅ Trip does not exist, proceeding with insertion...');
            
            // Step 2: Prepare trip data
            const tripData = {
                host_id: hostId,
                ...trip,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            console.log('  📝 Trip data to insert:', {
                turo_trip_id: tripData.turo_trip_id,
                renter_name: tripData.renter_name,
                vehicle_plate: tripData.vehicle_plate,
                start_date: tripData.start_date,
                end_date: tripData.end_date,
                trip_status: tripData.trip_status,
                host_id: tripData.host_id
            });
            
            // Step 3: Insert trip
            console.log('  💾 Inserting trip into database...');
            const { data: newTrip, error: insertError } = await supabaseAdmin
                .from('trips')
                .insert(tripData)
                .select()
                .single();
            
            if (insertError) {
                console.error(`  ❌ Failed to insert ${trip.renter_name}:`);
                console.error(`  ❌ Error message: ${insertError.message}`);
                console.error(`  ❌ Error code: ${insertError.code}`);
                console.error(`  ❌ Error hint: ${insertError.hint}`);
                console.error(`  ❌ Full error:`, insertError);
                
                // Try to understand the specific constraint violation
                if (insertError.code === '23505') {
                    console.log('  🔍 Unique constraint violation - checking which constraint...');
                    if (insertError.message.includes('host_id_turo_trip_id')) {
                        console.log('  ⚠️  Duplicate host_id + turo_trip_id combination');
                    }
                }
                continue;
            }
            
            if (!newTrip) {
                console.error(`  ❌ Insert returned no data for ${trip.renter_name}`);
                continue;
            }
            
            console.log(`  ✅ Successfully inserted ${trip.renter_name}!`);
            console.log(`  📍 Database ID: ${newTrip.id}`);
            console.log(`  🗓️  Start: ${new Date(newTrip.start_date).toLocaleString()}`);
            console.log(`  🗓️  End: ${new Date(newTrip.end_date).toLocaleString()}`);
            
            // Step 4: Verify insertion
            console.log('  🔍 Verifying trip was saved...');
            const { data: verifyTrip, error: verifyError } = await supabaseAdmin
                .from('trips')
                .select('id, turo_trip_id, renter_name, vehicle_plate, start_date, trip_status')
                .eq('id', newTrip.id)
                .single();
            
            if (verifyError || !verifyTrip) {
                console.error(`  ❌ CRITICAL: Trip ${trip.renter_name} not found after insert!`);
                console.error(`  ❌ Verify error:`, verifyError);
            } else {
                console.log(`  ✅ VERIFIED: ${verifyTrip.renter_name} (${verifyTrip.turo_trip_id}) saved successfully`);
            }
        }
        
        // Final verification of all upcoming trips
        console.log('\n🔍 Final verification - checking all upcoming trips...');
        const { data: finalTrips, error: finalError } = await supabaseAdmin
            .from('trips')
            .select('id, turo_trip_id, renter_name, vehicle_plate, start_date, trip_status')
            .eq('host_id', hostId)
            .gte('start_date', '2025-08-29T00:00:00+00:00') // From tomorrow
            .order('start_date', { ascending: true });
        
        if (finalError) {
            console.error('❌ Error in final verification:', finalError);
        } else {
            console.log('\\n📊 Final upcoming trips in database:');
            if (finalTrips.length === 0) {
                console.log('  ⚠️  No upcoming trips found');
            } else {
                finalTrips.forEach(trip => {
                    console.log(`  ✅ ${trip.renter_name} (${trip.turo_trip_id}): ${trip.vehicle_plate} - ${new Date(trip.start_date).toLocaleDateString()} (${trip.trip_status})`);
                });
            }
            console.log(`\\nTotal upcoming trips: ${finalTrips.length}`);
        }
        
        console.log('\\n🎉 Upcoming trips fix process completed!');
        
    } catch (error) {
        console.error('❌ Script failed with error:', error);
        console.error('❌ Stack trace:', error.stack);
    }
}

// Run the fix
fixUpcomingTrips();