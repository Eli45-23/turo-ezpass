const { supabaseAdmin } = require('./config/supabase');

async function fixHostIdMismatch() {
    console.log('🔧 Starting host_id mismatch fix...');
    
    try {
        // Show current state before fix
        console.log('\n📊 BEFORE FIX - Current state:');
        
        const { data: tollsByHost } = await supabaseAdmin
            .from('toll_charges')
            .select('host_id')
            .eq('plate_number', 'LPJ3806')
            .gte('toll_date', '2025-08-01')
            .lte('toll_date', '2025-08-31');
            
        console.log(`Tolls for LPJ3806 in August: ${tollsByHost?.length || 0} total`);
        
        const hostCounts = tollsByHost?.reduce((acc, toll) => {
            acc[toll.host_id] = (acc[toll.host_id] || 0) + 1;
            return acc;
        }, {}) || {};
        
        console.log('Host ID distribution:', hostCounts);
        
        // Update toll host_ids to match trips
        console.log('\n🔄 Updating toll host_ids...');
        
        const { data, error, count } = await supabaseAdmin
            .from('toll_charges')
            .update({ 
                host_id: 'df28be49-b5ea-4e8c-ba63-03fc47bd1c7c', // nametwo@gmail.com
                updated_at: new Date().toISOString()
            })
            .eq('host_id', '5322cf92-98a4-49fb-aaa2-64daa5610a2e') // emailone@gmail.com
            .eq('plate_number', 'LPJ3806')
            .gte('toll_date', '2025-08-01')
            .lte('toll_date', '2025-08-31')
            .select();
        
        if (error) {
            console.error('❌ Error updating host_ids:', error);
            return;
        }
        
        console.log(`✅ Successfully updated ${count || data?.length || 0} toll records`);
        
        // Show state after fix
        console.log('\n📊 AFTER FIX - Verifying results:');
        
        const { data: updatedTolls } = await supabaseAdmin
            .from('toll_charges')
            .select('host_id, id, toll_date, toll_location, toll_amount')
            .eq('plate_number', 'LPJ3806')
            .gte('toll_date', '2025-08-01')
            .lte('toll_date', '2025-08-31')
            .order('toll_date');
            
        console.log(`Total tolls now: ${updatedTolls?.length || 0}`);
        updatedTolls?.forEach(toll => {
            console.log(`  - ${toll.toll_date}: $${toll.toll_amount} at ${toll.toll_location} (host: ${toll.host_id.substring(0, 8)}...)`);
        });
        
        console.log('\n🎯 Next step: Run toll matching process to link tolls to trips');
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
}

// Run the fix
fixHostIdMismatch();