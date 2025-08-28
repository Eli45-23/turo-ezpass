const { supabaseAdmin } = require('./config/supabase');

async function fixMissingTransponderIds() {
    console.log('🔧 Analyzing and fixing missing transponder IDs...');
    
    try {
        const hostId = 'ed988a4c-b72e-4605-8cf7-c2a4a69f61ba'; // Host with data
        
        // Step 1: Get transponder mappings
        console.log('\n🔍 Step 1: Loading transponder mappings...');
        
        const { data: mappings, error: mappingsError } = await supabaseAdmin
            .from('transponder_mappings')
            .select('*')
            .eq('host_id', hostId);
            
        if (mappingsError) {
            console.error('❌ Error loading transponder mappings:', mappingsError);
            return;
        }
        
        console.log(`📋 Found ${mappings.length} transponder mappings:`);
        mappings.forEach(m => {
            console.log(`  - ${m.transponder_number} → ${m.vehicle_plate} (${m.vehicle_description})`);
        });
        
        // Step 2: Find tolls with plate_number "N/A" and null transponder_id
        console.log('\n🔍 Step 2: Finding tolls with missing transponder data...');
        
        const { data: naTolls, error: tollsError } = await supabaseAdmin
            .from('toll_charges')
            .select('id, plate_number, transponder_id, toll_date, toll_location, toll_amount')
            .eq('host_id', hostId)
            .eq('plate_number', 'N/A')
            .is('transponder_id', null)
            .limit(10);
            
        if (tollsError) {
            console.error('❌ Error loading N/A tolls:', tollsError);
            return;
        }
        
        console.log(`📋 Found ${naTolls.length} tolls with plate_number='N/A' and null transponder_id (showing first 10):`);
        naTolls.forEach(toll => {
            console.log(`  - ID ${toll.id}: $${toll.toll_amount} at ${toll.toll_location} on ${toll.toll_date.substring(0, 10)}`);
        });
        
        // Step 3: Analysis - check if there are patterns that could indicate which transponder was used
        console.log('\n🔍 Step 3: Analyzing toll patterns...');
        
        // Get tolls by date and amount to see if there are patterns
        const { data: allTolls } = await supabaseAdmin
            .from('toll_charges')
            .select('id, plate_number, transponder_id, toll_date, toll_location, toll_amount, trip_id')
            .eq('host_id', hostId)
            .order('toll_date', { ascending: true });
            
        console.log(`📊 Total tolls in database: ${allTolls.length}`);
        
        const tollsByPlate = {};
        const tollsByDate = {};
        
        allTolls.forEach(toll => {
            const plate = toll.plate_number || 'N/A';
            const date = toll.toll_date.substring(0, 10);
            
            if (!tollsByPlate[plate]) tollsByPlate[plate] = [];
            if (!tollsByDate[date]) tollsByDate[date] = [];
            
            tollsByPlate[plate].push(toll);
            tollsByDate[date].push(toll);
        });
        
        console.log('📊 Tolls by plate:');
        Object.keys(tollsByPlate).forEach(plate => {
            const count = tollsByPlate[plate].length;
            const totalAmount = tollsByPlate[plate].reduce((sum, t) => sum + parseFloat(t.toll_amount), 0);
            console.log(`  - ${plate}: ${count} tolls, $${totalAmount.toFixed(2)} total`);
        });
        
        // Step 4: Look for days with mixed plate data that could indicate transponder usage
        console.log('\n🔍 Step 4: Looking for days with mixed toll data...');
        
        let potentialTransponderDays = 0;
        Object.keys(tollsByDate).forEach(date => {
            const dayTolls = tollsByDate[date];
            const plates = [...new Set(dayTolls.map(t => t.plate_number))];
            
            if (plates.includes('N/A') && plates.length > 1) {
                potentialTransponderDays++;
                const naCount = dayTolls.filter(t => t.plate_number === 'N/A').length;
                const plateCount = dayTolls.filter(t => t.plate_number !== 'N/A').length;
                console.log(`  - ${date}: ${naCount} N/A tolls, ${plateCount} plate tolls (${plates.filter(p => p !== 'N/A').join(', ')})`);
            }
        });
        
        console.log(`📊 Found ${potentialTransponderDays} days with mixed N/A and plate tolls`);
        
        // Step 5: Recommendations
        console.log('\n💡 Recommendations:');
        console.log('1. The CSV import fix is now in place for future uploads');
        console.log('2. Existing N/A tolls likely represent transponder-only transactions');
        console.log('3. Without the original CSV data, we cannot determine which transponder was used');
        console.log('4. Consider re-uploading the original CSV file to populate transponder_id fields');
        console.log('5. Once transponder_id fields are populated, run the toll matcher again');
        
        console.log('\n✅ Analysis complete!');
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
}

// Run the analysis
fixMissingTransponderIds();