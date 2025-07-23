/**
 * Toll-to-Trip Matching Script
 * 
 * Reads toll records from E-ZPass scraper and trip data from Turo scraper,
 * then matches toll records to trips based on overlapping timestamps.
 * 
 * @TuroTrip-Agent Implementation
 */

const fs = require('fs').promises;
const path = require('path');

class TollTripMatcher {
  constructor() {
    this.tollRecords = [];
    this.tripData = [];
    this.matches = [];
    this.unmatchedTolls = [];
    this.unmatchedTrips = [];
  }

  /**
   * Load toll records from E-ZPass scraper output
   */
  async loadTollRecords() {
    try {
      const tollFilePath = path.join(__dirname, 'scrapers', 'ezpass.json');
      console.log(`Loading toll records from: ${tollFilePath}`);
      
      const tollFileContent = await fs.readFile(tollFilePath, 'utf8');
      const tollData = JSON.parse(tollFileContent);
      
      this.tollRecords = tollData.records || [];
      console.log(`Loaded ${this.tollRecords.length} toll records`);
      
      return this.tollRecords;
    } catch (error) {
      console.error('Failed to load toll records:', error);
      
      // Create empty file if it doesn't exist
      if (error.code === 'ENOENT') {
        console.log('Creating empty toll records file...');
        const emptyData = {
          scrapeDate: new Date().toISOString(),
          dateRange: {
            start: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
            end: new Date().toISOString().split('T')[0]
          },
          totalRecords: 0,
          records: []
        };
        
        await fs.writeFile(
          path.join(__dirname, 'scrapers', 'ezpass.json'), 
          JSON.stringify(emptyData, null, 2)
        );
        
        this.tollRecords = [];
        return this.tollRecords;
      }
      
      throw error;
    }
  }

  /**
   * Load trip data from Turo scraper output
   */
  async loadTripData() {
    try {
      const tripFilePath = path.join(__dirname, 'scrapers', 'turo-trips.json');
      console.log(`Loading trip data from: ${tripFilePath}`);
      
      const tripFileContent = await fs.readFile(tripFilePath, 'utf8');
      const tripData = JSON.parse(tripFileContent);
      
      this.tripData = tripData.trips || [];
      console.log(`Loaded ${this.tripData.length} trips`);
      
      return this.tripData;
    } catch (error) {
      console.error('Failed to load trip data:', error);
      
      // Create empty file if it doesn't exist
      if (error.code === 'ENOENT') {
        console.log('Creating empty trip data file...');
        const emptyData = {
          scrapeDate: new Date().toISOString(),
          dateRange: {
            start: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
            end: new Date().toISOString().split('T')[0]
          },
          totalTrips: 0,
          trips: []
        };
        
        await fs.writeFile(
          path.join(__dirname, 'scrapers', 'turo-trips.json'), 
          JSON.stringify(emptyData, null, 2)
        );
        
        this.tripData = [];
        return this.tripData;
      }
      
      throw error;
    }
  }

  /**
   * Parse date string to Date object with error handling
   */
  parseDate(dateString) {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        // Try parsing different date formats
        const formats = [
          // MM/DD/YYYY
          /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
          // YYYY-MM-DD
          /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
          // DD-MM-YYYY
          /^(\d{1,2})-(\d{1,2})-(\d{4})$/
        ];
        
        for (const format of formats) {
          const match = dateString.match(format);
          if (match) {
            let year, month, day;
            
            if (format === formats[0]) { // MM/DD/YYYY
              [, month, day, year] = match;
            } else if (format === formats[1]) { // YYYY-MM-DD
              [, year, month, day] = match;
            } else if (format === formats[2]) { // DD-MM-YYYY
              [, day, month, year] = match;
            }
            
            const parsedDate = new Date(year, month - 1, day);
            if (!isNaN(parsedDate.getTime())) {
              return parsedDate;
            }
          }
        }
        
        return null;
      }
      
