#!/usr/bin/env node

/**
 * Fix canceled trips issue by:
 * 1. Adding trip_status column to trips table
 * 2. Identifying and marking likely canceled trips
 * 3. Re-matching tolls to active trips only
 */

const { db } = require('./config/database');

async function fixCanceledTrips() {
    console.log('🔧 Starting canceled trips cleanup...');
    
    // Step 1: Add trip_status column if it doesn't exist
    await new Promise((resolve, reject) => {
        db.run(
            `ALTER TABLE trips ADD COLUMN trip_status TEXT DEFAULT 'active'`,
            (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.error('Error adding trip_status column:', err.message);
                    reject(err);
                } else {
                    console.log('✅ trip_status column added/verified');
                    resolve();
                }
            }
        );
    });
    
    // Step 2: Find potential canceled trips by looking for same vehicle/dates with different renters
    const potentialCancelations = await new Promise((resolve, reject) => {
        db.all(`
            SELECT t1.id as trip1_id, t1.turo_trip_id as trip1_turo_id, t1.renter_name as renter1,
                   t2.id as trip2_id, t2.turo_trip_id as trip2_turo_id, t2.renter_name as renter2,
                   t1.vehicle_plate, t1.start_date, t1.end_date,
                   COUNT(tc.id) as toll_count_trip1,
                   (SELECT COUNT(*) FROM toll_charges tc2 WHERE tc2.trip_id = t2.id) as toll_count_trip2
            FROM trips t1
            JOIN trips t2 ON t1.vehicle_plate = t2.vehicle_plate 
                         AND t1.id != t2.id
                         AND t1.renter_name != t2.renter_name
                         AND (
                             (t1.start_date <= t2.end_date AND t1.end_date >= t2.start_date) OR
                             (t2.start_date <= t1.end_date AND t2.end_date >= t1.start_date)
                         )
            LEFT JOIN toll_charges tc ON tc.trip_id = t1.id
            GROUP BY t1.id, t2.id
            HAVING toll_count_trip1 > 0 OR toll_count_trip2 = 0
            ORDER BY t1.vehicle_plate, t1.start_date
        `, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
    
    console.log(`🔍 Found ${potentialCancelations.length} potential cancelation conflicts`);
    
    // Step 3: Analyze conflicts and mark likely canceled trips
    const tripsToCancel = [];
    
    for (const conflict of potentialCancelations) {
        console.log(`\n🚗 Vehicle ${conflict.vehicle_plate} conflict:`);
        console.log(`  Trip 1: ${conflict.trip1_turo_id} - ${conflict.renter1} (${conflict.toll_count_trip1} tolls)`);
        console.log(`  Trip 2: ${conflict.trip2_turo_id} - ${conflict.renter2} (${conflict.toll_count_trip2} tolls)`);
        
        // If one trip has all the tolls and the other has none, mark the zero-toll trip as likely canceled
        if (conflict.toll_count_trip1 > 0 && conflict.toll_count_trip2 === 0) {
            tripsToCancel.push({
                tripId: conflict.trip2_id,
                turoTripId: conflict.trip2_turo_id,
                renterName: conflict.renter2,
                reason: `No tolls vs ${conflict.toll_count_trip1} tolls on conflicting trip`
            });
            console.log(`  ❌ Marking trip ${conflict.trip2_turo_id} (${conflict.renter2}) as likely canceled`);
        } else if (conflict.toll_count_trip2 > 0 && conflict.toll_count_trip1 === 0) {
            tripsToCancel.push({
                tripId: conflict.trip1_id,
                turoTripId: conflict.trip1_turo_id,
                renterName: conflict.renter1,
                reason: `No tolls vs ${conflict.toll_count_trip2} tolls on conflicting trip`
            });
            console.log(`  ❌ Marking trip ${conflict.trip1_turo_id} (${conflict.renter1}) as likely canceled`);
        }
    }
    
    console.log(`\n🚫 Found ${tripsToCancel.length} likely canceled trips to mark:`);
    tripsToCancel.forEach(trip => {
        console.log(`  - ${trip.turoTripId} (${trip.renterName}): ${trip.reason}`);
    });
    
    // Step 4: Mark trips as canceled
    for (const trip of tripsToCancel) {
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE trips SET trip_status = 'canceled' WHERE id = ?`,
                [trip.tripId],
                function(err) {
                    if (err) {
                        console.error(`❌ Error marking trip ${trip.turoTripId} as canceled:`, err.message);
                        reject(err);
                    } else {
                        console.log(`✅ Marked trip ${trip.turoTripId} as canceled`);
                        resolve();
                    }
                }
            );
        });
    }
    
    // Step 5: Unmatch tolls from canceled trips
    console.log('\n🔄 Unmatching tolls from canceled trips...');
    const unmatchResult = await new Promise((resolve, reject) => {
        db.run(
            `UPDATE toll_charges 
             SET trip_id = NULL, is_matched = 0 
             WHERE trip_id IN (
                 SELECT id FROM trips WHERE trip_status IN ('canceled', 'cancelled', 'declined')
             )`,
            function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
    
    console.log(`✅ Unmatched ${unmatchResult} toll charges from canceled trips`);
    
    // Step 6: Re-match tolls to active trips only
    console.log('\n🎯 Re-matching tolls to active trips...');
    const TuroIntegrationService = require('./services/turo-integration');
    const turoService = new TuroIntegrationService();
    
    // Get all host IDs
    const hostIds = await new Promise((resolve, reject) => {
        db.all(`SELECT DISTINCT host_id FROM trips`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(r => r.host_id));
        });
    });
    
    for (const hostId of hostIds) {
        const matchResult = await turoService.autoMatchTolls(hostId);
        console.log(`✅ Host ${hostId}: Re-matched ${matchResult.matchedCount} tolls to active trips`);
    }
    
    // Step 7: Summary report
    console.log('\n📊 Final Summary:');
    const finalStats = await new Promise((resolve, reject) => {
        db.get(`
            SELECT 
                COUNT(CASE WHEN trip_status = 'canceled' THEN 1 END) as canceled_trips,
                COUNT(CASE WHEN trip_status != 'canceled' OR trip_status IS NULL THEN 1 END) as active_trips,
                (SELECT COUNT(*) FROM toll_charges WHERE is_matched = 1) as matched_tolls,
                (SELECT COUNT(*) FROM toll_charges WHERE is_matched = 0) as unmatched_tolls
            FROM trips
        `, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
    
    console.log(`  📈 Active trips: ${finalStats.active_trips}`);
    console.log(`  ❌ Canceled trips: ${finalStats.canceled_trips}`);
    console.log(`  🎯 Matched tolls: ${finalStats.matched_tolls}`);
    console.log(`  ❓ Unmatched tolls: ${finalStats.unmatched_tolls}`);
    
    console.log('\n✅ Canceled trips cleanup completed!');
    process.exit(0);
}

// Run the fix
fixCanceledTrips().catch(err => {
    console.error('❌ Error fixing canceled trips:', err);
    process.exit(1);
});