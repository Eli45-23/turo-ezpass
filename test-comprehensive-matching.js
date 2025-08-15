const sqlite3 = require('sqlite3').verbose();

// Connect to database
const db = new sqlite3.Database('./turo_tolls.db');

// Import the exact matching logic from tolls.js
function checkPlateMatch(tollPlate, tripVehicle, transponderMap) {
    if (!tollPlate || !tripVehicle) {
        return { matches: true, confidence: 0.5, reason: "no plate data - time-based match" };
    }
    
    // Clean plates for comparison and handle state prefixes
    let cleanTollPlate = tollPlate.replace(/[^A-Z0-9]/g, '').toUpperCase();
    const cleanTripPlate = tripVehicle.replace(/[^A-Z0-9]/g, '').toUpperCase();
    
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
    
    // Check if toll plate is a transponder number
    if (/^\d{10,11}$/.test(cleanTollPlate)) {
        // Transponder lookup
        if (transponderMap[cleanTollPlate]) {
            let mappedPlate = transponderMap[cleanTollPlate].replace(/[^A-Z0-9]/g, '').toUpperCase();
            
            // Also remove state prefixes from mapped plates for consistency
            for (const prefix of statePrefixes) {
                if (mappedPlate.startsWith(prefix) && mappedPlate.length > prefix.length) {
                    mappedPlate = mappedPlate.substring(prefix.length);
                    break;
                }
            }
            
            if (mappedPlate === cleanTripPlate) {
                return { matches: true, confidence: 1.0, reason: `transponder ${cleanTollPlate} mapped to ${mappedPlate}` };
            }
        }
        // Unknown transponder - allow time-based matching
        return { matches: true, confidence: 0.7, reason: `unknown transponder ${cleanTollPlate}` };
    }
    
    // Direct plate comparison
    if (cleanTollPlate === cleanTripPlate) {
        return { matches: true, confidence: 1.0, reason: `exact plate match ${cleanTollPlate}` };
    }
    
    // No match
    return { matches: false, confidence: 0, reason: `plate mismatch ${cleanTollPlate}≠${cleanTripPlate}` };
}

// Test comprehensive matching
async function testComprehensiveMatching() {
    console.log('🧪 Testing Comprehensive Toll Matching with Transponders & State Prefixes\n');
    
    // Load transponder mappings
    db.all(`
        SELECT transponder_number, vehicle_plate 
        FROM transponder_mappings 
        WHERE host_id = 1 AND is_active = 1
    `, (err, mappings) => {
        if (err) {
            console.error('❌ Error fetching mappings:', err);
            return;
        }
        
        const transponderMap = {};
        mappings.forEach(m => {
            transponderMap[m.transponder_number] = m.vehicle_plate;
        });
        console.log(`📷 Loaded transponder mappings:`, transponderMap);
        console.log('');
        
        // Get unmatched tolls
        db.all(`
            SELECT tc.*, ta.host_id
            FROM toll_charges tc
            JOIN toll_accounts ta ON tc.toll_account_id = ta.id
            WHERE ta.host_id = 1 AND tc.is_matched = 0 AND tc.plate_number IS NOT NULL
            ORDER BY tc.toll_date ASC
        `, (err, unmatchedTolls) => {
            if (err) {
                console.error('❌ Error fetching unmatched tolls:', err);
                return;
            }
            
            console.log(`📊 Found ${unmatchedTolls.length} unmatched tolls with plate data\n`);
            
            // Get active trips
            db.all(`
                SELECT * FROM trips 
                WHERE host_id = 1
                AND (trip_status IS NULL OR trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
                ORDER BY start_date ASC
            `, (err, trips) => {
                if (err) {
                    console.error('❌ Error fetching trips:', err);
                    return;
                }
                
                console.log(`🎯 Found ${trips.length} active trips\n`);
                
                let potentialMatches = 0;
                let matchDetails = [];
                
                unmatchedTolls.forEach((toll, index) => {
                    console.log(`--- Testing Toll ${index + 1}/${unmatchedTolls.length} ---`);
                    console.log(`Date: ${toll.toll_date}`);
                    console.log(`Location: ${toll.toll_location}`);
                    console.log(`Amount: $${toll.toll_amount}`);
                    console.log(`Plate: ${toll.plate_number}`);
                    
                    let foundMatch = false;
                    
                    trips.forEach(trip => {
                        const tollDate = new Date(toll.toll_date);
                        const tripStart = new Date(trip.start_date);
                        const tripEnd = new Date(trip.end_date);
                        
                        // Check if toll is during trip period (exact period matching)
                        if (tollDate >= tripStart && tollDate <= tripEnd) {
                            console.log(`  📅 Date match with Trip ${trip.id} (${trip.renter_name})`);
                            console.log(`    Trip: ${trip.start_date} to ${trip.end_date}`);
                            console.log(`    Vehicle: ${trip.vehicle_plate}`);
                            
                            const plateMatch = checkPlateMatch(toll.plate_number, trip.vehicle_plate, transponderMap);
                            console.log(`    🎯 Plate result: ${plateMatch.matches ? '✅' : '❌'} (${plateMatch.reason})`);
                            
                            if (plateMatch.matches && !foundMatch) {
                                potentialMatches++;
                                foundMatch = true;
                                matchDetails.push({
                                    tollId: toll.id,
                                    tripId: trip.id,
                                    tollAmount: toll.toll_amount,
                                    tollPlate: toll.plate_number,
                                    tripPlate: trip.vehicle_plate,
                                    renterName: trip.renter_name,
                                    reason: plateMatch.reason,
                                    confidence: plateMatch.confidence
                                });
                                console.log(`    ✨ MATCH FOUND! (Confidence: ${plateMatch.confidence})`);
                            }
                        }
                    });
                    
                    if (!foundMatch) {
                        console.log(`  ❌ No matches found for this toll`);
                    }
                    console.log('');
                });
                
                console.log(`🎯 SUMMARY`);
                console.log(`=========`);
                console.log(`Total unmatched tolls tested: ${unmatchedTolls.length}`);
                console.log(`Potential matches found: ${potentialMatches}`);
                console.log(`Match rate: ${((potentialMatches / unmatchedTolls.length) * 100).toFixed(1)}%`);
                console.log(`Total value of matchable tolls: $${matchDetails.reduce((sum, m) => sum + m.tollAmount, 0).toFixed(2)}`);
                
                if (matchDetails.length > 0) {
                    console.log(`\n📋 Match Details:`);
                    matchDetails.forEach((match, i) => {
                        console.log(`${i + 1}. Toll ID ${match.tollId} ($${match.tollAmount}) → Trip ${match.tripId} (${match.renterName})`);
                        console.log(`   Plates: ${match.tollPlate} → ${match.tripPlate}`);
                        console.log(`   Reason: ${match.reason}`);
                    });
                }
                
                db.close();
            });
        });
    });
}

// Run the test
testComprehensiveMatching();