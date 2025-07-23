# Turo EZPass Scrapers

Playwright-based automation scripts for extracting toll data from E-ZPass NY portal and trip data from Turo host dashboard, with intelligent toll-to-trip matching.

## Overview

This package contains four main components:

1. **E-ZPass Scraper** (`scrapers/ezpass.js`) - Extracts toll records from E-ZPass NY portal
2. **Turo Scraper** (`scrapers/turo.js`) - Extracts trip data from Turo host dashboard  
3. **Matching Engine** (`match.js`) - Matches toll records to trips based on time and location
4. **TuroBot** (`turobot.js`) - Automated toll reimbursement submission system

## Prerequisites

- Node.js 18+ 
- AWS credentials configured for Secrets Manager access
- E-ZPass NY account credentials stored in AWS Secrets Manager
- Turo host account credentials stored in AWS Secrets Manager

## Installation

```bash
cd app/scripts
npm install
npm run install-browsers
```

## Configuration

### AWS Secrets Manager Setup

Store credentials in AWS Secrets Manager:

**E-ZPass Credentials** (`turo-ezpass/ezpass/credentials`):
```json
{
  "username": "your_ezpass_username",
  "password": "your_ezpass_password", 
  "state": "ny"
}
```

**Turo Credentials** (`turo-ezpass/turo/credentials`):
```json
{
  "email": "your_turo_email",
  "password": "your_turo_password"
}
```

### Environment Variables

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Secret Names (optional - defaults shown)
EZPASS_CREDENTIALS_SECRET_NAME=turo-ezpass/ezpass/credentials
TURO_CREDENTIALS_SECRET_NAME=turo-ezpass/turo/credentials

# Environment
NODE_ENV=production  # Set to 'development' for non-headless mode
```

## Usage

### Run Individual Scrapers

```bash
# Scrape E-ZPass toll data (last 7 days)
npm run scrape-ezpass

# Scrape Turo trip data (last 7 days)
npm run scrape-turo

# Scrape Turo with specific vehicle filter
node scrapers/turo.js VEHICLE_ID_123
```

### Run Complete Process

```bash
# Run all scrapers and matching in sequence
npm run scrape-all

# Submit matched tolls to Turo (automated reimbursement)
npm run submit

# Complete end-to-end automation (scrape + match + submit)
npm run full-automation

# Or run individually
npm run scrape-ezpass
npm run scrape-turo
npm run match
npm run submit
```

### TuroBot Automated Submission

```bash
# Submit all high/medium confidence matches automatically
npm run submit

