const { supabaseAdmin } = require('./config/supabase');

async function fixTrip44808757() {
    console.log('🔧 Fixing missing tolls for Trip #44808757...');
    
    try {
        const hostId = 'ed988a4c-b72e-4605-8cf7-c2a4a69f61ba';
        const tripId = 2686; // Trip 44808757's internal ID
        
        // Step 1: Show current state
        console.log('\n🔍 Current state:');
        const { data: currentTolls } = await supabaseAdmin
            .from('toll_charges')
            .select('id, toll_date, toll_amount, toll_location, trip_id, is_matched')
            .eq('trip_id', tripId);
            
        console.log(`Trip 44808757 currently has ${currentTolls?.length || 0} matched tolls:`);
        currentTolls?.forEach(toll => {
            console.log(`  - ${toll.toll_date.substring(5, 16)}: $${toll.toll_amount} at ${toll.toll_location}`);
        });
        
        // Step 2: Update the 2 missing tolls
        console.log('\n🔧 Updating missing tolls...');
        
        const { data: updatedTolls, error } = await supabaseAdmin
            .from('toll_charges')
            .update({
                trip_id: tripId,
                is_matched: true,
                updated_at: new Date().toISOString()
            })
            .in('id', [9290, 9291])
            .eq('host_id', hostId)
            .select('id, toll_date, toll_amount, toll_location');
            
        if (error) {
            console.error('❌ Error updating tolls:', error);
            return;
        }
        
        console.log(`✅ Updated ${updatedTolls?.length || 0} tolls:`);
        updatedTolls?.forEach(toll => {
            console.log(`  - ${toll.toll_date.substring(5, 16)}: $${toll.toll_amount} at ${toll.toll_location}`);
        });
        
        // Step 3: Show final state
        console.log('\n🔍 Final state:');
        const { data: finalTolls } = await supabaseAdmin
            .from('toll_charges')
            .select('id, toll_date, toll_amount, toll_location, trip_id, is_matched')
            .eq('trip_id', tripId)
            .order('toll_date');
            
        const totalAmount = finalTolls?.reduce((sum, toll) => sum + parseFloat(toll.toll_amount), 0) || 0;
        
        console.log(`Trip 44808757 now has ${finalTolls?.length || 0} matched tolls (Total: $${totalAmount.toFixed(2)}):`);
        finalTolls?.forEach(toll => {
            console.log(`  - ${toll.toll_date.substring(5, 16)}: $${toll.toll_amount} at ${toll.toll_location}`);
        });
        
        console.log('\n✅ Trip 44808757 fix complete!');
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
}

// Run the fix
fixTrip44808757();