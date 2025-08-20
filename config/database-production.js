const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Determine if we're running in production with PostgreSQL
const isDatabaseURL = process.env.DATABASE_URL && process.env.NODE_ENV === 'production';

let db;
let dbType = 'sqlite';

if (isDatabaseURL) {
    // PostgreSQL configuration for production
    const { Client, Pool } = require('pg');
    
    // Parse DATABASE_URL
    const dbUrl = new URL(process.env.DATABASE_URL);
    
    const pgConfig = {
        host: dbUrl.hostname,
        port: dbUrl.port || 5432,
        database: dbUrl.pathname.slice(1), // Remove leading '/'
        user: dbUrl.username,
        password: dbUrl.password,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 20, // Maximum number of clients in the pool
        min: 5,  // Minimum number of clients in the pool
    };

    // Create connection pool
    db = new Pool(pgConfig);
    dbType = 'postgresql';

    console.log('🐘 PostgreSQL database connection configured');

    // Test connection
    db.connect((err, client, done) => {
        if (err) {
            console.error('❌ Error connecting to PostgreSQL:', err);
            process.exit(1);
        } else {
            console.log('✅ PostgreSQL connection successful');
            done(); // Release the client back to the pool
        }
    });

    // Handle pool events
    db.on('error', (err) => {
        console.error('❌ PostgreSQL pool error:', err);
    });

    db.on('connect', () => {
        console.log('🔗 New PostgreSQL client connected');
    });

} else {
    // SQLite configuration for development/testing
    const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'turo_tolls.db');
    
    // Ensure database directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('❌ Error opening SQLite database:', err);
            process.exit(1);
        } else {
            console.log('💾 SQLite database connected:', dbPath);
            
            // Apply SQLite optimizations
            db.serialize(() => {
                db.run('PRAGMA foreign_keys = ON');
                db.run('PRAGMA journal_mode = WAL');
                db.run('PRAGMA cache_size = -65536'); // 64MB cache
                db.run('PRAGMA mmap_size = 268435456'); // 256MB mmap
                db.run('PRAGMA synchronous = NORMAL');
                db.run('PRAGMA page_size = 4096');
                db.run('PRAGMA temp_store = MEMORY');
                console.log('⚡ SQLite optimizations applied');
            });
        }
    });
}

// Database abstraction layer
class DatabaseAdapter {
    constructor(db, type) {
        this.db = db;
        this.type = type;
    }

    // Execute a single query
    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (this.type === 'postgresql') {
                this.db.query(sql, params, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            rows: result.rows,
                            rowCount: result.rowCount,
                            lastID: result.rows[0]?.id
                        });
                    }
                });
            } else {
                // SQLite
                if (sql.trim().toUpperCase().startsWith('SELECT')) {
                    this.db.all(sql, params, (err, rows) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({
                                rows: rows,
                                rowCount: rows.length
                            });
                        }
                    });
                } else {
                    this.db.run(sql, params, function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({
                                rows: [],
                                rowCount: this.changes,
                                lastID: this.lastID
                            });
                        }
                    });
                }
            }
        });
    }

    // Get a single row
    async get(sql, params = []) {
        if (this.type === 'postgresql') {
            const result = await this.query(sql + ' LIMIT 1', params);
            return result.rows[0] || null;
        } else {
            return new Promise((resolve, reject) => {
                this.db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row || null);
                });
            });
        }
    }

    // Get all rows
    async all(sql, params = []) {
        const result = await this.query(sql, params);
        return result.rows;
    }

    // Run a statement (INSERT, UPDATE, DELETE)
    async run(sql, params = []) {
        return await this.query(sql, params);
    }

    // Execute multiple statements in a transaction
    async transaction(statements) {
        if (this.type === 'postgresql') {
            const client = await this.db.connect();
            try {
                await client.query('BEGIN');
                const results = [];
                
                for (const stmt of statements) {
                    const result = await client.query(stmt.sql, stmt.params || []);
                    results.push({
                        rows: result.rows,
                        rowCount: result.rowCount,
                        lastID: result.rows[0]?.id
                    });
                }
                
                await client.query('COMMIT');
                return results;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } else {
            // SQLite
            return new Promise((resolve, reject) => {
                db.serialize(() => {
                    db.run('BEGIN TRANSACTION');
                    
                    const results = [];
                    let completed = 0;
                    
                    const executeNext = (index) => {
                        if (index >= statements.length) {
                            db.run('COMMIT', (err) => {
                                if (err) reject(err);
                                else resolve(results);
                            });
                            return;
                        }
                        
                        const stmt = statements[index];
                        db.run(stmt.sql, stmt.params || [], function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }
                            
                            results.push({
                                rows: [],
                                rowCount: this.changes,
                                lastID: this.lastID
                            });
                            
                            executeNext(index + 1);
                        });
                    };
                    
                    executeNext(0);
                });
            });
        }
    }

    // Close database connection
    async close() {
        if (this.type === 'postgresql') {
            await this.db.end();
        } else {
            return new Promise((resolve) => {
                this.db.close(resolve);
            });
        }
    }
}

// Create the database adapter
const dbAdapter = new DatabaseAdapter(db, dbType);

// SQL translation helpers
const SQL = {
    // Auto-increment column definition
    autoIncrement: dbType === 'postgresql' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT',
    
    // Current timestamp
    now: dbType === 'postgresql' ? 'NOW()' : 'CURRENT_TIMESTAMP',
    
    // Boolean type
    boolean: dbType === 'postgresql' ? 'BOOLEAN' : 'BOOLEAN',
    
    // Text type
    text: dbType === 'postgresql' ? 'TEXT' : 'TEXT',
    
    // Decimal type
    decimal: (precision, scale) => dbType === 'postgresql' ? `DECIMAL(${precision},${scale})` : `DECIMAL(${precision},${scale})`,
    
    // DateTime type
    datetime: dbType === 'postgresql' ? 'TIMESTAMP' : 'DATETIME',
    
    // LIMIT syntax
    limit: (count, offset = 0) => dbType === 'postgresql' ? `LIMIT ${count} OFFSET ${offset}` : `LIMIT ${count} OFFSET ${offset}`,
    
    // IF NOT EXISTS for CREATE TABLE
    ifNotExists: dbType === 'postgresql' ? '' : 'IF NOT EXISTS',
    
    // Upsert syntax
    upsert: (table, columns, values, conflictColumns) => {
        if (dbType === 'postgresql') {
            const columnList = columns.join(', ');
            const valueList = values.map((_, i) => `$${i + 1}`).join(', ');
            const updateList = columns.filter(col => !conflictColumns.includes(col))
                                    .map(col => `${col} = EXCLUDED.${col}`)
                                    .join(', ');
            return `INSERT INTO ${table} (${columnList}) VALUES (${valueList}) ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateList}`;
        } else {
            const columnList = columns.join(', ');
            const valueList = values.map(() => '?').join(', ');
            return `INSERT OR REPLACE INTO ${table} (${columnList}) VALUES (${valueList})`;
        }
    }
};

module.exports = {
    db: dbAdapter,
    rawDb: db,
    dbType,
    SQL,
    isDatabaseURL
};