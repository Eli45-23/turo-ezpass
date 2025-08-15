#!/usr/bin/env node

/**
 * Comprehensive Performance Audit Report Generator
 * Combines all performance test results into a unified report
 */

const fs = require('fs');
const path = require('path');

class ComprehensivePerformanceReport {
    constructor() {
        this.reportData = {
            timestamp: new Date().toISOString(),
            auditSummary: {},
            executiveSummary: {},
            detailedFindings: {},
            recommendations: {
                immediate: [],
                shortTerm: [],
                longTerm: []
            },
            scalabilityAssessment: {},
            performanceMetrics: {},
            testResults: {}
        };
    }

    async loadTestResults() {
        console.log('📊 Loading performance test results...');
        
        const testFiles = [
            { pattern: 'system-resource-analysis-*.json', key: 'systemResource' },
            { pattern: 'process-performance-analysis-*.json', key: 'processPerformance' },
            { pattern: 'focused-load-test-*.json', key: 'loadTesting' },
            { pattern: 'database-performance-analysis-*.json', key: 'databasePerformance' }
        ];

        for (const testFile of testFiles) {
            try {
                const files = fs.readdirSync(__dirname).filter(f => 
                    f.match(testFile.pattern.replace('*', '.*'))
                );
                
                if (files.length > 0) {
                    // Get the most recent file
                    const latestFile = files.sort().pop();
                    const filePath = path.join(__dirname, latestFile);
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    
                    this.reportData.testResults[testFile.key] = {
                        filename: latestFile,
                        data: data
                    };
                    
                    console.log(`✅ Loaded ${testFile.key}: ${latestFile}`);
                } else {
                    console.log(`⚠️ No results found for ${testFile.key}`);
                    this.reportData.testResults[testFile.key] = null;
                }
            } catch (error) {
                console.log(`❌ Error loading ${testFile.key}: ${error.message}`);
                this.reportData.testResults[testFile.key] = null;
            }
        }
    }

    analyzeSystemPerformance() {
        console.log('🔍 Analyzing system performance...');
        
        const systemData = this.reportData.testResults.systemResource?.data;
        const processData = this.reportData.testResults.processPerformance?.data;
        
        if (systemData) {
            this.reportData.performanceMetrics.system = {
                platform: systemData.systemInfo?.platform,
                cpuCount: systemData.systemInfo?.cpuCount,
                totalMemoryGB: systemData.systemInfo?.totalMemoryGB,
                nodeVersion: processData?.serverInfo?.healthCheck?.version || 'N/A',
                memoryUsage: {
                    heapAvg: systemData.analysis?.memory?.heapUsed?.avg || 0,
                    rssAvg: systemData.analysis?.memory?.rss?.avg || 0,
                    variance: systemData.analysis?.memory?.heapUsed?.variance || 0
                },
                fileSystem: {
                    readPerformance: systemData.performanceMetrics?.fileSystem?.read?.avgMs || 0,
                    writePerformance: systemData.performanceMetrics?.fileSystem?.write?.avgMs || 0
                },
                grade: this.calculateSystemGrade(systemData)
            };
        }

        if (processData) {
            this.reportData.performanceMetrics.process = {
                serverStatus: processData.serverInfo?.status || 'unknown',
                healthCheckResponse: processData.serverInfo?.responseTime || 0,
                endpointHealthScore: this.calculateEndpointHealth(processData.healthMetrics),
                eventLoopLag: processData.analysis?.eventLoop?.avg || 0,
                memoryTrend: processData.analysis?.memory?.heapUsed?.trend || 0,
                grade: this.calculateProcessGrade(processData)
            };
        }
    }

