const { db } = require('./config/database');
const TuroIntegrationService = require('./services/turo-integration');

/**
 * Enhanced ML Matching Test Script
 * 
 * This script demonstrates the new ML-enhanced toll matching capabilities:
 * - Fuzzy string matching for license plates with OCR error handling
 * - Confidence scoring system with detailed factors
 * - Pattern learning from historical data
 * - Geographic intelligence and anomaly detection
 */

async function testMLMatching() {
    console.log('🤖 Testing ML-Enhanced Toll Matching System');
    console.log('='.repeat(50));
    
    try {
        const turoService = new TuroIntegrationService();
        const hostId = 1; // Test with host ID 1
        
        // 1. Test enhanced auto-matching
        console.log('\n🚀 1. Testing Enhanced Auto-Matching...');
        const matchResult = await turoService.autoMatchTolls(hostId, { 
            autoApplyMedium: true 
        });
        
        console.log('📊 Enhanced Matching Results:');
        console.log(`   • Total charges processed: ${matchResult.totalCharges}`);
        console.log(`   • Matches applied: ${matchResult.matchedCount}`);
        console.log(`   • ML Enhanced: ${matchResult.mlEnhanced ? '✅' : '❌'}`);
        
        if (matchResult.confidence) {
            console.log(`   • Average confidence: ${matchResult.confidence.average}`);
            console.log(`   • High confidence matches: ${matchResult.confidence.highConfidence}`);
            console.log(`   • Medium confidence matches: ${matchResult.confidence.mediumConfidence}`);
            console.log(`   • Flagged for review: ${matchResult.confidence.needsReview}`);
        }
        
        // 2. Test matching suggestions for unmatched charges
        console.log('\n🎯 2. Testing Matching Suggestions...');
        const unmatchedCharges = await getUnmatchedCharges(hostId);
        
        if (unmatchedCharges.length > 0) {
            const charge = unmatchedCharges[0];
            console.log(`\n📋 Analyzing charge: ${charge.toll_location} - $${charge.toll_amount} (${charge.plate_number})`);
            
            const suggestions = await turoService.getMatchingSuggestions(charge.id, 3);
            
            if (suggestions.length > 0) {
                console.log('\n💡 Top matching suggestions:');
                suggestions.forEach((suggestion, index) => {
                    const trip = suggestion.trip;
                    const confidence = (suggestion.confidence * 100).toFixed(1);
                    console.log(`   ${index + 1}. Trip ${trip.turo_trip_id} (${trip.renter_name})`);
                    console.log(`      Vehicle: ${trip.vehicle_plate}`);
                    console.log(`      Dates: ${trip.start_date.split('T')[0]} to ${trip.end_date.split('T')[0]}`);
                    console.log(`      Confidence: ${confidence}% (${suggestion.recommendation})`);
                    
                    if (suggestion.factors) {
                        console.log('      Confidence Factors:');
                        console.log(`        • Plate match: ${(suggestion.factors.plateMatch * 100).toFixed(1)}%`);
                        console.log(`        • Date proximity: ${(suggestion.factors.dateProximity * 100).toFixed(1)}%`);
                        console.log(`        • Geographic feasibility: ${(suggestion.factors.geoFeasibility * 100).toFixed(1)}%`);
                        console.log(`        • Historical pattern: ${(suggestion.factors.historicalPattern * 100).toFixed(1)}%`);
                        console.log(`        • Amount reasonable: ${(suggestion.factors.amountReasonable * 100).toFixed(1)}%`);
                    }
                    console.log('');
                });
            } else {
                console.log('   No suitable matches found for this charge.');
            }
        } else {
            console.log('   No unmatched charges found.');
        }
        
        // 3. Test performance analysis
        console.log('\n📈 3. Analyzing Matching Performance...');
        const performance = await turoService.analyzeMatchingPerformance(hostId, 30);
        
        console.log('📊 Performance Metrics (Last 30 days):');
        console.log(`   • Overall accuracy: ${performance.accuracy}%`);
        console.log(`   • Total charges: ${performance.totalCharges}`);
        console.log(`   • Matched charges: ${performance.matchedCharges}`);
        console.log(`   • Confidence distribution:`);
        console.log(`     - High confidence: ${performance.confidenceDistribution.high}`);
        console.log(`     - Medium confidence: ${performance.confidenceDistribution.medium}`);
        console.log(`     - Low confidence: ${performance.confidenceDistribution.low}`);
        console.log(`   • Average matched amount: $${performance.averageMatchedAmount || 0}`);
        console.log(`   • Unique toll locations: ${performance.uniqueLocations}`);
        
        // 4. Test anomaly detection
        console.log('\n🚨 4. Testing Anomaly Detection...');
        const anomalies = await turoService.detectAnomalies(hostId);
        
        if (anomalies.length > 0) {
            console.log(`\n⚠️  Detected ${anomalies.length} potential anomalies:`);
            anomalies.slice(0, 5).forEach((anomaly, index) => {
                console.log(`   ${index + 1}. ${anomaly.toll_location} - $${anomaly.toll_amount}`);
                console.log(`      Date: ${anomaly.toll_date.split('T')[0]}`);
                console.log(`      Type: ${anomaly.anomalyType}`);
                console.log(`      Severity: ${anomaly.severity}`);
                console.log(`      Recommendation: ${anomaly.recommendation}`);
                if (anomaly.amount_deviation) {
                    console.log(`      Amount deviation: $${anomaly.amount_deviation.toFixed(2)}`);
                }
                console.log('');
            });
        } else {
            console.log('   No anomalies detected.');
        }
        
        // 5. Test fuzzy matching capabilities
        console.log('\n🔍 5. Testing Fuzzy Matching Capabilities...');
        await testFuzzyMatching();
        
        // 6. Show current toll matching status
        console.log('\n📋 6. Current Toll Matching Status...');
        await showMatchingStatus(hostId);
        
        // 7. Test ML feature flags
        console.log('\n⚙️  7. ML Feature Configuration...');
        console.log('   ML Features Status:');
        Object.entries(turoService.mlFeatures).forEach(([feature, enabled]) => {
            console.log(`   • ${feature}: ${enabled ? '✅' : '❌'}`);
        });
        
        console.log('\n✅ ML Matching Test Complete!');
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('❌ Error testing ML matching:', error);
    } finally {
        process.exit(0);
    }
}

