#!/usr/bin/env node

/**
 * System Resource Monitor - Performance Audit Phase 1.1
 * Monitors system resources and Node.js process performance
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { performance, PerformanceObserver } = require('perf_hooks');

class SystemResourceMonitor {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            systemInfo: {},
            processMetrics: {},
            resourceUsage: [],
            performanceMetrics: {},
            recommendations: []
        };
        this.startTime = Date.now();
        this.measurementInterval = 1000; // 1 second
        this.measurementDuration = 30000; // 30 seconds
    }

    async collectSystemInfo() {
        console.log('📊 Collecting system information...');
        
        this.results.systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            release: os.release(),
            hostname: os.hostname(),
            uptime: os.uptime(),
            totalMemory: os.totalmem(),
            totalMemoryGB: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100,
            cpuCount: os.cpus().length,
            cpuModel: os.cpus()[0].model,
            loadAverage: os.loadavg(),
            networkInterfaces: Object.keys(os.networkInterfaces())
        };

        console.log(`💻 System: ${this.results.systemInfo.platform} ${this.results.systemInfo.arch}`);
        console.log(`🧠 Memory: ${this.results.systemInfo.totalMemoryGB} GB`);
        console.log(`⚡ CPUs: ${this.results.systemInfo.cpuCount}x ${this.results.systemInfo.cpuModel}`);
    }

    async collectProcessMetrics() {
        console.log('🔍 Collecting Node.js process metrics...');
        
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        this.results.processMetrics = {
            pid: process.pid,
            title: process.title,
            version: process.version,
            uptime: process.uptime(),
            memoryUsage: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers,
                rssMB: Math.round(memUsage.rss / (1024 * 1024) * 100) / 100,
                heapTotalMB: Math.round(memUsage.heapTotal / (1024 * 1024) * 100) / 100,
                heapUsedMB: Math.round(memUsage.heapUsed / (1024 * 1024) * 100) / 100
            },
            cpuUsage: {
                user: cpuUsage.user,
                system: cpuUsage.system,
                userMs: Math.round(cpuUsage.user / 1000),
                systemMs: Math.round(cpuUsage.system / 1000)
            }
        };

        console.log(`📈 Memory Usage: RSS ${this.results.processMetrics.memoryUsage.rssMB}MB, Heap ${this.results.processMetrics.memoryUsage.heapUsedMB}MB`);
        console.log(`⚙️ CPU Usage: User ${this.results.processMetrics.cpuUsage.userMs}ms, System ${this.results.processMetrics.cpuUsage.systemMs}ms`);
    }

    async monitorResourceUsage() {
        console.log(`📊 Starting continuous resource monitoring for ${this.measurementDuration / 1000} seconds...`);
        
        return new Promise((resolve) => {
            let measurements = 0;
            const maxMeasurements = this.measurementDuration / this.measurementInterval;
            
            const interval = setInterval(() => {
                const measurement = {
                    timestamp: Date.now() - this.startTime,
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    systemLoad: os.loadavg()[0],
                    freeMemory: os.freemem(),
                    freeMempercent: Math.round((os.freemem() / os.totalmem()) * 100)
                };

                // Convert to MB for readability
                measurement.memoryMB = {
                    rss: Math.round(measurement.memory.rss / (1024 * 1024) * 100) / 100,
                    heapTotal: Math.round(measurement.memory.heapTotal / (1024 * 1024) * 100) / 100,
                    heapUsed: Math.round(measurement.memory.heapUsed / (1024 * 1024) * 100) / 100
                };

                this.results.resourceUsage.push(measurement);
                
                measurements++;
                if (measurements % 5 === 0) {
                    console.log(`⏱️ ${measurements}/${maxMeasurements} - Memory: ${measurement.memoryMB.heapUsed}MB, Load: ${measurement.systemLoad.toFixed(2)}`);
                }

                if (measurements >= maxMeasurements) {
                    clearInterval(interval);
                    resolve();
                }
            }, this.measurementInterval);
        });
    }

    async testFileSystemPerformance() {
        console.log('💾 Testing file system I/O performance...');
        
        const testFile = path.join(__dirname, 'temp-perf-test.txt');
        const testData = 'A'.repeat(1024 * 1024); // 1MB of data
        const iterations = 10;

        const writeStats = [];
        const readStats = [];

        // Write performance test
        for (let i = 0; i < iterations; i++) {
            const writeStart = performance.now();
            fs.writeFileSync(testFile, testData);
            const writeEnd = performance.now();
            writeStats.push(writeEnd - writeStart);
        }

        // Read performance test
        for (let i = 0; i < iterations; i++) {
            const readStart = performance.now();
            fs.readFileSync(testFile);
            const readEnd = performance.now();
            readStats.push(readEnd - readStart);
        }

        // Clean up
        fs.unlinkSync(testFile);

        this.results.performanceMetrics.fileSystem = {
            write: {
                iterations,
                timings: writeStats,
                avgMs: Math.round(writeStats.reduce((a, b) => a + b, 0) / writeStats.length * 100) / 100,
                minMs: Math.round(Math.min(...writeStats) * 100) / 100,
                maxMs: Math.round(Math.max(...writeStats) * 100) / 100
            },
            read: {
                iterations,
                timings: readStats,
                avgMs: Math.round(readStats.reduce((a, b) => a + b, 0) / readStats.length * 100) / 100,
                minMs: Math.round(Math.min(...readStats) * 100) / 100,
                maxMs: Math.round(Math.max(...readStats) * 100) / 100
            }
        };

        console.log(`📖 File Read: ${this.results.performanceMetrics.fileSystem.read.avgMs}ms avg`);
        console.log(`📝 File Write: ${this.results.performanceMetrics.fileSystem.write.avgMs}ms avg`);
    }

    analyzeResults() {
        console.log('🔍 Analyzing resource usage patterns...');
        
        const resourceUsage = this.results.resourceUsage;
        if (resourceUsage.length === 0) return;

        // Memory analysis
        const heapUsages = resourceUsage.map(r => r.memoryMB.heapUsed);
        const rssUsages = resourceUsage.map(r => r.memoryMB.rss);
        const loads = resourceUsage.map(r => r.systemLoad);

        this.results.analysis = {
            memory: {
                heapUsed: {
                    min: Math.min(...heapUsages),
                    max: Math.max(...heapUsages),
                    avg: Math.round(heapUsages.reduce((a, b) => a + b, 0) / heapUsages.length * 100) / 100,
                    variance: Math.round((Math.max(...heapUsages) - Math.min(...heapUsages)) * 100) / 100
                },
                rss: {
                    min: Math.min(...rssUsages),
                    max: Math.max(...rssUsages),
                    avg: Math.round(rssUsages.reduce((a, b) => a + b, 0) / rssUsages.length * 100) / 100,
                    variance: Math.round((Math.max(...rssUsages) - Math.min(...rssUsages)) * 100) / 100
                }
            },
            systemLoad: {
                min: Math.min(...loads),
                max: Math.max(...loads),
                avg: Math.round(loads.reduce((a, b) => a + b, 0) / loads.length * 100) / 100,
                variance: Math.round((Math.max(...loads) - Math.min(...loads)) * 100) / 100
            }
        };

        // Generate recommendations
        this.generateRecommendations();
    }

    generateRecommendations() {
        const analysis = this.results.analysis;
        const systemInfo = this.results.systemInfo;
        
        // Memory recommendations
        if (analysis.memory.heapUsed.avg > 100) {
            this.results.recommendations.push({
                category: 'Memory',
                severity: 'Medium',
                issue: `Average heap usage is ${analysis.memory.heapUsed.avg}MB`,
                recommendation: 'Consider implementing memory optimization strategies and monitoring for potential leaks'
            });
        }

        if (analysis.memory.heapUsed.variance > 50) {
            this.results.recommendations.push({
                category: 'Memory',
                severity: 'Low',
                issue: `High memory variance (${analysis.memory.heapUsed.variance}MB)`,
                recommendation: 'Memory usage is fluctuating significantly - investigate periodic memory spikes'
            });
        }

        // System load recommendations
        if (analysis.systemLoad.avg > systemInfo.cpuCount) {
            this.results.recommendations.push({
                category: 'CPU',
                severity: 'High',
                issue: `System load (${analysis.systemLoad.avg}) exceeds CPU count (${systemInfo.cpuCount})`,
                recommendation: 'System is under high load - consider scaling or optimization'
            });
        }

        // File system recommendations
        const fsPerf = this.results.performanceMetrics.fileSystem;
        if (fsPerf.write.avgMs > 100) {
            this.results.recommendations.push({
                category: 'File System',
                severity: 'Medium',
                issue: `Slow write performance (${fsPerf.write.avgMs}ms average)`,
                recommendation: 'Consider using SSD storage or implementing asynchronous file operations'
            });
        }

        if (this.results.recommendations.length === 0) {
            this.results.recommendations.push({
                category: 'Overall',
                severity: 'Info',
                issue: 'No critical performance issues detected',
                recommendation: 'System performance appears optimal for current load'
            });
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 SYSTEM RESOURCE ANALYSIS RESULTS');
        console.log('='.repeat(80));

        // System Overview
        console.log('\n🖥️ SYSTEM OVERVIEW:');
        console.log(`Platform: ${this.results.systemInfo.platform} ${this.results.systemInfo.arch}`);
        console.log(`CPUs: ${this.results.systemInfo.cpuCount}x ${this.results.systemInfo.cpuModel}`);
        console.log(`Total Memory: ${this.results.systemInfo.totalMemoryGB} GB`);
        console.log(`Load Average: ${this.results.systemInfo.loadAverage.map(l => l.toFixed(2)).join(', ')}`);

        // Process Metrics
        console.log('\n🔧 NODE.JS PROCESS:');
        console.log(`PID: ${this.results.processMetrics.pid}`);
        console.log(`Version: ${this.results.processMetrics.version}`);
        console.log(`Uptime: ${Math.round(this.results.processMetrics.uptime)} seconds`);
        console.log(`Memory Usage: RSS ${this.results.processMetrics.memoryUsage.rssMB}MB, Heap ${this.results.processMetrics.memoryUsage.heapUsedMB}MB`);

        // Resource Analysis
        if (this.results.analysis) {
            console.log('\n📈 RESOURCE USAGE ANALYSIS:');
            console.log(`Heap Memory - Min: ${this.results.analysis.memory.heapUsed.min}MB, Max: ${this.results.analysis.memory.heapUsed.max}MB, Avg: ${this.results.analysis.memory.heapUsed.avg}MB`);
            console.log(`RSS Memory - Min: ${this.results.analysis.memory.rss.min}MB, Max: ${this.results.analysis.memory.rss.max}MB, Avg: ${this.results.analysis.memory.rss.avg}MB`);
            console.log(`System Load - Min: ${this.results.analysis.systemLoad.min.toFixed(2)}, Max: ${this.results.analysis.systemLoad.max.toFixed(2)}, Avg: ${this.results.analysis.systemLoad.avg.toFixed(2)}`);
        }

        // File System Performance
        if (this.results.performanceMetrics.fileSystem) {
            console.log('\n💾 FILE SYSTEM PERFORMANCE:');
            console.log(`Read Performance - Avg: ${this.results.performanceMetrics.fileSystem.read.avgMs}ms, Min: ${this.results.performanceMetrics.fileSystem.read.minMs}ms, Max: ${this.results.performanceMetrics.fileSystem.read.maxMs}ms`);
            console.log(`Write Performance - Avg: ${this.results.performanceMetrics.fileSystem.write.avgMs}ms, Min: ${this.results.performanceMetrics.fileSystem.write.minMs}ms, Max: ${this.results.performanceMetrics.fileSystem.write.maxMs}ms`);
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
        const filename = `system-resource-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filepath = path.join(__dirname, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
        console.log(`💾 Results saved to: ${filename}`);
        
        return filename;
    }

    async run() {
        try {
            console.log('🚀 Starting System Resource Analysis...\n');

            await this.collectSystemInfo();
            await this.collectProcessMetrics();
            await this.testFileSystemPerformance();
            await this.monitorResourceUsage();
            
            this.analyzeResults();
            this.printResults();
            
            const filename = await this.saveResults();
            
            console.log('\n✅ System Resource Analysis Complete!');
            return {
                success: true,
                results: this.results,
                filename
            };

        } catch (error) {
            console.error('❌ Error during system resource analysis:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Run the analysis if this script is executed directly
if (require.main === module) {
    const monitor = new SystemResourceMonitor();
    monitor.run().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}

module.exports = SystemResourceMonitor;