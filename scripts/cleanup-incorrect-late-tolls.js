/**
 * Cleanup Script: Remove incorrectly detected late tolls
 * Removes late toll detections where tolls fall outside trip time windows
 */

const { supabaseAdmin } = require('../config/supabase');

async function cleanupIncorrectLateTolls() {
    try {
        console.log('🧹 Starting cleanup of incorrectly detected late tolls...');
        
        // Find late tolls that are outside their trip time windows
        const { data: incorrectLateTolls, error: selectError } = await supabaseAdmin
            .from('late_tolls_detected')
            .select(`
                id,
                trip_id,
                toll_charge_id,
                trips!inner(turo_trip_id, start_date, end_date),
                toll_charges!inner(toll_date, toll_location, toll_amount)
            `);
            
        if (selectError) {
            console.error('❌ Error fetching late tolls:', selectError);
            return;
        }
        
        const toDelete = [];
        
        for (const lateToll of incorrectLateTolls) {
            const tollDate = new Date(lateToll.toll_charges.toll_date);
            const tripStart = new Date(lateToll.trips.start_date);
            const tripEnd = new Date(lateToll.trips.end_date);
            
            // Check if toll is outside trip window
            if (tollDate < tripStart || tollDate > tripEnd) {
                toDelete.push(lateToll.id);
                console.log(`❌ Will delete: Late toll ${lateToll.id} for trip ${lateToll.trips.turo_trip_id}`);
                console.log(`   Toll date: ${lateToll.toll_charges.toll_date} (${lateToll.toll_charges.toll_location})`);
                console.log(`   Trip window: ${lateToll.trips.start_date} to ${lateToll.trips.end_date}`);
            }
        }
        
        if (toDelete.length === 0) {
            console.log('✅ No incorrect late toll detections found - database is clean');
            return;
        }
        
        console.log(`🗑️ Deleting ${toDelete.length} incorrect late toll detections...`);
        
        // Delete the incorrect records
        const { error: deleteError } = await supabaseAdmin
            .from('late_tolls_detected')
            .delete()
            .in('id', toDelete);
            
        if (deleteError) {
            console.error('❌ Error deleting incorrect late tolls:', deleteError);
            return;
        }
        
        console.log(`✅ Successfully cleaned up ${toDelete.length} incorrect late toll detections`);
        console.log('🎯 Late toll detection is now accurate - only tolls within exact trip windows will be detected');
        
    } catch (error) {
        console.error('❌ Error in cleanup script:', error);
    }
}

// Run cleanup if called directly
if (require.main === module) {
    cleanupIncorrectLateTolls().then(() => {
        console.log('🏁 Cleanup script completed');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Cleanup script failed:', error);
        process.exit(1);
    });
}

module.exports = cleanupIncorrectLateTolls;