async function testFuzzyMatching() {
    const MLTollMatcher = require('./services/ml-toll-matcher');
    const matcher = new MLTollMatcher();
    
    console.log('🔤 Testing fuzzy string matching with OCR errors:');
    
    const testCases = [
        { original: 'LPJ3806', variations: ['LPJ380G', 'LPJ38O6', 'LPJ3B06'] },
        { original: 'ABC123D', variations: ['ABC1Z3D', 'AB0123D', 'ABC12BD'] },
        { original: 'XYZ789P', variations: ['XYZ7B9P', 'XY2789P', 'XYZ789F'] }
    ];
    
    testCases.forEach(testCase => {
        console.log(`\n   Original plate: ${testCase.original}`);
        testCase.variations.forEach(variation => {
            const similarity = matcher.fuzzyMatch(testCase.original, variation);
            const corrected = matcher.applyOCRCorrections(variation);
            const hasCorrection = corrected.includes(testCase.original);
            
            console.log(`   • ${variation} -> Similarity: ${(similarity * 100).toFixed(1)}% ${hasCorrection ? '✅ OCR Corrected' : ''}`);
        });
    });
}

async function getUnmatchedCharges(hostId) {
    return new Promise((resolve) => {
        db.all(`
            SELECT tc.*, ta.host_id
            FROM toll_charges tc
            JOIN toll_accounts ta ON tc.toll_account_id = ta.id
            WHERE ta.host_id = ? AND tc.is_matched = 0
            ORDER BY tc.toll_date DESC
            LIMIT 5
        `, [hostId], (err, charges) => {
            resolve(err ? [] : charges);
        });
    });
}

async function showMatchingStatus(hostId) {
    return new Promise((resolve) => {
        db.all(`
            SELECT 
                tc.toll_date, 
                tc.toll_location, 
                tc.toll_amount, 
                tc.plate_number,
                tc.is_matched,
                tc.validation_status,
                t.turo_trip_id,
                t.renter_name,
                t.vehicle_plate,
                t.start_date,
                t.end_date
             FROM toll_charges tc
             LEFT JOIN trips t ON tc.trip_id = t.id
             JOIN toll_accounts ta ON tc.toll_account_id = ta.id
             WHERE ta.host_id = ?
             ORDER BY tc.toll_date DESC
             LIMIT 10
        `, [hostId], (err, results) => {
            if (err) {
                console.error('   Error fetching results:', err);
                resolve();
                return;
            }
            
            console.log('\n📊 Recent toll charges status:');
            results.forEach(row => {
                const matchStatus = row.is_matched ? 
                    (row.validation_status === 'auto_high' ? '🟢' : 
                     row.validation_status === 'auto_medium' ? '🟡' : '✅') : '🔴';
                
                const tripInfo = row.is_matched ? 
                    `${row.turo_trip_id} (${row.renter_name})` : 
                    'UNMATCHED';
                
                const confidenceInfo = row.validation_status ? 
                    ` [${row.validation_status.toUpperCase()}]` : '';
                
                console.log(`   ${matchStatus} ${row.toll_date.split('T')[0]} - ${row.toll_location} $${row.toll_amount}`);
                console.log(`      Plate: ${row.plate_number} -> ${tripInfo}${confidenceInfo}`);
                
                if (row.is_matched && row.vehicle_plate) {
                    console.log(`      Trip Vehicle: ${row.vehicle_plate} (${row.start_date.split('T')[0]} to ${row.end_date.split('T')[0]})`);
                }
                console.log('');
            });
            
            resolve();
        });
    });
}

// Helper function to simulate user training
async function simulateUserTraining(turoService, chargeId, tripId) {
    console.log(`\n🎓 Simulating user training: Charge ${chargeId} -> Trip ${tripId}`);
    await turoService.trainFromCorrection(chargeId, tripId, {
        userConfirmed: true,
        correctionType: 'manual_match',
        feedback: 'User confirmed this match is correct'
    });
    console.log('   Training completed - ML system learned from this correction');
}

// Run the test
console.log('🚀 Initializing ML-Enhanced Toll Matching Test...\n');
testMLMatching();