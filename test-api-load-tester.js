#!/usr/bin/env node

/**
 * API Load Tester - Performance Audit Phase 2.1
 * Tests API endpoints under concurrent load to measure scalability and performance
 */

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

class APILoadTester {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.results = {
            timestamp: new Date().toISOString(),
            testConfiguration: {},
            loadTests: [],
            summary: {},
            recommendations: []
        };
        
        // Load test configurations
        this.loadTestConfigs = [
            { name: 'Light Load', concurrent: 5, requests: 50, duration: 30000 },
            { name: 'Medium Load', concurrent: 15, requests: 150, duration: 45000 },
            { name: 'Heavy Load', concurrent: 30, requests: 300, duration: 60000 },
            { name: 'Stress Test', concurrent: 50, requests: 500, duration: 90000 }
        ];

        // Test endpoints
        this.testEndpoints = [
            { path: '/', method: 'GET', name: 'Home Page', priority: 'critical' },
            { path: '/health', method: 'GET', name: 'Health Check', priority: 'critical' },
            { path: '/dashboard.html', method: 'GET', name: 'Dashboard', priority: 'high' },
            { path: '/public/style.css', method: 'GET', name: 'Static CSS', priority: 'medium' },
            { path: '/api/dashboard', method: 'GET', name: 'Dashboard API', priority: 'high' },
            { path: '/api/tolls', method: 'GET', name: 'Tolls API', priority: 'high' },
            { path: '/api/auth', method: 'POST', name: 'Auth API', priority: 'critical', 
              body: JSON.stringify({ email: 'test@example.com', password: 'test123' }),
              headers: { 'Content-Type': 'application/json' } }
        ];
    }

    async makeRequest(endpoint, timeout = 10000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const url = new URL(endpoint.path, this.serverUrl);
            
            const options = {
                hostname: url.hostname,
                port: url.port || 3000,
                path: url.pathname + url.search,
                method: endpoint.method || 'GET',
                headers: endpoint.headers || {},
                timeout: timeout
            };

            const req = http.request(options, (res) => {
                let data = '';
                const responseStartTime = Date.now();
                
                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    const endTime = Date.now();
                    resolve({
                        success: true,
                        statusCode: res.statusCode,
                        responseTime: endTime - startTime,
                        timeToFirstByte: responseStartTime - startTime,
                        contentLength: data.length,
                        contentType: res.headers['content-type'] || 'unknown',
                        endpoint: endpoint.path,
                        method: endpoint.method || 'GET'
                    });
                });
            });

            req.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message,
                    responseTime: Date.now() - startTime,
                    endpoint: endpoint.path,
                    method: endpoint.method || 'GET'
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'timeout',
                    responseTime: timeout,
                    endpoint: endpoint.path,
                    method: endpoint.method || 'GET'
                });
            });

            if (endpoint.body) {
                req.write(endpoint.body);
            }
            
            req.end();
        });
    }

    async runConcurrentRequests(endpoint, concurrentUsers, totalRequests) {
        console.log(`🚀 Testing ${endpoint.name} with ${concurrentUsers} concurrent users (${totalRequests} total requests)`);
        
        const results = [];
        const startTime = Date.now();
        let completedRequests = 0;
        let activeRequests = 0;
        
        return new Promise((resolve) => {
            const startNextRequest = async () => {
                if (completedRequests >= totalRequests) {
                    return;
                }

                activeRequests++;
                const requestStart = Date.now();
                
                const result = await this.makeRequest(endpoint);
                result.requestStartTime = requestStart;
                result.activeUsers = activeRequests;
                
                results.push(result);
                completedRequests++;
                activeRequests--;

                // Progress logging
                if (completedRequests % Math.max(1, Math.floor(totalRequests / 10)) === 0) {
                    const progress = Math.round((completedRequests / totalRequests) * 100);
                    console.log(`   📈 Progress: ${progress}% (${completedRequests}/${totalRequests})`);
                }

                // Start next request if needed
                if (completedRequests < totalRequests) {
                    setImmediate(startNextRequest);
                }

                // Check if we're done
                if (completedRequests >= totalRequests && activeRequests === 0) {
                    const endTime = Date.now();
                    const totalDuration = endTime - startTime;
                    
                    resolve({
                        endpoint: endpoint.path,
                        name: endpoint.name,
                        concurrentUsers,
                        totalRequests,
                        totalDuration,
                        results,
                        requestsPerSecond: Math.round((totalRequests / (totalDuration / 1000)) * 100) / 100
                    });
                }
            };

            // Start initial concurrent requests
            for (let i = 0; i < Math.min(concurrentUsers, totalRequests); i++) {
                setImmediate(startNextRequest);
            }
        });
    }

    async runLoadTest(config) {
        console.log(`\n🔥 Starting ${config.name} Test`);
        console.log(`Configuration: ${config.concurrent} concurrent users, ${config.requests} requests, ${config.duration/1000}s max duration`);
        
        const testResults = {
            config,
            startTime: Date.now(),
            endpointResults: []
        };

        // Test each endpoint
        for (const endpoint of this.testEndpoints) {
            const requestsPerEndpoint = Math.floor(config.requests / this.testEndpoints.length);
            const concurrentPerEndpoint = Math.min(config.concurrent, requestsPerEndpoint);
            
            if (requestsPerEndpoint > 0) {
                const result = await this.runConcurrentRequests(endpoint, concurrentPerEndpoint, requestsPerEndpoint);
                testResults.endpointResults.push(result);
            }
        }

        testResults.endTime = Date.now();
        testResults.duration = testResults.endTime - testResults.startTime;
        
        // Analyze results
        this.analyzeLoadTestResults(testResults);
        
        return testResults;
    }

    analyzeLoadTestResults(testResults) {
        console.log(`\n📊 Analyzing ${testResults.config.name} results...`);
        
        testResults.analysis = {
            summary: {},
            endpoints: {},
            performance: {},
            errors: {}
        };

        let allResults = [];
        let totalRequests = 0;
        let totalErrors = 0;
        let totalResponseTime = 0;

        // Analyze each endpoint
        testResults.endpointResults.forEach(endpointTest => {
            const results = endpointTest.results;
            allResults = allResults.concat(results);
            
            const successfulResults = results.filter(r => r.success);
            const failedResults = results.filter(r => !r.success);
            const responseTimes = successfulResults.map(r => r.responseTime);
            
            totalRequests += results.length;
            totalErrors += failedResults.length;
            totalResponseTime += responseTimes.reduce((a, b) => a + b, 0);

            // Calculate percentiles
            responseTimes.sort((a, b) => a - b);
            const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
            const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
            const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

            testResults.analysis.endpoints[endpointTest.endpoint] = {
                totalRequests: results.length,
                successfulRequests: successfulResults.length,
                failedRequests: failedResults.length,
                successRate: Math.round((successfulRequests.length / results.length) * 100),
                averageResponseTime: responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length * 100) / 100 : 0,
                minResponseTime: Math.min(...responseTimes) || 0,
                maxResponseTime: Math.max(...responseTimes) || 0,
                p50ResponseTime: p50,
                p95ResponseTime: p95,
                p99ResponseTime: p99,
                requestsPerSecond: endpointTest.requestsPerSecond,
                errors: failedResults.map(r => r.error)
            };

            console.log(`   ${endpointTest.name}: ${successfulResults.length}/${results.length} success (${Math.round(successfulResults.length/results.length*100)}%), avg ${testResults.analysis.endpoints[endpointTest.endpoint].averageResponseTime}ms`);
        });

        // Overall analysis
        const allResponseTimes = allResults.filter(r => r.success).map(r => r.responseTime);
        allResponseTimes.sort((a, b) => a - b);

        testResults.analysis.summary = {
            totalRequests,
            successfulRequests: totalRequests - totalErrors,
            failedRequests: totalErrors,
            overallSuccessRate: Math.round(((totalRequests - totalErrors) / totalRequests) * 100),
            averageResponseTime: allResponseTimes.length > 0 ? Math.round(allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length * 100) / 100 : 0,
            p50ResponseTime: allResponseTimes[Math.floor(allResponseTimes.length * 0.5)] || 0,
            p95ResponseTime: allResponseTimes[Math.floor(allResponseTimes.length * 0.95)] || 0,
            p99ResponseTime: allResponseTimes[Math.floor(allResponseTimes.length * 0.99)] || 0,
            overallRequestsPerSecond: Math.round((totalRequests / (testResults.duration / 1000)) * 100) / 100,
            testDuration: testResults.duration
        };

        console.log(`   📊 Overall: ${testResults.analysis.summary.overallSuccessRate}% success, ${testResults.analysis.summary.averageResponseTime}ms avg, ${testResults.analysis.summary.overallRequestsPerSecond} req/s`);
    }

    async runFullLoadTestSuite() {
        console.log('🚀 Starting Comprehensive Load Test Suite...\n');
        
        for (const config of this.loadTestConfigs) {
            const testResult = await this.runLoadTest(config);
            this.results.loadTests.push(testResult);
            
            // Wait between tests to allow system recovery
            if (config !== this.loadTestConfigs[this.loadTestConfigs.length - 1]) {
                console.log('\n⏸️  Waiting 10 seconds for system recovery...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }

    generateComprehensiveAnalysis() {
        console.log('\n🔍 Generating comprehensive load test analysis...');
        
        const summary = {
            totalTests: this.results.loadTests.length,
            totalRequests: 0,
            totalSuccessfulRequests: 0,
            totalFailedRequests: 0,
            performanceByLoad: {},
            endpointPerformance: {},
            scalabilityMetrics: {}
        };

        // Aggregate results
        this.results.loadTests.forEach(test => {
            const analysis = test.analysis.summary;
            summary.totalRequests += analysis.totalRequests;
            summary.totalSuccessfulRequests += analysis.successfulRequests;
            summary.totalFailedRequests += analysis.failedRequests;

            summary.performanceByLoad[test.config.name] = {
                concurrentUsers: test.config.concurrent,
                totalRequests: analysis.totalRequests,
                successRate: analysis.overallSuccessRate,
                avgResponseTime: analysis.averageResponseTime,
                p95ResponseTime: analysis.p95ResponseTime,
                requestsPerSecond: analysis.overallRequestsPerSecond,
                duration: analysis.testDuration
            };

            // Track endpoint performance across different loads
            Object.keys(test.analysis.endpoints).forEach(endpoint => {
                if (!summary.endpointPerformance[endpoint]) {
                    summary.endpointPerformance[endpoint] = [];
                }
                summary.endpointPerformance[endpoint].push({
                    load: test.config.name,
                    concurrent: test.config.concurrent,
                    successRate: test.analysis.endpoints[endpoint].successRate,
                    avgResponseTime: test.analysis.endpoints[endpoint].averageResponseTime,
                    p95ResponseTime: test.analysis.endpoints[endpoint].p95ResponseTime,
                    requestsPerSecond: test.analysis.endpoints[endpoint].requestsPerSecond
                });
            });
        });

        // Calculate scalability metrics
        const loads = this.results.loadTests.map(test => ({
            concurrent: test.config.concurrent,
            rps: test.analysis.summary.overallRequestsPerSecond,
            avgResponse: test.analysis.summary.averageResponseTime,
            successRate: test.analysis.summary.overallSuccessRate
        }));

        summary.scalabilityMetrics = {
            maxThroughput: Math.max(...loads.map(l => l.rps)),
            minResponseTime: Math.min(...loads.map(l => l.avgResponse)),
            maxResponseTime: Math.max(...loads.map(l => l.avgResponse)),
            scalabilityIndex: this.calculateScalabilityIndex(loads),
            performanceDegradation: this.calculatePerformanceDegradation(loads)
        };

        this.results.summary = summary;
        this.generateRecommendations();
    }

    calculateScalabilityIndex(loads) {
        // Calculate how well the system scales with increased load
        if (loads.length < 2) return 100;
        
        const firstLoad = loads[0];
        const lastLoad = loads[loads.length - 1];
        
        const expectedRPS = (lastLoad.concurrent / firstLoad.concurrent) * firstLoad.rps;
        const actualRPS = lastLoad.rps;
        
        return Math.round((actualRPS / expectedRPS) * 100);
    }

    calculatePerformanceDegradation(loads) {
        // Calculate how response time degrades with load
        if (loads.length < 2) return 0;
        
        const minResponse = Math.min(...loads.map(l => l.avgResponse));
        const maxResponse = Math.max(...loads.map(l => l.avgResponse));
        
        return Math.round(((maxResponse - minResponse) / minResponse) * 100);
    }

    generateRecommendations() {
        const summary = this.results.summary;
        
        // Success rate recommendations
        const avgSuccessRate = summary.totalSuccessfulRequests / summary.totalRequests * 100;
        if (avgSuccessRate < 95) {
            this.results.recommendations.push({
                category: 'Reliability',
                severity: 'High',
                issue: `Overall success rate is low (${Math.round(avgSuccessRate)}%)`,
                recommendation: 'Investigate failing endpoints and implement proper error handling and retry mechanisms'
            });
        }

        // Performance recommendations
        const stressTestResult = this.results.loadTests.find(t => t.config.name === 'Stress Test');
        if (stressTestResult && stressTestResult.analysis.summary.p95ResponseTime > 2000) {
            this.results.recommendations.push({
                category: 'Performance',
                severity: 'Medium',
                issue: `High p95 response times under stress (${stressTestResult.analysis.summary.p95ResponseTime}ms)`,
                recommendation: 'Optimize database queries and implement caching to improve response times'
            });
        }

        // Scalability recommendations
        if (summary.scalabilityMetrics.scalabilityIndex < 70) {
            this.results.recommendations.push({
                category: 'Scalability',
                severity: 'High',
                issue: `Poor scalability index (${summary.scalabilityMetrics.scalabilityIndex}%)`,
                recommendation: 'System does not scale well with increased load. Consider connection pooling, caching, and load balancing'
            });
        }

        if (summary.scalabilityMetrics.performanceDegradation > 200) {
            this.results.recommendations.push({
                category: 'Performance',
                severity: 'Medium',
                issue: `High performance degradation under load (${summary.scalabilityMetrics.performanceDegradation}% increase)`,
                recommendation: 'Implement performance optimization strategies to maintain response times under load'
            });
        }

        // Endpoint-specific recommendations
        Object.entries(summary.endpointPerformance).forEach(([endpoint, performances]) => {
            const criticalEndpoint = this.testEndpoints.find(e => e.path === endpoint && e.priority === 'critical');
            if (criticalEndpoint) {
                const worstPerformance = performances.sort((a, b) => b.avgResponseTime - a.avgResponseTime)[0];
                if (worstPerformance.avgResponseTime > 1000) {
                    this.results.recommendations.push({
                        category: 'Critical Endpoint',
                        severity: 'High',
                        issue: `Critical endpoint ${endpoint} has high response times (${worstPerformance.avgResponseTime}ms)`,
                        recommendation: 'Prioritize optimization of this critical endpoint as it impacts user experience'
                    });
                }
            }
        });

        if (this.results.recommendations.length === 0) {
            this.results.recommendations.push({
                category: 'Overall',
                severity: 'Info',
                issue: 'Load test results are within acceptable parameters',
                recommendation: 'System demonstrates good performance under tested load conditions'
            });
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(80));
        console.log('🔥 LOAD TEST RESULTS SUMMARY');
        console.log('='.repeat(80));

        const summary = this.results.summary;
        
        // Overall metrics
        console.log('\n📊 OVERALL PERFORMANCE:');
        console.log(`Total Requests: ${summary.totalRequests.toLocaleString()}`);
        console.log(`Successful Requests: ${summary.totalSuccessfulRequests.toLocaleString()} (${Math.round(summary.totalSuccessfulRequests/summary.totalRequests*100)}%)`);
        console.log(`Failed Requests: ${summary.totalFailedRequests.toLocaleString()} (${Math.round(summary.totalFailedRequests/summary.totalRequests*100)}%)`);

        // Performance by load
        console.log('\n🚀 PERFORMANCE BY LOAD LEVEL:');
        Object.entries(summary.performanceByLoad).forEach(([loadName, metrics]) => {
            console.log(`${loadName}:`);
            console.log(`  Concurrent Users: ${metrics.concurrentUsers}`);
            console.log(`  Success Rate: ${metrics.successRate}%`);
            console.log(`  Avg Response Time: ${metrics.avgResponseTime}ms`);
            console.log(`  P95 Response Time: ${metrics.p95ResponseTime}ms`);
            console.log(`  Throughput: ${metrics.requestsPerSecond} req/s`);
        });

        // Scalability metrics
        console.log('\n📈 SCALABILITY METRICS:');
        console.log(`Max Throughput: ${summary.scalabilityMetrics.maxThroughput} req/s`);
        console.log(`Response Time Range: ${summary.scalabilityMetrics.minResponseTime}ms - ${summary.scalabilityMetrics.maxResponseTime}ms`);
        console.log(`Scalability Index: ${summary.scalabilityMetrics.scalabilityIndex}% (100% = perfect scaling)`);
        console.log(`Performance Degradation: ${summary.scalabilityMetrics.performanceDegradation}% (lower is better)`);

        // Top performing endpoints
        console.log('\n🏆 TOP PERFORMING ENDPOINTS:');
        Object.entries(summary.endpointPerformance).forEach(([endpoint, performances]) => {
            const avgResponse = performances.reduce((sum, p) => sum + p.avgResponseTime, 0) / performances.length;
            const avgSuccess = performances.reduce((sum, p) => sum + p.successRate, 0) / performances.length;
            console.log(`${endpoint}: ${Math.round(avgSuccess)}% success, ${Math.round(avgResponse)}ms avg`);
        });

        // Recommendations
        console.log('\n💡 LOAD TEST RECOMMENDATIONS:');
        this.results.recommendations.forEach(rec => {
            const severityIcon = rec.severity === 'High' ? '🚨' : rec.severity === 'Medium' ? '⚠️' : '💡';
            console.log(`${severityIcon} [${rec.category}] ${rec.issue}`);
            console.log(`   → ${rec.recommendation}`);
        });

        console.log('\n' + '='.repeat(80));
    }

    async saveResults() {
        const filename = `api-load-test-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filepath = path.join(__dirname, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
        console.log(`💾 Results saved to: ${filename}`);
        
        return filename;
    }

    async run() {
        try {
            console.log('🔥 Starting Comprehensive API Load Testing...\n');

            await this.runFullLoadTestSuite();
            this.generateComprehensiveAnalysis();
            this.printResults();
            
            const filename = await this.saveResults();
            
            console.log('\n✅ API Load Testing Complete!');
            return {
                success: true,
                results: this.results,
                filename
            };

        } catch (error) {
            console.error('❌ Error during API load testing:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Run the load test if this script is executed directly
if (require.main === module) {
    const tester = new APILoadTester();
    tester.run().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}

module.exports = APILoadTester;