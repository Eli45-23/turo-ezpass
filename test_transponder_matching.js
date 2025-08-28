const { supabaseAdmin } = require('./config/supabase');
const EnhancedTollMatcher = require('./services/enhanced-toll-matcher');

async function testTransponderMatching() {
    console.log('🔧 Testing transponder matching functionality...');
    
    try {
        const hostId = 'ed988a4c-b72e-4605-8cf7-c2a4a69f61ba'; // Correct host with data
        
        // Step 1: Check current state
        console.log('\n🔍 Step 1: Current database state...');
        
        const { data: tolls } = await supabaseAdmin
            .from('toll_charges')
            .select('id, plate_number, transponder_id, toll_amount, toll_location')
            .eq('host_id', hostId)
            .limit(10);
            
        console.log(`📋 Sample tolls:`, tolls?.slice(0, 5).map(t => ({
            id: t.id,
            plate_number: t.plate_number,
            transponder_id: t.transponder_id,
            amount: t.toll_amount,
            location: t.toll_location
        })));
        
        const { data: mappings } = await supabaseAdmin
            .from('transponder_mappings')
            .select('*')
            .eq('host_id', hostId);
            
        console.log(`🔗 Transponder mappings:`, mappings?.map(m => ({
            transponder: m.transponder_number,
            plate: m.vehicle_plate,
            description: m.vehicle_description
        })));
        
        // Step 2: Create test tolls with transponder_id to verify matching works
        console.log('\n🧪 Step 2: Creating test toll with transponder_id...');
        
        const testTransponderToll = {
            host_id: hostId,
            toll_account_id: 88, // CSV Import toll account for this host
            transaction_id: 'TEST_TRANSPONDER_' + Date.now(),
            plate_number: null,
            transponder_id: '08600713745', // Should map to LLL1078
            toll_date: new Date().toISOString(),
            toll_location: 'TEST_BRIDGE',
            toll_amount: 5.50,
            is_matched: false
        };
        
        const { data: insertedToll, error: insertError } = await supabaseAdmin
            .from('toll_charges')
            .insert(testTransponderToll)
            .select()
            .single();
            
        if (insertError) {
            console.error('❌ Error creating test toll:', insertError);
            return;
        }
        
        console.log('✅ Created test toll:', {
            id: insertedToll.id,
            transponder_id: insertedToll.transponder_id,
            plate_number: insertedToll.plate_number,
            amount: insertedToll.toll_amount
        });
        
        // Step 3: Run the enhanced toll matcher
        console.log('\n🔄 Step 3: Running enhanced toll matcher...');
        
        const matcher = new EnhancedTollMatcher();
        const results = await matcher.enhancedAutoMatch(hostId, {
            processAllTolls: false, // Process unmatched tolls
            confidenceThreshold: 0.6
        });
        
        console.log('✅ Matching process completed!');
        console.log('📊 Results:', results);
        
        // Step 4: Check if the test toll was resolved
        console.log('\n🔍 Step 4: Verifying transponder resolution...');
        
        const { data: updatedToll } = await supabaseAdmin
            .from('toll_charges')
            .select('*')
            .eq('id', insertedToll.id)
            .single();
            
        console.log('📋 Test toll after matching:', {
            id: updatedToll.id,
            transponder_id: updatedToll.transponder_id,
            plate_number: updatedToll.plate_number,
            trip_id: updatedToll.trip_id,
            is_matched: updatedToll.is_matched
        });
        
        // Step 5: Clean up test toll
        await supabaseAdmin
            .from('toll_charges')
            .delete()
            .eq('id', insertedToll.id);
            
        console.log('🧹 Cleaned up test toll');
        
        console.log('\n🎉 Test complete!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testTransponderMatching();