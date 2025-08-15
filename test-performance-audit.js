const { db } = require('./config/database');
const MLTollMatcher = require('./services/ml-toll-matcher');
const EnhancedTollProcessor = require('./services/enhanced-toll-processor');

/**
 * Performance Audit Test for Toll Matching Algorithms
 * 
 * Comprehensive performance testing and analysis of:
 * - ML Toll Matcher performance and accuracy
 * - Enhanced Toll Processor efficiency
 * - Memory usage and scalability
 * - Algorithm optimization opportunities
 */

async function runPerformanceAudit() {
    console.log('📊 TOLL MATCHING ALGORITHMS - PERFORMANCE AUDIT');
    console.log('='.repeat(60));
    
    try {
        // Initialize components
        const mlMatcher = new MLTollMatcher();
        const tollProcessor = new EnhancedTollProcessor();
        
        // 1. Database Analysis
        console.log('\n🔍 1. DATABASE ANALYSIS');
        console.log('-'.repeat(40));
        await analyzeDatabaseMetrics();
        
        // 2. ML Matcher Performance
        console.log('\n🤖 2. ML MATCHER PERFORMANCE');
        console.log('-'.repeat(40));
        await testMLMatcherPerformance(mlMatcher);
        
        // 3. Enhanced Processor Performance
        console.log('\n⚙️ 3. ENHANCED PROCESSOR PERFORMANCE');
        console.log('-'.repeat(40));
        await testProcessorPerformance(tollProcessor);
        
        // 4. Fuzzy Matching Algorithm Analysis
        console.log('\n🔤 4. FUZZY MATCHING ANALYSIS');
        console.log('-'.repeat(40));
        testFuzzyMatchingPerformance(mlMatcher);
        
        // 5. Memory Usage Analysis
        console.log('\n💾 5. MEMORY USAGE ANALYSIS');
        console.log('-'.repeat(40));
        await testMemoryUsage(mlMatcher, tollProcessor);
        
        // 6. Scalability Testing
        console.log('\n📈 6. SCALABILITY TESTING');
        console.log('-'.repeat(40));
        await testScalability(mlMatcher);
        
        // 7. Data Quality Assessment
        console.log('\n🔬 7. DATA QUALITY ASSESSMENT');
        console.log('-'.repeat(40));
        await assessDataQuality();
        
        // 8. Algorithm Comparison
        console.log('\n⚖️ 8. ALGORITHM COMPARISON');
        console.log('-'.repeat(40));
        await compareAlgorithms(mlMatcher);
        
        console.log('\n✅ PERFORMANCE AUDIT COMPLETE');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ Error during performance audit:', error);
    } finally {
        process.exit(0);
    }
}

async function analyzeDatabaseMetrics() {
    const startTime = Date.now();
    
    const metrics = await new Promise((resolve) => {
        db.all(`
            SELECT 
                COUNT(*) as total_tolls,
                COUNT(CASE WHEN is_matched = 1 THEN 1 END) as matched_tolls,
                COUNT(CASE WHEN is_matched = 0 THEN 1 END) as unmatched_tolls,
                COUNT(DISTINCT plate_number) as unique_plates,
                COUNT(DISTINCT toll_location) as unique_locations,
                AVG(toll_amount) as avg_amount,
                MIN(toll_amount) as min_amount,
                MAX(toll_amount) as max_amount,
                COUNT(DISTINCT DATE(toll_date)) as unique_dates
            FROM toll_charges
            WHERE plate_number IS NOT NULL
        `, (err, result) => {
            resolve(err ? [] : result);
        });
    });
    
    const tripMetrics = await new Promise((resolve) => {
        db.all(`
            SELECT 
                COUNT(*) as total_trips,
                COUNT(DISTINCT vehicle_plate) as unique_vehicles,
                AVG(JULIANDAY(end_date) - JULIANDAY(start_date)) as avg_trip_duration_days
            FROM trips
        `, (err, result) => {
            resolve(err ? [] : result);
        });
    });
    
    const queryTime = Date.now() - startTime;
    
    if (metrics.length > 0 && tripMetrics.length > 0) {
        const m = metrics[0];
        const t = tripMetrics[0];
        
        console.log(`   📊 Toll Charges: ${m.total_tolls} total (${m.matched_tolls} matched, ${m.unmatched_tolls} unmatched)`);
        console.log(`   📊 Match Rate: ${((m.matched_tolls / m.total_tolls) * 100).toFixed(1)}%`);
        console.log(`   🚗 Unique Plates: ${m.unique_plates}`);
        console.log(`   📍 Unique Locations: ${m.unique_locations}`);
        console.log(`   💰 Amount Range: $${m.min_amount} - $${m.max_amount} (avg: $${parseFloat(m.avg_amount).toFixed(2)})`);
        console.log(`   📅 Date Span: ${m.unique_dates} unique days`);
        console.log(`   🚙 Trips: ${t.total_trips} trips, ${t.unique_vehicles} vehicles`);
        console.log(`   ⏱️ Avg Trip Duration: ${parseFloat(t.avg_trip_duration_days).toFixed(1)} days`);
        console.log(`   ⚡ Query Performance: ${queryTime}ms`);
    }
}