# Run in development mode (non-headless browser)
NODE_ENV=development npm run submit
```

## Output Files

### E-ZPass Scraper Output (`scrapers/ezpass.json`)

```json
{
  "scrapeDate": "2025-01-23T10:30:00.000Z",
  "dateRange": {
    "start": "2025-01-16",
    "end": "2025-01-23"
  },
  "totalRecords": 3,
  "records": [
    {
      "id": "TXN123456789",
      "date": "2025-01-20",
      "time": "14:30:22",
      "location": "Holland Tunnel",
      "amount": 16.00,
      "description": "Toll Transaction",
      "screenshotPath": "/path/to/screenshot.png",
      "screenshotFilename": "ezpass_toll_TXN123456789_1642683000000.png"
    }
  ]
}
```

### Turo Scraper Output (`scrapers/turo-trips.json`)

```json
{
  "scrapeDate": "2025-01-23T10:30:00.000Z",
  "dateRange": {
    "start": "2025-01-16", 
    "end": "2025-01-23"
  },
  "totalTrips": 2,
  "trips": [
    {
      "tripId": "TRIP123456789",
      "status": "completed",
      "guest": {
        "name": "John Doe"
      },
      "vehicle": {
        "name": "Tesla Model 3"
      },
      "dates": {
        "start": "2025-01-20T10:00:00.000Z",
        "end": "2025-01-20T18:00:00.000Z"
      },
      "location": "Newark Airport",
      "amount": 175.50
    }
  ]
}
```

### Matching Output (`matches.json`)

```json
{
  "matchedAt": "2025-01-23T10:30:00.000Z",
  "summary": {
    "totalMatches": 1,
    "highConfidenceMatches": 1,
    "mediumConfidenceMatches": 0,
    "lowConfidenceMatches": 0,
    "unmatchedTolls": 0,
    "unmatchedTrips": 1,
    "totalTollAmount": 16.00
  },
  "matches": [
    {
      "tripId": "TRIP123456789",
      "tollId": "TXN123456789", 
      "amount": 16.00,
      "screenshotPath": "/path/to/screenshot.png",
      "confidence": {
        "score": 0.9,
        "timeOverlap": 1.0,
        "locationSimilarity": 0.8,
        "category": "high"
      },
      "toll": { /* toll details */ },
      "trip": { /* trip details */ }
    }
  ]
}
```

### TuroBot Submission Report (`submission-report.json`)

```json
{
  "submissionDate": "2025-01-23T12:30:00.000Z",
  "summary": {
    "totalMatches": 3,
    "successfulSubmissions": 2,
    "failedSubmissions": 1,
    "totalAmount": 32.00,
    "averageProcessingTime": 15234
  },
  "submissions": [
    {
      "tripId": "TRIP123456789",
      "tollId": "TXN123456789",
      "amount": 16.00,
      "status": "success",
      "message": "Reimbursement request submitted successfully",
      "confirmationId": "REQ123456",
      "uploadSuccess": true,
      "confidence": "high",
      "processingTime": 12500,
      "timestamp": "2025-01-23T12:30:15.000Z"
    }
  ],
  "configuration": {
    "requestDelay": 3000,
    "submissionDelay": 5000,
    "maxRetries": 3
  }
}
```

## Screenshots

E-ZPass scraper automatically captures screenshots for each toll record and saves them to `scrapers/screenshots/` directory. Screenshot filenames include the toll transaction ID and timestamp for easy identification.

## Matching Algorithm

The matching engine uses a sophisticated scoring system:

### Time Overlap Scoring
- **1.0**: Toll occurs during trip duration
- **0.1-0.8**: Toll occurs within 24-hour buffer (proximity-based scoring)
- **0.5**: Partial match (limited date information)
- **0.0**: No time correlation

### Location Similarity Scoring  
- **1.0**: Exact location match
- **0.8**: One location contains the other
- **0.6**: Common location keywords (airports, bridges, tunnels)
- **0.1-0.5**: Word overlap similarity
- **0.0**: No location correlation

### Confidence Categories
- **High (≥0.8)**: Strong time and location correlation
- **Medium (≥0.5)**: Good correlation with minor gaps
- **Low (≥0.2)**: Weak correlation, manual review recommended
- **No Match (<0.2)**: Insufficient correlation

## Error Handling

### Robust Retry Logic
- Automatic retry with exponential backoff
- Screenshot capture on errors for debugging
- Graceful degradation when selectors change

### Fallback Mechanisms
- Environment variable credentials as backup
- Multiple selector strategies for form elements
- Client-side date filtering as backup

### Monitoring & Logging
- Detailed console logging for troubleshooting
- Screenshot capture for manual verification
- Error screenshots for debugging failures

## Security Considerations

### Credential Management
- All credentials stored in AWS Secrets Manager
- No credentials in source code or environment files
- Automatic credential rotation support

### Anti-Detection Measures
- Realistic browser fingerprinting
- Human-like interaction delays
- Stealth mode configuration
- User agent rotation

### Rate Limiting
- Respectful request timing (2-3 second delays)
- Session duration limits
- Daily usage restrictions

## Troubleshooting

### Common Issues

**Login Failures**:
- Verify credentials in Secrets Manager
- Check for CAPTCHA requirements
- Review error screenshots in `scrapers/screenshots/`

**No Data Extracted**:
- Verify date range filters
- Check website structure changes
- Review selector matching logic

**Matching Issues**:
- Verify date formats in source data
- Check location name variations
- Adjust confidence thresholds if needed

### Debug Mode

Run in development mode for debugging:
```bash
NODE_ENV=development npm run scrape-ezpass
```

This will:
- Show browser window (non-headless)
- Enable detailed logging
- Preserve intermediate screenshots

## Legal Compliance

⚠️ **Important**: This tool automates access to financial and personal data. Ensure compliance with:

- Website Terms of Service
- Data protection regulations (GDPR, CCPA)
- Financial data handling requirements
- User consent and authorization

Always obtain explicit user permission before automating access to their accounts.

## Support

For issues or questions:
1. Check error screenshots in `scrapers/screenshots/`
2. Review console logs for detailed error information
3. Verify AWS credentials and Secrets Manager access
4. Ensure website structures haven't changed