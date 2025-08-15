#!/usr/bin/env node

/**
 * Focused API Load Tester - Performance Audit Phase 2.1
 * Quick load testing focused on key endpoints
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

class FocusedLoadTester {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.results = {
            timestamp: new Date().toISOString(),
            loadTests: [],
            summary: {},
            recommendations: []
        };
        
        // Quick test configurations
        this.loadTestConfigs = [
            { name: 'Light Load', concurrent: 5, requests: 25, duration: 15000 },
            { name: 'Medium Load', concurrent: 15, requests: 75, duration: 20000 },
            { name: 'Heavy Load', concurrent: 25, requests: 100, duration: 25000 }
        ];

        // Key endpoints to test
        this.testEndpoints = [
            { path: '/', method: 'GET', name: 'Home Page', priority: 'critical' },
            { path: '/health', method: 'GET', name: 'Health Check', priority: 'critical' },
            { path: '/dashboard.html', method: 'GET', name: 'Dashboard', priority: 'high' }
        ];
    }

    async makeRequest(endpoint, timeout = 5000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const req = http.get(`${this.serverUrl}${endpoint.path}`, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    resolve({
                        success: true,
                        statusCode: res.statusCode,
                        responseTime: Date.now() - startTime,
                        contentLength: data.length,
                        endpoint: endpoint.path
                    });
                });
            });

            req.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message,
                    responseTime: Date.now() - startTime,
                    endpoint: endpoint.path
                });
            });

            req.setTimeout(timeout, () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'timeout',
                    responseTime: timeout,
                    endpoint: endpoint.path
                });
            });
        });
    }

    async runConcurrentRequests(endpoint, concurrent, total) {
        console.log(`🚀 Testing ${endpoint.name}: ${concurrent} concurrent, ${total} total`);
        
        const results = [];
        let completed = 0;
        let active = 0;
        
        return new Promise((resolve) => {
            const startRequest = async () => {
                if (completed >= total) return;
                
                active++;
                const result = await this.makeRequest(endpoint);
                results.push(result);
                completed++;
                active--;

                if (completed % 10 === 0) {
                    console.log(`   Progress: ${Math.round(completed/total*100)}%`);
                }

                if (completed < total) {
                    setImmediate(startRequest);
                }

                if (completed >= total && active === 0) {
                    resolve(results);
                }
            };

            // Start concurrent requests
            for (let i = 0; i < Math.min(concurrent, total); i++) {
                setImmediate(startRequest);
            }
        });
    }

    async runLoadTest(config) {
        console.log(`\n🔥 ${config.name} Test (${config.concurrent} concurrent users)`);
        
        const testResult = {
            config,
            startTime: Date.now(),
            endpointResults: []
        };

        for (const endpoint of this.testEndpoints) {
            const requestsPerEndpoint = Math.floor(config.requests / this.testEndpoints.length);
            const results = await this.runConcurrentRequests(endpoint, config.concurrent, requestsPerEndpoint);
            
            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);
            const responseTimes = successful.map(r => r.responseTime);
            responseTimes.sort((a, b) => a - b);

            const analysis = {
                endpoint: endpoint.path,
                name: endpoint.name,
                totalRequests: results.length,
                successful: successful.length,
                failed: failed.length,
                successRate: Math.round((successful.length / results.length) * 100),
                avgResponseTime: responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0,
                minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
                maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
                p95ResponseTime: responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.95)] || 0 : 0
            };

            testResult.endpointResults.push(analysis);
            console.log(`   ${endpoint.name}: ${analysis.successRate}% success, ${analysis.avgResponseTime}ms avg`);
        }

        testResult.endTime = Date.now();
        testResult.duration = testResult.endTime - testResult.startTime;
        
        return testResult;
    }

    async runAllTests() {
        console.log('🚀 Starting Focused Load Testing Suite...\n');
        
        for (const config of this.loadTestConfigs) {
            const result = await this.runLoadTest(config);
            this.results.loadTests.push(result);
            
            // Short recovery period
            if (config !== this.loadTestConfigs[this.loadTestConfigs.length - 1]) {
                console.log('\n⏸️ Recovery pause...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }

    analyzeResults() {
        console.log('\n🔍 Analyzing results...');
        
        const summary = {
            totalTests: this.results.loadTests.length,
            performance: {},
            endpoints: {}
        };

        this.results.loadTests.forEach(test => {
            summary.performance[test.config.name] = {
                concurrent: test.config.concurrent,
                duration: test.duration,
                endpoints: test.endpointResults.map(e => ({
                    name: e.name,
                    successRate: e.successRate,
                    avgResponseTime: e.avgResponseTime,
                    p95ResponseTime: e.p95ResponseTime
                }))
            };

            // Track endpoint performance across loads
            test.endpointResults.forEach(endpoint => {
                if (!summary.endpoints[endpoint.endpoint]) {
                    summary.endpoints[endpoint.endpoint] = [];
                }
                summary.endpoints[endpoint.endpoint].push({
                    load: test.config.name,
                    concurrent: test.config.concurrent,
                    successRate: endpoint.successRate,
                    avgResponseTime: endpoint.avgResponseTime,
                    p95ResponseTime: endpoint.p95ResponseTime
                });
            });
        });

        this.results.summary = summary;
        this.generateRecommendations();
    }

    generateRecommendations() {
        // Check for performance issues
        this.results.loadTests.forEach(test => {
            test.endpointResults.forEach(endpoint => {
                if (endpoint.successRate < 95) {
                    this.results.recommendations.push({
                        severity: 'High',
                        category: 'Reliability',
                        issue: `${endpoint.name} has low success rate (${endpoint.successRate}%) under ${test.config.name}`,
                        recommendation: 'Investigate endpoint failures and implement proper error handling'
                    });
                }

                if (endpoint.avgResponseTime > 1000) {
                    this.results.recommendations.push({
                        severity: 'Medium',
                        category: 'Performance',
                        issue: `${endpoint.name} has high response times (${endpoint.avgResponseTime}ms) under ${test.config.name}`,
                        recommendation: 'Optimize endpoint performance through caching or query optimization'
                    });
                }

                if (endpoint.p95ResponseTime > 2000) {
                    this.results.recommendations.push({
                        severity: 'Medium',
                        category: 'Performance',
                        issue: `${endpoint.name} has high P95 response times (${endpoint.p95ResponseTime}ms)`,
                        recommendation: 'Address performance outliers that affect user experience'
                    });
                }
            });
        });

        // Check scalability
        Object.entries(this.results.summary.endpoints).forEach(([path, performances]) => {
            const lightLoad = performances.find(p => p.load === 'Light Load');
            const heavyLoad = performances.find(p => p.load === 'Heavy Load');
            
            if (lightLoad && heavyLoad) {
                const degradation = ((heavyLoad.avgResponseTime - lightLoad.avgResponseTime) / lightLoad.avgResponseTime) * 100;
                if (degradation > 300) {
                    this.results.recommendations.push({
                        severity: 'High',
                        category: 'Scalability',
                        issue: `${path} shows poor scalability (${Math.round(degradation)}% performance degradation)`,
                        recommendation: 'System does not scale well with increased load. Consider optimization strategies.'
                    });
                }
            }
        });

        if (this.results.recommendations.length === 0) {
            this.results.recommendations.push({
                severity: 'Info',
                category: 'Overall',
                issue: 'All load test metrics are within acceptable ranges',
                recommendation: 'System demonstrates good performance characteristics under tested load'
            });
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(60));
        console.log('🔥 FOCUSED LOAD TEST RESULTS');
        console.log('='.repeat(60));

        // Performance by load
        Object.entries(this.results.summary.performance).forEach(([loadName, metrics]) => {
            console.log(`\n📊 ${loadName}:`);
            console.log(`  Concurrent Users: ${metrics.concurrent}`);
            console.log(`  Test Duration: ${(metrics.duration/1000).toFixed(1)}s`);
            
            metrics.endpoints.forEach(endpoint => {
                console.log(`  ${endpoint.name}:`);
                console.log(`    Success Rate: ${endpoint.successRate}%`);
                console.log(`    Avg Response: ${endpoint.avgResponseTime}ms`);
                console.log(`    P95 Response: ${endpoint.p95ResponseTime}ms`);
            });
        });

        // Endpoint comparison
        console.log('\n🏆 ENDPOINT PERFORMANCE COMPARISON:');
        Object.entries(this.results.summary.endpoints).forEach(([path, performances]) => {
            console.log(`\n${path}:`);
            performances.forEach(perf => {
                console.log(`  ${perf.load}: ${perf.successRate}% success, ${perf.avgResponseTime}ms avg`);
            });
        });

        // Recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        this.results.recommendations.forEach(rec => {
            const icon = rec.severity === 'High' ? '🚨' : rec.severity === 'Medium' ? '⚠️' : '💡';
            console.log(`${icon} [${rec.category}] ${rec.issue}`);
            console.log(`   → ${rec.recommendation}`);
        });

        console.log('\n' + '='.repeat(60));
    }

    async saveResults() {
        const filename = `focused-load-test-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(this.results, null, 2));
        console.log(`💾 Results saved to: ${filename}`);
        return filename;
    }

    async run() {
        try {
            await this.runAllTests();
            this.analyzeResults();
            this.printResults();
            const filename = await this.saveResults();
            
            console.log('\n✅ Focused Load Testing Complete!');
            return { success: true, results: this.results, filename };
        } catch (error) {
            console.error('❌ Error during load testing:', error);
            return { success: false, error: error.message };
        }
    }
}

if (require.main === module) {
    const tester = new FocusedLoadTester();
    tester.run().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}

module.exports = FocusedLoadTester;