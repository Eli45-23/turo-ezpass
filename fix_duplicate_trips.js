const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yjnqxcfqxtysgdgqszxy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqbnF4Y2ZxeHR5c2dkZ3FzenF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMzI2NDY2MCwiZXhwIjoyMDM4ODQwNjYwfQ.FlrSwBGPCn1nvHnKxvXTjGNGY2FgIUDzLFaxLaRy4h0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixDuplicateTrips() {
  try {
    console.log('🔧 Fixing duplicate trips issue...');
    
    // First update toll charges to point to correct trip IDs
    console.log('📝 Updating toll charge mappings...');
    const { error: updateError } = await supabase.rpc('exec_sql', {
      sql: `
        UPDATE toll_charges 
        SET 
          trip_id = CASE 
            WHEN trip_id = 1988 THEN 2120
            WHEN trip_id = 1989 THEN 2121
            WHEN trip_id = 1990 THEN 2122
            WHEN trip_id = 1991 THEN 2123
            WHEN trip_id = 1992 THEN 2124
            ELSE trip_id
          END,
          host_id = '5322cf92-98a4-49fb-aaa2-64daa5610a2e',
          updated_at = now()
        WHERE trip_id IN (1988, 1989, 1990, 1991, 1992)
          AND is_matched = true;
      `
    });

    if (updateError) {
      console.error('❌ Error updating toll charges:', updateError);
      return;
    }

    console.log('✅ Updated toll charge mappings');

    // Then delete duplicate trips
    console.log('🗑️ Deleting duplicate trips...');
    const { error: deleteError } = await supabase.rpc('exec_sql', {
      sql: `
        DELETE FROM trips 
        WHERE id IN (1988, 1989, 1990, 1991, 1992)
          AND host_id = 'df28be49-b5ea-4e8c-ba63-03fc47bd1c7c';
      `
    });

    if (deleteError) {
      console.error('❌ Error deleting duplicate trips:', deleteError);
      return;
    }

    console.log('✅ Deleted duplicate trips');
    console.log('🎉 Fix completed successfully!');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

fixDuplicateTrips();