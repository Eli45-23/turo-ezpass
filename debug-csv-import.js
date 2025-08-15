const TuroIntegrationService = require('./services/turo-integration');

async function debugCSVImport() {
    const turoService = new TuroIntegrationService();
    
    // Test with minimal CSV data
    const testCSV = `Guest First Name,Guest Last Name,Reservation ID,Trip Start,Trip End,Vehicle,Trip Status
John,Doe,TEST123,2025-08-01 10:00:00,2025-08-02 10:00:00,2024 Honda Civic (NY #ABC123),completed`;
    
    try {
        console.log('🧪 Testing CSV import...');
        const result = await turoService.importFromCSV(testCSV, 1);
        
        console.log('📊 Import result:', result);
        console.log('📊 Result type:', typeof result);
        console.log('📊 Is array?', Array.isArray(result));
        
        if (result && typeof result === 'object') {
            console.log('📊 Result keys:', Object.keys(result));
            
            if (result.results) {
                console.log('📊 Results array?', Array.isArray(result.results));
                console.log('📊 Results length:', result.results?.length);
                
                // Test the filter operation
                try {
                    const successfulImports = result.results.filter(r => r.changes > 0);
                    console.log('✅ Filter worked! Successful imports:', successfulImports.length);
                } catch (filterError) {
                    console.error('❌ Filter failed:', filterError.message);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Import failed:', error);
    }
}

debugCSVImport();