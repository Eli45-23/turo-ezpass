const TuroIntegrationService = require('./services/turo-integration');

async function simpleMLTest() {
    console.log('🤖 Simple ML Matching Test');
    
    try {
        const turoService = new TuroIntegrationService();
        
        // Test ML features are enabled
        console.log('\n⚙️ ML Features:');
        Object.entries(turoService.mlFeatures).forEach(([feature, enabled]) => {
            console.log(`   • ${feature}: ${enabled ? '✅' : '❌'}`);
        });
        
        // Test fuzzy matching
        console.log('\n🔍 Testing Fuzzy Matching:');
        const matcher = turoService.mlMatcher;
        const similarity = matcher.fuzzyMatch('LPJ3806', 'LPJ380G');
        console.log(`   • Similarity between 'LPJ3806' and 'LPJ380G': ${(similarity * 100).toFixed(1)}%`);
        
        // Test OCR corrections
        const corrections = matcher.applyOCRCorrections('LPJ380G');
        console.log(`   • OCR corrections for 'LPJ380G': ${corrections.slice(0, 5).join(', ')}`);
        
        // Test auto-matching with a simple case
        console.log('\n🚀 Testing Auto-Matching:');
        const result = await turoService.autoMatchTolls(1);
        
        console.log(`   • Processed: ${result.totalCharges} charges`);
        console.log(`   • Matched: ${result.matchedCount} charges`);
        console.log(`   • ML Enhanced: ${result.mlEnhanced ? '✅' : '❌'}`);
        
        if (result.confidence) {
            console.log(`   • Average Confidence: ${result.confidence.average}`);
        }
        
        console.log('\n✅ Simple ML Test Complete!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        process.exit(0);
    }
}

simpleMLTest();