    analyzeLoadTestingResults() {
        console.log('🚀 Analyzing load testing results...');
        
        const loadData = this.reportData.testResults.loadTesting?.data;
        
        if (!loadData) {
            this.reportData.performanceMetrics.loadTesting = {
                grade: 'N/A',
                issue: 'Load testing data not available'
            };
            return;
        }

        const summary = loadData.summary;
        if (!summary || !summary.endpoints) {
            this.reportData.performanceMetrics.loadTesting = {
                grade: 'N/A',
                issue: 'Load testing summary not available'
            };
            return;
        }

        // Calculate overall performance metrics
        const endpointPerformance = Object.entries(summary.endpoints).map(([endpoint, performances]) => {
            const avgResponseTime = performances.reduce((sum, p) => sum + p.avgResponseTime, 0) / performances.length;
            const avgSuccessRate = performances.reduce((sum, p) => sum + p.successRate, 0) / performances.length;
            
            return {
                endpoint,
                avgResponseTime: Math.round(avgResponseTime),
                avgSuccessRate: Math.round(avgSuccessRate),
                scalability: this.calculateScalability(performances)
            };
        });

        const overallResponseTime = endpointPerformance.reduce((sum, ep) => sum + ep.avgResponseTime, 0) / endpointPerformance.length;
        const overallSuccessRate = endpointPerformance.reduce((sum, ep) => sum + ep.avgSuccessRate, 0) / endpointPerformance.length;

        this.reportData.performanceMetrics.loadTesting = {
            totalTests: summary.totalTests || 0,
            overallResponseTime: Math.round(overallResponseTime),
            overallSuccessRate: Math.round(overallSuccessRate),
            endpointPerformance,
            scalabilityScore: this.calculateOverallScalability(endpointPerformance),
            grade: this.calculateLoadTestGrade(overallResponseTime, overallSuccessRate)
        };
    }

    analyzeDatabasePerformance() {
        console.log('🗄️ Analyzing database performance...');
        
        const dbData = this.reportData.testResults.databasePerformance?.data;
        
        if (!dbData) {
            this.reportData.performanceMetrics.database = {
                grade: 'N/A',
                issue: 'Database performance data not available'
            };
            return;
        }

        const dbInfo = dbData.databaseInfo || {};
        const queryPerf = dbData.queryPerformance || [];
        const concurrency = dbData.concurrencyTests || [];

        // Calculate query performance metrics
        const avgQueryTime = queryPerf.length > 0 ? 
            queryPerf.reduce((sum, q) => sum + (q.averageTime || 0), 0) / queryPerf.length : 0;
        
        const slowQueries = queryPerf.filter(q => q.averageTime > 100);
        
        // Calculate concurrency performance
        const avgConcurrencySuccess = concurrency.length > 0 ?
            concurrency.reduce((sum, c) => sum + (c.successRate || 0), 0) / concurrency.length : 100;

        const maxOpsPerSecond = concurrency.length > 0 ?
            Math.max(...concurrency.map(c => c.operationsPerSecond || 0)) : 0;

        this.reportData.performanceMetrics.database = {
            size: dbInfo.sizeMB || 0,
            tableCount: dbInfo.tableCount || 0,
            indexCount: dbData.indexAnalysis?.length || 0,
            avgQueryTime: Math.round(avgQueryTime * 100) / 100,
            slowQueriesCount: slowQueries.length,
            concurrencySuccessRate: Math.round(avgConcurrencySuccess),
            maxOperationsPerSecond: Math.round(maxOpsPerSecond),
            grade: this.calculateDatabaseGrade(avgQueryTime, avgConcurrencySuccess, slowQueries.length)
        };
    }

    generateExecutiveSummary() {
        console.log('📋 Generating executive summary...');
        
        const metrics = this.reportData.performanceMetrics;
        
        // Calculate overall grades
        const grades = [];
        if (metrics.system?.grade !== 'N/A') grades.push(this.gradeToNumber(metrics.system.grade));
        if (metrics.process?.grade !== 'N/A') grades.push(this.gradeToNumber(metrics.process.grade));
        if (metrics.loadTesting?.grade !== 'N/A') grades.push(this.gradeToNumber(metrics.loadTesting.grade));
        if (metrics.database?.grade !== 'N/A') grades.push(this.gradeToNumber(metrics.database.grade));
        
        const overallGrade = grades.length > 0 ? 
            this.numberToGrade(grades.reduce((a, b) => a + b, 0) / grades.length) : 'N/A';

        // Identify strengths and weaknesses
        const strengths = [];
        const weaknesses = [];
        
        if (metrics.system?.grade === 'A' || metrics.system?.grade === 'B') {
            strengths.push('Excellent system resource utilization');
        }
        if (metrics.database?.concurrencySuccessRate >= 95) {
            strengths.push('Strong database concurrency performance');
        }
        if (metrics.loadTesting?.overallSuccessRate >= 95) {
            strengths.push('High API reliability under load');
        }
        if (metrics.process?.healthCheckResponse < 50) {
            strengths.push('Fast server response times');
        }

        if (metrics.loadTesting?.overallSuccessRate < 90) {
            weaknesses.push('API reliability issues under load');
        }
        if (metrics.database?.slowQueriesCount > 0) {
            weaknesses.push('Database query performance concerns');
        }
        if (metrics.process?.eventLoopLag > 10) {
            weaknesses.push('Event loop performance issues');
        }

        this.reportData.executiveSummary = {
            overallGrade,
            performanceScore: Math.round(this.gradeToNumber(overallGrade) * 10),
            testingCompleted: Object.values(this.reportData.testResults).filter(r => r !== null).length,
            totalTests: 4,
            strengths,
            weaknesses,
            recommendationCount: this.countRecommendations()
        };
    }