async function testMLMatcherPerformance(mlMatcher) {
    const startTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;
    
    try {
        // Test with host ID 1
        const result = await mlMatcher.enhancedAutoMatch(1, { autoApplyMedium: false });
        
        const endTime = Date.now();
        const finalMemory = process.memoryUsage().heapUsed;
        const executionTime = endTime - startTime;
        const memoryDelta = finalMemory - initialMemory;
        
        console.log(`   🎯 Charges Processed: ${result.totalCharges}`);
        console.log(`   🎯 Potential Matches: ${result.potentialMatches}`);
        console.log(`   🎯 High Confidence: ${result.highConfidence}`);
        console.log(`   🎯 Medium Confidence: ${result.mediumConfidence}`);
        console.log(`   🎯 Needs Review: ${result.needsReview}`);
        console.log(`   🎯 Average Confidence: ${result.averageConfidence}`);
        console.log(`   ⚡ Execution Time: ${executionTime}ms`);
        console.log(`   💾 Memory Delta: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   📈 Performance: ${(result.totalCharges / (executionTime / 1000)).toFixed(1)} charges/sec`);
        
        // Test confidence distribution
        if (result.potentialMatches > 0) {
            const highRate = (result.highConfidence / result.potentialMatches * 100).toFixed(1);
            const mediumRate = (result.mediumConfidence / result.potentialMatches * 100).toFixed(1);
            const reviewRate = (result.needsReview / result.potentialMatches * 100).toFixed(1);
            
            console.log(`   📊 Confidence Distribution:`);
            console.log(`      High (${highRate}%): ${result.highConfidence} matches`);
            console.log(`      Medium (${mediumRate}%): ${result.mediumConfidence} matches`);  
            console.log(`      Review (${reviewRate}%): ${result.needsReview} matches`);
        }
        
    } catch (error) {
        console.log(`   ❌ ML Matcher Error: ${error.message}`);
    }
}

async function testProcessorPerformance(tollProcessor) {
    // Create test transactions
    const testTransactions = [
        {
            date: '2025-08-11T12:00:00.000Z',
            location: 'Test Bridge',
            amount: 15.50,
            plate: 'TEST001',
            transactionId: 'test_tx_001'
        },
        {
            date: '2025-08-11T13:30:00.000Z', 
            location: 'Test Tunnel',
            amount: 8.75,
            plate: 'TEST002',
            transactionId: 'test_tx_002'
        }
    ];
    
    const startTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;
    
    try {
        // Note: Using test account ID 999 to avoid affecting real data
        const result = await tollProcessor.processTollTransactions(testTransactions, 999, 1);
        
        const endTime = Date.now();
        const finalMemory = process.memoryUsage().heapUsed;
        const executionTime = endTime - startTime;
        const memoryDelta = finalMemory - initialMemory;
        
        console.log(`   ✅ Processing Success: ${result.success}`);
        console.log(`   📊 New Transactions: ${result.newTransactions}`);
        console.log(`   🔄 Duplicates Detected: ${result.duplicates}`);
        console.log(`   ❌ Validation Failures: ${result.validationFailures}`);
        console.log(`   📝 Error Count: ${result.errors.length}`);
        console.log(`   ⚡ Execution Time: ${executionTime}ms`);
        console.log(`   💾 Memory Delta: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   📈 Performance: ${(testTransactions.length / (executionTime / 1000)).toFixed(1)} transactions/sec`);
        
        // Show processing stats
        const stats = tollProcessor.getProcessingStats();
        console.log(`   📊 Overall Stats:`);
        console.log(`      Success Rate: ${stats.successRate}`);
        console.log(`      Duplicate Rate: ${stats.duplicateRate}`);
        console.log(`      Total Processed: ${stats.totalProcessed}`);
        
        // Clean up test data
        await new Promise((resolve) => {
            db.run(`DELETE FROM toll_charges WHERE transaction_id LIKE 'test_tx_%'`, resolve);
        });
        
    } catch (error) {
        console.log(`   ❌ Processor Error: ${error.message}`);
    }
}

