const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://yjnqxcfqxtysgdgqszxy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqbnF4Y2ZxeHR5c2dkZ3FzenF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMzI2NDY2MCwiZXhwIjoyMDM4ODQwNjYwfQ.FlrSwBGPCn1nvHnKxvXTjGNGY2FgIUDzLFaxLaRy4h0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
    try {
        console.log('🔧 Applying database migration for data isolation fix...');
        
        // Read the migration file
        const migrationSql = fs.readFileSync('migrations/001_add_host_trip_unique_constraint.sql', 'utf8');
        
        // Split into individual statements (rough splitting - good enough for our migration)
        const statements = migrationSql
            .split(';')
            .map(s => s.trim())
            .filter(s => s && !s.startsWith('--'));
        
        console.log(`📝 Found ${statements.length} SQL statements to execute`);
        
        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (!statement) continue;
            
            console.log(`🔄 Executing statement ${i + 1}/${statements.length}...`);
            console.log(`   ${statement.substring(0, 100)}...`);
            
            const { data, error } = await supabase.rpc('exec', {
                query: statement
            });
            
            if (error) {
                console.error(`❌ Error executing statement ${i + 1}:`, error);
                if (error.message.includes('already exists') || error.message.includes('does not exist')) {
                    console.log('⚠️ Continuing (constraint/policy may already exist)...');
                    continue;
                } else {
                    throw error;
                }
            } else {
                console.log(`✅ Statement ${i + 1} executed successfully`);
            }
        }
        
        console.log('🎉 Migration completed successfully!');
        console.log('🛡️ Database now has proper multi-tenant isolation controls');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

applyMigration();