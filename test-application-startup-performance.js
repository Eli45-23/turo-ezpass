#!/usr/bin/env node

/**
 * Application Startup Performance Analyzer - Performance Audit Phase 4.1
 * Analyzes Node.js application startup time, memory usage patterns, and initialization performance
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

class ApplicationStartupAnalyzer {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            startupTests: [],
            memoryAnalysis: [],
            moduleLoadingAnalysis: [],
            initializationMetrics: {},
            recommendations: []
        };
        this.serverScript = path.join(__dirname, 'server.js');
        this.testIterations = 5;
    }

    async measureModuleLoadTime() {
        console.log('📦 Analyzing module loading performance...');
        
        // Create a test script that measures require times
        const measureScript = `
const { performance } = require('perf_hooks');

const modules = [
    'express',
    'sqlite3',
    'path',
    'fs',
    'http',
    'ws',
    'crypto',
    './config/database',
    './middleware/security'
];

const loadTimes = {};
const totalStart = performance.now();

modules.forEach(moduleName => {
    try {
        const start = performance.now();
        require(moduleName);
        const end = performance.now();
        loadTimes[moduleName] = Math.round((end - start) * 100) / 100;
    } catch (error) {
        loadTimes[moduleName] = { error: error.message };
    }
});

const totalEnd = performance.now();
loadTimes['__total__'] = Math.round((totalEnd - totalStart) * 100) / 100;

console.log(JSON.stringify(loadTimes));
        `;

        const scriptPath = path.join(__dirname, 'temp-module-test.js');
        fs.writeFileSync(scriptPath, measureScript);

        return new Promise((resolve) => {
            exec(`node ${scriptPath}`, { cwd: __dirname }, (error, stdout, stderr) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(scriptPath);
                } catch (e) {}

                if (error) {
                    console.log('⚠️ Module loading test failed:', error.message);
                    resolve({});
                    return;
                }

                try {
                    const loadTimes = JSON.parse(stdout.trim());
                    this.results.moduleLoadingAnalysis = Object.entries(loadTimes)
                        .filter(([name]) => name !== '__total__')
                        .map(([name, time]) => ({
                            module: name,
                            loadTime: typeof time === 'object' ? -1 : time,
                            error: typeof time === 'object' ? time.error : null
                        }))
                        .sort((a, b) => b.loadTime - a.loadTime);

                    const totalTime = loadTimes.__total__;
                    console.log(`📦 Total module loading time: ${totalTime}ms`);
                    
                    // Show slowest modules
                    const slowModules = this.results.moduleLoadingAnalysis
                        .filter(m => m.loadTime > 0)
                        .slice(0, 3);
                    
                    slowModules.forEach(m => {
                        console.log(`   ${m.module}: ${m.loadTime}ms`);
                    });

                    resolve({ totalTime, modules: this.results.moduleLoadingAnalysis });
                } catch (parseError) {
                    console.log('⚠️ Failed to parse module loading results');
                    resolve({});
                }
            });
        });
    }

    async measureStartupTime() {
        console.log('🚀 Measuring application startup performance...');
        
        const startupResults = [];
        
        for (let i = 0; i < this.testIterations; i++) {
            console.log(`   Startup test ${i + 1}/${this.testIterations}...`);
            
            const startTime = Date.now();
            let serverProcess;
            let startupComplete = false;
            let healthCheckSuccess = false;
            let memoryAtStartup = 0;

            const startupPromise = new Promise((resolve) => {
                // Start server process
                serverProcess = spawn('node', ['server.js'], {
                    cwd: __dirname,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: { ...process.env, NODE_ENV: 'test' }
                });

                let output = '';
                let errorOutput = '';

                serverProcess.stdout.on('data', (data) => {
                    output += data.toString();
                    
                    // Check if server has started
                    if (output.includes('Turo Toll Tracker running') && !startupComplete) {
                        const startupTime = Date.now() - startTime;
                        startupComplete = true;
                        
                        // Try to get memory usage
                        try {
                            memoryAtStartup = process.memoryUsage().rss;
                        } catch (e) {}

                        // Give server a moment to stabilize then test health endpoint
                        setTimeout(async () => {
                            try {
                                const healthResult = await this.testHealthEndpoint();
                                healthCheckSuccess = healthResult.success;
                                
                                resolve({
                                    iteration: i + 1,
                                    startupTime,
                                    memoryAtStartup: Math.round(memoryAtStartup / (1024 * 1024) * 100) / 100,
                                    healthCheckSuccess,
                                    healthCheckTime: healthResult.responseTime,
                                    output: output.substring(0, 500), // First 500 chars
                                    success: true
                                });
                            } catch (error) {
                                resolve({
                                    iteration: i + 1,
                                    startupTime,
                                    memoryAtStartup: Math.round(memoryAtStartup / (1024 * 1024) * 100) / 100,
                                    healthCheckSuccess: false,
                                    error: error.message,
                                    success: startupComplete
                                });
                            }
                        }, 1000);
                    }
                });

                serverProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                serverProcess.on('close', (code) => {
                    if (!startupComplete) {
                        resolve({
                            iteration: i + 1,
                            startupTime: Date.now() - startTime,
                            error: `Process exited with code ${code}`,
                            errorOutput: errorOutput.substring(0, 500),
                            success: false
                        });
                    }
                });

                // Timeout after 30 seconds
                setTimeout(() => {
                    if (!startupComplete) {
                        resolve({
                            iteration: i + 1,
                            startupTime: 30000,
                            error: 'Startup timeout',
                            success: false
                        });
                    }
                }, 30000);
            });

            const result = await startupPromise;
            startupResults.push(result);

            // Clean up server process
            if (serverProcess && !serverProcess.killed) {
                serverProcess.kill('SIGTERM');
                
                // Force kill if not stopped after 5 seconds
                setTimeout(() => {
                    if (!serverProcess.killed) {
                        serverProcess.kill('SIGKILL');
                    }
                }, 5000);
            }

            // Wait between tests
            if (i < this.testIterations - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        this.results.startupTests = startupResults;
        this.analyzeStartupResults();
        
        return startupResults;
    }

    async testHealthEndpoint() {
        const http = require('http');
        
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const req = http.get('http://localhost:3000/health', (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    resolve({
                        success: res.statusCode === 200,
                        statusCode: res.statusCode,
                        responseTime: Date.now() - startTime,
                        data: data.substring(0, 200) // First 200 chars
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

    analyzeStartupResults() {
        console.log('🔍 Analyzing startup performance results...');
        
        const successfulStartups = this.results.startupTests.filter(t => t.success);
        const failedStartups = this.results.startupTests.filter(t => !t.success);
        
        if (successfulStartups.length === 0) {
            this.results.initializationMetrics = {
                successRate: 0,
                averageStartupTime: 0,
                analysis: 'All startup attempts failed'
            };
            return;
        }

        const startupTimes = successfulStartups.map(t => t.startupTime);
        const memoryUsages = successfulStartups.map(t => t.memoryAtStartup).filter(m => m > 0);
        const healthCheckTimes = successfulStartups.map(t => t.healthCheckTime).filter(t => t);

        this.results.initializationMetrics = {
            totalTests: this.results.startupTests.length,
            successfulStartups: successfulStartups.length,
            failedStartups: failedStartups.length,
            successRate: Math.round((successfulStartups.length / this.results.startupTests.length) * 100),
            
            startupTime: {
                average: Math.round(startupTimes.reduce((a, b) => a + b, 0) / startupTimes.length),
                min: Math.min(...startupTimes),
                max: Math.max(...startupTimes),
                variance: Math.max(...startupTimes) - Math.min(...startupTimes)
            },
            
            memoryUsage: memoryUsages.length > 0 ? {
                average: Math.round(memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length * 100) / 100,
                min: Math.min(...memoryUsages),
                max: Math.max(...memoryUsages)
            } : null,
            
            healthCheck: healthCheckTimes.length > 0 ? {
                average: Math.round(healthCheckTimes.reduce((a, b) => a + b, 0) / healthCheckTimes.length),
                min: Math.min(...healthCheckTimes),
                max: Math.max(...healthCheckTimes)
            } : null
        };

        console.log(`📊 Startup success rate: ${this.results.initializationMetrics.successRate}%`);
        console.log(`⏱️ Average startup time: ${this.results.initializationMetrics.startupTime.average}ms`);
        if (this.results.initializationMetrics.memoryUsage) {
            console.log(`💾 Average memory at startup: ${this.results.initializationMetrics.memoryUsage.average}MB`);
        }
    }

    generateRecommendations() {
        console.log('💡 Generating startup performance recommendations...');
        
        const metrics = this.results.initializationMetrics;
        
        // Success rate recommendations
        if (metrics.successRate < 100) {
            this.results.recommendations.push({
                category: 'Reliability',
                severity: metrics.successRate < 80 ? 'High' : 'Medium',
                issue: `Startup success rate is ${metrics.successRate}% (${metrics.failedStartups}/${metrics.totalTests} failures)`,
                recommendation: 'Investigate startup failures and improve error handling during initialization'
            });
        }

        // Startup time recommendations
        if (metrics.startupTime && metrics.startupTime.average > 5000) {
            this.results.recommendations.push({
                category: 'Performance',
                severity: 'Medium',
                issue: `Slow startup time (${metrics.startupTime.average}ms average)`,
                recommendation: 'Optimize application initialization by reducing blocking operations and lazy-loading non-critical modules'
            });
        }

        if (metrics.startupTime && metrics.startupTime.variance > 3000) {
            this.results.recommendations.push({
                category: 'Consistency',
                severity: 'Low',
                issue: `Inconsistent startup times (${metrics.startupTime.variance}ms variance)`,
                recommendation: 'Startup performance varies significantly - investigate causes of timing inconsistency'
            });
        }

        // Memory recommendations
        if (metrics.memoryUsage && metrics.memoryUsage.average > 100) {
            this.results.recommendations.push({
                category: 'Memory',
                severity: 'Medium',
                issue: `High memory usage at startup (${metrics.memoryUsage.average}MB average)`,
                recommendation: 'Consider optimizing initial memory allocation and lazy-loading components'
            });
        }

        // Module loading recommendations
        const slowModules = this.results.moduleLoadingAnalysis.filter(m => m.loadTime > 100);
        if (slowModules.length > 0) {
            this.results.recommendations.push({
                category: 'Module Loading',
                severity: 'Medium',
                issue: `Slow module loading detected: ${slowModules.map(m => m.module).join(', ')}`,
                recommendation: 'Consider lazy loading or optimizing slow-loading modules'
            });
        }

        // Health check recommendations
        if (metrics.healthCheck && metrics.healthCheck.average > 1000) {
            this.results.recommendations.push({
                category: 'Health Check',
                severity: 'Low',
                issue: `Slow health check response (${metrics.healthCheck.average}ms)`,
                recommendation: 'Optimize health check endpoint for faster response times'
            });
        }

        if (this.results.recommendations.length === 0) {
            this.results.recommendations.push({
                category: 'Overall',
                severity: 'Info',
                issue: 'Application startup performance is within acceptable parameters',
                recommendation: 'Continue monitoring startup metrics for performance trends'
            });
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(80));
        console.log('🚀 APPLICATION STARTUP PERFORMANCE ANALYSIS');
        console.log('='.repeat(80));

        const metrics = this.results.initializationMetrics;
        
        // Startup metrics
        console.log('\n🎯 STARTUP PERFORMANCE METRICS:');
        console.log(`Total Tests: ${metrics.totalTests}`);
        console.log(`Success Rate: ${metrics.successRate}% (${metrics.successfulStartups}/${metrics.totalTests})`);
        
        if (metrics.startupTime) {
            console.log(`Startup Time: ${metrics.startupTime.average}ms avg (${metrics.startupTime.min}-${metrics.startupTime.max}ms)`);
            console.log(`Startup Variance: ${metrics.startupTime.variance}ms`);
        }

        if (metrics.memoryUsage) {
            console.log(`Memory at Startup: ${metrics.memoryUsage.average}MB avg (${metrics.memoryUsage.min}-${metrics.memoryUsage.max}MB)`);
        }

        if (metrics.healthCheck) {
            console.log(`Health Check: ${metrics.healthCheck.average}ms avg (${metrics.healthCheck.min}-${metrics.healthCheck.max}ms)`);
        }

        // Module loading analysis
        if (this.results.moduleLoadingAnalysis.length > 0) {
            console.log('\n📦 MODULE LOADING PERFORMANCE:');
            const topModules = this.results.moduleLoadingAnalysis
                .filter(m => m.loadTime > 0)
                .slice(0, 5);
            
            topModules.forEach(module => {
                console.log(`${module.module}: ${module.loadTime}ms`);
            });

            const failedModules = this.results.moduleLoadingAnalysis.filter(m => m.error);
            if (failedModules.length > 0) {
                console.log('\n❌ Failed to load:');
                failedModules.forEach(module => {
                    console.log(`${module.module}: ${module.error}`);
                });
            }
        }

        // Individual test results
        console.log('\n🔍 INDIVIDUAL STARTUP TESTS:');
        this.results.startupTests.forEach(test => {
            const status = test.success ? '✅' : '❌';
            console.log(`${status} Test ${test.iteration}: ${test.startupTime}ms startup`);
            if (test.error) {
                console.log(`   Error: ${test.error}`);
            }
            if (test.healthCheckSuccess !== undefined) {
                const healthStatus = test.healthCheckSuccess ? '✅' : '❌';
                console.log(`   Health Check: ${healthStatus} ${test.healthCheckTime || 'N/A'}ms`);
            }
        });

        // Recommendations
        console.log('\n💡 STARTUP PERFORMANCE RECOMMENDATIONS:');
        this.results.recommendations.forEach(rec => {
            const severityIcon = rec.severity === 'High' ? '🚨' : rec.severity === 'Medium' ? '⚠️' : '💡';
            console.log(`${severityIcon} [${rec.category}] ${rec.issue}`);
            console.log(`   → ${rec.recommendation}`);
        });

        console.log('\n' + '='.repeat(80));
    }

    async saveResults() {
        const filename = `application-startup-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filepath = path.join(__dirname, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
        console.log(`💾 Results saved to: ${filename}`);
        
        return filename;
    }

    async run() {
        try {
            console.log('🚀 Starting Application Startup Performance Analysis...\n');

            // Check if server script exists
            if (!fs.existsSync(this.serverScript)) {
                throw new Error(`Server script not found: ${this.serverScript}`);
            }

            await this.measureModuleLoadTime();
            await this.measureStartupTime();
            
            this.generateRecommendations();
            this.printResults();
            
            const filename = await this.saveResults();
            
            console.log('\n✅ Application Startup Performance Analysis Complete!');
            return {
                success: true,
                results: this.results,
                filename
            };

        } catch (error) {
            console.error('❌ Error during startup performance analysis:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Run the analysis if this script is executed directly
if (require.main === module) {
    const analyzer = new ApplicationStartupAnalyzer();
    analyzer.run().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}

module.exports = ApplicationStartupAnalyzer;