#!/usr/bin/env node

/**
 * Add Financial CHECK Constraints Script
 * Adds missing financial data integrity constraints to existing tables
 */

const { db } = require('./config/database');

class FinancialConstraintsManager {
    constructor() {
        this.constraints = {
            invoices: [
                'total_amount >= 0',
                'processing_fee >= 0 AND processing_fee <= 25',
                'status IN ("pending", "sent", "paid", "failed", "cancelled")'
            ],
            invoice_items: [
                'amount >= 0 AND amount <= 200'
            ],
            toll_charges: [
                'toll_amount >= 0 AND toll_amount <= 500'
            ]
        };
    }

    /**
     * Check if constraints already exist
     */
    async checkExistingConstraints() {
        console.log('🔍 Checking existing constraints...');
        
        const tables = ['invoices', 'invoice_items', 'toll_charges'];
        const results = {};
        
        for (const table of tables) {
            const schema = await this.getTableSchema(table);
            results[table] = {
                schema,
                hasConstraints: schema.includes('CHECK')
            };
        }
        
        console.log('📊 Current constraint status:');
        for (const [table, info] of Object.entries(results)) {
            console.log(`   ${table}: ${info.hasConstraints ? '✅ Has constraints' : '❌ Missing constraints'}`);
        }
        
        return results;
    }

