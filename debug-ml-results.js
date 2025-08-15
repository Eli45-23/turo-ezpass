const MLTollMatcher = require('./services/ml-toll-matcher');

async function debugMLResults() {
    console.log('🐛 Debugging ML Results Structure');
    
    try {
        const matcher = new MLTollMatcher();
        const results = await matcher.enhancedAutoMatch(1);
        
        console.log('Results object:', JSON.stringify(results, null, 2));
        console.log('Results type:', typeof results);
        console.log('Results keys:', Object.keys(results));
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
}

debugMLResults();