    generateScalabilityAssessment() {
        console.log('📈 Generating scalability assessment...');
        
        const loadData = this.reportData.testResults.loadTesting?.data;
        const dbData = this.reportData.testResults.databasePerformance?.data;
        const systemData = this.reportData.testResults.systemResource?.data;
        
        let scalabilityScore = 100;
        const limitations = [];
        const recommendations = [];

        // Load testing scalability
        if (loadData && loadData.recommendations) {
            const scalabilityIssues = loadData.recommendations.filter(r => 
                r.category === 'Scalability' && r.severity === 'High'
            );
            if (scalabilityIssues.length > 0) {
                scalabilityScore -= 30;
                limitations.push('API scalability limitations identified');
                recommendations.push('Implement connection pooling and load balancing');
            }
        }

        // Database scalability
        if (dbData && dbData.concurrencyTests) {
            const failedConcurrency = dbData.concurrencyTests.filter(t => t.successRate < 95);
            if (failedConcurrency.length > 0) {
                scalabilityScore -= 25;
                limitations.push('Database concurrency limitations');
                recommendations.push('Optimize database connection handling');
            }
        }

        // System resource limitations
        if (systemData && systemData.analysis) {
            const memoryVariance = systemData.analysis.memory?.heapUsed?.variance || 0;
            if (memoryVariance > 50) {
                scalabilityScore -= 15;
                limitations.push('Memory usage consistency issues');
                recommendations.push('Implement memory optimization strategies');
            }
        }

        this.reportData.scalabilityAssessment = {
            score: Math.max(scalabilityScore, 0),
            grade: this.numberToGrade(scalabilityScore / 10),
            limitations,
            recommendations,
            estimatedUserCapacity: this.estimateUserCapacity(),
            bottlenecks: this.identifyBottlenecks()
        };
    }

    consolidateRecommendations() {
        console.log('💡 Consolidating recommendations...');
        
        const allRecommendations = [];
        
        // Collect recommendations from all test results
        Object.values(this.reportData.testResults).forEach(testResult => {
            if (testResult && testResult.data && testResult.data.recommendations) {
                testResult.data.recommendations.forEach(rec => {
                    allRecommendations.push({
                        ...rec,
                        source: testResult.filename
                    });
                });
            }
        });

        // Categorize by priority
        const immediate = allRecommendations.filter(r => r.severity === 'High');
        const shortTerm = allRecommendations.filter(r => r.severity === 'Medium');
        const longTerm = allRecommendations.filter(r => r.severity === 'Low' || r.severity === 'Info');

        this.reportData.recommendations = {
            immediate: immediate.slice(0, 5), // Top 5 immediate issues
            shortTerm: shortTerm.slice(0, 8),  // Top 8 short-term improvements
            longTerm: longTerm.slice(0, 5),    // Top 5 long-term optimizations
            totalRecommendations: allRecommendations.length
        };
    }

    // Helper methods for calculations
    calculateSystemGrade(systemData) {
        let score = 100;
        
        if (!systemData.analysis) return 'N/A';
        
        const memUsage = systemData.analysis.memory?.heapUsed?.avg || 0;
        const loadAvg = systemData.analysis.systemLoad?.avg || 0;
        const fsPerf = systemData.performanceMetrics?.fileSystem?.write?.avgMs || 0;
        
        if (memUsage > 100) score -= 20;
        if (loadAvg > 2) score -= 15;
        if (fsPerf > 10) score -= 10;
        
        return this.numberToGrade(score / 10);
    }

