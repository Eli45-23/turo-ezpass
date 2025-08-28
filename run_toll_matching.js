const EnhancedTollMatcher = require('./services/enhanced-toll-matcher');

async function runTollMatching() {
    console.log('🔄 Starting toll matching process...');
    
    try {
        const hostId = 'df28be49-b5ea-4e8c-ba63-03fc47bd1c7c'; // nametwo@gmail.com
        const matcher = new EnhancedTollMatcher();
        
        console.log(`🎯 Running matcher for host: ${hostId}`);
        
        const results = await matcher.enhancedAutoMatch(hostId, {
            processAllTolls: true, // Match both matched and unmatched tolls
            confidenceThreshold: 0.4 // Lower threshold to catch more matches
        });
        
        console.log('✅ Matching process completed!');
        console.log('📊 Results:', {
            totalMatches: results.matches?.length || 0,
            averageConfidence: results.averageConfidence || 0,
            details: results
        });
        
        // Show specific matches for our target trips
        if (results.matches?.length > 0) {
            console.log('\n🎯 Matches found:');
            results.matches.forEach((match, index) => {
                console.log(`  ${index + 1}. Toll ${match.toll.transaction_id} → Trip ${match.trip.turo_trip_id} (${Math.round(match.confidence * 100)}% confidence)`);
                console.log(`     $${match.toll.toll_amount} at ${match.toll.toll_location} on ${match.toll.toll_date}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Toll matching failed:', error);
    }
}

// Run the matching process
runTollMatching();