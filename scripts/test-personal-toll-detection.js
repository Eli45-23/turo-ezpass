const { supabaseAdmin } = require('../config/supabase');
const ImprovedPersonalTollDetector = require('./improved-personal-toll-detector');

/**
 * Test script for personal toll detection
 * This validates the improved detection logic without making changes
 */
async function testPersonalTollDetection() {
    console.log('🧪 Testing Personal Toll Detection Logic');
    console.log('========================================');
    
    try {
        // Step 1: Get all hosts to test
        const { data: hosts, error: hostError } = await supabaseAdmin
            .from('hosts')
            .select('id, email')
            .limit(5); // Test first 5 hosts
        
        if (hostError) {
            throw hostError;
        }
        
        if (!hosts || hosts.length === 0) {
            console.log('❌ No hosts found in database');
            return;
        }
        
        console.log(`🔍 Testing detection logic for ${hosts.length} hosts`);
        
        const detector = new ImprovedPersonalTollDetector();
        const overallResults = {
            totalHosts: hosts.length,
            hostsWithIssues: 0,
            totalUnclassified: 0,
            totalNewPersonal: 0,
            totalSuspicious: 0,
            totalErrors: 0
        };
        
        // Step 2: Test each host
        for (const host of hosts) {
            console.log(`\\n🏠 Testing host: ${host.email} (${host.id})`);
            
            try {
                // Run detection in dry-run mode (don't mark as personal)
                const results = await detector.detectPersonalTolls(host.id, { 
                    markPersonal: false // Dry run mode
                });
                
                console.log(`   📊 Results:`);
                console.log(`   - Total tolls analyzed: ${results.totalTolls}`);
                console.log(`   - Would mark as personal: ${results.newPersonalTolls}`);
                console.log(`   - Suspicious tolls: ${results.suspiciousTolls}`);
                console.log(`   - Errors: ${results.errors.length}`);
                
                // Update overall stats
                if (results.newPersonalTolls > 0 || results.suspiciousTolls > 0) {
                    overallResults.hostsWithIssues++;
                }
                overallResults.totalUnclassified += results.totalTolls;
                overallResults.totalNewPersonal += results.newPersonalTolls;
                overallResults.totalSuspicious += results.suspiciousTolls;
                overallResults.totalErrors += results.errors.length;
                
                // Show sample issues
                if (results.analysis && results.analysis.length > 0) {
                    const personalSample = results.analysis
                        .filter(a => a.shouldBePersonal)
                        .slice(0, 3);
                    
                    if (personalSample.length > 0) {
                        console.log(`   🏠 Sample personal tolls:`);
                        personalSample.forEach(a => {
                            console.log(`     • $${a.tollAmount} at ${a.tollLocation} on ${a.tollDate.toLocaleDateString()}`);
                            console.log(`       Reason: ${a.reason}`);
                        });
                    }
                    
                    const suspiciousSample = results.analysis
                        .filter(a => a.suspicious)
                        .slice(0, 2);
                    
                    if (suspiciousSample.length > 0) {
                        console.log(`   ⚠️ Sample suspicious tolls:`);
                        suspiciousSample.forEach(a => {
                            console.log(`     • $${a.tollAmount} at ${a.tollLocation} on ${a.tollDate.toLocaleDateString()}`);
                            console.log(`       Reason: ${a.reason}`);
                            console.log(`       Nearby trips: ${a.nearbyTrips.length}`);
                        });
                    }
                }
                
            } catch (error) {
                console.error(`   ❌ Error testing host ${host.email}:`, error.message);
                overallResults.totalErrors++;
            }
        }
        
        // Step 3: Generate overall summary
        console.log('\\n📈 OVERALL TEST RESULTS');
        console.log('========================');
        console.log(`Hosts tested: ${overallResults.totalHosts}`);
        console.log(`Hosts with issues: ${overallResults.hostsWithIssues}`);
        console.log(`Total unclassified tolls: ${overallResults.totalUnclassified}`);
        console.log(`Would mark as personal: ${overallResults.totalNewPersonal}`);
        console.log(`Suspicious tolls found: ${overallResults.totalSuspicious}`);
        console.log(`Errors encountered: ${overallResults.totalErrors}`);
        
        // Step 4: Recommendations
        console.log('\\n💡 RECOMMENDATIONS');
        console.log('==================');
        
        if (overallResults.totalNewPersonal > 0) {
            console.log(`✅ Found ${overallResults.totalNewPersonal} tolls that should be marked as personal`);
            console.log('   → Run the improved detector with markPersonal: true to fix these');
        }
        
        if (overallResults.totalSuspicious > 0) {
            console.log(`⚠️ Found ${overallResults.totalSuspicious} suspicious tolls requiring manual review`);
            console.log('   → These may indicate issues with the matching algorithm');
        }
        
        if (overallResults.totalErrors > 0) {
            console.log(`❌ Encountered ${overallResults.totalErrors} errors`);
            console.log('   → Check logs above for specific error details');
        }
        
        if (overallResults.totalUnclassified === 0) {
            console.log('🎉 All tolls are properly classified!');
        }
        
        // Step 5: Database health check
        console.log('\\n🔍 DATABASE HEALTH CHECK');
        console.log('========================');
        
        // Check for is_personal column
        const { data: columnInfo, error: columnError } = await supabaseAdmin
            .from('information_schema.columns')
            .select('column_name, data_type, is_nullable, column_default')
            .eq('table_name', 'toll_charges')
            .eq('column_name', 'is_personal');
        
        if (columnError) {
            console.log('❌ Could not check is_personal column existence');
        } else if (!columnInfo || columnInfo.length === 0) {
            console.log('❌ CRITICAL: is_personal column does not exist in toll_charges table');
            console.log('   → Run: ALTER TABLE toll_charges ADD COLUMN is_personal BOOLEAN DEFAULT FALSE;');
        } else {
            console.log('✅ is_personal column exists');
        }
        
        // Check overall toll status distribution
        const { data: statusStats, error: statsError } = await supabaseAdmin
            .rpc('exec', {
                query: `
                    SELECT 
                        COUNT(*) as total_tolls,
                        COUNT(CASE WHEN is_matched = true THEN 1 END) as matched_tolls,
                        COUNT(CASE WHEN is_personal = true THEN 1 END) as personal_tolls,
                        COUNT(CASE WHEN is_matched = false AND is_personal = false THEN 1 END) as unclassified_tolls
                    FROM toll_charges;
                `
            });
        
        if (!statsError && statusStats && statusStats.length > 0) {
            const stats = statusStats[0];
            console.log(`\\n📊 Toll Status Distribution:`);
            console.log(`   Total tolls: ${stats.total_tolls}`);
            console.log(`   Matched to trips: ${stats.matched_tolls}`);
            console.log(`   Personal tolls: ${stats.personal_tolls}`);
            console.log(`   Unclassified: ${stats.unclassified_tolls}`);
            
            const classifiedPercentage = ((parseInt(stats.matched_tolls) + parseInt(stats.personal_tolls)) / parseInt(stats.total_tolls) * 100).toFixed(1);
            console.log(`   Classification rate: ${classifiedPercentage}%`);
        }
        
        console.log('\\n✅ Test completed successfully');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
testPersonalTollDetection()
    .then(() => {
        console.log('\\n🎯 Test completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });