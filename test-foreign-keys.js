#!/usr/bin/env node

/**
 * Test Foreign Key Enforcement
 * Verifies that foreign key constraints are properly enforced
 */

const { db } = require('./config/database');

async function testForeignKeyEnforcement() {
    console.log('🧪 Testing foreign key enforcement...');
    
    return new Promise((resolve) => {
        // Test 1: Check if foreign keys are enabled
        db.get('PRAGMA foreign_keys', (err, row) => {
            if (err) {
                console.error('❌ Error checking foreign key status:', err);
                resolve(false);
                return;
            }
            
            console.log(`🔒 Foreign keys status: ${row.foreign_keys ? 'ENABLED' : 'DISABLED'}`);
            
            if (!row.foreign_keys) {
                console.error('❌ Foreign keys are not enabled!');
                resolve(false);
                return;
            }
            
            // Test 2: Try to insert an invalid foreign key reference
            console.log('🧪 Testing foreign key constraint enforcement...');
            
            db.run(
                'INSERT INTO toll_charges (toll_account_id, trip_id, toll_date, toll_location, toll_amount) VALUES (?, ?, ?, ?, ?)',
                [999999, 999999, '2024-01-01', 'Test Location', 5.50],
                function(err) {
                    if (err) {
                        if (err.message.includes('FOREIGN KEY constraint failed')) {
                            console.log('✅ Foreign key constraint properly enforced!');
                            console.log('   Attempted insert with invalid foreign keys was rejected');
                            resolve(true);
                        } else {
                            console.error('❌ Unexpected error:', err.message);
                            resolve(false);
                        }
                    } else {
                        console.error('❌ Foreign key constraint NOT enforced - invalid insert succeeded!');
                        console.error('   This should not happen - removing test record...');
                        
                        // Clean up the test record
                        db.run('DELETE FROM toll_charges WHERE id = ?', [this.lastID], () => {
                            resolve(false);
                        });
                    }
                }
            );
        });
    });
}

// Run test if script is executed directly
if (require.main === module) {
    testForeignKeyEnforcement()
        .then((success) => {
            if (success) {
                console.log('\n✅ Foreign key enforcement is working correctly!');
                console.log('🔒 Database integrity protection is active');
                process.exit(0);
            } else {
                console.log('\n❌ Foreign key enforcement test failed!');
                console.log('⚠️  Database integrity may be compromised');
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('\n❌ Test failed with error:', error);
            process.exit(1);
        });
}

module.exports = { testForeignKeyEnforcement };