#!/usr/bin/env node

/**
 * ML Features Enablement Script
 * Enables ML features gradually according to the safe rollout plan
 */

const fs = require('fs').promises;
const path = require('path');

class MLFeaturesEnabler {
    constructor() {
        this.configFile = path.join(__dirname, 'services/turo-integration.js');
        this.enablementPlan = {
            phase1: ['fuzzyPlateMatching'],
            phase2: ['confidenceScoring'], 
            phase3: ['geographicIntelligence'],
            phase4: ['patternLearning'],
            phase5: ['enhancedMatching', 'anomalyDetection']
        };
    }

    /**
     * Read current ML configuration
     */
    async readCurrentConfig() {
        console.log('🔍 Reading current ML configuration...');
        
        const content = await fs.readFile(this.configFile, 'utf8');
        
        // Extract the mlFeatures object
        const mlFeaturesMatch = content.match(/this\.mlFeatures = \{([^}]+)\}/s);
        if (!mlFeaturesMatch) {
            throw new Error('Could not find mlFeatures configuration');
        }
        
        const configText = mlFeaturesMatch[1];
        const currentConfig = {};
        
        // Parse each feature flag
        const featureRegex = /(\w+):\s*(true|false)/g;
        let match;
        while ((match = featureRegex.exec(configText)) !== null) {
            currentConfig[match[1]] = match[2] === 'true';
        }
        
