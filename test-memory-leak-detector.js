#!/usr/bin/env node

/**
 * Memory Leak Detector - Performance Audit Phase 4.2
 * Monitors memory usage patterns and detects potential leaks in running application
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

class MemoryLeakDetector {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.results = {
            timestamp: new Date().toISOString(),
            testConfiguration: {
                monitoringDuration: 120000, // 2 minutes
                measurementInterval: 2000,  // 2 seconds
                requestInterval: 1000,      // 1 second between requests
                totalRequests: 120
            },
            memoryMeasurements: [],
            heapAnalysis: {},
            gcActivity: [],
            leakDetection: {},
            recommendations: []
        };
        
        this.startTime = Date.now();
        this.setupGCObserver();
    }

    setupGCObserver() {
        // Monitor garbage collection if available
        if (global.gc && typeof global.gc === 'function') {
            console.log('✅ Manual GC available for testing');
            this.gcAvailable = true;
        } else {
            console.log('⚠️ Manual GC not available (run with --expose-gc for detailed analysis)');
            this.gcAvailable = false;
        }
    }

    async makeRequest(endpoint = '/health') {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const req = http.get(`${this.serverUrl}${endpoint}`, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    resolve({
                        success: true,
                        statusCode: res.statusCode,
                        responseTime: Date.now() - startTime,
                        contentLength: data.length
                    });
                });
            });

            req.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message,
                    responseTime: Date.now() - startTime
                });
            });

            req.setTimeout(5000, () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'timeout',
                    responseTime: 5000
                });
            });
        });
    }

    async takeMemoryMeasurement(requestCount = 0) {
        const memUsage = process.memoryUsage();
        const timestamp = Date.now() - this.startTime;
        
        // Get additional process info
        const cpuUsage = process.cpuUsage();
        const uptime = process.uptime();
        
        const measurement = {
            timestamp,
            requestCount,
            memory: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers
            },
            memoryMB: {
                rss: Math.round(memUsage.rss / (1024 * 1024) * 100) / 100,
                heapTotal: Math.round(memUsage.heapTotal / (1024 * 1024) * 100) / 100,
                heapUsed: Math.round(memUsage.heapUsed / (1024 * 1024) * 100) / 100,
                external: Math.round(memUsage.external / (1024 * 1024) * 100) / 100
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            uptime: Math.round(uptime)
        };

        this.results.memoryMeasurements.push(measurement);
        return measurement;
    }

    async runMemoryStressTest() {
        console.log('🧠 Starting memory monitoring and stress testing...');
        console.log(`⏱️ Duration: ${this.results.testConfiguration.monitoringDuration / 1000} seconds`);
        console.log(`📊 Measurements every: ${this.results.testConfiguration.measurementInterval / 1000} seconds`);
        
        let requestCount = 0;
        let measurementCount = 0;
        
        // Start memory monitoring
        const monitoringInterval = setInterval(async () => {
            const measurement = await this.takeMemoryMeasurement(requestCount);
            measurementCount++;
            
            if (measurementCount % 10 === 0) {
                console.log(`📊 Measurement ${measurementCount}: Heap ${measurement.memoryMB.heapUsed}MB, RSS ${measurement.memoryMB.rss}MB (${requestCount} requests)`);
            }
        }, this.results.testConfiguration.measurementInterval);

        // Start making requests to stress the application
        const requestInterval = setInterval(async () => {
            if (requestCount >= this.results.testConfiguration.totalRequests) {
                clearInterval(requestInterval);
                return;
            }

            // Alternate between different endpoints
            const endpoints = ['/', '/health', '/dashboard.html'];
            const endpoint = endpoints[requestCount % endpoints.length];
            
            const result = await this.makeRequest(endpoint);
            requestCount++;

            // Occasionally force garbage collection if available
            if (this.gcAvailable && requestCount % 20 === 0) {
                global.gc();
                const postGcMeasurement = await this.takeMemoryMeasurement(requestCount);
                this.results.gcActivity.push({
                    timestamp: postGcMeasurement.timestamp,
                    requestCount,
                    memoryBeforeGC: this.results.memoryMeasurements[this.results.memoryMeasurements.length - 2],
                    memoryAfterGC: postGcMeasurement
                });
                console.log(`🗑️ GC triggered at request ${requestCount}: ${postGcMeasurement.memoryMB.heapUsed}MB heap`);
            }
        }, this.results.testConfiguration.requestInterval);

        // Wait for monitoring duration
        return new Promise((resolve) => {
            setTimeout(() => {
                clearInterval(monitoringInterval);
                clearInterval(requestInterval);
                console.log(`✅ Memory monitoring complete: ${measurementCount} measurements, ${requestCount} requests`);
                resolve();
            }, this.results.testConfiguration.monitoringDuration);
        });
    }

    analyzeMemoryPatterns() {
        console.log('🔍 Analyzing memory usage patterns...');
        
        const measurements = this.results.memoryMeasurements;
        if (measurements.length < 2) {
            console.log('⚠️ Insufficient measurements for analysis');
            return;
        }

        // Extract memory series
        const heapUsed = measurements.map(m => m.memoryMB.heapUsed);
        const rss = measurements.map(m => m.memoryMB.rss);
        const external = measurements.map(m => m.memoryMB.external);
        const timestamps = measurements.map(m => m.timestamp);

        // Calculate trends
        const heapTrend = this.calculateTrend(heapUsed);
        const rssTrend = this.calculateTrend(rss);
        
        // Calculate statistics
        this.results.heapAnalysis = {
            heapUsed: {
                min: Math.min(...heapUsed),
                max: Math.max(...heapUsed),
                avg: Math.round(heapUsed.reduce((a, b) => a + b, 0) / heapUsed.length * 100) / 100,
                trend: heapTrend,
                variance: Math.round((Math.max(...heapUsed) - Math.min(...heapUsed)) * 100) / 100,
                growth: Math.round((heapUsed[heapUsed.length - 1] - heapUsed[0]) * 100) / 100
            },
            rss: {
                min: Math.min(...rss),
                max: Math.max(...rss),
                avg: Math.round(rss.reduce((a, b) => a + b, 0) / rss.length * 100) / 100,
                trend: rssTrend,
                variance: Math.round((Math.max(...rss) - Math.min(...rss)) * 100) / 100,
                growth: Math.round((rss[rss.length - 1] - rss[0]) * 100) / 100
            },
            external: {
                min: Math.min(...external),
                max: Math.max(...external),
                avg: Math.round(external.reduce((a, b) => a + b, 0) / external.length * 100) / 100,
                growth: Math.round((external[external.length - 1] - external[0]) * 100) / 100
            },
            measurementCount: measurements.length,
            duration: timestamps[timestamps.length - 1] - timestamps[0]
        };

        // Detect potential leaks
        this.detectMemoryLeaks();
        
        console.log(`📈 Heap usage: ${this.results.heapAnalysis.heapUsed.min}-${this.results.heapAnalysis.heapUsed.max}MB (avg: ${this.results.heapAnalysis.heapUsed.avg}MB)`);
        console.log(`📊 Heap growth: ${this.results.heapAnalysis.heapUsed.growth > 0 ? '+' : ''}${this.results.heapAnalysis.heapUsed.growth}MB`);
        console.log(`🏠 RSS growth: ${this.results.heapAnalysis.rss.growth > 0 ? '+' : ''}${this.results.heapAnalysis.rss.growth}MB`);
    }

    calculateTrend(values) {
        if (values.length < 2) return 0;
        
        // Simple linear regression slope
        const n = values.length;
        const sumX = (n - 1) * n / 2; // 0 + 1 + 2 + ... + (n-1)
        const sumY = values.reduce((a, b) => a + b, 0);
        const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
        const sumXX = (n - 1) * n * (2 * n - 1) / 6;
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return Math.round(slope * 1000) / 1000; // Round to 3 decimal places
    }

    detectMemoryLeaks() {
        const analysis = this.results.heapAnalysis;
        const measurements = this.results.memoryMeasurements;
        
        // Leak detection criteria
        const leakIndicators = [];
        
        // 1. Consistent upward trend
        if (analysis.heapUsed.trend > 0.01) { // More than 0.01MB per measurement
            leakIndicators.push({
                type: 'Upward Trend',
                severity: analysis.heapUsed.trend > 0.1 ? 'High' : 'Medium',
                description: `Heap memory shows consistent upward trend (+${analysis.heapUsed.trend}MB per measurement)`
            });
        }

        // 2. High total growth
        if (analysis.heapUsed.growth > 10) {
            leakIndicators.push({
                type: 'High Growth',
                severity: analysis.heapUsed.growth > 25 ? 'High' : 'Medium',
                description: `Significant heap growth during test (+${analysis.heapUsed.growth}MB)`
            });
        }

        // 3. RSS growth without heap growth (potential external memory issues)
        if (analysis.rss.growth > 10 && analysis.heapUsed.growth < 5) {
            leakIndicators.push({
                type: 'RSS Growth',
                severity: 'Medium',
                description: `RSS memory increased (+${analysis.rss.growth}MB) without corresponding heap growth`
            });
        }

        // 4. High variance (memory not being freed)
        if (analysis.heapUsed.variance > 20) {
            leakIndicators.push({
                type: 'High Variance',
                severity: 'Low',
                description: `High memory usage variance (${analysis.heapUsed.variance}MB) suggests inconsistent cleanup`
            });
        }

        // 5. Ineffective garbage collection
        if (this.results.gcActivity.length > 0) {
            const gcEffectiveness = this.results.gcActivity.map(gc => {
                if (!gc.memoryBeforeGC || !gc.memoryAfterGC) return 0;
                const before = gc.memoryBeforeGC.memoryMB.heapUsed;
                const after = gc.memoryAfterGC.memoryMB.heapUsed;
                return Math.round((before - after) * 100) / 100;
            });

            const avgGcReduction = gcEffectiveness.reduce((a, b) => a + b, 0) / gcEffectiveness.length;
            
            if (avgGcReduction < 2) {
                leakIndicators.push({
                    type: 'Ineffective GC',
                    severity: 'Medium',
                    description: `Garbage collection is not freeing significant memory (avg ${avgGcReduction}MB per GC)`
                });
            }
        }

        this.results.leakDetection = {
            indicators: leakIndicators,
            riskLevel: leakIndicators.length === 0 ? 'Low' : 
                      leakIndicators.some(i => i.severity === 'High') ? 'High' : 'Medium',
            summary: leakIndicators.length === 0 ? 'No significant memory leak indicators detected' :
                    `${leakIndicators.length} potential memory leak indicator(s) found`
        };

        console.log(`🔍 Leak detection: ${this.results.leakDetection.riskLevel} risk (${leakIndicators.length} indicators)`);
    }

    generateRecommendations() {
        console.log('💡 Generating memory performance recommendations...');
        
        const analysis = this.results.heapAnalysis;
        const leakDetection = this.results.leakDetection;
        
        // Leak-related recommendations
        leakDetection.indicators.forEach(indicator => {
            this.results.recommendations.push({
                category: 'Memory Leak',
                severity: indicator.severity,
                issue: indicator.description,
                recommendation: this.getLeakRecommendation(indicator.type)
            });
        });

        // General memory recommendations
        if (analysis.heapUsed.max > 100) {
            this.results.recommendations.push({
                category: 'Memory Usage',
                severity: 'Medium',
                issue: `High peak memory usage (${analysis.heapUsed.max}MB)`,
                recommendation: 'Monitor memory usage patterns and implement memory optimization strategies'
            });
        }

        if (analysis.heapUsed.variance > 30) {
            this.results.recommendations.push({
                category: 'Memory Consistency',
                severity: 'Low',
                issue: `High memory usage variance (${analysis.heapUsed.variance}MB)`,
                recommendation: 'Investigate memory allocation patterns and implement more consistent cleanup'
            });
        }

        // GC recommendations
        if (this.results.gcActivity.length > 0) {
            const gcFrequency = this.results.gcActivity.length / (analysis.duration / 60000); // per minute
            if (gcFrequency < 1) {
                this.results.recommendations.push({
                    category: 'Garbage Collection',
                    severity: 'Low',
                    issue: `Low GC frequency (${Math.round(gcFrequency * 100) / 100}/min)`,
                    recommendation: 'Consider tuning GC settings or implementing more frequent explicit cleanup'
                });
            }
        }

        if (this.results.recommendations.length === 0) {
            this.results.recommendations.push({
                category: 'Overall',
                severity: 'Info',
                issue: 'No significant memory issues detected',
                recommendation: 'Memory usage patterns appear healthy. Continue monitoring for trends.'
            });
        }
    }

    getLeakRecommendation(indicatorType) {
        const recommendations = {
            'Upward Trend': 'Investigate objects that are not being garbage collected. Check for event listeners, timers, and circular references.',
            'High Growth': 'Review memory allocation patterns and ensure proper cleanup of objects, especially in request handlers.',
            'RSS Growth': 'Check for native module memory usage, large buffers, or external resource leaks.',
            'High Variance': 'Implement more consistent memory management and consider pooling frequently allocated objects.',
            'Ineffective GC': 'Review object retention patterns and ensure objects are eligible for garbage collection.'
        };
        
        return recommendations[indicatorType] || 'Monitor memory usage and investigate potential causes.';
    }

    printResults() {
        console.log('\n' + '='.repeat(80));
        console.log('🧠 MEMORY LEAK DETECTION ANALYSIS');
        console.log('='.repeat(80));

        const analysis = this.results.heapAnalysis;
        const leakDetection = this.results.leakDetection;
        
        // Test configuration
        console.log('\n📋 TEST CONFIGURATION:');
        console.log(`Duration: ${this.results.testConfiguration.monitoringDuration / 1000}s`);
        console.log(`Measurements: ${analysis.measurementCount}`);
        console.log(`Requests Made: ${this.results.testConfiguration.totalRequests}`);
        if (this.results.gcActivity.length > 0) {
            console.log(`Manual GC Events: ${this.results.gcActivity.length}`);
        }

        // Memory analysis
        console.log('\n📊 MEMORY USAGE ANALYSIS:');
        console.log(`Heap Used: ${analysis.heapUsed.min}-${analysis.heapUsed.max}MB (avg: ${analysis.heapUsed.avg}MB)`);
        console.log(`Heap Growth: ${analysis.heapUsed.growth > 0 ? '+' : ''}${analysis.heapUsed.growth}MB`);
        console.log(`Heap Trend: ${analysis.heapUsed.trend > 0 ? '+' : ''}${analysis.heapUsed.trend}MB/measurement`);
        console.log(`RSS Used: ${analysis.rss.min}-${analysis.rss.max}MB (avg: ${analysis.rss.avg}MB)`);
        console.log(`RSS Growth: ${analysis.rss.growth > 0 ? '+' : ''}${analysis.rss.growth}MB`);
        console.log(`External Memory: ${analysis.external.avg}MB avg`);

        // Garbage collection analysis
        if (this.results.gcActivity.length > 0) {
            console.log('\n🗑️ GARBAGE COLLECTION ANALYSIS:');
            console.log(`GC Events: ${this.results.gcActivity.length}`);
            const gcEffectiveness = this.results.gcActivity.map(gc => {
                const before = gc.memoryBeforeGC?.memoryMB?.heapUsed || 0;
                const after = gc.memoryAfterGC?.memoryMB?.heapUsed || 0;
                return Math.round((before - after) * 100) / 100;
            });
            const avgReduction = gcEffectiveness.reduce((a, b) => a + b, 0) / gcEffectiveness.length;
            console.log(`Average Memory Freed per GC: ${avgReduction}MB`);
        }

        // Leak detection
        console.log('\n🔍 MEMORY LEAK DETECTION:');
        console.log(`Risk Level: ${leakDetection.riskLevel}`);
        console.log(`Summary: ${leakDetection.summary}`);
        
        if (leakDetection.indicators.length > 0) {
            console.log('\nIndicators Found:');
            leakDetection.indicators.forEach(indicator => {
                const severityIcon = indicator.severity === 'High' ? '🚨' : indicator.severity === 'Medium' ? '⚠️' : '💡';
                console.log(`${severityIcon} ${indicator.type}: ${indicator.description}`);
            });
        }

        // Recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        this.results.recommendations.forEach(rec => {
            const severityIcon = rec.severity === 'High' ? '🚨' : rec.severity === 'Medium' ? '⚠️' : '💡';
            console.log(`${severityIcon} [${rec.category}] ${rec.issue}`);
            console.log(`   → ${rec.recommendation}`);
        });

        console.log('\n' + '='.repeat(80));
    }

    async saveResults() {
        const filename = `memory-leak-detection-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filepath = path.join(__dirname, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
        console.log(`💾 Results saved to: ${filename}`);
        
        return filename;
    }

    async run() {
        try {
            console.log('🧠 Starting Memory Leak Detection Analysis...\n');

            // Check if server is accessible
            const healthCheck = await this.makeRequest('/health');
            if (!healthCheck.success) {
                throw new Error(`Server not accessible: ${healthCheck.error}`);
            }
            console.log('✅ Server is accessible, starting memory monitoring...\n');

            await this.runMemoryStressTest();
            this.analyzeMemoryPatterns();
            this.generateRecommendations();
            this.printResults();
            
            const filename = await this.saveResults();
            
            console.log('\n✅ Memory Leak Detection Analysis Complete!');
            return {
                success: true,
                results: this.results,
                filename
            };

        } catch (error) {
            console.error('❌ Error during memory leak detection:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Run the analysis if this script is executed directly
if (require.main === module) {
    const detector = new MemoryLeakDetector();
    detector.run().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}

module.exports = MemoryLeakDetector;