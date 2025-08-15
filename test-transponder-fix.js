// Test transponder ID fix
function testTransponderFix() {
    const testValues = [
        '8600713745',  // Missing leading zero
        '08600713745', // Already has leading zero
        '8600713746',  // Missing leading zero
        '8600713744',  // Missing leading zero
        'NY LLL1078'   // License plate format
    ];
    
    testValues.forEach(tagPlateField => {
        let result = {
            transponderId: null,
            plateNumber: null,
            processed: false
        };
        
        // Test the exact logic from dashboard.js
        if (tagPlateField.match(/^[A-Z]{2,3}\s+[A-Z0-9]+$/)) {
            // Format: "NY LLL1078" - extract plate
            result.plateNumber = tagPlateField.replace(/^(NY|NJ|CT|PA|MA|FL)\s*/, '').trim().toUpperCase();
            result.transponderId = null;
            result.processed = 'plate';
        } else if (tagPlateField.match(/^\d{10,11}$/)) {
            // Format: "08600713744" or "8600713744" - transponder ID only
            // Add leading zero if missing (EZ-Pass sometimes drops it)
            result.transponderId = tagPlateField.length === 10 ? '0' + tagPlateField : tagPlateField;
            result.plateNumber = null;
            result.processed = 'transponder';
        } else if (tagPlateField.length > 0) {
            // Try to extract plate from mixed format
            result.plateNumber = tagPlateField.replace(/^(NY|NJ|CT|PA|MA|FL)\s*/, '').trim().toUpperCase();
            result.transponderId = null;
            result.processed = 'mixed';
        } else {
            // No data
            result.plateNumber = null;
            result.transponderId = null;
            result.processed = 'empty';
        }
        
        console.log(`Input: "${tagPlateField}" → Type: ${result.processed}, Plate: ${result.plateNumber}, Transponder: ${result.transponderId}`);
    });
    
    // Test transponder mapping
    const transponderMapping = {
        '08600713745': 'LLL1078',
        '08600713746': 'LPJ3806',
        '08600713744': 'LGM9054'
    };
    
    console.log('\nTesting transponder lookups:');
    ['08600713745', '8600713745', '08600713746', '8600713746'].forEach(id => {
        const processedId = id.length === 10 ? '0' + id : id;
        const plate = transponderMapping[processedId] || null;
        console.log(`Transponder "${id}" → Processed: "${processedId}" → Plate: ${plate}`);
    });
}

testTransponderFix();