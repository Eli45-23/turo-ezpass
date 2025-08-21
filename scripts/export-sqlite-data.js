const { db } = require('../config/database');
const fs = require('fs');
const path = require('path');

// Export all data from SQLite database to JSON format for Supabase migration
async function exportAllData() {
    console.log('🚀 Starting SQLite data export...');
    
    const exportData = {
        hosts: [],
        toll_accounts: [],
        trips: [],
        toll_charges: [],
        invoices: [],
        invoice_items: [],
        transponder_mappings: [],
        deleted_transponder_plates: []
    };

    const exportPromises = [];

    // Export each table
    const tables = Object.keys(exportData);
    
    for (const tableName of tables) {
        exportPromises.push(
            new Promise((resolve, reject) => {
                const query = `SELECT * FROM ${tableName}`;
                
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.error(`❌ Error exporting ${tableName}:`, err);
                        resolve([]); // Continue with empty array instead of failing
                    } else {
                        console.log(`✅ Exported ${rows.length} records from ${tableName}`);
                        exportData[tableName] = rows;
                        resolve(rows);
                    }
                });
            })
        );
    }

    try {
        await Promise.all(exportPromises);
        
        // Create exports directory if it doesn't exist
        const exportsDir = path.join(__dirname, '..', 'exports');
        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
        }

        // Write export data to file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const exportFilePath = path.join(exportsDir, `sqlite-export-${timestamp}.json`);
        
        fs.writeFileSync(exportFilePath, JSON.stringify(exportData, null, 2));
        
        console.log('📊 Export Summary:');
        Object.entries(exportData).forEach(([table, data]) => {
            console.log(`   ${table}: ${data.length} records`);
        });
        
        console.log(`💾 Data exported to: ${exportFilePath}`);
        
        // Also create a PostgreSQL SQL dump file
        const sqlFilePath = path.join(exportsDir, `sqlite-to-postgresql-${timestamp}.sql`);
        const sqlContent = generatePostgreSQLInserts(exportData);
        fs.writeFileSync(sqlFilePath, sqlContent);
        
        console.log(`🐘 PostgreSQL SQL file created: ${sqlFilePath}`);
        
        return {
            jsonFile: exportFilePath,
            sqlFile: sqlFilePath,
            summary: exportData
        };
        
    } catch (error) {
        console.error('❌ Export failed:', error);
        throw error;
    }
}

// Generate PostgreSQL INSERT statements
function generatePostgreSQLInserts(data) {
    let sql = '-- SQLite to PostgreSQL Data Migration\n';
    sql += `-- Generated on ${new Date().toISOString()}\n\n`;
    
    // Add setup commands
    sql += '-- Disable triggers and constraints during import\n';
    sql += 'SET session_replication_role = replica;\n\n';
    
    // Process each table
    Object.entries(data).forEach(([tableName, rows]) => {
        if (rows.length === 0) return;
        
        sql += `-- Insert data into ${tableName}\n`;
        
        // Get column names from first row
        const columns = Object.keys(rows[0]);
        
        // Convert SQLite data types for PostgreSQL
        const convertedRows = rows.map(row => {
            const convertedRow = { ...row };
            
            // Convert boolean values
            columns.forEach(col => {
                if (typeof convertedRow[col] === 'boolean') {
                    // PostgreSQL booleans
                } else if (convertedRow[col] === 1 || convertedRow[col] === 0) {
                    // Convert SQLite boolean integers
                    if (['is_active', 'is_matched', 'submitted_to_turo', 'is_archived', 'success', 'resolved'].includes(col)) {
                        convertedRow[col] = convertedRow[col] === 1;
                    }
                }
                
                // Handle datetime strings
                if (col.includes('_at') || col.includes('_date') || col === 'toll_date') {
                    if (convertedRow[col] && typeof convertedRow[col] === 'string') {
                        // Ensure ISO format
                        try {
                            convertedRow[col] = new Date(convertedRow[col]).toISOString();
                        } catch (e) {
                            // Keep original value if conversion fails
                        }
                    }
                }
                
                // Handle UUIDs for host references (will need to be updated after Supabase auth)
                if (col === 'host_id' && tableName !== 'hosts') {
                    // These will need to be updated after users are migrated to Supabase Auth
                    convertedRow[col] = `-- UPDATE_WITH_SUPABASE_UUID_${convertedRow[col]}`;
                }
            });
            
            return convertedRow;
        });
        
        // Generate INSERT statement
        const columnList = columns.join(', ');
        const valuesList = convertedRows.map(row => {
            const values = columns.map(col => {
                const value = row[col];
                if (value === null || value === undefined) {
                    return 'NULL';
                } else if (typeof value === 'string') {
                    return `'${value.replace(/'/g, "''")}'`;
                } else if (typeof value === 'boolean') {
                    return value ? 'TRUE' : 'FALSE';
                } else {
                    return value;
                }
            });
            return `(${values.join(', ')})`;
        }).join(',\n    ');
        
        sql += `INSERT INTO ${tableName} (${columnList}) VALUES\n    ${valuesList};\n\n`;
    });
    
    // Re-enable triggers and constraints
    sql += '-- Re-enable triggers and constraints\n';
    sql += 'SET session_replication_role = DEFAULT;\n\n';
    
    // Update sequences
    sql += '-- Update sequences to prevent ID conflicts\n';
    Object.keys(data).forEach(tableName => {
        if (data[tableName].length > 0) {
            sql += `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), (SELECT MAX(id) FROM ${tableName}));\n`;
        }
    });
    
    return sql;
}

// Run export if called directly
if (require.main === module) {
    exportAllData()
        .then((result) => {
            console.log('✅ Export completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Export failed:', error);
            process.exit(1);
        });
}

module.exports = { exportAllData };