const sqlite3 = require('sqlite3').verbose();

// Connect to database
const db = new sqlite3.Database('./turo_tolls.db');

// Function to check plate matching with state prefixes
function checkPlateMatch(tollPlate, tripVehicle, transponderMap = {}) {
    if (!tollPlate || !tripVehicle) {
        return { matches: true, confidence: 0.5, reason: "no plate data - time-based match" };
    }
    
    // Clean plates for comparison and handle state prefixes
    let cleanTollPlate = tollPlate.replace(/[^A-Z0-9]/g, '').toUpperCase();
    const cleanTripPlate = tripVehicle.replace(/[^A-Z0-9]/g, '').toUpperCase();
    
    console.log(`🔍 Original plates: toll="${tollPlate}" trip="${tripVehicle}"`);
    console.log(`🔍 Cleaned plates: toll="${cleanTollPlate}" trip="${cleanTripPlate}"`);
    
    // Remove common state prefixes from toll plates (EZ-Pass often adds these)
    const statePrefixes = ['NY', 'NJ', 'PA', 'CT', 'MA', 'DE', 'MD', 'VA', 'FL', 'CA', 'TX'];
    for (const prefix of statePrefixes) {
        if (cleanTollPlate.startsWith(prefix) && cleanTollPlate.length > prefix.length) {
            const withoutPrefix = cleanTollPlate.substring(prefix.length);
            console.log(`🔍 Detected state prefix: ${tollPlate} → ${prefix} + ${withoutPrefix}`);
            cleanTollPlate = withoutPrefix;
            break;
        }
    }
    
    console.log(`🔍 Final comparison: "${cleanTollPlate}" vs "${cleanTripPlate}"`);
    
    // Direct plate comparison
    if (cleanTollPlate === cleanTripPlate) {
        return { matches: true, confidence: 1.0, reason: `exact plate match ${cleanTollPlate}` };
    }
    
    // No match
    return { matches: false, confidence: 0, reason: `plate mismatch ${cleanTollPlate}≠${cleanTripPlate}` };
}

// Test the matching algorithm with some sample data
async function testStatePrefix() {
    console.log('🧪 Testing State Prefix Handling in Toll Matching\n');
    
    // Get unmatched tolls with plate data
    db.all(`
        SELECT tc.*, ta.host_id
        FROM toll_charges tc
        JOIN toll_accounts ta ON tc.toll_account_id = ta.id
        WHERE ta.host_id = 1 AND tc.is_matched = 0 AND tc.plate_number IS NOT NULL
        LIMIT 10
    `, (err, unmatchedTolls) => {
        if (err) {
            console.error('❌ Error fetching unmatched tolls:', err);
            db.close();
            return;
        }
        
        console.log(`📊 Found ${unmatchedTolls.length} unmatched tolls with plate data\n`);
        
        // Get active trips
        db.all(`
            SELECT * FROM trips 
            WHERE host_id = 1
            AND (trip_status IS NULL OR trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
            LIMIT 20
        `, (err, trips) => {
            if (err) {
                console.error('❌ Error fetching trips:', err);
                db.close();
                return;
            }
            
            console.log(`🎯 Found ${trips.length} active trips\n`);
            
            let potentialMatches = 0;
            
            unmatchedTolls.forEach((toll, index) => {
                console.log(`--- Testing Toll ${index + 1} ---`);
                console.log(`Date: ${toll.toll_date}, Location: ${toll.toll_location}, Amount: $${toll.toll_amount}`);
                console.log(`Plate: ${toll.plate_number}`);
                
                trips.forEach(trip => {
                    const tollDate = new Date(toll.toll_date);
                    const tripStart = new Date(trip.start_date);
                    const tripEnd = new Date(trip.end_date);
                    
                    // Check if toll is during trip period
                    if (tollDate >= tripStart && tollDate <= tripEnd) {
                        console.log(`  📅 Date match with Trip ${trip.id} (${trip.renter_name}): ${trip.start_date} to ${trip.end_date}`);
                        console.log(`  🚗 Trip vehicle: ${trip.vehicle_plate}`);
                        
                        const plateMatch = checkPlateMatch(toll.plate_number, trip.vehicle_plate);
                        console.log(`  🎯 Plate match: ${plateMatch.matches ? '✅' : '❌'} (${plateMatch.reason})`);
                        
                        if (plateMatch.matches) {
                            potentialMatches++;
                            console.log(`  ✨ POTENTIAL MATCH FOUND!`);
                        }
                        console.log('');
                    }
                });
                
                console.log('');
            });
            
            console.log(`🎯 Summary: Found ${potentialMatches} potential matches with improved state prefix handling`);
            db.close();
        });
    });
}

// Run the test
testStatePrefix();