    calculateProcessGrade(processData) {
        let score = 100;
        
        const healthMetrics = processData.healthMetrics?.summary;
        if (healthMetrics) {
            if (healthMetrics.failedEndpoints > 0) score -= 30;
            if (healthMetrics.averageResponseTime > 100) score -= 20;
        }
        
        const eventLoopLag = processData.analysis?.eventLoop?.avg || 0;
        if (eventLoopLag > 10) score -= 25;
        
        const memoryTrend = processData.analysis?.memory?.heapUsed?.trend || 0;
        if (memoryTrend > 5) score -= 15;
        
        return this.numberToGrade(score / 10);
    }

    calculateLoadTestGrade(responseTime, successRate) {
        let score = 100;
        
        if (successRate < 95) score -= 40;
        else if (successRate < 98) score -= 20;
        
        if (responseTime > 1000) score -= 30;
        else if (responseTime > 500) score -= 15;
        else if (responseTime > 200) score -= 5;
        
        return this.numberToGrade(score / 10);
    }

    calculateDatabaseGrade(avgQueryTime, concurrencySuccess, slowQueries) {
        let score = 100;
        
        if (avgQueryTime > 50) score -= 20;
        if (concurrencySuccess < 95) score -= 25;
        if (slowQueries > 0) score -= 15;
        
        return this.numberToGrade(score / 10);
    }

    calculateEndpointHealth(healthMetrics) {
        if (!healthMetrics || !healthMetrics.summary) return 0;
        
        const summary = healthMetrics.summary;
        return Math.round((summary.successfulEndpoints / summary.totalEndpoints) * 100);
    }

    calculateScalability(performances) {
        if (performances.length < 2) return 'N/A';
        
        const lightLoad = performances[0];
        const heavyLoad = performances[performances.length - 1];
        
        const degradation = ((heavyLoad.avgResponseTime - lightLoad.avgResponseTime) / lightLoad.avgResponseTime) * 100;
        
        if (degradation < 50) return 'Excellent';
        if (degradation < 150) return 'Good';
        if (degradation < 300) return 'Fair';
        return 'Poor';
    }

    calculateOverallScalability(endpointPerformance) {
        const scalabilityRatings = endpointPerformance.map(ep => {
            switch (ep.scalability) {
                case 'Excellent': return 4;
                case 'Good': return 3;
                case 'Fair': return 2;
                case 'Poor': return 1;
                default: return 2;
            }
        });
        
        const avgRating = scalabilityRatings.reduce((a, b) => a + b, 0) / scalabilityRatings.length;
        
        if (avgRating >= 3.5) return 'Excellent';
        if (avgRating >= 2.5) return 'Good';
        if (avgRating >= 1.5) return 'Fair';
        return 'Poor';
    }

    estimateUserCapacity() {
        const loadData = this.reportData.testResults.loadTesting?.data;
        if (!loadData || !loadData.summary) return 'Unknown';
        
        const performance = loadData.summary.performance;
        if (!performance) return 'Unknown';
        
        // Find the highest successful concurrent users
        const successfulTests = Object.entries(performance).filter(([name, metrics]) => 
            metrics.endpoints && metrics.endpoints.every(ep => ep.successRate >= 95)
        );
        
        if (successfulTests.length === 0) return '< 5 users';
        
        const maxUsers = Math.max(...successfulTests.map(([name, metrics]) => metrics.concurrent));
        
        // Estimate based on successful test patterns
        if (maxUsers >= 25) return '50-100 users';
        if (maxUsers >= 15) return '25-50 users';
        if (maxUsers >= 5) return '10-25 users';
        return '< 10 users';
    }

    identifyBottlenecks() {
        const bottlenecks = [];
        
        const metrics = this.reportData.performanceMetrics;
        
        if (metrics.database?.avgQueryTime > 50) {
            bottlenecks.push('Database query performance');
        }
        
        if (metrics.loadTesting?.overallResponseTime > 500) {
            bottlenecks.push('API response times');
        }
        
        if (metrics.process?.eventLoopLag > 10) {
            bottlenecks.push('Event loop blocking operations');
        }
        
        if (metrics.system?.memoryUsage?.variance > 50) {
            bottlenecks.push('Memory management inefficiency');
        }
        
        return bottlenecks.length > 0 ? bottlenecks : ['No major bottlenecks identified'];
    }