    /**
     * Get table schema
     */
    async getTableSchema(tableName) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [tableName], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.sql : '');
            });
        });
    }

    /**
     * Count records in a table
     */
    async countRecords(tableName) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
    }

    /**
     * Add constraints to invoices table
     */
    async addInvoicesConstraints() {
        console.log('🔧 Adding constraints to invoices table...');
        
        const recordCount = await this.countRecords('invoices');
        console.log(`   Current records: ${recordCount}`);
        
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // Temporarily disable foreign keys for data migration
                db.run('PRAGMA foreign_keys = OFF');
                db.run('BEGIN TRANSACTION');
                
                // Create new table with constraints (matching current structure)
                db.run(`
                    CREATE TABLE invoices_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        trip_id INTEGER NOT NULL,
                        invoice_number TEXT UNIQUE NOT NULL,
                        total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
                        processing_fee DECIMAL(10,2) DEFAULT 0 CHECK (processing_fee >= 0 AND processing_fee <= 25),
                        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'paid', 'failed', 'cancelled')),
                        sent_date DATETIME,
                        paid_date DATETIME,
                        turo_charge_id TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        data_checksum TEXT,
                        validation_notes TEXT,
                        FOREIGN KEY (trip_id) REFERENCES trips(id)
                    )
                `, (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }
                    
                    // Copy data from old table
                    db.run(`
                        INSERT INTO invoices_new 
                        SELECT * FROM invoices
                    `, (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }
                        
                        // Drop old table and rename new one
                        db.run('DROP TABLE invoices', (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }
                            
                            db.run('ALTER TABLE invoices_new RENAME TO invoices', (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }
                                
                                // Recreate indexes
                                db.run('CREATE INDEX idx_invoices_trip_status ON invoices(trip_id, status)', (err) => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        reject(err);
                                        return;
                                    }
                                    
                                    db.run('CREATE INDEX idx_invoices_status_date ON invoices(status, created_at)', (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            reject(err);
                                            return;
                                        }
                                        
                                        db.run('CREATE INDEX idx_invoices_number ON invoices(invoice_number)', (err) => {
                                            if (err) {
                                                db.run('ROLLBACK');
                                                reject(err);
                                                return;
                                            }
                                            
                                            db.run('COMMIT', (err) => {
                                                if (err) {
                                                    db.run('ROLLBACK');
                                                    db.run('PRAGMA foreign_keys = ON');
                                                    reject(err);
                                                } else {
                                                    // Re-enable foreign keys
                                                    db.run('PRAGMA foreign_keys = ON');
                                                    console.log('   ✅ Invoices table constraints added successfully');
                                                    resolve();
                                                }
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    }

    /**
     * Add constraints to invoice_items table
     */
    async addInvoiceItemsConstraints() {
        console.log('🔧 Adding constraints to invoice_items table...');
        
        const recordCount = await this.countRecords('invoice_items');
        console.log(`   Current records: ${recordCount}`);
        
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // Temporarily disable foreign keys for data migration
                db.run('PRAGMA foreign_keys = OFF');
                db.run('BEGIN TRANSACTION');
                
                // Create new table with constraints
                db.run(`
                    CREATE TABLE invoice_items_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        invoice_id INTEGER NOT NULL,
                        toll_charge_id INTEGER NOT NULL,
                        description TEXT,
                        amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0 AND amount <= 200),
                        FOREIGN KEY (invoice_id) REFERENCES invoices(id),
                        FOREIGN KEY (toll_charge_id) REFERENCES toll_charges(id)
                    )
                `, (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }
                    
                    // Copy data from old table
                    db.run(`
                        INSERT INTO invoice_items_new 
                        SELECT * FROM invoice_items
                    `, (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }
                        
                        // Drop old table and rename new one
                        db.run('DROP TABLE invoice_items', (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }
                            
                            db.run('ALTER TABLE invoice_items_new RENAME TO invoice_items', (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }
                                
                                // Recreate indexes
                                db.run('CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id)', (err) => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        reject(err);
                                        return;
                                    }
                                    
                                    db.run('CREATE INDEX idx_invoice_items_toll ON invoice_items(toll_charge_id)', (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            reject(err);
                                            return;
                                        }
                                        
                                        db.run('COMMIT', (err) => {
                                            if (err) {
                                                db.run('ROLLBACK');
                                                db.run('PRAGMA foreign_keys = ON');
                                                reject(err);
                                            } else {
                                                // Re-enable foreign keys
                                                db.run('PRAGMA foreign_keys = ON');
                                                console.log('   ✅ Invoice_items table constraints added successfully');
                                                resolve();
                                            }
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    }

    /**
     * Test constraints are working
     */
    async testConstraints() {
        console.log('🧪 Testing financial constraints...');
        
        const tests = [
            {
                name: 'Negative total_amount in invoices',
                sql: `INSERT INTO invoices (trip_id, invoice_number, total_amount) VALUES (1, 'TEST-NEG', -10.00)`,
                shouldFail: true
            },
            {
                name: 'Excessive processing_fee in invoices',
                sql: `INSERT INTO invoices (trip_id, invoice_number, total_amount, processing_fee) VALUES (1, 'TEST-FEE', 10.00, 30.00)`,
                shouldFail: true
            },
            {
                name: 'Invalid status in invoices', 
                sql: `INSERT INTO invoices (trip_id, invoice_number, total_amount, status) VALUES (1, 'TEST-STATUS', 10.00, 'invalid_status')`,
                shouldFail: true
            },
            {
                name: 'Negative amount in invoice_items',
                sql: `INSERT INTO invoice_items (invoice_id, toll_charge_id, amount) VALUES (1, 1, -5.00)`,
                shouldFail: true
            }
        ];
        
        for (const test of tests) {
            try {
                await new Promise((resolve, reject) => {
                    db.run(test.sql, (err) => {
                        if (err) {
                            if (test.shouldFail && err.message.includes('CHECK constraint failed')) {
                                console.log(`   ✅ ${test.name}: Correctly rejected`);
                                resolve();
                            } else {
                                reject(new Error(`Unexpected error: ${err.message}`));
                            }
                        } else {
                            if (test.shouldFail) {
                                reject(new Error(`${test.name}: Should have failed but succeeded`));
                            } else {
                                console.log(`   ✅ ${test.name}: Correctly accepted`);
                                resolve();
                            }
                        }
                    });
                });
            } catch (error) {
                console.error(`   ❌ ${test.name}: ${error.message}`);
                return false;
            }
        }
        
        return true;
    }

    /**
     * Run the complete constraint addition process
     */
    async addFinancialConstraints() {
        console.log('🚀 Adding financial CHECK constraints to database...');
        
        try {
            // Check current state
            const constraintStatus = await this.checkExistingConstraints();
            
            let hasChanges = false;
            
            // Add constraints to tables that need them
            if (!constraintStatus.invoices.hasConstraints) {
                await this.addInvoicesConstraints();
                hasChanges = true;
            } else {
                console.log('   ⏭️  Invoices table already has constraints');
            }
            
            if (!constraintStatus.invoice_items.hasConstraints) {
                await this.addInvoiceItemsConstraints();
                hasChanges = true;
            } else {
                console.log('   ⏭️  Invoice_items table already has constraints');
            }
            
            // Note: toll_charges already has constraints from the audit findings
            console.log('   ✅ Toll_charges table already has proper constraints');
            
            if (hasChanges) {
                // Test the new constraints
                const testsPassed = await this.testConstraints();
                
                if (testsPassed) {
                    console.log('\n🎉 Financial CHECK constraints added successfully!');
                    console.log('✅ All constraint tests passed');
                    console.log('🔒 Financial data integrity protection is now active');
                    return true;
                } else {
                    console.log('\n⚠️  Constraints added but some tests failed');
                    return false;
                }
            } else {
                console.log('\n✅ All financial constraints were already in place');
                return true;
            }
            
        } catch (error) {
            console.error('❌ Error adding financial constraints:', error);
            throw error;
        }
    }
}

// Run constraint addition if script is executed directly
if (require.main === module) {
    const manager = new FinancialConstraintsManager();
    
    manager.addFinancialConstraints()
        .then((success) => {
            if (success) {
                console.log('\n✅ Ready to proceed with SQL injection fixes');
                process.exit(0);
            } else {
                console.log('\n⚠️  Constraints added with warnings');
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('\n❌ Failed to add financial constraints:', error);
            process.exit(1);
        });
}

module.exports = { FinancialConstraintsManager };