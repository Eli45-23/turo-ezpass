const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const TuroIntegrationService = require('./services/turo-integration');
const path = require('path');

// Connect to database
const dbPath = path.join(__dirname, 'turo_tolls.db');
const db = new sqlite3.Database(dbPath);

console.log('🧪 Testing complete CSV import workflow...\n');

// Step 1: Create a test user if not exists
const email = 'test@example.com';
const password = 'testpass123';

bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
        console.error('Error hashing password:', err);
        return;
    }
    
    // Insert or update test user
    db.run(
        'INSERT OR REPLACE INTO hosts (email, password_hash, full_name) VALUES (?, ?, ?)',
        [email, hashedPassword, 'Test User'],
        function(err) {
            if (err) {
                console.error('Error creating test user:', err);
                return;
            }
            
            const hostId = this.lastID || 1; // Use existing ID if replacing
            console.log(`✅ Test host created/updated with ID: ${hostId}`);
            
            // Step 2: Create a toll account for the host
            db.run(
                'INSERT OR REPLACE INTO toll_accounts (host_id, provider, account_number, username, password_encrypted) VALUES (?, ?, ?, ?, ?)',
                [hostId, 'EZ-Pass NY', 'TEST123456', 'test@example.com', 'encrypted_test_password'],
                function(err) {
                    if (err) {
                        console.error('Error creating toll account:', err);
                        return;
                    }
                    
                    const tollAccountId = this.lastID || 1;
                    console.log(`✅ Toll account created with ID: ${tollAccountId}`);
                    
                    // Step 3: Test CSV import
                    const csvData = `Reservation ID,Guest,Vehicle,Trip start,Trip end,Trip status
12345678,John Smith,Elias's Mazda (NY #LPJ3806),2025-05-15 10:00 AM,2025-05-18 06:00 PM,Completed
87654321,Sarah Johnson,Toyota Camry (NY #ABC123),2025-06-05 02:00 PM,2025-06-08 08:00 PM,Completed
11223344,Mike Davis,Honda Civic (NY #XYZ789),2025-06-20 09:00 AM,2025-06-23 05:00 PM,Completed
99887766,Emily Wilson,Ford Focus (NY #DEF456),2025-07-01 11:00 AM,2025-07-04 07:00 PM,Completed
55667788,David Brown,Nissan Altima (NY #GHI789),2025-05-25 08:00 AM,2025-05-28 04:00 PM,Completed`;
                    
                    const turoService = new TuroIntegrationService();
                    
                    console.log('\n📊 Testing CSV import...');
                    turoService.importFromCSV(csvData, hostId)
                        .then(results => {
                            const successfulImports = results.filter(r => r.changes > 0);
                            console.log(`✅ Imported ${successfulImports.length} trips successfully`);
                            
                            // Step 4: Generate some historical toll data that matches the trips
                            console.log('\n🚗 Generating matching toll data...');
                            
                            const tollCharges = [
                                { date: '2025-05-16T15:30:00.000Z', plate: 'LPJ3806', location: 'George Washington Bridge', amount: 16.00 },
                                { date: '2025-05-17T09:15:00.000Z', plate: 'LPJ3806', location: 'Lincoln Tunnel', amount: 16.00 },
                                { date: '2025-06-06T14:45:00.000Z', plate: 'ABC123', location: 'Holland Tunnel', amount: 16.00 },
                                { date: '2025-06-21T11:30:00.000Z', plate: 'XYZ789', location: 'Verrazzano Bridge', amount: 19.00 },
                                { date: '2025-07-02T16:00:00.000Z', plate: 'DEF456', location: 'Queensboro Bridge', amount: 10.17 },
                                { date: '2025-05-26T13:20:00.000Z', plate: 'GHI789', location: 'Triborough Bridge', amount: 10.17 }
                            ];
                            
                            let insertedTolls = 0;
                            tollCharges.forEach((toll, index) => {
                                db.run(
                                    'INSERT INTO toll_charges (toll_account_id, toll_date, toll_location, toll_amount, plate_number, transaction_id) VALUES (?, ?, ?, ?, ?, ?)',
                                    [tollAccountId, toll.date, toll.location, toll.amount, toll.plate, `TEST-${Date.now()}-${index}`],
                                    function(err) {
                                        if (!err) insertedTolls++;
                                        
                                        if (index === tollCharges.length - 1) {
                                            console.log(`✅ Inserted ${insertedTolls} toll charges`);
                                            
                                            // Step 5: Test auto-matching
                                            console.log('\n🔄 Testing auto-matching...');
                                            turoService.autoMatchTolls(hostId)
                                                .then(matchResult => {
                                                    console.log(`✅ Auto-matching completed:`);
                                                    console.log(`   - Matched ${matchResult.matchedCount} tolls`);
                                                    console.log(`   - Total charges: ${matchResult.totalCharges}`);
                                                    console.log(`   - Match confidence scores:`, matchResult.matches.map(m => m.confidence));
                                                    
                                                    // Step 6: Verify final state
                                                    console.log('\n📈 Final verification...');
                                                    db.all(
                                                        `SELECT 
                                                            t.turo_trip_id, t.renter_name, t.vehicle_plate,
                                                            COUNT(tc.id) as toll_count,
                                                            SUM(tc.toll_amount) as total_amount
                                                         FROM trips t
                                                         LEFT JOIN toll_charges tc ON t.id = tc.trip_id
                                                         WHERE t.host_id = ?
                                                         GROUP BY t.id`,
                                                        [hostId],
                                                        (err, trips) => {
                                                            if (!err) {
                                                                console.log('\n🎯 FINAL RESULTS:');
                                                                trips.forEach(trip => {
                                                                    console.log(`   ${trip.turo_trip_id} (${trip.renter_name}, ${trip.vehicle_plate}): ${trip.toll_count || 0} tolls, $${(trip.total_amount || 0).toFixed(2)}`);
                                                                });
                                                                
                                                                console.log('\n✅ CSV import workflow test COMPLETED successfully!');
                                                                console.log('\n📋 To test in browser:');
                                                                console.log(`   1. Go to http://localhost:3000`);
                                                                console.log(`   2. Login with: ${email} / ${password}`);
                                                                console.log(`   3. Upload your CSV file`);
                                                                console.log(`   4. Check the trips section for imported data`);
                                                                
                                                                db.close();
                                                            }
                                                        }
                                                    );
                                                })
                                                .catch(err => {
                                                    console.error('❌ Auto-matching failed:', err);
                                                    db.close();
                                                });
                                        }
                                    }
                                );
                            });
                        })
                        .catch(error => {
                            console.error('❌ CSV import failed:', error);
                            db.close();
                        });
                }
            );
        }
    );
});