    countRecommendations() {
        return Object.values(this.reportData.testResults)
            .filter(r => r !== null)
            .reduce((count, testResult) => {
                return count + (testResult.data?.recommendations?.length || 0);
            }, 0);
    }

    gradeToNumber(grade) {
        const gradeMap = { 'A': 9, 'B': 7, 'C': 5, 'D': 3, 'F': 1 };
        return gradeMap[grade] || 5;
    }

    numberToGrade(number) {
        if (number >= 9) return 'A';
        if (number >= 7) return 'B';
        if (number >= 5) return 'C';
        if (number >= 3) return 'D';
        return 'F';
    }

    printReport() {
        console.log('\n' + '='.repeat(100));
        console.log('🏆 COMPREHENSIVE PERFORMANCE AUDIT REPORT');
        console.log('='.repeat(100));

        const exec = this.reportData.executiveSummary;
        const metrics = this.reportData.performanceMetrics;
        const scalability = this.reportData.scalabilityAssessment;

        // Executive Summary
        console.log('\n📋 EXECUTIVE SUMMARY');
        console.log('─'.repeat(50));
        console.log(`Overall Performance Grade: ${exec.overallGrade} (${exec.performanceScore}/100)`);
        console.log(`Tests Completed: ${exec.testingCompleted}/${exec.totalTests}`);
        console.log(`Total Recommendations: ${exec.recommendationCount}`);
        
        console.log('\n✅ STRENGTHS:');
        exec.strengths.forEach(strength => console.log(`  • ${strength}`));
        
        if (exec.weaknesses.length > 0) {
            console.log('\n⚠️ AREAS FOR IMPROVEMENT:');
            exec.weaknesses.forEach(weakness => console.log(`  • ${weakness}`));
        }

        // Performance Metrics Summary
        console.log('\n📊 PERFORMANCE METRICS SUMMARY');
        console.log('─'.repeat(50));
        
        if (metrics.system) {
            console.log(`System Resources: ${metrics.system.grade} - ${metrics.system.cpuCount} CPUs, ${metrics.system.totalMemoryGB}GB RAM`);
        }
        
        if (metrics.process) {
            console.log(`Process Health: ${metrics.process.grade} - ${metrics.process.endpointHealthScore}% endpoint success rate`);
        }
        
        if (metrics.loadTesting) {
            console.log(`Load Testing: ${metrics.loadTesting.grade} - ${metrics.loadTesting.overallSuccessRate}% success, ${metrics.loadTesting.overallResponseTime}ms avg`);
        }
        
        if (metrics.database) {
            console.log(`Database: ${metrics.database.grade} - ${metrics.database.avgQueryTime}ms avg query, ${metrics.database.concurrencySuccessRate}% concurrency success`);
        }

        // Scalability Assessment
        console.log('\n📈 SCALABILITY ASSESSMENT');
        console.log('─'.repeat(50));
        console.log(`Scalability Score: ${scalability.score}/100 (${scalability.grade})`);
        console.log(`Estimated User Capacity: ${scalability.estimatedUserCapacity}`);
        
        console.log('\nPrimary Bottlenecks:');
        scalability.bottlenecks.forEach(bottleneck => console.log(`  • ${bottleneck}`));

        // Critical Recommendations
        console.log('\n🚨 IMMEDIATE ACTION REQUIRED');
        console.log('─'.repeat(50));
        if (this.reportData.recommendations.immediate.length > 0) {
            this.reportData.recommendations.immediate.forEach(rec => {
                console.log(`• [${rec.category}] ${rec.issue}`);
                console.log(`  → ${rec.recommendation}`);
            });
        } else {
            console.log('  No immediate critical issues identified');
        }

        // Performance Recommendations
        console.log('\n⚠️ SHORT-TERM IMPROVEMENTS');
        console.log('─'.repeat(50));
        if (this.reportData.recommendations.shortTerm.length > 0) {
            this.reportData.recommendations.shortTerm.slice(0, 5).forEach(rec => {
                console.log(`• [${rec.category}] ${rec.issue}`);
            });
        } else {
            console.log('  No short-term improvements identified');
        }

        // Test Results Summary
        console.log('\n📋 TEST RESULTS SUMMARY');
        console.log('─'.repeat(50));
        Object.entries(this.reportData.testResults).forEach(([testKey, result]) => {
            const status = result ? '✅' : '❌';
            const filename = result ? result.filename : 'Not available';
            console.log(`${status} ${testKey}: ${filename}`);
        });

        console.log('\n' + '='.repeat(100));
        console.log(`Report generated on: ${this.reportData.timestamp}`);
        console.log('='.repeat(100));
    }

