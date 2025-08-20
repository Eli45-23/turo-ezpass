#!/usr/bin/env node

/**
 * Migration script to transfer data from SQLite to PostgreSQL
 * This script exports data from SQLite and imports it into PostgreSQL
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');

// Configuration
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'turo_tolls.db');
const POSTGRES_URL = process.env.DATABASE_URL;
const BACKUP_DIR = path.join(__dirname, '..', 'backups', 'migration');

// Tables to migrate (in order to handle foreign key dependencies)
const TABLES_TO_MIGRATE = [
    'hosts',
    'toll_accounts',
    'trips',
    'toll_charges',
    'invoices',
    'invoice_items',
    'transponder_mappings',
    'deleted_transponder_plates',
    'security_logs',
    'login_attempts',
    'data_checkpoints',
    'backup_logs',
    'validation_errors',
    'transaction_log',
    'notification_preferences',
    'notification_queue',
    'notification_logs',
    'notification_events',
    'analytics_metrics',
    'financial_analytics',
    'performance_metrics',
    'bi_reports',
    'predictive_analytics',
    'automated_reports',
    'toll_location_analytics',
    'vehicle_analytics',
    'late_tolls_detected',
    'trip_status_history',
    'trip_status_intelligence',
    'user_trip_patterns',
    'ml_timing_patterns'
];

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

class DatabaseMigrator {
    constructor() {
        this.sqliteDb = null;
        this.pgClient = null;
        this.migrationStats = {
            tablesProcessed: 0,
            totalRecords: 0,
            startTime: null,
            errors: []
        };
    }

    async initialize() {
        log('🚀 Initializing Database Migration Tool', 'bright');
        
        // Validate requirements
        if (!POSTGRES_URL) {
            throw new Error('DATABASE_URL environment variable is required for PostgreSQL connection');
        }

        if (!fs.existsSync(SQLITE_DB_PATH)) {
            throw new Error(`SQLite database not found at: ${SQLITE_DB_PATH}`);
        }

        // Create backup directory
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
            logInfo(`Created backup directory: ${BACKUP_DIR}`);
        }

        // Initialize SQLite connection
        this.sqliteDb = new sqlite3.Database(SQLITE_DB_PATH, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                throw new Error(`Failed to connect to SQLite database: ${err.message}`);
            }
            logSuccess('Connected to SQLite database');
        });

        // Initialize PostgreSQL connection
        this.pgClient = new Client({
            connectionString: POSTGRES_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        await this.pgClient.connect();
        logSuccess('Connected to PostgreSQL database');

        this.migrationStats.startTime = new Date();
    }

    async createBackup() {
        logInfo('Creating backup of current data...');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `pre-migration-backup-${timestamp}.sql`);
        
        try {
            // Export PostgreSQL schema and data
            const { execSync } = require('child_process');
            const pgDumpCmd = `pg_dump "${POSTGRES_URL}" > "${backupFile}"`;
            
            execSync(pgDumpCmd);
            logSuccess(`Backup created: ${backupFile}`);
            
            return backupFile;
        } catch (error) {
            logWarning(`Failed to create automatic backup: ${error.message}`);
            return null;
        }
    }

    async getTableData(tableName) {
        return new Promise((resolve, reject) => {
            // First check if table exists and get its structure
            this.sqliteDb.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
                if (err) {
                    reject(new Error(`Failed to get table structure for ${tableName}: ${err.message}`));
                    return;
                }

                if (columns.length === 0) {
                    logWarning(`Table ${tableName} does not exist in SQLite, skipping`);
                    resolve({ columns: [], rows: [] });
                    return;
                }

                // Get all data from the table
                this.sqliteDb.all(`SELECT * FROM ${tableName}`, (err, rows) => {
                    if (err) {
                        reject(new Error(`Failed to read data from ${tableName}: ${err.message}`));
                        return;
                    }

                    resolve({
                        columns: columns.map(col => col.name),
                        rows: rows || []
                    });
                });
            });
        });
    }

    convertSQLiteToPostgreSQL(value, columnName) {
        // Handle null values
        if (value === null || value === undefined) {
            return null;
        }

        // Convert boolean values (SQLite stores as 0/1, PostgreSQL needs true/false)
        if (typeof value === 'number' && (value === 0 || value === 1)) {
            // Check if this is likely a boolean column
            const booleanColumns = [
                'is_active', 'is_matched', 'submitted_to_turo', 'is_archived',
                'success', 'resolved', 'email_notifications', 'toll_alerts',
                'weekly_summaries', 'monthly_summaries', 'system_alerts',
                'trip_completion', 'invoice_notifications', 'real_time_alerts',
                'notification_sent'
            ];
            
            if (booleanColumns.some(col => columnName.toLowerCase().includes(col.toLowerCase()))) {
                return value === 1;
            }
        }

        // Convert date strings to proper format
        if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
            return value; // PostgreSQL can handle ISO date strings
        }

        return value;
    }

    async insertDataIntoPostgreSQL(tableName, columns, rows) {
        if (rows.length === 0) {
            logInfo(`No data to migrate for table ${tableName}`);
            return;
        }

        logInfo(`Migrating ${rows.length} records to ${tableName}...`);

        // Build the INSERT statement
        const columnList = columns.join(', ');
        const valuePlaceholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        const insertSQL = `INSERT INTO ${tableName} (${columnList}) VALUES (${valuePlaceholders})`;

        // Disable foreign key checks and triggers temporarily
        await this.pgClient.query('BEGIN');

        try {
            let insertedCount = 0;
            
            for (const row of rows) {
                try {
                    const values = columns.map(col => this.convertSQLiteToPostgreSQL(row[col], col));
                    await this.pgClient.query(insertSQL, values);
                    insertedCount++;
                } catch (error) {
                    logError(`Failed to insert row into ${tableName}: ${error.message}`);
                    this.migrationStats.errors.push({
                        table: tableName,
                        error: error.message,
                        row: row
                    });
                    
                    // Continue with other rows
                    continue;
                }
            }

            await this.pgClient.query('COMMIT');
            logSuccess(`Successfully migrated ${insertedCount}/${rows.length} records to ${tableName}`);
            
            this.migrationStats.totalRecords += insertedCount;

        } catch (error) {
            await this.pgClient.query('ROLLBACK');
            throw new Error(`Failed to migrate data to ${tableName}: ${error.message}`);
        }
    }

    async updateSequences() {
        logInfo('Updating PostgreSQL sequence values...');
        
        const sequenceQueries = [
            `SELECT setval('hosts_id_seq', (SELECT MAX(id) FROM hosts))`,
            `SELECT setval('trips_id_seq', (SELECT MAX(id) FROM trips))`,
            `SELECT setval('toll_charges_id_seq', (SELECT MAX(id) FROM toll_charges))`,
            `SELECT setval('invoices_id_seq', (SELECT MAX(id) FROM invoices))`,
            `SELECT setval('toll_accounts_id_seq', (SELECT MAX(id) FROM toll_accounts))`,
            `SELECT setval('transponder_mappings_id_seq', (SELECT MAX(id) FROM transponder_mappings))`
        ];

        for (const query of sequenceQueries) {
            try {
                await this.pgClient.query(query);
            } catch (error) {
                logWarning(`Failed to update sequence: ${error.message}`);
            }
        }

        logSuccess('Sequence values updated');
    }

    async validateMigration() {
        logInfo('Validating migration...');
        
        const validationResults = [];

        for (const tableName of TABLES_TO_MIGRATE) {
            try {
                // Get count from SQLite
                const sqliteData = await this.getTableData(tableName);
                const sqliteCount = sqliteData.rows.length;

                // Get count from PostgreSQL
                const pgResult = await this.pgClient.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const pgCount = parseInt(pgResult.rows[0].count);

                const isValid = sqliteCount === pgCount;
                validationResults.push({
                    table: tableName,
                    sqliteCount,
                    pgCount,
                    valid: isValid
                });

                if (isValid) {
                    logSuccess(`✓ ${tableName}: ${pgCount} records`);
                } else {
                    logError(`✗ ${tableName}: SQLite(${sqliteCount}) != PostgreSQL(${pgCount})`);
                }

            } catch (error) {
                logWarning(`Could not validate ${tableName}: ${error.message}`);
                validationResults.push({
                    table: tableName,
                    error: error.message,
                    valid: false
                });
            }
        }

        return validationResults;
    }

    async migrateAllTables() {
        logInfo(`Starting migration of ${TABLES_TO_MIGRATE.length} tables...`);

        for (const tableName of TABLES_TO_MIGRATE) {
            try {
                log(`\n📋 Processing table: ${tableName}`, 'cyan');
                
                const tableData = await this.getTableData(tableName);
                await this.insertDataIntoPostgreSQL(tableName, tableData.columns, tableData.rows);
                
                this.migrationStats.tablesProcessed++;
                
            } catch (error) {
                logError(`Failed to migrate table ${tableName}: ${error.message}`);
                this.migrationStats.errors.push({
                    table: tableName,
                    error: error.message
                });
            }
        }

        await this.updateSequences();
    }

    generateMigrationReport() {
        const endTime = new Date();
        const duration = Math.round((endTime - this.migrationStats.startTime) / 1000);
        
        log('\n📊 Migration Report', 'bright');
        log('='.repeat(50), 'blue');
        log(`Start Time: ${this.migrationStats.startTime.toISOString()}`, 'blue');
        log(`End Time: ${endTime.toISOString()}`, 'blue');
        log(`Duration: ${duration} seconds`, 'blue');
        log(`Tables Processed: ${this.migrationStats.tablesProcessed}/${TABLES_TO_MIGRATE.length}`, 'blue');
        log(`Total Records Migrated: ${this.migrationStats.totalRecords}`, 'blue');
        log(`Errors: ${this.migrationStats.errors.length}`, this.migrationStats.errors.length > 0 ? 'red' : 'green');
        
        if (this.migrationStats.errors.length > 0) {
            log('\n❌ Errors encountered:', 'red');
            this.migrationStats.errors.forEach((error, index) => {
                log(`${index + 1}. Table: ${error.table}`, 'red');
                log(`   Error: ${error.error}`, 'red');
            });
        }

        // Save report to file
        const reportFile = path.join(BACKUP_DIR, `migration-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        fs.writeFileSync(reportFile, JSON.stringify({
            ...this.migrationStats,
            endTime,
            duration
        }, null, 2));
        
        logInfo(`Migration report saved to: ${reportFile}`);
    }

    async cleanup() {
        if (this.sqliteDb) {
            this.sqliteDb.close();
            logInfo('SQLite connection closed');
        }

        if (this.pgClient) {
            await this.pgClient.end();
            logInfo('PostgreSQL connection closed');
        }
    }

    async run() {
        try {
            await this.initialize();
            await this.createBackup();
            await this.migrateAllTables();
            
            const validationResults = await this.validateMigration();
            const allValid = validationResults.every(result => result.valid);
            
            if (allValid) {
                logSuccess('🎉 Migration completed successfully!');
            } else {
                logWarning('⚠️  Migration completed with validation warnings');
            }
            
            this.generateMigrationReport();
            
        } catch (error) {
            logError(`Migration failed: ${error.message}`);
            console.error(error);
            process.exit(1);
        } finally {
            await this.cleanup();
        }
    }
}

// Run migration if this script is executed directly
if (require.main === module) {
    const migrator = new DatabaseMigrator();
    migrator.run().catch(error => {
        logError(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = DatabaseMigrator;