      return date;
    } catch (error) {
      console.warn(`Failed to parse date: ${dateString}`, error);
      return null;
    }
  }

  /**
   * Calculate time overlap between toll and trip
   */
  calculateTimeOverlap(tollDate, tripStartDate, tripEndDate) {
    try {
      const toll = this.parseDate(tollDate);
      const tripStart = this.parseDate(tripStartDate);
      const tripEnd = this.parseDate(tripEndDate);
      
      if (!toll) return 0;
      
      // If trip doesn't have valid dates, use a reasonable buffer
      if (!tripStart || !tripEnd) {
        if (tripStart) {
          // Only start date available - check if toll is within 48 hours of start
          const timeDiff = Math.abs(toll.getTime() - tripStart.getTime());
          const hoursDiff = timeDiff / (1000 * 60 * 60);
          return hoursDiff <= 48 ? 0.5 : 0; // Partial match
        }
        return 0;
      }
      
      // Check if toll date falls within trip duration
      if (toll >= tripStart && toll <= tripEnd) {
        return 1.0; // Perfect time match
      }
      
      // Check if toll is within reasonable buffer (24 hours before/after trip)
      const bufferHours = 24;
      const bufferMs = bufferHours * 60 * 60 * 1000;
      
      const tripStartWithBuffer = new Date(tripStart.getTime() - bufferMs);
      const tripEndWithBuffer = new Date(tripEnd.getTime() + bufferMs);
      
      if (toll >= tripStartWithBuffer && toll <= tripEndWithBuffer) {
        // Calculate proximity score (closer = higher score)
        const totalTripDuration = tripEnd.getTime() - tripStart.getTime();
        const bufferDuration = bufferMs * 2; // Before and after
        const totalWindow = totalTripDuration + bufferDuration;
        
        let distanceFromTrip;
        if (toll < tripStart) {
          distanceFromTrip = tripStart.getTime() - toll.getTime();
        } else if (toll > tripEnd) {
          distanceFromTrip = toll.getTime() - tripEnd.getTime();
        } else {
          distanceFromTrip = 0; // Within trip
        }
        
        // Score between 0.1 and 0.8 based on proximity
        const proximityScore = Math.max(0.1, 0.8 - (distanceFromTrip / bufferMs) * 0.7);
        return proximityScore;
      }
      
      return 0; // No time overlap
    } catch (error) {
      console.warn('Error calculating time overlap:', error);
      return 0;
    }
  }

  /**
   * Calculate location similarity between toll and trip
   */
  calculateLocationSimilarity(tollLocation, tripLocation) {
    try {
      if (!tollLocation || !tripLocation) return 0;
      
      const toll = tollLocation.toLowerCase().trim();
      const trip = tripLocation.toLowerCase().trim();
      
      // Exact match
      if (toll === trip) return 1.0;
      
      // Check if one location contains the other
      if (toll.includes(trip) || trip.includes(toll)) return 0.8;
      
      // Check for common location keywords
      const commonLocations = [
        'newark', 'jfk', 'laguardia', 'manhattan', 'brooklyn', 'queens',
        'bronx', 'holland tunnel', 'lincoln tunnel', 'george washington bridge',
        'brooklyn bridge', 'manhattan bridge', 'williamsburg bridge',
        'midtown tunnel', 'queensboro bridge'
      ];
      
      for (const location of commonLocations) {
        if (toll.includes(location) && trip.includes(location)) {
          return 0.6;
        }
      }
      
      // Basic word overlap
      const tollWords = toll.split(/\s+/);
      const tripWords = trip.split(/\s+/);
      const commonWords = tollWords.filter(word => 
        word.length > 2 && tripWords.includes(word)
      );
      
      if (commonWords.length > 0) {
        const overlapRatio = commonWords.length / Math.max(tollWords.length, tripWords.length);
        return Math.min(0.5, overlapRatio);
      }
      
      return 0;
    } catch (error) {
      console.warn('Error calculating location similarity:', error);
      return 0;
    }
  }

  /**
   * Calculate overall match confidence score
   */
  calculateMatchConfidence(timeOverlap, locationSimilarity, tollAmount) {
    try {
      // Weighted scoring
      const timeWeight = 0.7;      // Time is most important
      const locationWeight = 0.3;  // Location is secondary
      
      const baseScore = (timeOverlap * timeWeight) + (locationSimilarity * locationWeight);
      
      // Boost confidence for reasonable toll amounts
      let amountBoost = 0;
      if (tollAmount >= 5 && tollAmount <= 50) {
        amountBoost = 0.1; // Reasonable toll range
      } else if (tollAmount > 50) {
        amountBoost = -0.1; // Very high toll, reduce confidence
      }
      
      const finalScore = Math.max(0, Math.min(1, baseScore + amountBoost));
      
      return {
        score: finalScore,
        timeOverlap: timeOverlap,
        locationSimilarity: locationSimilarity,
        category: this.categorizeConfidence(finalScore)
      };
    } catch (error) {
      console.warn('Error calculating match confidence:', error);
      return {
        score: 0,
        timeOverlap: 0,
        locationSimilarity: 0,
        category: 'no_match'
      };
    }
  }

  /**
   * Categorize confidence score
   */
  categorizeConfidence(score) {
    if (score >= 0.8) return 'high';
    if (score >= 0.5) return 'medium';
    if (score >= 0.2) return 'low';
    return 'no_match';
  }

  /**
   * Match toll records to trips
   */
  async matchTollsToTrips() {
    try {
      console.log('Starting toll-to-trip matching...');
      
      this.matches = [];
      this.unmatchedTolls = [...this.tollRecords];
      this.unmatchedTrips = [...this.tripData];
      
      // For each toll record, find the best matching trip
      for (const toll of this.tollRecords) {
        let bestMatch = null;
        let bestConfidence = { score: 0 };
        
        for (const trip of this.tripData) {
          // Calculate time overlap
          const timeOverlap = this.calculateTimeOverlap(
            toll.date, 
            trip.dates.start, 
            trip.dates.end
          );
          
          // Skip if no time overlap
          if (timeOverlap === 0) continue;
          
          // Calculate location similarity
          const locationSimilarity = this.calculateLocationSimilarity(
            toll.location, 
            trip.location
          );
          
          // Calculate overall confidence
          const confidence = this.calculateMatchConfidence(
            timeOverlap, 
            locationSimilarity, 
            toll.amount
          );
          
          // Update best match if this is better
          if (confidence.score > bestConfidence.score) {
            bestMatch = trip;
            bestConfidence = confidence;
          }
        }
        
        // Only create match if confidence is above minimum threshold
        if (bestMatch && bestConfidence.score >= 0.2) {
          const match = {
            tripId: bestMatch.tripId,
            tollId: toll.id,
            amount: toll.amount,
            screenshotPath: toll.screenshotPath || null,
            screenshotFilename: toll.screenshotFilename || null,
            confidence: bestConfidence,
            toll: {
              id: toll.id,
              date: toll.date,
              time: toll.time,
              location: toll.location,
              amount: toll.amount,
              description: toll.description
            },
            trip: {
              tripId: bestMatch.tripId,
              status: bestMatch.status,
              guestName: bestMatch.guest.name,
              vehicleName: bestMatch.vehicle.name,
              startDate: bestMatch.dates.start,
              endDate: bestMatch.dates.end,
              location: bestMatch.location,
              amount: bestMatch.amount
            },
            matchedAt: new Date().toISOString()
          };
          
          this.matches.push(match);
          
          // Remove from unmatched lists
          this.unmatchedTolls = this.unmatchedTolls.filter(t => t.id !== toll.id);
          this.unmatchedTrips = this.unmatchedTrips.filter(t => t.tripId !== bestMatch.tripId);
          
          console.log(`Matched toll ${toll.id} to trip ${bestMatch.tripId} (confidence: ${bestConfidence.category})`);
        }
      }
      
      console.log(`Matching completed:`);
      console.log(`- Total matches: ${this.matches.length}`);
      console.log(`- High confidence: ${this.matches.filter(m => m.confidence.category === 'high').length}`);
      console.log(`- Medium confidence: ${this.matches.filter(m => m.confidence.category === 'medium').length}`);
      console.log(`- Low confidence: ${this.matches.filter(m => m.confidence.category === 'low').length}`);
      console.log(`- Unmatched tolls: ${this.unmatchedTolls.length}`);
      console.log(`- Unmatched trips: ${this.unmatchedTrips.length}`);
      
      return this.matches;
    } catch (error) {
      console.error('Failed to match tolls to trips:', error);
      throw error;
    }
  }

  /**
   * Save matches to JSON file
   */
  async saveMatches() {
    try {
      const outputPath = path.join(__dirname, 'matches.json');
      
      const outputData = {
        matchedAt: new Date().toISOString(),
        summary: {
          totalMatches: this.matches.length,
          highConfidenceMatches: this.matches.filter(m => m.confidence.category === 'high').length,
          mediumConfidenceMatches: this.matches.filter(m => m.confidence.category === 'medium').length,
          lowConfidenceMatches: this.matches.filter(m => m.confidence.category === 'low').length,
          unmatchedTolls: this.unmatchedTolls.length,
          unmatchedTrips: this.unmatchedTrips.length,
          totalTollAmount: this.matches.reduce((sum, match) => sum + match.amount, 0)
        },
        matches: this.matches,
        unmatchedTolls: this.unmatchedTolls.map(toll => ({
          id: toll.id,
          date: toll.date,
          location: toll.location,
          amount: toll.amount,
          reason: 'No matching trip found within time/location criteria'
        })),
        unmatchedTrips: this.unmatchedTrips.map(trip => ({
          tripId: trip.tripId,
          startDate: trip.dates.start,
          endDate: trip.dates.end,
          location: trip.location,
          reason: 'No matching tolls found for this trip'
        }))
      };

      await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
      
      console.log(`Matches saved to: ${outputPath}`);
      console.log(`Total matches: ${this.matches.length}`);
      console.log(`Total toll amount: $${outputData.summary.totalTollAmount.toFixed(2)}`);
      
      return outputPath;
    } catch (error) {
      console.error('Failed to save matches:', error);
      throw error;
    }
  }

  /**
   * Generate match report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        tollRecordsProcessed: this.tollRecords.length,
        tripsProcessed: this.tripData.length,
        totalMatches: this.matches.length,
        matchRate: this.tollRecords.length > 0 ? 
          (this.matches.length / this.tollRecords.length * 100).toFixed(1) + '%' : '0%'
      },
      confidenceBreakdown: {
        high: this.matches.filter(m => m.confidence.category === 'high').length,
        medium: this.matches.filter(m => m.confidence.category === 'medium').length,
        low: this.matches.filter(m => m.confidence.category === 'low').length
      },
      recommendations: []
    };

    // Add recommendations based on results
    if (this.unmatchedTolls.length > 0) {
      report.recommendations.push(
        `${this.unmatchedTolls.length} tolls could not be matched. Consider expanding the time window or improving location matching.`
      );
    }

    if (this.matches.filter(m => m.confidence.category === 'low').length > 0) {
      report.recommendations.push(
        'Some matches have low confidence. Manual review recommended before submitting claims.'
      );
    }

    if (this.matches.length === 0 && this.tollRecords.length > 0) {
      report.recommendations.push(
        'No matches found. Check that trip data covers the same time period as toll records.'
      );
    }

    return report;
  }

  /**
   * Main matching process
   */
  async process() {
    try {
      console.log('Starting toll-trip matching process...');
      
      // Load data
      await this.loadTollRecords();
      await this.loadTripData();
      
      // Perform matching
      await this.matchTollsToTrips();
      
      // Save results
      const outputPath = await this.saveMatches();
      
      // Generate report
      const report = this.generateReport();
      
      console.log('\n=== MATCHING REPORT ===');
      console.log(JSON.stringify(report, null, 2));
      
      console.log('\n=== PROCESS COMPLETED ===');
      console.log(`Results saved to: ${outputPath}`);
      
      return {
        success: true,
        matches: this.matches,
        report: report,
        outputPath: outputPath
      };
      
    } catch (error) {
      console.error('Matching process failed:', error);
      throw error;
    }
  }
}

// Export for use as module
module.exports = TollTripMatcher;

// Run if called directly
if (require.main === module) {
  const matcher = new TollTripMatcher();
  
  matcher.process()
    .then(result => {
      console.log('Matching completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Matching failed:', error);
      process.exit(1);
    });
}