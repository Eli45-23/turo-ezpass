#!/usr/bin/env node

/**
 * Add Match Confidence Column
 * This script adds the missing match_confidence column to the toll_charges table
 */

const { createClient } = require('@supabase/supabase-js');
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

console.log('🚀 Adding match_confidence column to toll_charges table...');

async function executeSQL(sql) {
    console.log('📋 Executing SQL:', sql.substring(0, 100) + '...');
    
    try {
        // Try to execute raw SQL using the admin client
        const { data, error } = await supabase.rpc('exec_sql', { 
            sql_query: sql 
        });
        
        if (error) {
            console.log('📋 Please execute this SQL manually in your Supabase dashboard:');
            console.log('');
            console.log(sql);
            console.log('');
            return false;
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
        const addColumnSQL = `
            ALTER TABLE toll_charges 
            ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2) DEFAULT NULL;
        `;
        
        const success = await executeSQL(addColumnSQL);
        
        if (success) {
            console.log('✅ Successfully added match_confidence column!');
            console.log('🎉 The enhanced toll matcher can now store confidence scores');
        } else {
            console.log('⚠️  Please add the column manually using the SQL shown above');
        }
        
    } catch (error) {
        console.error('❌ Failed to add column:', error.message);
        
        console.log('\n📋 Manual fix required. Please execute this SQL in your Supabase dashboard:');
        console.log('');
        console.log('ALTER TABLE toll_charges ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2) DEFAULT NULL;');
        console.log('');
        
        process.exit(1);
    }
}

main();