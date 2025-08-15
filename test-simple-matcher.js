const SimpleTollMatcher = require('./services/simple-toll-matcher.js');
const { db } = require('./config/database');

async function testWithRealData() {
    console.log('🧪 Testing Simple Toll Matcher with real database data...');
    
    const matcher = new SimpleTollMatcher();
    
    // Get real trips and tolls from database
    const trips = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM trips WHERE host_id = 1 ORDER BY start_date', (err, results) => {
            if (err) reject(err);
            else resolve(results || []);
        });
    });
    
    const tollQuery = `SELECT tc.*, ta.host_id FROM toll_charges tc 
                       JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                       WHERE ta.host_id = 1 ORDER BY toll_date`;
    
    const tolls = await new Promise((resolve, reject) => {
        db.all(tollQuery, (err, results) => {
            if (err) reject(err);
            else resolve(results || []);
        });
    });
    
    console.log(`📊 Found ${trips.length} trips and ${tolls.length} tolls in database`);
    
    // Test with unmatched tolls only for fair comparison
    const unmatchedTolls = tolls.filter(toll => !toll.is_matched);
    console.log(`🎯 Testing with ${unmatchedTolls.length} unmatched tolls`);
    
    const progressCallback = (progress) => {
        if (progress.tollDetails && progress.tollDetails.status === 'MATCHED') {
            console.log(`✅ NEW MATCH: ${progress.tollDetails.location} (${progress.tollDetails.plate}) → Trip ${progress.tollDetails.tripId}`);
        }
    };
    
    try {
        const result = await matcher.matchTollsToTrips(1, trips, unmatchedTolls, progressCallback);
        
        console.log('');
        console.log('🎉 SIMPLE TOLL MATCHER RESULTS:');
        console.log(`📊 Total tolls processed: ${result.totalTolls}`);
        console.log(`✅ Matched tolls: ${result.matchedCount}`); 
        console.log(`❌ Unmatched tolls: ${result.unmatchedCount}`);
        console.log(`🎯 Accuracy: ${result.accuracy}%`);
        console.log('');
        
        if (parseFloat(result.accuracy) >= 95) {
            console.log('🎉 SUCCESS: Achieved 95%+ match rate as specified!');
        } else if (parseFloat(result.accuracy) > 50) {
            console.log('📈 GOOD IMPROVEMENT: Much better than old 50% rate!');
        } else {
            console.log('⚠️ Needs improvement - analyzing unmatched tolls...');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
    
    process.exit(0);
}

testWithRealData();