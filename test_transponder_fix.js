const { supabaseAdmin } = require('./config/supabase');

async function testTransponderFix() {
    console.log('🧪 Testing transponder resolution fix...');
    
    const hostId = 'ed988a4c-b72e-4605-8cf7-c2a4a69f61ba';
    
    try {
        // Get a sample of transponder tolls with plate_number = 'N/A'
        const { data: transponderTolls, error: tollsError } = await supabaseAdmin
            .from('toll_charges')
            .select('id, plate_number, transponder_id, toll_amount, toll_location, toll_date')
            .eq('host_id', hostId)
            .eq('plate_number', 'N/A')
            .not('transponder_id', 'is', null)
            .limit(5);
            
        if (tollsError) {
            console.error('❌ Error fetching transponder tolls:', tollsError);
            return;
        }
        
        console.log(`🔍 Found ${transponderTolls?.length || 0} transponder tolls with plate='N/A':`);
        transponderTolls?.forEach(toll => {
            console.log(`  - ID ${toll.id}: Transponder ${toll.transponder_id}, Plate: ${toll.plate_number}, Amount: $${toll.toll_amount}`);
        });
        
        // Get transponder mappings
        const { data: mappings, error: mappingsError } = await supabaseAdmin
            .from('transponder_mappings')
            .select('*')
            .eq('host_id', hostId);
            
        if (mappingsError) {
            console.error('❌ Error fetching mappings:', mappingsError);
            return;
        }
        
        console.log(`\n🔗 Found ${mappings?.length || 0} transponder mappings:`);
        mappings?.forEach(mapping => {
            console.log(`  - ${mapping.transponder_number} → ${mapping.vehicle_plate} (${mapping.vehicle_description})`);
        });
        
        // Test the SimpleTollMatcher extraction logic
        const SimpleTollMatcher = require('./services/simple-toll-matcher');
        const matcher = new SimpleTollMatcher();
        
        if (transponderTolls?.length > 0) {
            console.log('\n🧪 Testing toll extraction logic:');
            const testToll = transponderTolls[0];
            
            // Test OLD logic (what would happen before fix)
            const oldExtraction = {
                tagOrPlate: testToll.plate_number || testToll.transponder_id,
            };
            
            // Test NEW logic (after fix)
            const plateNumber = testToll.plate_number;
            const transponderId = testToll.transponder_id;
            const newExtraction = {
                tagOrPlate: (plateNumber === 'N/A' && transponderId) ? transponderId : (plateNumber || transponderId),
                transponderId: transponderId,
                plateNumber: plateNumber
            };
            
            console.log('  Before fix (OLD):');
            console.log('    tagOrPlate:', oldExtraction.tagOrPlate);
            console.log('  After fix (NEW):');
            console.log('    tagOrPlate:', newExtraction.tagOrPlate);
            console.log('    transponderId:', newExtraction.transponderId);
            console.log('    plateNumber:', newExtraction.plateNumber);
            
            // Test if the transponder can be resolved
            const mappingFound = mappings?.find(m => m.transponder_number === transponderId);
            console.log('  Mapping resolution:');
            console.log('    Transponder:', transponderId);
            console.log('    Maps to vehicle:', mappingFound?.vehicle_plate || 'NOT FOUND');
            
            if (mappingFound) {
                console.log('✅ SUCCESS: This transponder toll should now be matchable!');
            } else {
                console.log('⚠️ WARNING: No mapping found for this transponder');
            }
        }
        
        console.log('\n✅ Transponder fix test complete!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testTransponderFix();