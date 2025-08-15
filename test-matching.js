const { db } = require('./config/database');
const TuroIntegrationService = require('./services/turo-integration');

async function testMatching() {
    console.log('🧪 Testing toll matching logic...');
    
    try {
        const turoService = new TuroIntegrationService();
        
        // Test with host ID 1
        const result = await turoService.autoMatchTolls(1);
        
        console.log('✅ Matching complete:', result);
        
        // Show current toll matching status
        db.all(
            `SELECT 
                tc.toll_date, 
                tc.toll_location, 
                tc.toll_amount, 
                tc.plate_number,
                tc.is_matched,
                t.turo_trip_id,
                t.renter_name,
                t.start_date,
                t.end_date
             FROM toll_charges tc
             LEFT JOIN trips t ON tc.trip_id = t.id
             WHERE tc.toll_account_id IN (SELECT id FROM toll_accounts WHERE host_id = 1)
             ORDER BY tc.toll_date DESC
             LIMIT 15`,
            [],
            (err, results) => {
                if (err) {
                    console.error('❌ Error fetching results:', err);
                } else {
                    console.log('\n📊 Current toll matching status:');
                    results.forEach(row => {
                        const matchStatus = row.is_matched ? '✅' : '❌';
                        const tripInfo = row.is_matched ? 
                            `${row.turo_trip_id} (${row.renter_name})` : 
                            'UNMATCHED';
                        console.log(`${matchStatus} ${row.toll_date.split('T')[0]} - ${row.toll_location} $${row.toll_amount} [${row.plate_number}] -> ${tripInfo}`);
                    });
                }
                
                process.exit(0);
            }
        );
        
    } catch (error) {
        console.error('❌ Error testing matching:', error);
        process.exit(1);
    }
}

testMatching();