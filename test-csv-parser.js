const TuroIntegrationService = require('./services/turo-integration');
const fs = require('fs');

// Read the test CSV file
const csvData = fs.readFileSync('./test-real-turo.csv', 'utf8');
console.log('Raw CSV data:');
console.log(csvData);
console.log('\n' + '='.repeat(50) + '\n');

// Create service instance and test parsing
const turoService = new TuroIntegrationService();

try {
    const trips = turoService.parseCSVData(csvData);
    console.log('✅ Successfully parsed trips:');
    console.log('Number of trips:', trips.length);
    console.log('Parsed trips:', JSON.stringify(trips, null, 2));
} catch (error) {
    console.error('❌ Error parsing CSV:', error);
}