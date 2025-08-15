#!/usr/bin/env node

/**
 * Simple Subagent Watcher
 * Monitors subagent activity and shows clean output
 */

const SubagentManager = require('./services/subagent-manager');

console.clear();
console.log('🤖 SUBAGENT MONITOR');
console.log('=' .repeat(50));
console.log('📡 Watching for subagent activity...');
console.log('💡 Press Ctrl+C to stop');
console.log('');

// Create subagent manager instance
const subagentManager = new SubagentManager();

// Override the logTrigger method to show clean output
const originalLogTrigger = subagentManager.logTrigger;
subagentManager.logTrigger = function(eventType, trigger, eventData) {
    const timestamp = new Date().toLocaleTimeString();
    
    console.log(`\n🔔 [${timestamp}] SUBAGENT ACTIVATED`);
    console.log(`   🤖 Agent: ${trigger.agent.toUpperCase()}`);
    console.log(`   📋 Task: ${trigger.description}`);
    console.log(`   ⚡ Event: ${eventType}`);
    
    // Show relevant data
    if (eventData.errorCount) console.log(`   🚨 Errors: ${eventData.errorCount}`);
    if (eventData.matchRate) console.log(`   📊 Match Rate: ${eventData.matchRate}%`);
    if (eventData.loadTime) console.log(`   ⏱️  Load Time: ${eventData.loadTime}ms`);
    if (eventData.newTrips) console.log(`   🚗 New Trips: ${eventData.newTrips}`);
    
    console.log('   ' + '-'.repeat(40));
    
    // Call original method
    originalLogTrigger.call(this, eventType, trigger, eventData);
};

// Simulate some events for demonstration
setTimeout(() => {
    console.log('🧪 Running test events...\n');
    
    // Test different scenarios
    subagentManager.checkTriggers('scraper_error', {
        errorCount: 5,
        lastError: 'Connection timeout'
    });
    
    setTimeout(() => {
        subagentManager.checkTriggers('low_match_rate', {
            matchRate: 70,
            totalTolls: 100
        });
    }, 2000);
    
    setTimeout(() => {
        subagentManager.checkTriggers('slow_dashboard', {
            loadTime: 4500,
            hostId: 1
        });
    }, 4000);
    
}, 1000);

// Keep running and listening
console.log('📻 Ready to monitor live subagent activity...');

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n👋 Subagent monitor stopped');
    process.exit(0);
});

// Keep process alive
setInterval(() => {
    // Just keep the process running
}, 1000);