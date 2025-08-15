/**
 * Test script to verify subagent triggers work correctly
 */

const SubagentManager = require('../services/subagent-manager');

async function testSubagentTriggers() {
    console.log('🧪 Testing Subagent Manager...\n');
    
    const subagentManager = new SubagentManager();
    
    // Test 1: Scraper error trigger
    console.log('Test 1: Scraper Error Trigger');
    const scraperTrigger = await subagentManager.checkTriggers('scraper_error', {
        errorCount: 5,
        lastError: 'Connection timeout'
    });
    console.log('Result:', scraperTrigger ? `✅ ${scraperTrigger.agent}` : '❌ No trigger');
    
    // Test 2: CSV import trigger
    console.log('\nTest 2: CSV Import Trigger');
    const csvTrigger = await subagentManager.checkTriggers('csv_imported', {
        newTrips: 15,
        totalProcessed: 20
    });
    console.log('Result:', csvTrigger ? `✅ ${csvTrigger.agent}` : '❌ No trigger');
    
    // Test 3: Low match rate trigger
    console.log('\nTest 3: Low Match Rate Trigger');
    const matchTrigger = await subagentManager.checkTriggers('low_match_rate', {
        matchRate: 70,
        totalTolls: 100,
        matchedCount: 70
    });
    console.log('Result:', matchTrigger ? `✅ ${matchTrigger.agent}` : '❌ No trigger');
    
    // Test 4: Slow dashboard trigger
    console.log('\nTest 4: Slow Dashboard Trigger');
    const dashboardTrigger = await subagentManager.checkTriggers('slow_dashboard', {
        loadTime: 4500,
        hostId: 1
    });
    console.log('Result:', dashboardTrigger ? `✅ ${dashboardTrigger.agent}` : '❌ No trigger');
    
    // Test 5: Verification required trigger
    console.log('\nTest 5: Verification Required Trigger');
    const verificationTrigger = await subagentManager.checkTriggers('verification_required', {
        verificationType: 'sms',
        accountId: 1
    });
    console.log('Result:', verificationTrigger ? `✅ ${verificationTrigger.agent}` : '❌ No trigger');
    
    // Test 6: No trigger condition (should not fire)
    console.log('\nTest 6: No Trigger Condition');
    const noTrigger = await subagentManager.checkTriggers('low_match_rate', {
        matchRate: 95, // High match rate - should not trigger
        totalTolls: 100,
        matchedCount: 95
    });
    console.log('Result:', noTrigger ? `❌ Unexpected trigger: ${noTrigger.agent}` : '✅ No trigger (correct)');
    
    // Summary
    console.log('\n📊 Available Agents:');
    const agents = subagentManager.getAvailableAgents();
    agents.forEach(agent => {
        const triggers = subagentManager.getTriggersForAgent(agent);
        console.log(`  - ${agent}: ${triggers.length} triggers`);
    });
    
    console.log('\n✅ Subagent system test completed!');
}

// Run tests
testSubagentTriggers().catch(console.error);