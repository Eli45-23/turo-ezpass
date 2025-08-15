const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to the database
const dbPath = path.join(__dirname, 'turo_tolls.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Starting historical toll data generation...');

// Clear existing toll data first
db.run(`DELETE FROM toll_charges`, function(err) {
    if (err) {
        console.error('Error clearing data:', err);
        return;
    }
    
    console.log(`✅ Cleared ${this.changes} existing toll charges`);
    
    // Generate 3 months of historical data
    const now = Date.now();
    const threeMonthsAgo = new Date(2025, 4, 1).getTime(); // May 1, 2025
    const currentDate = new Date(2025, 7, 6).getTime(); // August 6, 2025 (today)
    
    console.log('Date range:');
    console.log('From:', new Date(threeMonthsAgo).toISOString());
    console.log('To:', new Date(currentDate).toISOString());
    
    const locations = [
        { name: 'George Washington Bridge', amount: 16.00 },
        { name: 'Lincoln Tunnel', amount: 16.00 },
        { name: 'Holland Tunnel', amount: 16.00 },
        { name: 'Verrazzano Bridge', amount: 19.00 },
        { name: 'Queensboro Bridge', amount: 10.17 },
        { name: 'Triborough Bridge', amount: 10.17 },
        { name: 'Midtown Tunnel', amount: 10.17 },
        { name: 'Brooklyn Bridge', amount: 0.00 },
        { name: 'Williamsburg Bridge', amount: 0.00 }
    ];
    
    const plates = ['ABC123', 'XYZ789', 'DEF456', 'GHI789', 'JKL012'];
    
    // Generate toll charges spread across 3 months
    const tollsToGenerate = [];
    
    // Generate roughly 2-3 tolls per day over 90 days = ~200 total tolls
    for (let day = 0; day < 90; day++) {
        const dayStart = threeMonthsAgo + (day * 24 * 60 * 60 * 1000);
        const tollsForDay = Math.floor(Math.random() * 4); // 0-3 tolls per day
        
        for (let i = 0; i < tollsForDay; i++) {
            const randomTimeInDay = dayStart + Math.random() * 24 * 60 * 60 * 1000;
            const location = locations[Math.floor(Math.random() * locations.length)];
            const plate = plates[Math.floor(Math.random() * plates.length)];
            
            // Only add paying tolls
            if (location.amount > 0) {
                tollsToGenerate.push({
                    date: new Date(randomTimeInDay).toISOString(),
                    location: location.name,
                    amount: location.amount,
                    plate: plate,
                    transactionId: 'HIST-' + Date.now() + '-' + day + '-' + i + '-' + Math.floor(Math.random() * 10000)
                });
            }
        }
    }
    
    console.log(`📊 Generated ${tollsToGenerate.length} toll charges to insert`);
    
    // Get the toll account ID (assuming there's at least one)
    db.get(`SELECT id FROM toll_accounts LIMIT 1`, (err, account) => {
        if (err || !account) {
            console.error('❌ No toll account found. Please add a toll account first.');
            db.close();
            return;
        }
        
        const accountId = account.id;
        console.log(`🎫 Using toll account ID: ${accountId}`);
        
        // Insert all toll charges
        let insertedCount = 0;
        let totalToInsert = tollsToGenerate.length;
        
        tollsToGenerate.forEach((toll, index) => {
            db.run(
                `INSERT INTO toll_charges 
                 (toll_account_id, toll_date, toll_location, toll_amount, plate_number, transaction_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [accountId, toll.date, toll.location, toll.amount, toll.plate, toll.transactionId],
                function(err) {
                    if (!err && this.changes > 0) {
                        insertedCount++;
                    } else if (err) {
                        console.error('Insert error:', err);
                    }
                    
                    // Progress updates
                    if ((index + 1) % 50 === 0 || index === totalToInsert - 1) {
                        console.log(`📈 Progress: ${index + 1}/${totalToInsert} (${insertedCount} inserted)`);
                    }
                    
                    // When all done
                    if (index === totalToInsert - 1) {
                        console.log(`✅ COMPLETED! Inserted ${insertedCount} historical toll charges`);
                        console.log('📅 Date range verification:');
                        
                        // Verify the date range
                        db.all(
                            `SELECT 
                                MIN(toll_date) as earliest, 
                                MAX(toll_date) as latest, 
                                COUNT(*) as total
                             FROM toll_charges WHERE toll_account_id = ?`,
                            [accountId],
                            (err, result) => {
                                if (!err && result[0]) {
                                    console.log(`   Earliest: ${result[0].earliest}`);
                                    console.log(`   Latest: ${result[0].latest}`);
                                    console.log(`   Total: ${result[0].total} charges`);
                                }
                                
                                // Update the account sync time
                                db.run(
                                    `UPDATE toll_accounts SET last_sync = CURRENT_TIMESTAMP WHERE id = ?`,
                                    [accountId],
                                    () => {
                                        console.log('🔄 Updated account sync time');
                                        console.log('🎉 ALL DONE! Refresh your dashboard to see the historical data.');
                                        db.close();
                                    }
                                );
                            }
                        );
                    }
                }
            );
        });
    });
});