function testFuzzyMatchingPerformance(mlMatcher) {
    const testCases = [
        { original: 'LPJ3806', variations: ['LPJ380G', 'LPJ38O6', 'LPJ3B06', 'LFJ3806'] },
        { original: 'ABC123D', variations: ['ABC1Z3D', 'AB0123D', 'ABC12BD', 'A8C123D'] },
        { original: 'XYZ789P', variations: ['XYZ7B9P', 'XY2789P', 'XYZ789F', 'XYZ7BGP'] }
    ];
    
    let totalTests = 0;
    let totalTime = 0;
    let accurateMatches = 0;
    
    testCases.forEach(testCase => {
        console.log(`\n   🔤 Testing: ${testCase.original}`);
        
        testCase.variations.forEach(variation => {
            const startTime = Date.now();
            
            // Test fuzzy matching
            const similarity = mlMatcher.fuzzyMatch(testCase.original, variation);
            
            // Test OCR corrections
            const corrections = mlMatcher.applyOCRCorrections(variation);
            const hasCorrection = corrections.includes(testCase.original);
            
            const endTime = Date.now();
            const testTime = endTime - startTime;
            
            totalTime += testTime;
            totalTests++;
            
            if (similarity >= 0.8 || hasCorrection) {
                accurateMatches++;
            }
            
            console.log(`      ${variation} → ${(similarity * 100).toFixed(1)}% similarity, ${corrections.length} OCR variants ${hasCorrection ? '✅' : '❌'} (${testTime}ms)`);
        });
    });
    
    console.log(`\n   📊 Fuzzy Matching Summary:`);
    console.log(`      Total Tests: ${totalTests}`);
    console.log(`      Accurate Matches: ${accurateMatches} (${(accurateMatches / totalTests * 100).toFixed(1)}%)`);
    console.log(`      Average Time: ${(totalTime / totalTests).toFixed(1)}ms per test`);
    console.log(`      Performance: ${(totalTests / (totalTime / 1000)).toFixed(0)} tests/sec`);
}

