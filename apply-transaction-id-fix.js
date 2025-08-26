#!/usr/bin/env node

/**
 * Fix Transaction ID Account Isolation Issue
 * This script fixes the global unique constraint on transaction_id that breaks account isolation.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables');
    console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// Create admin client that can bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

console.log('🚀 Starting Transaction ID Account Isolation Fix...');
console.log('🎯 This will fix the global unique constraint that prevents account isolation');

async function executeSQL(sql) {
    console.log('📋 Executing SQL:', sql.substring(0, 100) + '...');
    
    try {
        // Try to execute raw SQL using the admin client
        const { data, error } = await supabase.rpc('exec_sql', { 
            sql_query: sql 
        });
        
        if (error) {
            // If exec_sql doesn't exist, try using the raw query method
            if (error.message.includes('Could not find the function')) {
                console.log('⚠️  exec_sql function not available, trying direct SQL execution');
                
                // For schema changes, we need to use the underlying connection
                const { data: result, error: directError } = await supabase
                    .from('_migration_lock')  // This will fail but might give us DB access
                    .select('*');
                    
                if (directError) {
                    console.log('❌ Unable to execute schema changes directly');
                    console.log('📋 Please execute this SQL manually in your Supabase dashboard:');
                    console.log('');
                    console.log(sql);
                    console.log('');
                    return false;
                }
            } else {
                console.error('❌ SQL execution error:', error.message);
                return false;
            }
        }
        
        console.log('✅ SQL executed successfully');
        return true;
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
        console.log('📋 Please execute this SQL manually in your Supabase dashboard:');
        console.log('');
        console.log(sql);
        console.log('');
        return false;
    }
}

async function main() {
    try {
        console.log('\n🔍 Checking current constraint...');
        
        // Check if the problematic constraint exists
        const checkSQL = `
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'toll_charges' 
            AND indexname = 'toll_charges_transaction_id_key';
        `;
        
        const { data: constraints } = await supabase.rpc('exec_sql', { 
            sql_query: checkSQL 
        });
        
        if (constraints && constraints.length > 0) {
            console.log('⚠️  Found problematic global unique constraint on transaction_id');
        } else {
            console.log('ℹ️  Global constraint not found, checking if fix is needed...');
        }
        
        // Read the migration file
        const migrationPath = path.join(__dirname, 'migrations', 'fix_transaction_id_account_isolation.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('\n🔧 Applying account isolation fix...');
        
        // Split the migration into individual commands
        const commands = migrationSQL.split(';').filter(cmd => cmd.trim().length > 0);
        
        for (const command of commands) {
            const trimmedCommand = command.trim();
            if (!trimmedCommand || trimmedCommand.startsWith('--') || trimmedCommand.startsWith('COMMENT')) continue;
            
            const success = await executeSQL(trimmedCommand);
            if (!success) {
                console.error('❌ Migration failed');
                process.exit(1);
            }
        }
        
        console.log('\n✅ Transaction ID account isolation fix completed successfully!');
        console.log('🎉 Each account can now upload the same E-ZPass data independently');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        
        // Provide manual instructions
        console.log('\n📋 Manual fix required. Please execute this SQL in your Supabase dashboard:');
        console.log('');
        console.log('-- Fix account isolation issue with transaction_id');
        console.log('DROP INDEX IF EXISTS toll_charges_transaction_id_key;');
        console.log('CREATE UNIQUE INDEX toll_charges_transaction_account_key ON toll_charges(transaction_id, toll_account_id);');
        console.log('');
        
        process.exit(1);
    }
}

main();