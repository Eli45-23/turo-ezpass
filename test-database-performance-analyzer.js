#!/usr/bin/env node

/**
 * Database Performance Analyzer - Performance Audit Phase 3.1
 * Analyzes SQLite database performance, queries, and optimization opportunities
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

class DatabasePerformanceAnalyzer {
    constructor() {
        this.dbPath = path.join(__dirname, 'turo_tolls.db');
        this.db = null;
        this.results = {
            timestamp: new Date().toISOString(),
            databaseInfo: {},
            tableAnalysis: [],
            queryPerformance: [],
            indexAnalysis: [],
            optimizationOpportunities: [],
            concurrencyTests: [],
            recommendations: []
        };
    }

    async openDatabase() {
        console.log('📊 Connecting to SQLite database...');
        
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    console.error('❌ Database connection failed:', err.message);
                    reject(err);
                } else {
                    console.log('✅ Database connected successfully');
                    resolve();
                }
            });
        });
    }

    async getDatabaseInfo() {
        console.log('🔍 Collecting database information...');
        
        return new Promise((resolve, reject) => {
            // Get database file stats
            const stats = fs.statSync(this.dbPath);
            
            this.results.databaseInfo = {
                path: this.dbPath,
                size: stats.size,
                sizeMB: Math.round(stats.size / (1024 * 1024) * 100) / 100,
                lastModified: stats.mtime,
                created: stats.birthtime
            };

            // Get SQLite version and configuration
            this.db.get("SELECT sqlite_version() as version", (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                this.results.databaseInfo.sqliteVersion = row.version;
                
                // Get database schema info
                this.db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    this.results.databaseInfo.tableCount = tables.length;
                    this.results.databaseInfo.tables = tables.map(t => t.name);
                    
                    console.log(`📁 Database: ${this.results.databaseInfo.sizeMB}MB, SQLite ${this.results.databaseInfo.sqliteVersion}`);
                    console.log(`📋 Tables: ${this.results.databaseInfo.tableCount} found`);
                    
                    resolve();
                });
            });
        });
    }

    async analyzeTableStructure() {
        console.log('📊 Analyzing table structures...');
        
        const tables = this.results.databaseInfo.tables;
        
        for (const tableName of tables) {
            console.log(`   Analyzing table: ${tableName}`);
            
            const tableInfo = await new Promise((resolve, reject) => {
                // Get table info
                this.db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    // Get row count
                    this.db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, countRow) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        // Get table size estimate
                        this.db.get(`SELECT SUM(length(name) + length(sql)) as schema_size FROM sqlite_master WHERE tbl_name = ?`, [tableName], (err, sizeRow) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            resolve({
                                tableName,
                                columns: columns.map(col => ({
                                    name: col.name,
                                    type: col.type,
                                    notNull: col.notnull === 1,
                                    primaryKey: col.pk === 1
                                })),
                                rowCount: countRow.count,
                                columnCount: columns.length,
                                schemaSize: sizeRow.schema_size || 0
                            });
                        });
                    });
                });
            });
            
            this.results.tableAnalysis.push(tableInfo);
        }
        
        console.log(`✅ Analyzed ${tables.length} tables`);
    }

    async analyzeIndexes() {
        console.log('🔍 Analyzing database indexes...');
        
        return new Promise((resolve, reject) => {
            this.db.all("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'", (err, indexes) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                this.results.indexAnalysis = indexes.map(idx => ({
                    name: idx.name,
                    table: idx.tbl_name,
                    definition: idx.sql
                }));
                
                console.log(`📊 Found ${indexes.length} custom indexes`);
                
                // Check for missing indexes on large tables
                const largeTables = this.results.tableAnalysis.filter(t => t.rowCount > 1000);
                largeTables.forEach(table => {
                    const tableIndexes = this.results.indexAnalysis.filter(idx => idx.table === table.tableName);
                    if (tableIndexes.length === 0) {
                        this.results.optimizationOpportunities.push({
                            type: 'Missing Index',
                            severity: 'Medium',
                            table: table.tableName,
                            issue: `Large table (${table.rowCount} rows) has no indexes`,
                            recommendation: 'Consider adding indexes on frequently queried columns'
                        });
                    }
                });
                
                resolve();
            });
        });
    }

    async testQueryPerformance() {
        console.log('⚡ Testing query performance...');
        
        // Define test queries based on common operations
        const testQueries = [
            { name: 'Table Count', query: "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'", category: 'metadata' },
            { name: 'Schema Query', query: "SELECT sql FROM sqlite_master WHERE type='table' LIMIT 5", category: 'metadata' }
        ];

        // Add table-specific queries for existing tables
        const existingTables = this.results.databaseInfo.tables;
        
        if (existingTables.includes('tolls')) {
            testQueries.push(
                { name: 'Tolls Count', query: 'SELECT COUNT(*) as count FROM tolls', category: 'data' },
                { name: 'Recent Tolls', query: 'SELECT * FROM tolls ORDER BY id DESC LIMIT 10', category: 'data' }
            );
        }

        if (existingTables.includes('trips')) {
            testQueries.push(
                { name: 'Trips Count', query: 'SELECT COUNT(*) as count FROM trips', category: 'data' },
                { name: 'Recent Trips', query: 'SELECT * FROM trips ORDER BY id DESC LIMIT 10', category: 'data' }
            );
        }

        if (existingTables.includes('users')) {
            testQueries.push(
                { name: 'Users Count', query: 'SELECT COUNT(*) as count FROM users', category: 'data' }
            );
        }

        // Execute queries and measure performance
        for (const testQuery of testQueries) {
            console.log(`   Testing: ${testQuery.name}`);
            
            const timings = [];
            const iterations = 5; // Run each query multiple times
            
            for (let i = 0; i < iterations; i++) {
                const startTime = performance.now();
                
                try {
                    await new Promise((resolve, reject) => {
                        this.db.all(testQuery.query, (err, rows) => {
                            if (err) {
                                reject(err);
                            } else {
                                const endTime = performance.now();
                                timings.push(endTime - startTime);
                                resolve(rows);
                            }
                        });
                    });
                } catch (error) {
                    console.log(`     ⚠️ Query failed: ${error.message}`);
                    timings.push(-1); // Mark as failed
                }
            }
            
            const validTimings = timings.filter(t => t >= 0);
            const queryResult = {
                name: testQuery.name,
                query: testQuery.query,
                category: testQuery.category,
                iterations: iterations,
                successfulRuns: validTimings.length,
                failedRuns: timings.filter(t => t < 0).length,
                averageTime: validTimings.length > 0 ? Math.round(validTimings.reduce((a, b) => a + b, 0) / validTimings.length * 100) / 100 : 0,
                minTime: validTimings.length > 0 ? Math.round(Math.min(...validTimings) * 100) / 100 : 0,
                maxTime: validTimings.length > 0 ? Math.round(Math.max(...validTimings) * 100) / 100 : 0,
                timings: validTimings
            };
            
            this.results.queryPerformance.push(queryResult);
            
            if (queryResult.successfulRuns > 0) {
                console.log(`     ✅ Avg: ${queryResult.averageTime}ms (${queryResult.minTime}-${queryResult.maxTime}ms)`);
            } else {
                console.log(`     ❌ All queries failed`);
            }
        }
    }

    async testConcurrentOperations() {
        console.log('🔄 Testing concurrent database operations...');
        
        const concurrencyTests = [
            { name: 'Light Concurrency', concurrent: 5, operations: 25 },
            { name: 'Medium Concurrency', concurrent: 10, operations: 50 },
            { name: 'Heavy Concurrency', concurrent: 20, operations: 100 }
        ];

        for (const test of concurrencyTests) {
            console.log(`   Testing ${test.name}: ${test.concurrent} concurrent operations`);
            
            const startTime = performance.now();
            const results = [];
            let completed = 0;
            
            const testPromise = new Promise((resolve) => {
                const executeOperation = async () => {
                    const opStart = performance.now();
                    
                    try {
                        await new Promise((opResolve, opReject) => {
                            // Simple read operation
                            this.db.get("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'", (err, row) => {
                                if (err) {
                                    opReject(err);
                                } else {
                                    opResolve(row);
                                }
                            });
                        });
                        
                        results.push({
                            success: true,
                            duration: performance.now() - opStart
                        });
                    } catch (error) {
                        results.push({
                            success: false,
                            duration: performance.now() - opStart,
                            error: error.message
                        });
                    }
                    
                    completed++;
                    
                    if (completed < test.operations) {
                        // Start another operation if we haven't reached the limit
                        setImmediate(executeOperation);
                    }
                    
                    if (completed === test.operations) {
                        resolve();
                    }
                };

                // Start initial concurrent operations
                for (let i = 0; i < Math.min(test.concurrent, test.operations); i++) {
                    setImmediate(executeOperation);
                }
            });

            await testPromise;
            
            const totalTime = performance.now() - startTime;
            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);
            const durations = successful.map(r => r.duration);

            const concurrencyResult = {
                name: test.name,
                concurrent: test.concurrent,
                totalOperations: test.operations,
                successful: successful.length,
                failed: failed.length,
                successRate: Math.round((successful.length / test.operations) * 100),
                totalDuration: Math.round(totalTime),
                averageOperationTime: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length * 100) / 100 : 0,
                operationsPerSecond: Math.round((test.operations / (totalTime / 1000)) * 100) / 100
            };

            this.results.concurrencyTests.push(concurrencyResult);
            
            console.log(`     ✅ ${concurrencyResult.successRate}% success, ${concurrencyResult.operationsPerSecond} ops/sec`);
        }
    }

    generateRecommendations() {
        console.log('💡 Generating performance recommendations...');
        
        // Database size recommendations
        if (this.results.databaseInfo.sizeMB > 100) {
            this.results.recommendations.push({
                category: 'Database Size',
                severity: 'Medium',
                issue: `Large database file (${this.results.databaseInfo.sizeMB}MB)`,
                recommendation: 'Consider data archiving or partitioning strategies for better performance'
            });
        }

        // Query performance recommendations
        const slowQueries = this.results.queryPerformance.filter(q => q.averageTime > 100);
        slowQueries.forEach(query => {
            this.results.recommendations.push({
                category: 'Query Performance',
                severity: query.averageTime > 500 ? 'High' : 'Medium',
                issue: `Slow query: ${query.name} (${query.averageTime}ms average)`,
                recommendation: 'Optimize query or add appropriate indexes'
            });
        });

        // Table structure recommendations
        const largeTables = this.results.tableAnalysis.filter(t => t.rowCount > 10000);
        largeTables.forEach(table => {
            const tableIndexes = this.results.indexAnalysis.filter(idx => idx.table === table.tableName);
            if (tableIndexes.length < 2) {
                this.results.recommendations.push({
                    category: 'Indexing',
                    severity: 'Medium',
                    issue: `Large table ${table.tableName} (${table.rowCount} rows) may need more indexes`,
                    recommendation: 'Analyze query patterns and add indexes on frequently searched columns'
                });
            }
        });

        // Concurrency recommendations
        const failedConcurrency = this.results.concurrencyTests.filter(t => t.successRate < 95);
        if (failedConcurrency.length > 0) {
            this.results.recommendations.push({
                category: 'Concurrency',
                severity: 'High',
                issue: 'Database shows poor performance under concurrent load',
                recommendation: 'Consider implementing connection pooling and optimizing for concurrent access'
            });
        }

        // General recommendations
        if (this.results.indexAnalysis.length === 0) {
            this.results.recommendations.push({
                category: 'Indexing',
                severity: 'Medium',
                issue: 'No custom indexes found',
                recommendation: 'Add indexes on frequently queried columns to improve performance'
            });
        }

        if (this.results.recommendations.length === 0) {
            this.results.recommendations.push({
                category: 'Overall',
                severity: 'Info',
                issue: 'No critical database performance issues detected',
                recommendation: 'Database performance appears optimal for current usage patterns'
            });
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(80));
        console.log('🗄️ DATABASE PERFORMANCE ANALYSIS RESULTS');
        console.log('='.repeat(80));

        // Database info
        console.log('\n📊 DATABASE INFORMATION:');
        console.log(`SQLite Version: ${this.results.databaseInfo.sqliteVersion}`);
        console.log(`Database Size: ${this.results.databaseInfo.sizeMB} MB`);
        console.log(`Tables: ${this.results.databaseInfo.tableCount}`);
        console.log(`Custom Indexes: ${this.results.indexAnalysis.length}`);

        // Table analysis
        if (this.results.tableAnalysis.length > 0) {
            console.log('\n📋 TABLE ANALYSIS:');
            this.results.tableAnalysis.forEach(table => {
                console.log(`${table.tableName}:`);
                console.log(`  Rows: ${table.rowCount.toLocaleString()}`);
                console.log(`  Columns: ${table.columnCount}`);
            });
        }

        // Query performance
        if (this.results.queryPerformance.length > 0) {
            console.log('\n⚡ QUERY PERFORMANCE:');
            this.results.queryPerformance.forEach(query => {
                const status = query.successfulRuns === query.iterations ? '✅' : query.successfulRuns > 0 ? '⚠️' : '❌';
                console.log(`${status} ${query.name}: ${query.averageTime}ms avg (${query.minTime}-${query.maxTime}ms)`);
            });
        }

        // Concurrency test results
        if (this.results.concurrencyTests.length > 0) {
            console.log('\n🔄 CONCURRENCY TEST RESULTS:');
            this.results.concurrencyTests.forEach(test => {
                console.log(`${test.name}:`);
                console.log(`  Success Rate: ${test.successRate}%`);
                console.log(`  Operations/Second: ${test.operationsPerSecond}`);
                console.log(`  Avg Operation Time: ${test.averageOperationTime}ms`);
            });
        }

        // Optimization opportunities
        if (this.results.optimizationOpportunities.length > 0) {
            console.log('\n🔧 OPTIMIZATION OPPORTUNITIES:');
            this.results.optimizationOpportunities.forEach(opp => {
                const severityIcon = opp.severity === 'High' ? '🚨' : opp.severity === 'Medium' ? '⚠️' : '💡';
                console.log(`${severityIcon} [${opp.table}] ${opp.issue}`);
                console.log(`   → ${opp.recommendation}`);
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

    async closeDatabase() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                    }
                    resolve();
                });
            });
        }
    }

    async saveResults() {
        const filename = `database-performance-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filepath = path.join(__dirname, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
        console.log(`💾 Results saved to: ${filename}`);
        
        return filename;
    }

    async run() {
        try {
            console.log('🚀 Starting Database Performance Analysis...\n');

            await this.openDatabase();
            await this.getDatabaseInfo();
            await this.analyzeTableStructure();
            await this.analyzeIndexes();
            await this.testQueryPerformance();
            await this.testConcurrentOperations();
            
            this.generateRecommendations();
            this.printResults();
            
            const filename = await this.saveResults();
            
            await this.closeDatabase();
            
            console.log('\n✅ Database Performance Analysis Complete!');
            return {
                success: true,
                results: this.results,
                filename
            };

        } catch (error) {
            console.error('❌ Error during database performance analysis:', error);
            await this.closeDatabase();
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Run the analysis if this script is executed directly
if (require.main === module) {
    const analyzer = new DatabasePerformanceAnalyzer();
    analyzer.run().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}

module.exports = DatabasePerformanceAnalyzer;