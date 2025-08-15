const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./turo_tolls.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
        return;
    }
    console.log('Connected to database');
});

// Get a toll that should match - within April-August range
console.log('Looking for tolls after April 1, 2025...');
db.get(`SELECT * FROM toll_charges WHERE plate_number = 'LPJ3806' AND toll_date >= 1743638400000 ORDER BY toll_date LIMIT 1`, (err, toll) => {
    if (err || !toll) {
        console.log('No tolls found in date range, using any toll for LPJ3806');
        // Fall back to any toll for this plate
        db.get(`SELECT * FROM toll_charges WHERE plate_number = 'LPJ3806' ORDER BY toll_date DESC LIMIT 1`, processTestToll);
        return;
    }
    processTestToll(null, toll);
});

function processTestToll(err, toll) {
    if (err || !toll) {
        console.error('Error getting toll:', err);
        db.close();
        return;
    }
    
    console.log('🎯 Toll Details:', {
        id: toll.id,
        toll_date: toll.toll_date,
        plate_number: toll.plate_number,
        toll_location: toll.toll_location,
        readable_date: new Date(toll.toll_date).toISOString()
    });
    
    // Get trips for the same plate
    db.all(`SELECT * FROM trips WHERE vehicle_plate = ? ORDER BY start_date`, [toll.plate_number], (err, trips) => {
        if (err) {
            console.error('Error getting trips:', err);
            db.close();
            return;
        }
        
        console.log(`\n🚗 Found ${trips.length} trips for plate ${toll.plate_number}:`);
        
        const tollDate = new Date(toll.toll_date);
        let foundMatch = false;
        
        trips.forEach((trip, index) => {
            const tripStart = new Date(trip.start_date);
            const tripEnd = new Date(trip.end_date);
            const isMatch = tollDate >= tripStart && tollDate <= tripEnd;
            
            console.log(`\nTrip ${index + 1}:`, {
                turo_trip_id: trip.turo_trip_id,
                start_date: tripStart.toISOString(),
                end_date: tripEnd.toISOString(),
                toll_within_range: isMatch,
                hours_diff: Math.round((tollDate - tripStart) / (1000 * 60 * 60))
            });
            
            if (isMatch) {
                foundMatch = true;
                console.log('✅ PERFECT MATCH FOUND!');
            }
        });
        
        if (!foundMatch) {
            console.log('\n❌ No matches found for this toll');
        }
        
        db.close();
    });
}