async function testMemoryUsage(mlMatcher, tollProcessor) {
    const initialMemory = process.memoryUsage();
    
    console.log(`   📊 Initial Memory Usage:`);
    console.log(`      Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`      Heap Total: ${(initialMemory.heapTotal / 1024 / 1024).toFixed(2)}MB`);
    console.log(`      External: ${(initialMemory.external / 1024 / 1024).toFixed(2)}MB`);
    
    // Simulate heavy usage
    for (let i = 0; i < 5; i++) {
        await mlMatcher.enhancedAutoMatch(1, { autoApplyMedium: false });
    }
    
    const afterML = process.memoryUsage();
    console.log(`   📊 After 5 ML Operations:`);
    console.log(`      Heap Used: ${(afterML.heapUsed / 1024 / 1024).toFixed(2)}MB (+${((afterML.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB)`);
    
    // Force garbage collection if available
    if (global.gc) {
        global.gc();
        const afterGC = process.memoryUsage();
        console.log(`   📊 After Garbage Collection:`);
        console.log(`      Heap Used: ${(afterGC.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    }
}

async function testScalability(mlMatcher) {
    const testSizes = [10, 50, 100];
    
    for (const size of testSizes) {
        console.log(`\n   📊 Testing with ${size} simulated charges...`);
        
        const startTime = Date.now();
        
        // Simulate processing multiple charges
        let totalProcessed = 0;
        for (let i = 0; i < Math.ceil(size / 10); i++) {
            const result = await mlMatcher.enhancedAutoMatch(1, { autoApplyMedium: false });
            totalProcessed += result.totalCharges;
        }
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        console.log(`      Processed: ${totalProcessed} charges`);
        console.log(`      Time: ${executionTime}ms`);
        console.log(`      Rate: ${(totalProcessed / (executionTime / 1000)).toFixed(1)} charges/sec`);
        console.log(`      Time per charge: ${(executionTime / totalProcessed).toFixed(1)}ms`);
    }
}

async function assessDataQuality() {
    const dataQuality = await new Promise((resolve) => {
        db.all(`
            SELECT 
                COUNT(CASE WHEN plate_number IS NULL OR plate_number = '' THEN 1 END) as missing_plates,
                COUNT(CASE WHEN toll_location IS NULL OR toll_location = '' OR LENGTH(toll_location) < 3 THEN 1 END) as invalid_locations,
                COUNT(CASE WHEN toll_amount IS NULL OR toll_amount <= 0 THEN 1 END) as invalid_amounts,
                COUNT(CASE WHEN toll_date IS NULL THEN 1 END) as missing_dates,
                COUNT(CASE WHEN transaction_id IS NULL OR transaction_id = '' THEN 1 END) as missing_transaction_ids,
                COUNT(*) as total_records
            FROM toll_charges
        `, (err, result) => {
            resolve(err ? [] : result);
        });
    });
    
    if (dataQuality.length > 0) {
        const q = dataQuality[0];
        const total = q.total_records;
        
        console.log(`   📊 Data Quality Analysis (${total} records):`);
        console.log(`      Missing Plates: ${q.missing_plates} (${(q.missing_plates / total * 100).toFixed(1)}%)`);
        console.log(`      Invalid Locations: ${q.invalid_locations} (${(q.invalid_locations / total * 100).toFixed(1)}%)`);  
        console.log(`      Invalid Amounts: ${q.invalid_amounts} (${(q.invalid_amounts / total * 100).toFixed(1)}%)`);
        console.log(`      Missing Dates: ${q.missing_dates} (${(q.missing_dates / total * 100).toFixed(1)}%)`);
        console.log(`      Missing Transaction IDs: ${q.missing_transaction_ids} (${(q.missing_transaction_ids / total * 100).toFixed(1)}%)`);
        
        const qualityScore = ((total - q.missing_plates - q.invalid_locations - q.invalid_amounts - q.missing_dates - q.missing_transaction_ids) / total * 100);
        console.log(`      Overall Quality Score: ${qualityScore.toFixed(1)}%`);
    }
}

async function compareAlgorithms(mlMatcher) {
    // Compare different matching approaches
    const approaches = [
        { name: 'Exact Matching', threshold: 1.0 },
        { name: 'High Confidence', threshold: 0.85 },
        { name: 'Medium Confidence', threshold: 0.65 },
        { name: 'Low Confidence', threshold: 0.45 }
    ];
    
    console.log(`   📊 Algorithm Comparison:`);
    
    for (const approach of approaches) {
        const startTime = Date.now();
        
        // Simulate matching with different thresholds
        const result = await mlMatcher.enhancedAutoMatch(1, { 
            autoApplyMedium: false,
            confidenceThreshold: approach.threshold 
        });
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        console.log(`      ${approach.name} (≥${approach.threshold}):`);
        console.log(`         Matches: ${result.potentialMatches}`);
        console.log(`         Time: ${executionTime}ms`);
        console.log(`         Avg Confidence: ${result.averageConfidence}`);
    }
}

// Run the audit
console.log('🚀 Starting Toll Matching Performance Audit...\n');
runPerformanceAudit();