        console.log('📊 Current ML configuration:');
        Object.entries(currentConfig).forEach(([feature, enabled]) => {
            console.log(`   ${feature}: ${enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
        });
        
        return currentConfig;
    }

    /**
     * Enable specific ML features
     */
    async enableFeatures(featuresToEnable) {
        console.log(`🔧 Enabling ML features: ${featuresToEnable.join(', ')}...`);
        
        const content = await fs.readFile(this.configFile, 'utf8');
        let updatedContent = content;
        
        // Update each feature flag
        for (const feature of featuresToEnable) {
            const oldPattern = new RegExp(`(${feature}:\\s*)false`, 'g');
            const newReplacement = `$1true`;
            
            if (oldPattern.test(updatedContent)) {
                updatedContent = updatedContent.replace(oldPattern, newReplacement);
                console.log(`   ✅ Enabled ${feature}`);
            } else {
                console.log(`   ⚠️  ${feature} was already enabled or not found`);
            }
        }
        
        // Write the updated configuration
        await fs.writeFile(this.configFile, updatedContent);
        
        console.log('💾 ML configuration updated successfully');
    }

    /**
     * Verify features are enabled
     */
    async verifyFeatures(expectedFeatures) {
        console.log('🧪 Verifying ML features were enabled...');
        
        const currentConfig = await this.readCurrentConfig();
        
        let allEnabled = true;
        for (const feature of expectedFeatures) {
            if (!currentConfig[feature]) {
                console.log(`   ❌ ${feature} is still disabled`);
                allEnabled = false;
            } else {
                console.log(`   ✅ ${feature} is enabled`);
            }
        }
        
        return allEnabled;
    }

    /**
     * Test fuzzy plate matching functionality
     */
    async testFuzzyPlateMatching() {
        console.log('🧪 Testing fuzzy plate matching functionality...');
        
        try {
            // Import the ML toll matcher to test functionality
            const MLTollMatcher = require('./services/ml-toll-matcher');
            const matcher = new MLTollMatcher();
            
            // Test fuzzy matching with common OCR errors
            const testCases = [
                { original: 'ABC123', ocr: 'AB0123', shouldMatch: true },
                { original: 'XYZ789', ocr: 'XY2789', shouldMatch: true },
                { original: 'DEF456', ocr: 'DEFABC', shouldMatch: false }
            ];
            
            let passedTests = 0;
            
            for (const testCase of testCases) {
                const similarity = matcher.calculatePlateSimilarity(testCase.original, testCase.ocr);
                const matches = similarity > 0.7; // Threshold for fuzzy matching
                
                if (matches === testCase.shouldMatch) {
                    console.log(`   ✅ ${testCase.original} -> ${testCase.ocr}: ${similarity.toFixed(2)} (${matches ? 'MATCH' : 'NO MATCH'})`);
                    passedTests++;
                } else {
                    console.log(`   ❌ ${testCase.original} -> ${testCase.ocr}: ${similarity.toFixed(2)} (Expected ${testCase.shouldMatch ? 'MATCH' : 'NO MATCH'})`);
                }
            }
            
            const success = passedTests === testCases.length;
            console.log(`🎯 Fuzzy matching tests: ${passedTests}/${testCases.length} passed`);
            
            return success;
        } catch (error) {
            console.log(`   ⚠️  Could not test fuzzy matching: ${error.message}`);
            return false;
        }
    }

    /**
     * Enable Phase 1: Fuzzy Plate Matching
     */
    async enablePhase1() {
        console.log('🚀 Starting Phase 1: Enabling Fuzzy Plate Matching');
        console.log('📋 Phase 1 will handle OCR errors in plate number recognition');
        
        try {
            // Read current config
            const currentConfig = await this.readCurrentConfig();
            
            // Enable fuzzy plate matching
            const phase1Features = this.enablementPlan.phase1;
            await this.enableFeatures(phase1Features);
            
            // Verify enablement
            const verified = await this.verifyFeatures(phase1Features);
            
            if (verified) {
                // Test the functionality
                const testsPassed = await this.testFuzzyPlateMatching();
                
                if (testsPassed) {
                    console.log('\n🎉 Phase 1 completed successfully!');
                    console.log('✅ Fuzzy plate matching is now active');
                    console.log('📈 Expected improvement: 75-80% matching accuracy (up from 70.5%)');
                    console.log('🎯 This will handle OCR errors for the 38% of charges with missing/incorrect plates');
                    
                    return true;
                } else {
                    console.log('\n⚠️  Phase 1 enabled but tests failed');
                    console.log('🔍 Manual verification of fuzzy matching functionality recommended');
                    return false;
                }
            } else {
                console.log('\n❌ Phase 1 enablement failed - features not properly enabled');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error enabling Phase 1:', error);
            throw error;
        }
    }

    /**
     * Enable Phase 2: Confidence Scoring
     */
    async enablePhase2() {
        console.log('🚀 Starting Phase 2: Enabling Confidence Scoring');
        console.log('📋 Phase 2 will add multi-factor validation to reduce false positives');
        
        try {
            const phase2Features = this.enablementPlan.phase2;
            await this.enableFeatures(phase2Features);
            
            const verified = await this.verifyFeatures(phase2Features);
            
            if (verified) {
                console.log('\n🎉 Phase 2 completed successfully!');
                console.log('✅ Confidence scoring is now active');
                console.log('📈 Expected improvement: 80-85% matching accuracy');
                console.log('🎯 Multi-factor validation will reduce false positives');
                
                return true;
            } else {
                console.log('\n❌ Phase 2 enablement failed');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error enabling Phase 2:', error);
            throw error;
        }
    }

    /**
     * Enable Phase 3: Geographic Intelligence
     */
    async enablePhase3() {
        console.log('🚀 Starting Phase 3: Enabling Geographic Intelligence');
        console.log('📋 Phase 3 will eliminate impossible matches based on location/time');
        
        try {
            const phase3Features = this.enablementPlan.phase3;
            await this.enableFeatures(phase3Features);
            
            const verified = await this.verifyFeatures(phase3Features);
            
            if (verified) {
                console.log('\n🎉 Phase 3 completed successfully!');
                console.log('✅ Geographic intelligence is now active');
                console.log('📈 Expected improvement: 82-87% matching accuracy');
                console.log('🎯 Location-based validation will eliminate impossible matches');
                
                return true;
            } else {
                console.log('\n❌ Phase 3 enablement failed');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error enabling Phase 3:', error);
            throw error;
        }
    }

    /**
     * Show current status and recommendations
     */
    async showStatus() {
        console.log('📊 ML Features Status Report\n');
        
        const currentConfig = await this.readCurrentConfig();
        
        console.log('🔧 Current Configuration:');
        Object.entries(currentConfig).forEach(([feature, enabled]) => {
            const status = enabled ? '✅ ENABLED' : '❌ DISABLED';
            console.log(`   ${feature}: ${status}`);
        });
        
        console.log('\n📈 Recommended Enablement Order:');
        console.log('   Phase 1: fuzzyPlateMatching (handles OCR errors)');
        console.log('   Phase 2: confidenceScoring (reduces false positives)'); 
        console.log('   Phase 3: geographicIntelligence (location validation)');
        console.log('   Phase 4: patternLearning (learns from history)');
        console.log('   Phase 5: enhancedMatching + anomalyDetection (full ML)');
        
        // Determine current phase
        const enabledFeatures = Object.entries(currentConfig).filter(([_, enabled]) => enabled);
        
        if (enabledFeatures.length === 0) {
            console.log('\n🎯 Recommendation: Start with Phase 1 (enablePhase1)');
        } else {
            console.log(`\n✅ ${enabledFeatures.length} features currently enabled`);
            
            if (currentConfig.fuzzyPlateMatching && !currentConfig.confidenceScoring) {
                console.log('🎯 Recommendation: Ready for Phase 2 (enablePhase2)');
            } else if (currentConfig.confidenceScoring && !currentConfig.geographicIntelligence) {
                console.log('🎯 Recommendation: Ready for Phase 3 (enablePhase3)');
            } else {
                console.log('🎯 Continue with gradual rollout as planned');
            }
        }
    }
}

// Command line interface
async function main() {
    const enabler = new MLFeaturesEnabler();
    const command = process.argv[2];
    
    try {
        switch (command) {
            case 'status':
                await enabler.showStatus();
                break;
                
            case 'phase1':
                const phase1Success = await enabler.enablePhase1();
                process.exit(phase1Success ? 0 : 1);
                break;
                
            case 'phase2':
                const phase2Success = await enabler.enablePhase2();
                process.exit(phase2Success ? 0 : 1);
                break;
                
            case 'phase3':
                const phase3Success = await enabler.enablePhase3();
                process.exit(phase3Success ? 0 : 1);
                break;
                
            default:
                console.log('🤖 ML Features Enablement Tool');
                console.log('');
                console.log('Usage:');
                console.log('  node enable-ml-features.js status   # Show current status');
                console.log('  node enable-ml-features.js phase1   # Enable fuzzy plate matching');
                console.log('  node enable-ml-features.js phase2   # Enable confidence scoring');
                console.log('  node enable-ml-features.js phase3   # Enable geographic intelligence');
                console.log('');
                
                // Show status by default
                await enabler.showStatus();
                break;
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { MLFeaturesEnabler };