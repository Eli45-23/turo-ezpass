#!/usr/bin/env node

/**
 * Node.js Process Performance Monitor - Performance Audit Phase 1.2
 * Monitors the running Turo server process performance in real-time
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { performance, PerformanceObserver } = require('perf_hooks');

class ProcessPerformanceMonitor {
    constructor() {
        this.serverPort = 3000;
        this.serverUrl = `http://localhost:${this.serverPort}`;
        this.results = {
            timestamp: new Date().toISOString(),
            serverInfo: {},
            processMetrics: {},
            performanceTimings: [],
            healthMetrics: {},
            eventLoopMetrics: [],
            recommendations: []
        };
        this.monitoringDuration = 60000; // 1 minute
        this.measurementInterval = 2000; // 2 seconds
        this.setupPerformanceObserver();
    }

    setupPerformanceObserver() {
        // Observe HTTP timings
        const obs = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.entryType === 'measure') {
                    this.results.performanceTimings.push({
                        name: entry.name,
                        duration: Math.round(entry.duration * 100) / 100,
                        startTime: entry.startTime,
                        timestamp: Date.now()
                    });
                }
            }
        });
        obs.observe({ entryTypes: ['measure', 'navigation'] });
    }

    async checkServerHealth() {
        console.log('🔍 Checking Turo server health and connectivity...');
        
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const req = http.get(`${this.serverUrl}/health`, (res) => {
                const responseTime = Date.now() - startTime;
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const healthData = JSON.parse(data);
                        this.results.serverInfo = {
                            status: 'online',
                            statusCode: res.statusCode,
                            responseTime,
                            healthCheck: healthData,
                            headers: res.headers
                        };
                        
                        console.log(`✅ Server online - Response time: ${responseTime}ms`);
                        console.log(`📊 Health status: ${healthData.status}`);
                        resolve(true);
                    } catch (error) {
                        console.log('⚠️ Server responded but health data parsing failed');
                        this.results.serverInfo = {
                            status: 'online_no_health',
                            statusCode: res.statusCode,
                            responseTime,
                            error: error.message
                        };
                        resolve(true);
                    }
                });
            });
            
            req.on('error', (error) => {
                console.log(`❌ Server not reachable: ${error.message}`);
                this.results.serverInfo = {
                    status: 'offline',
                    error: error.message
                };
                resolve(false);
            });
            
            req.setTimeout(5000, () => {
                req.destroy();
                console.log('⏰ Server health check timed out');
                this.results.serverInfo = {
                    status: 'timeout'
                };
                resolve(false);
            });
        });
    }

    async testAPIEndpoints() {
        console.log('🌐 Testing critical API endpoints...');
        
        const endpoints = [
            { path: '/', name: 'Home Page' },
            { path: '/health', name: 'Health Check' },
            { path: '/api/dashboard', name: 'Dashboard API' },
            { path: '/api/tolls', name: 'Tolls API' },
            { path: '/api/auth', name: 'Auth API' }
        ];

        const endpointResults = [];

        for (const endpoint of endpoints) {
            const startTime = Date.now();
            performance.mark(`${endpoint.name}-start`);
            
            try {
                await new Promise((resolve, reject) => {
                    const req = http.get(`${this.serverUrl}${endpoint.path}`, (res) => {
                        const responseTime = Date.now() - startTime;
                        performance.mark(`${endpoint.name}-end`);
                        performance.measure(`${endpoint.name}`, `${endpoint.name}-start`, `${endpoint.name}-end`);
                        
                        let data = '';
                        res.on('data', (chunk) => {
                            data += chunk;
                        });
                        
                        res.on('end', () => {
                            const result = {
                                endpoint: endpoint.path,
                                name: endpoint.name,
                                statusCode: res.statusCode,
                                responseTime,
                                contentLength: data.length,
                                contentType: res.headers['content-type'] || 'unknown',
                                success: res.statusCode >= 200 && res.statusCode < 300
                            };
                            
                            endpointResults.push(result);
                            console.log(`${result.success ? '✅' : '❌'} ${endpoint.name}: ${res.statusCode} (${responseTime}ms)`);
                            resolve(result);
                        });
                    });
                    
                    req.on('error', (error) => {
                        const result = {
                            endpoint: endpoint.path,
                            name: endpoint.name,
                            error: error.message,
                            responseTime: Date.now() - startTime,
                            success: false
                        };
                        endpointResults.push(result);
                        console.log(`❌ ${endpoint.name}: ${error.message}`);
                        resolve(result);
                    });
                    
                    req.setTimeout(10000, () => {
                        req.destroy();
                        const result = {
                            endpoint: endpoint.path,
                            name: endpoint.name,
                            error: 'timeout',
                            responseTime: Date.now() - startTime,
                            success: false
                        };
                        endpointResults.push(result);
                        console.log(`⏰ ${endpoint.name}: Timeout`);
                        resolve(result);
                    });
                });
            } catch (error) {
                console.log(`❌ ${endpoint.name}: ${error.message}`);
            }
        }

        this.results.healthMetrics.endpoints = endpointResults;
        
        // Calculate endpoint statistics
        const successfulEndpoints = endpointResults.filter(e => e.success);
        const failedEndpoints = endpointResults.filter(e => !e.success);
        const responseTimes = successfulEndpoints.map(e => e.responseTime).filter(t => t);
        
        this.results.healthMetrics.summary = {
            totalEndpoints: endpointResults.length,
            successfulEndpoints: successfulEndpoints.length,
            failedEndpoints: failedEndpoints.length,
            averageResponseTime: responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length * 100) / 100 : 0,
            minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
            maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0
        };
    }

    async monitorProcessMetrics() {
        console.log(`📊 Starting process monitoring for ${this.monitoringDuration / 1000} seconds...`);
        
        return new Promise((resolve) => {
            let measurements = 0;
            const maxMeasurements = this.monitoringDuration / this.measurementInterval;
            const processMetrics = [];
            
            const interval = setInterval(() => {
                const memUsage = process.memoryUsage();
                const cpuUsage = process.cpuUsage();
                const hrTime = process.hrtime();
                
                const metric = {
                    timestamp: Date.now(),
                    measurement: measurements + 1,
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
                    uptime: process.uptime(),
                    pid: process.pid
                };

                // Add event loop lag estimation
                const eventLoopStart = hrTime[0] * 1e9 + hrTime[1];
                setImmediate(() => {
                    const eventLoopEnd = process.hrtime();
                    const eventLoopEndNs = eventLoopEnd[0] * 1e9 + eventLoopEnd[1];
                    const lag = (eventLoopEndNs - eventLoopStart) / 1e6; // Convert to milliseconds
                    
                    metric.eventLoopLag = Math.round(lag * 100) / 100;
                    this.results.eventLoopMetrics.push({
                        timestamp: metric.timestamp,
                        lag: metric.eventLoopLag
                    });
                });

                processMetrics.push(metric);
                
                measurements++;
                if (measurements % 10 === 0) {
                    console.log(`⏱️ ${measurements}/${maxMeasurements} - Heap: ${metric.memoryMB.heapUsed}MB, RSS: ${metric.memoryMB.rss}MB`);
                }

                if (measurements >= maxMeasurements) {
                    clearInterval(interval);
                    this.results.processMetrics = {
                        measurements: processMetrics,
                        duration: this.monitoringDuration,
                        interval: this.measurementInterval
                    };
                    resolve();
                }
            }, this.measurementInterval);
        });
    }

    analyzePerformanceData() {
        console.log('🔍 Analyzing process performance data...');
        
        const metrics = this.results.processMetrics.measurements;
        if (!metrics || metrics.length === 0) return;

        // Memory analysis
        const heapUsed = metrics.map(m => m.memoryMB.heapUsed);
        const rss = metrics.map(m => m.memoryMB.rss);
        const eventLoopLags = this.results.eventLoopMetrics.map(e => e.lag).filter(l => !isNaN(l));

        this.results.analysis = {
            memory: {
                heapUsed: {
                    min: Math.min(...heapUsed),
                    max: Math.max(...heapUsed),
                    avg: Math.round(heapUsed.reduce((a, b) => a + b, 0) / heapUsed.length * 100) / 100,
                    trend: heapUsed[heapUsed.length - 1] - heapUsed[0],
                    variance: Math.max(...heapUsed) - Math.min(...heapUsed)
                },
                rss: {
                    min: Math.min(...rss),
                    max: Math.max(...rss),
                    avg: Math.round(rss.reduce((a, b) => a + b, 0) / rss.length * 100) / 100,
                    trend: rss[rss.length - 1] - rss[0],
                    variance: Math.max(...rss) - Math.min(...rss)
                }
            },
            eventLoop: eventLoopLags.length > 0 ? {
                min: Math.min(...eventLoopLags),
                max: Math.max(...eventLoopLags),
                avg: Math.round(eventLoopLags.reduce((a, b) => a + b, 0) / eventLoopLags.length * 100) / 100
            } : { avg: 0, min: 0, max: 0 },
            performance: {
                measurementCount: metrics.length,
                monitoringDuration: this.monitoringDuration / 1000,
                dataCompleteness: (metrics.length / (this.monitoringDuration / this.measurementInterval)) * 100
            }
        };

        this.generateRecommendations();
    }

    generateRecommendations() {
        const analysis = this.results.analysis;
        const healthMetrics = this.results.healthMetrics;
        
        // Memory recommendations
        if (analysis.memory.heapUsed.trend > 10) {
            this.results.recommendations.push({
                category: 'Memory',
                severity: 'High',
                issue: `Memory usage is trending upward (+${analysis.memory.heapUsed.trend.toFixed(2)}MB)`,
                recommendation: 'Monitor for potential memory leaks. Consider implementing memory profiling.'
            });
        }

        if (analysis.memory.heapUsed.max > 200) {
            this.results.recommendations.push({
                category: 'Memory',
                severity: 'Medium',
                issue: `Peak heap usage is high (${analysis.memory.heapUsed.max}MB)`,
                recommendation: 'Consider optimizing memory usage patterns and implementing garbage collection tuning'
            });
        }

        // Event loop recommendations
        if (analysis.eventLoop.avg > 10) {
            this.results.recommendations.push({
                category: 'Event Loop',
                severity: 'High',
                issue: `High average event loop lag (${analysis.eventLoop.avg}ms)`,
                recommendation: 'Identify and optimize blocking operations. Consider using worker threads for CPU-intensive tasks.'
            });
        }

        // API endpoint recommendations
        if (healthMetrics && healthMetrics.summary) {
            const summary = healthMetrics.summary;
            
            if (summary.failedEndpoints > 0) {
                this.results.recommendations.push({
                    category: 'API',
                    severity: 'High',
                    issue: `${summary.failedEndpoints} out of ${summary.totalEndpoints} endpoints are failing`,
                    recommendation: 'Investigate failed endpoints and ensure proper error handling'
                });
            }

            if (summary.averageResponseTime > 1000) {
                this.results.recommendations.push({
                    category: 'API',
                    severity: 'Medium',
                    issue: `Average API response time is high (${summary.averageResponseTime}ms)`,
                    recommendation: 'Optimize database queries and implement caching strategies'
                });
            }
        }

        if (this.results.recommendations.length === 0) {
            this.results.recommendations.push({
                category: 'Overall',
                severity: 'Info',
                issue: 'No critical performance issues detected',
                recommendation: 'Process performance appears optimal. Continue monitoring for trends.'
            });
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(80));
        console.log('🔧 NODE.JS PROCESS PERFORMANCE ANALYSIS');
        console.log('='.repeat(80));

        // Server Status
        console.log('\n🌐 SERVER STATUS:');
        if (this.results.serverInfo.status === 'online') {
            console.log(`Status: ✅ Online (${this.results.serverInfo.statusCode})`);
            console.log(`Response Time: ${this.results.serverInfo.responseTime}ms`);
            if (this.results.serverInfo.healthCheck) {
                console.log(`Service: ${this.results.serverInfo.healthCheck.service || 'Turo Toll Tracker'}`);
            }
        } else {
            console.log(`Status: ❌ ${this.results.serverInfo.status}`);
        }

        // API Endpoints Health
        if (this.results.healthMetrics.summary) {
            console.log('\n🌐 API ENDPOINTS HEALTH:');
            const summary = this.results.healthMetrics.summary;
            console.log(`Total Endpoints: ${summary.totalEndpoints}`);
            console.log(`Successful: ${summary.successfulEndpoints} (${Math.round(summary.successfulEndpoints/summary.totalEndpoints*100)}%)`);
            console.log(`Failed: ${summary.failedEndpoints} (${Math.round(summary.failedEndpoints/summary.totalEndpoints*100)}%)`);
            console.log(`Average Response Time: ${summary.averageResponseTime}ms`);
            console.log(`Response Time Range: ${summary.minResponseTime}ms - ${summary.maxResponseTime}ms`);
        }

        // Process Performance Analysis
        if (this.results.analysis) {
            console.log('\n📈 PROCESS PERFORMANCE:');
            console.log(`Heap Memory - Min: ${this.results.analysis.memory.heapUsed.min}MB, Max: ${this.results.analysis.memory.heapUsed.max}MB, Avg: ${this.results.analysis.memory.heapUsed.avg}MB`);
            console.log(`RSS Memory - Min: ${this.results.analysis.memory.rss.min}MB, Max: ${this.results.analysis.memory.rss.max}MB, Avg: ${this.results.analysis.memory.rss.avg}MB`);
            console.log(`Memory Trend - Heap: ${this.results.analysis.memory.heapUsed.trend > 0 ? '+' : ''}${this.results.analysis.memory.heapUsed.trend.toFixed(2)}MB`);
            
            if (this.results.analysis.eventLoop.avg > 0) {
                console.log(`Event Loop Lag - Min: ${this.results.analysis.eventLoop.min}ms, Max: ${this.results.analysis.eventLoop.max}ms, Avg: ${this.results.analysis.eventLoop.avg}ms`);
            }
        }

        // Performance Timings
        if (this.results.performanceTimings.length > 0) {
            console.log('\n⏱️ API PERFORMANCE TIMINGS:');
            this.results.performanceTimings.forEach(timing => {
                console.log(`${timing.name}: ${timing.duration}ms`);
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
        const filename = `process-performance-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filepath = path.join(__dirname, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
        console.log(`💾 Results saved to: ${filename}`);
        
        return filename;
    }

    async run() {
        try {
            console.log('🚀 Starting Node.js Process Performance Monitoring...\n');

            const serverHealthy = await this.checkServerHealth();
            if (!serverHealthy) {
                console.log('⚠️ Server not healthy, continuing with limited analysis...');
            } else {
                await this.testAPIEndpoints();
            }
            
            await this.monitorProcessMetrics();
            this.analyzePerformanceData();
            this.printResults();
            
            const filename = await this.saveResults();
            
            console.log('\n✅ Process Performance Analysis Complete!');
            return {
                success: true,
                results: this.results,
                filename
            };

        } catch (error) {
            console.error('❌ Error during process performance analysis:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Run the analysis if this script is executed directly
if (require.main === module) {
    const monitor = new ProcessPerformanceMonitor();
    monitor.run().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}

module.exports = ProcessPerformanceMonitor;