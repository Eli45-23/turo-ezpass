const sqlite3 = require('sqlite3').verbose();

// Connect to database
const db = new sqlite3.Database('./turo_tolls.db');

// Test pure time-based matching (ignoring plates completely)
async function testTimeBasedMatching() {
    console.log('🧪 Testing Pure Time-Based Toll Matching (Ignoring License Plates)\n');
    console.log('This will help identify if the core issue is date misalignment or plate misalignment.\n');
    
    // Get unmatched tolls
    db.all(`
        SELECT tc.*, ta.host_id
        FROM toll_charges tc
        JOIN toll_accounts ta ON tc.toll_account_id = ta.id
        WHERE ta.host_id = 1 AND tc.is_matched = 0
        ORDER BY tc.toll_date ASC
    `, (err, unmatchedTolls) => {
        if (err) {
            console.error('❌ Error fetching unmatched tolls:', err);
            return;
        }
        
        console.log(`📊 Found ${unmatchedTolls.length} total unmatched tolls\n`);
        
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
            
            let timeMatches = 0;
            let plateAndTimeMatches = 0;
            let matchDetails = [];
            let unmatchedDetails = [];
            
            unmatchedTolls.forEach((toll, index) => {
                if (index < 10) { // Show details for first 10
                    console.log(`--- Testing Toll ${index + 1}/${unmatchedTolls.length} ---`);
                    console.log(`Date: ${toll.toll_date}`);
                    console.log(`Location: ${toll.toll_location}`);
                    console.log(`Amount: $${toll.toll_amount}`);
                    console.log(`Plate: ${toll.plate_number || 'N/A'}`);
                }
                
                let foundTimeMatch = false;
                let foundPlateMatch = false;
                let bestMatch = null;
                
                trips.forEach(trip => {
                    const tollDate = new Date(toll.toll_date);
                    const tripStart = new Date(trip.start_date);
                    const tripEnd = new Date(trip.end_date);
                    
                    // Check if toll is during trip period (exact period matching)
                    if (tollDate >= tripStart && tollDate <= tripEnd) {
                        foundTimeMatch = true;
                        
                        if (index < 10) {
                            console.log(`  📅 TIME MATCH with Trip ${trip.id} (${trip.renter_name})`);
                            console.log(`    Trip: ${trip.start_date} to ${trip.end_date}`);
                            console.log(`    Vehicle: ${trip.vehicle_plate}`);
                        }
                        
                        // Check plates for comparison (but don't require match)
                        if (toll.plate_number && trip.vehicle_plate) {
                            // Simple comparison - remove state prefixes and clean
                            let cleanTollPlate = toll.plate_number.replace(/^NY\s*/, '').replace(/[^A-Z0-9]/g, '').toUpperCase();
                            let cleanTripPlate = trip.vehicle_plate.replace(/[^A-Z0-9]/g, '').toUpperCase();
                            
                            if (cleanTollPlate === cleanTripPlate) {
                                foundPlateMatch = true;
                                if (index < 10) {
                                    console.log(`    🎯 PLATE ALSO MATCHES! (${cleanTollPlate})`);
                                }
                            } else if (index < 10) {
                                console.log(`    🎯 Plate mismatch: ${cleanTollPlate} ≠ ${cleanTripPlate}`);
                            }
                        }
                        
                        if (!bestMatch) {
                            bestMatch = {
                                tripId: trip.id,
                                renterName: trip.renter_name,
                                tripPlate: trip.vehicle_plate
                            };
                        }
                    }
                });
                
                if (foundTimeMatch) {
                    timeMatches++;
                    
                    matchDetails.push({
                        tollId: toll.id,
                        tollDate: toll.toll_date,
                        tollAmount: toll.toll_amount,
                        tollPlate: toll.plate_number,
                        tripId: bestMatch.tripId,
                        tripPlate: bestMatch.tripPlate,
                        renterName: bestMatch.renterName,
                        hasPlateMatch: foundPlateMatch
                    });
                    
                    if (foundPlateMatch) {
                        plateAndTimeMatches++;
                    }
                } else {
                    unmatchedDetails.push({
                        tollId: toll.id,
                        tollDate: toll.toll_date,
                        tollAmount: toll.toll_amount,
                        tollPlate: toll.plate_number
                    });
                }
                
                if (index < 10) {
                    console.log(`  Result: ${foundTimeMatch ? (foundPlateMatch ? '✅ TIME + PLATE' : '⚠️ TIME ONLY') : '❌ NO MATCH'}`);
                    console.log('');
                }
            });
            
            console.log(`🎯 COMPREHENSIVE ANALYSIS`);
            console.log(`========================`);
            console.log(`Total unmatched tolls: ${unmatchedTolls.length}`);
            console.log(`Time-based matches: ${timeMatches} (${((timeMatches / unmatchedTolls.length) * 100).toFixed(1)}%)`);
            console.log(`Time + plate matches: ${plateAndTimeMatches} (${((plateAndTimeMatches / unmatchedTolls.length) * 100).toFixed(1)}%)`);
            console.log(`Time-only matches: ${timeMatches - plateAndTimeMatches}`);
            console.log(`Complete non-matches: ${unmatchedTolls.length - timeMatches}`);
            console.log(`Total value of time-matchable tolls: $${matchDetails.reduce((sum, m) => sum + m.tollAmount, 0).toFixed(2)}`);
            console.log(`Total value of perfect matches: $${matchDetails.filter(m => m.hasPlateMatch).reduce((sum, m) => sum + m.tollAmount, 0).toFixed(2)}`);
            
            if (unmatchedDetails.length > 0) {
                console.log(`\n⚠️ TOLLS WITH NO TIME MATCHES (${unmatchedDetails.length})`);
                unmatchedDetails.slice(0, 5).forEach((toll, i) => {
                    console.log(`${i + 1}. ${toll.tollDate} - $${toll.tollAmount} (${toll.tollPlate || 'No plate'})`);
                });
                if (unmatchedDetails.length > 5) {
                    console.log(`   ... and ${unmatchedDetails.length - 5} more`);
                }
            }
            
            console.log(`\n🔍 CONCLUSION:`);
            if (timeMatches > plateAndTimeMatches * 2) {
                console.log(`The main issue is PLATE MISALIGNMENT - tolls fall within trip dates but plates don't match.`);
                console.log(`Recommendation: Use time-based matching with manual plate verification.`);
            } else if (timeMatches < unmatchedTolls.length * 0.3) {
                console.log(`The main issue is DATE MISALIGNMENT - tolls don't fall within any trip periods.`);
                console.log(`This suggests missing trip data or incorrect toll/trip dates.`);
            } else {
                console.log(`Mixed issues - both date and plate alignment need attention.`);
            }
            
            db.close();
        });
    });
}

// Run the test
testTimeBasedMatching();