    async saveReport() {
        const filename = `COMPREHENSIVE-PERFORMANCE-AUDIT-REPORT-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const markdownFilename = filename.replace('.json', '.md');
        
        // Save JSON report
        fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(this.reportData, null, 2));
        console.log(`💾 Detailed report saved to: ${filename}`);

        // Create markdown summary
        const markdownReport = this.generateMarkdownReport();
        fs.writeFileSync(path.join(__dirname, markdownFilename), markdownReport);
        console.log(`📄 Summary report saved to: ${markdownFilename}`);

        return { jsonFile: filename, markdownFile: markdownFilename };
    }

    generateMarkdownReport() {
        const exec = this.reportData.executiveSummary;
        const scalability = this.reportData.scalabilityAssessment;
        
        return `# Turo Toll Tracker - Comprehensive Performance Audit Report

## Executive Summary

**Overall Performance Grade:** ${exec.overallGrade} (${exec.performanceScore}/100)
**Date:** ${new Date(this.reportData.timestamp).toLocaleDateString()}
**Tests Completed:** ${exec.testingCompleted}/${exec.totalTests}

### Key Findings

#### ✅ Strengths
${exec.strengths.map(s => `- ${s}`).join('\n')}

#### ⚠️ Areas for Improvement  
${exec.weaknesses.map(w => `- ${w}`).join('\n')}

## Performance Metrics

| Category | Grade | Key Metrics |
|----------|-------|-------------|
| System Resources | ${this.reportData.performanceMetrics.system?.grade || 'N/A'} | ${this.reportData.performanceMetrics.system?.cpuCount || 0} CPUs, ${this.reportData.performanceMetrics.system?.totalMemoryGB || 0}GB RAM |
| Process Health | ${this.reportData.performanceMetrics.process?.grade || 'N/A'} | ${this.reportData.performanceMetrics.process?.endpointHealthScore || 0}% endpoint success |
| Load Testing | ${this.reportData.performanceMetrics.loadTesting?.grade || 'N/A'} | ${this.reportData.performanceMetrics.loadTesting?.overallSuccessRate || 0}% success rate |
| Database | ${this.reportData.performanceMetrics.database?.grade || 'N/A'} | ${this.reportData.performanceMetrics.database?.avgQueryTime || 0}ms avg query time |

## Scalability Assessment

**Score:** ${scalability.score}/100 (${scalability.grade})
**Estimated Capacity:** ${scalability.estimatedUserCapacity}

### Primary Bottlenecks
${scalability.bottlenecks.map(b => `- ${b}`).join('\n')}

## Priority Recommendations

### 🚨 Immediate Action Required
${this.reportData.recommendations.immediate.map(r => `- **${r.category}:** ${r.issue}`).join('\n')}

### ⚠️ Short-term Improvements
${this.reportData.recommendations.shortTerm.slice(0, 5).map(r => `- **${r.category}:** ${r.issue}`).join('\n')}

---
*Report generated by Turo Toll Tracker Performance Audit System*`;
    }

    async run() {
        try {
            console.log('🏆 Starting Comprehensive Performance Audit Report Generation...\n');

            await this.loadTestResults();
            this.analyzeSystemPerformance();
            this.analyzeDatabasePerformance();
            this.analyzeLoadTestingResults();
            this.generateExecutiveSummary();
            this.generateScalabilityAssessment();
            this.consolidateRecommendations();

            this.printReport();
            const files = await this.saveReport();

            console.log('\n✅ Comprehensive Performance Audit Report Complete!');
            return {
                success: true,
                report: this.reportData,
                files
            };

        } catch (error) {
            console.error('❌ Error generating comprehensive report:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

if (require.main === module) {
    const reporter = new ComprehensivePerformanceReport();
    reporter.run().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}

module.exports = ComprehensivePerformanceReport;