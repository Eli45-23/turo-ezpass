const { supabaseAdmin } = require('../config/supabase');

/**
 * Simple Toll Matcher
 * Following user's exact specification for 95-100% match rate
 * 
 * Logic:
 * 1. Extract trip data: ID, Guest, Vehicle, Start, End
 * 2. Extract toll data: Txn ID, Tag/Plate, Date, Time, Amount  
 * 3. Use transponder mappings to resolve Tag IDs to plates
 * 4. Match tolls within trip time windows for known vehicles only
 */
class SimpleTollMatcher {
    
    /**
     * Main matching function - follows user's 4-step process exactly
     */
    async matchTollsToTrips(hostId, trips, tolls, progressCallback = () => {}) {
        console.log('🎯 Starting Simple Toll Matching (User Spec)');
        console.log('🔍 DEBUG: matchTollsToTrips called with:');
        console.log('  - hostId:', hostId);
        console.log('  - trips type:', typeof trips, 'isArray:', Array.isArray(trips));
        console.log('  - tolls type:', typeof tolls, 'isArray:', Array.isArray(tolls));
        console.log('  - trips count:', trips?.length || 0);
        console.log('  - tolls count:', tolls?.length || 0);
        
        if (trips?.length > 0) {
            console.log('  - Sample trip data:', {
                id: trips[0].id || trips[0].turoTripId,
                vehicle: trips[0].vehicle_plate || trips[0].vehiclePlate,
                start: trips[0].start_date || trips[0].startDate,
                end: trips[0].end_date || trips[0].endDate,
                guest: trips[0].renter_name || trips[0].guest
            });
        }
        
        if (tolls?.length > 0) {
            console.log('  - Sample toll data:', {
                id: tolls[0].laneId || tolls[0].transaction_id,
                amount: tolls[0].amount || tolls[0].toll_amount,
                date: tolls[0].transactionDate || tolls[0].toll_date,
                plate: tolls[0].plateNumber || tolls[0].plate_number,
                transponder: tolls[0].transponderId || tolls[0].transponder_id
            });
        }
        
        console.log(`📊 Processing ${trips?.length || 0} trips and ${tolls?.length || 0} tolls`);
        
        // PRE-PROCESSING FILTER: Remove any cancelled trips before any processing
        const originalTripCount = trips?.length || 0;
        const filteredTrips = trips.filter(trip => {
            // Check multiple possible status field names
            const status = trip.status || trip.trip_status || trip.tripStatus || '';
            const statusLower = status.toString().toLowerCase();
            const isCancelled = statusLower.includes('cancel') || statusLower.includes('decline') || 
                              statusLower.includes('expired') || statusLower.includes('terminated') || 
                              statusLower.includes('rejected');
            
            if (isCancelled) {
                console.log('🚫 PRE-FILTER: Removing cancelled trip before processing:', {
                    id: trip.turoTripId || trip.reservationId || trip.id,
                    status: status,
                    guest: trip.guest || trip.renter_name
                });
                return false;
            }
            return true;
        });
        
        if (originalTripCount !== filteredTrips.length) {
            console.log(`🛡️ Pre-filtering removed ${originalTripCount - filteredTrips.length} cancelled trips. Processing ${filteredTrips.length} active trips.`);
        }
        
        // Early exit if no data to process
        if (!filteredTrips || filteredTrips.length === 0) {
            console.log('❌ EARLY EXIT: No trips to process after filtering');
            return {
                matches: [],
                unmatchedTolls: tolls || [],
                matchedCount: 0,
                totalCharges: tolls?.length || 0,
                averageConfidence: 0,
                details: { noTripsAfterFiltering: true }
            };
        }
        
        if (!tolls || tolls.length === 0) {
            console.log('❌ EARLY EXIT: No tolls to process');
            return {
                matches: [],
                unmatchedTolls: [],
                matchedCount: 0,
                totalCharges: 0,
                averageConfidence: 0,
                details: { noTollsProvided: true }
            };
        }
        
        progressCallback({
            step: 'initializing',
            message: 'Starting simple toll matching...',
            progress: 5
        });
        
        // Step 1: Extract and normalize trip data
        const tripData = this.extractTripData(filteredTrips);
        console.log(`✅ Step 1: Extracted ${tripData.length} trip records`);
        if (tripData.length > 0) {
            console.log('🔍 Sample extracted trip:', tripData[0]);
        }
        
        // Step 2: Extract and normalize toll data  
        const tollData = this.extractTollData(tolls);
        console.log(`✅ Step 2: Extracted ${tollData.length} toll records`);
        if (tollData.length > 0) {
            console.log('🔍 Sample extracted toll:', tollData[0]);
        }
        
        // Step 3: Load transponder mappings for known vehicles
        const transponderMappings = await this.loadTransponderMappings(hostId);
        console.log(`✅ Step 3: Loaded ${transponderMappings.size} transponder mappings`);
        console.log('🔍 DEBUG: Available transponder mappings:', Array.from(transponderMappings.entries()));
        
        // Early exit if no transponder mappings
        if (transponderMappings.size === 0) {
            console.log('⚠️ WARNING: No transponder mappings found! This will prevent matching.');
            console.log('📝 To fix: Add vehicle/transponder mappings in the Transponders section');
        }
        
        progressCallback({
            step: 'matching',
            message: 'Matching tolls to trips...',
            progress: 20
        });
        
        // Step 4: Match tolls to trips using time windows and vehicle identity
        const matches = this.performMatching(tripData, tollData, transponderMappings, progressCallback);
        
        console.log(`✅ Step 4: Found ${matches.length} toll-to-trip matches`);
        
        // Analyze personal driving tolls for debugging
        this.analyzePersonalDrivingTolls(tollData, matches, transponderMappings);
        
        // Apply matches to database
        const appliedCount = await this.applyMatches(matches);
        
        progressCallback({
            step: 'completed',
            message: `Simple matching complete: ${appliedCount} tolls matched`,
            progress: 100
        });
        
        return {
            totalTolls: tollData.length,
            matchedCount: appliedCount,
            personalDrivingCount: tollData.length - appliedCount,
            accuracy: ((appliedCount / tollData.length) * 100).toFixed(1)
        };
    }
    
    /**
     * Step 1: Extract useful trip data from CSV
     * Fields: Reservation ID, Guest, Vehicle, Vehicle name, Trip start, Trip end
     */
    extractTripData(trips) {
        console.log('🔍 DEBUG: extractTripData called with:', typeof trips, Array.isArray(trips) ? trips.length : 'not array');
        console.log('🔍 DEBUG: trips parameter:', trips);
        
        if (!trips || !Array.isArray(trips)) {
            console.log('❌ DEBUG: trips is not an array!', trips);
            return [];
        }
        
        console.log('🔍 DEBUG: Raw trips data received:', trips.length > 0 ? {
            sampleTrip: trips[0],
            totalTrips: trips.length,
            sampleFields: Object.keys(trips[0] || {})
        } : 'No trips');
        
        const extracted = trips.map((trip, index) => {
            const extracted = {
                reservationId: trip.turo_trip_id || trip.turoTripId || trip.reservationId,
                guest: trip.renter_name || trip.guest,
                vehicle: trip.vehicle_plate || trip.vehiclePlate,
                vehicleName: trip.vehicleName || trip.vehicle || '',
                tripStart: this.parseDate(trip.start_date || trip.startDate),
                tripEnd: this.parseDate(trip.end_date || trip.endDate),
                originalTrip: trip // Keep reference for database updates
            };
            
            if (index === 0) {
                console.log('🔍 DEBUG: First trip extraction:', {
                    input: trip,
                    extracted: extracted,
                    tripStartValid: !isNaN(extracted.tripStart),
                    tripEndValid: !isNaN(extracted.tripEnd)
                });
            }
            
            return extracted;
        }).filter(trip => {
            // Only include completed trips with valid dates and plates
            const valid = trip.vehicle && trip.tripStart && trip.tripEnd && !isNaN(trip.tripStart) && !isNaN(trip.tripEnd);
            if (!valid && trip.vehicle) {
                console.log('⚠️ Filtering out invalid trip:', {
                    vehicle: trip.vehicle,
                    tripStart: trip.tripStart,
                    tripEnd: trip.tripEnd,
                    startValid: !isNaN(trip.tripStart),
                    endValid: !isNaN(trip.tripEnd)
                });
            }
            
            // STRICT FILTER: Reject any cancelled trips (defense in depth - should already be filtered)
            if (trip.originalTrip && trip.originalTrip.status) {
                const tripStatus = trip.originalTrip.status.toLowerCase();
                const isCancelled = tripStatus.includes('cancel') || tripStatus.includes('decline') || 
                                  tripStatus.includes('expired') || tripStatus.includes('terminated') || 
                                  tripStatus.includes('rejected');
                if (isCancelled) {
                    console.log('🚫 CRITICAL: Cancelled trip found in extractTripData - should have been pre-filtered:', {
                        reservationId: trip.reservationId,
                        status: trip.originalTrip.status,
                        vehicle: trip.vehicle
                    });
                    // STRICT rejection - don't even process validity
                    return false;
                }
            }
            
            return valid;
        });
        
        console.log(`📊 Trip extraction result: ${extracted.length}/${trips.length} trips valid`);
        return extracted;
    }
    
    /**
     * Step 2: Extract toll data from CSV
     * Fields: Lane Txn ID, Tag/Plate #, Posted Date, Agency, Entry Plaza, Exit Plaza, Class, Date, Time, Amount
     */
    extractTollData(tolls) {
        console.log('🔍 DEBUG: extractTollData called with:', typeof tolls, Array.isArray(tolls) ? tolls.length : 'not array');
        console.log('🔍 DEBUG: tolls parameter:', tolls);
        
        if (!tolls || !Array.isArray(tolls)) {
            console.log('❌ DEBUG: tolls is not an array!', tolls);
            return [];
        }
        
        console.log('🔍 DEBUG: Raw tolls data received:', tolls.length > 0 ? {
            sampleToll: tolls[0],
            totalTolls: tolls.length,
            sampleFields: Object.keys(tolls[0] || {})
        } : 'No tolls');
        
        const extracted = tolls.map((toll, index) => {
            const extracted = {
                laneTransactionId: toll.transaction_id || toll.laneId || toll.transactionId || toll.id,
                tagOrPlate: toll.plate_number || toll.plateNumber || toll.transponder_id || toll.transponderId,
                postedDate: toll.posted_date ? new Date(toll.posted_date) : (toll.postedDate ? new Date(toll.postedDate) : null),
                agency: toll.agency || '',
                entryPlaza: toll.entry_plaza || toll.entryPlaza || '',
                exitPlaza: toll.exit_plaza || toll.exitPlaza || '',
                tollLocation: toll.toll_location || toll.location || '',
                tollClass: toll.toll_class || toll.class || '',
                tollDate: this.parseDate(toll.charge_date || toll.toll_date || toll.transactionDate || toll.date),
                tollTime: this.extractTime(toll),
                amount: Math.abs(parseFloat(toll.toll_amount || toll.amount)) || 0,
                originalToll: toll // Keep reference for database updates
            };
            
            if (index === 0) {
                console.log('🔍 DEBUG: First toll extraction:', {
                    input: toll,
                    extracted: extracted,
                    tollDateValid: !isNaN(extracted.tollDate),
                    hasPlateOrTransponder: !!extracted.tagOrPlate,
                    hasAmount: extracted.amount > 0
                });
            }
            
            return extracted;
        }).filter(toll => {
            // Only include tolls with valid dates, amounts, and tag/plate data
            const valid = toll.tagOrPlate && toll.tollDate && toll.amount > 0 && !isNaN(toll.tollDate);
            if (!valid && toll.amount > 0) {
                console.log('⚠️ Filtering out invalid toll:', {
                    tagOrPlate: toll.tagOrPlate,
                    tollDate: toll.tollDate,
                    amount: toll.amount,
                    dateValid: !isNaN(toll.tollDate)
                });
            }
            return valid;
        });
        
        console.log(`📊 Toll extraction result: ${extracted.length}/${tolls.length} tolls valid`);
        return extracted;
    }
    
    /**
     * Parse date - handles Unix timestamps (milliseconds), Unix timestamps (seconds), and ISO strings
     */
    parseDate(dateInput) {
        if (!dateInput) return null;
        
        // If it's already a Date object
        if (dateInput instanceof Date) return dateInput;
        
        // If it's a number (Unix timestamp)
        if (typeof dateInput === 'number') {
            // Database uses milliseconds (13 digits), but some systems use seconds (10 digits)
            if (dateInput > 1000000000000) {
                return new Date(dateInput); // Already in milliseconds
            } else {
                return new Date(dateInput * 1000); // Convert seconds to milliseconds
            }
        }
        
        // If it's a string
        if (typeof dateInput === 'string') {
            // Try parsing as Unix timestamp first (if all digits)
            if (/^\d{10,13}$/.test(dateInput)) {
                const timestamp = parseInt(dateInput);
                if (timestamp > 1000000000000) {
                    return new Date(timestamp); // Milliseconds
                } else {
                    return new Date(timestamp * 1000); // Seconds
                }
            }
            
            // Otherwise try parsing as date string
            const parsed = new Date(dateInput);
            return isNaN(parsed) ? null : parsed;
        }
        
        return null;
    }

    /**
     * Extract time from toll record (handle different formats)
     */
    extractTime(toll) {
        // If toll has separate time field, use it
        if (toll.time) return toll.time;
        
        // Otherwise extract from transactionDate or date
        const date = this.parseDate(toll.transactionDate || toll.date || toll.toll_date);
        if (!date) return '00:00 AM';
        
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    }
    
    /**
     * Step 3: Load transponder mappings from database
     * Returns Map: transponderNumber -> plateNumber
     * ONLY loads user-defined mappings (not auto-discovered)
     */
    async loadTransponderMappings(hostId) {
        try {
            const mappings = new Map();
            
            const { data: results, error } = await supabaseAdmin
                .from('transponder_mappings')
                .select('transponder_number, vehicle_plate, vehicle_description')
                .eq('host_id', hostId)
                .eq('is_active', true)
                .or('vehicle_description.is.null,vehicle_description.not.ilike.Auto-discovered%');
            
            if (!error && results) {
                results.forEach(mapping => {
                    // Additional safety check: skip any auto-discovered mappings
                    if (!mapping.vehicle_description || !mapping.vehicle_description.startsWith('Auto-discovered')) {
                        mappings.set(mapping.transponder_number, this.normalizePlate(mapping.vehicle_plate));
                        console.log(`✅ Loaded user-defined mapping: ${mapping.transponder_number} → ${mapping.vehicle_plate}`);
                    } else {
                        console.log(`🚫 Skipping auto-discovered mapping: ${mapping.transponder_number} → ${mapping.vehicle_plate}`);
                    }
                });
                console.log(`🔗 Loaded ${mappings.size} user-defined transponder mappings (excluding auto-discovered)`);
            }
            return mappings;
        } catch (error) {
            console.error('❌ Error loading transponder mappings:', error);
            return new Map();
        }
    }
    
    /**
     * Step 4: Perform the actual matching
     * Logic: For each toll, find trips where:
     * 1. Vehicle matches (plate OR transponder resolves to plate)
     * 2. Toll date/time is within trip start/end window
     */
    performMatching(tripData, tollData, transponderMappings, progressCallback) {
        const matches = [];
        let processed = 0;
        
        console.log(`🔍 Starting matching process for ${tollData.length} tolls...`);
        
        for (const toll of tollData) {
            processed++;
            const progress = 20 + (processed / tollData.length * 60);
            
            // Resolve vehicle identity from toll
            const tollVehicles = this.resolveTollVehicle(toll.tagOrPlate, transponderMappings);
            
            if (tollVehicles.length === 0) {
                console.log(`⚠️ UNMATCHED: Unknown vehicle/transponder: ${toll.tagOrPlate} (Amount: $${toll.amount}, Location: ${toll.tollLocation}, Date: ${toll.tollDate.toLocaleDateString()}) - ignoring as per user spec`);
                continue;
            }
            
            // Find matching trip
            const matchingTrip = this.findMatchingTrip(toll, tollVehicles, tripData);
            
            if (matchingTrip) {
                matches.push({
                    toll: toll,
                    trip: matchingTrip,
                    reason: `Vehicle: ${tollVehicles.join('/')} - Time: ${toll.tollDate.toISOString()} within trip window`,
                    confidence: 0.95
                });
                
                console.log(`✅ MATCH: Toll ${toll.laneTransactionId} (${toll.tagOrPlate}) → Trip ${matchingTrip.reservationId} (${matchingTrip.vehicle})`);
                
                progressCallback({
                    step: 'matching',
                    message: `✅ Matched: ${toll.tollLocation} → Trip ${matchingTrip.reservationId}`,
                    progress: progress,
                    tollDetails: {
                        id: toll.laneTransactionId,
                        location: toll.tollLocation,
                        amount: toll.amount,
                        date: toll.tollDate.toLocaleDateString(),
                        plate: toll.tagOrPlate,
                        status: 'MATCHED',
                        tripId: matchingTrip.reservationId,
                        confidence: 0.95
                    }
                });
            } else {
                console.log(`❌ NO MATCH: Toll ${toll.laneTransactionId} (${toll.tagOrPlate}) - no trip found within time window (Amount: $${toll.amount}, Location: ${toll.tollLocation}, Date: ${toll.tollDate.toLocaleDateString()})`);
                
                progressCallback({
                    step: 'matching',
                    message: `🚗 Personal driving: ${toll.tollLocation} - business expense`,
                    progress: progress,
                    tollDetails: {
                        id: toll.laneTransactionId,
                        location: toll.tollLocation,
                        amount: toll.amount,
                        date: toll.tollDate.toLocaleDateString(),
                        plate: toll.tagOrPlate,
                        status: 'UNMATCHED',
                        reason: 'Personal driving (no rental trip found)'
                    }
                });
            }
        }
        
        return matches;
    }
    
    /**
     * Resolve toll vehicle identity - handle both plates and transponders
     * Returns array of normalized plate numbers this toll could belong to
     * FIXED: Now allows direct plate matching even without transponder mappings
     */
    resolveTollVehicle(tagOrPlate, transponderMappings) {
        if (!tagOrPlate) return [];
        
        const vehicles = [];
        const normalized = this.normalizePlate(tagOrPlate);
        
        // Check if it's a transponder that maps to a plate
        if (transponderMappings.has(tagOrPlate)) {
            const mappedPlate = transponderMappings.get(tagOrPlate);
            vehicles.push(mappedPlate);
        }
        
        // Check if it's a direct plate match
        if (this.isPlateNumber(tagOrPlate)) {
            // FIXED: Always include direct plate matches, even without transponder mappings
            if (!vehicles.includes(normalized)) {
                vehicles.push(normalized);
            }
            
            // Also check if it's mapped via transponder for completeness
            for (const [transponder, plate] of transponderMappings.entries()) {
                if (this.normalizePlate(plate) === normalized) {
                    // Already added above, no need to add again
                    break;
                }
            }
        }
        
        return vehicles;
    }
    
    /**
     * Find a trip that matches the toll based on vehicle and time window
     * Prioritizes active/completed trips over cancelled ones
     */
    findMatchingTrip(toll, tollVehicles, tripData) {
        const matchingTrips = [];
        
        // First pass: collect all matching trips
        for (const trip of tripData) {
            // Check vehicle match
            const tripVehicle = this.normalizePlate(trip.vehicle);
            if (!tollVehicles.includes(tripVehicle)) {
                continue;
            }
            
            // Check time window - STRICT EXACT matching only (no buffers allowed)
            if (toll.tollDate >= trip.tripStart && toll.tollDate <= trip.tripEnd) {
                matchingTrips.push(trip);
                console.log(`✅ EXACT MATCH: Toll date ${toll.tollDate.toISOString()} is within trip window [${trip.tripStart.toISOString()} - ${trip.tripEnd.toISOString()}]`);
            } else {
                // Log why it didn't match for debugging
                if (toll.tollDate < trip.tripStart) {
                    const hoursBefore = Math.round((trip.tripStart - toll.tollDate) / (1000 * 60 * 60));
                    console.log(`❌ REJECTED: Toll ${toll.laneTransactionId} occurred ${hoursBefore} hours BEFORE trip ${trip.reservationId} start`);
                } else if (toll.tollDate > trip.tripEnd) {
                    const hoursAfter = Math.round((toll.tollDate - trip.tripEnd) / (1000 * 60 * 60));
                    console.log(`❌ REJECTED: Toll ${toll.laneTransactionId} occurred ${hoursAfter} hours AFTER trip ${trip.reservationId} end`);
                }
            }
        }
        
        if (matchingTrips.length === 0) {
            return null;
        }
        
        // If only one match, return it
        if (matchingTrips.length === 1) {
            return matchingTrips[0];
        }
        
        // Multiple matches: prioritize active/completed trips over cancelled ones
        // First try to find non-cancelled trips
        const activeTrips = matchingTrips.filter(trip => {
            if (!trip.originalTrip || !trip.originalTrip.status) {
                return true; // Assume active if no status
            }
            const status = trip.originalTrip.status.toLowerCase();
            const isCancelled = status.includes('cancel') || status.includes('decline') || 
                              status.includes('expired') || status.includes('terminated') || 
                              status.includes('rejected');
            return !isCancelled;
        });
        
        if (activeTrips.length > 0) {
            console.log(`🎯 Multiple trip matches found for toll ${toll.laneTransactionId}, prioritizing active trip ${activeTrips[0].reservationId} over cancelled alternatives`);
            return activeTrips[0];
        }
        
        // Fallback to first match (should rarely happen due to earlier filtering)
        console.log(`⚠️ Only cancelled trips match toll ${toll.laneTransactionId}, using ${matchingTrips[0].reservationId}`);
        return matchingTrips[0];
    }
    
    /**
     * Determine if a tag/plate value is a plate number vs transponder
     */
    isPlateNumber(value) {
        if (!value) return false;
        
        // Remove spaces and special chars for analysis
        const cleaned = value.replace(/[^A-Z0-9]/g, '').toUpperCase();
        
        // Transponders are typically all digits, 10-11 characters
        if (/^\d{10,11}$/.test(cleaned)) {
            return false; // This is likely a transponder
        }
        
        // Plates typically have letters and numbers, 6-8 characters
        if (cleaned.length >= 4 && cleaned.length <= 8 && /[A-Z]/.test(cleaned)) {
            return true; // This is likely a plate
        }
        
        // Default to treating it as a plate if unclear
        return true;
    }
    
    /**
     * Normalize plate number for comparison
     */
    normalizePlate(plate) {
        if (!plate) return '';
        return plate
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')  // Remove special chars and spaces
            .replace(/^[A-Z]{2}/, '');   // Remove state prefix (NY, NJ, etc.)
    }
    
    /**
     * Apply matches to database
     */
    async applyMatches(matches) {
        let appliedCount = 0;
        
        for (const match of matches) {
            try {
                // FINAL VALIDATION: Ensure toll is EXACTLY within trip window before applying
                if (match.toll.tollDate < match.trip.tripStart || match.toll.tollDate > match.trip.tripEnd) {
                    console.error(`🚫 BLOCKING INVALID MATCH: Toll ${match.toll.laneTransactionId} is outside trip ${match.trip.reservationId} window`);
                    console.error(`   Toll Date: ${match.toll.tollDate.toISOString()}`);
                    console.error(`   Trip Window: ${match.trip.tripStart.toISOString()} - ${match.trip.tripEnd.toISOString()}`);
                    continue; // Skip this match
                }
                
                // We need to find the actual database IDs since CSV data doesn't have them
                const tripDbId = await this.findTripDatabaseId(match.trip);
                const tollDbId = await this.findTollDatabaseId(match.toll);
                
                if (tripDbId && tollDbId) {
                    try {
                        const { error } = await supabaseAdmin
                            .from('toll_charges')
                            .update({
                                trip_id: tripDbId,
                                is_matched: true,
                                match_confidence: match.confidence,
                                match_method: 'simple_matcher'
                            })
                            .eq('id', tollDbId);
                        
                        if (error) {
                            console.error(`❌ Failed to apply match for toll ${match.toll.laneTransactionId}:`, error);
                        } else {
                            appliedCount++;
                            console.log(`✅ Applied match: Toll ${tollDbId} → Trip ${tripDbId} (${match.confidence})`);
                        }
                    } catch (error) {
                        console.error(`❌ Exception applying match for toll ${match.toll.laneTransactionId}:`, error);
                    }
                } else {
                    console.error(`❌ Could not find database IDs for match:`, {
                        trip: match.trip.reservationId,
                        toll: match.toll.laneTransactionId,
                        tripDbId,
                        tollDbId
                    });
                }
            } catch (error) {
                console.error(`❌ Database error applying match:`, error);
            }
        }
        
        console.log(`✅ Applied ${appliedCount}/${matches.length} matches to database`);
        return appliedCount;
    }
    
    /**
     * Find trip database ID from reservation ID
     */
    async findTripDatabaseId(trip) {
        try {
            console.log(`🔍 DEBUG: Looking for trip ${trip.reservationId} in database...`);
            
            // If the originalTrip already has a database ID, use it directly
            if (trip.originalTrip && trip.originalTrip.id) {
                console.log(`✅ Using existing database ID: ${trip.originalTrip.id} for trip ${trip.reservationId}`);
                return trip.originalTrip.id;
            }
            
            // Otherwise, search by turo_trip_id
            const { data: result, error } = await supabaseAdmin
                .from('trips')
                .select('id, turo_trip_id, vehicle_plate')
                .eq('turo_trip_id', trip.reservationId)
                .single();
            
            if (result) {
                console.log(`✅ Found trip by turo_trip_id: ${result.id} (${result.turo_trip_id}, plate: ${result.vehicle_plate})`);
                return result.id;
            }
            
            console.error(`❌ Could not find trip in database:`, {
                reservationId: trip.reservationId,
                originalTripId: trip.originalTrip?.id,
                error: error?.message
            });
            return null;
        } catch (error) {
            console.error(`❌ Error finding trip in database:`, error);
            return null;
        }
    }
    
    /**
     * Find toll database ID from transaction ID
     */
    async findTollDatabaseId(toll) {
        try {
            console.log(`🔍 DEBUG: Looking for toll ${toll.laneTransactionId} in database...`);
            
            // If the originalToll already has a database ID, use it directly
            if (toll.originalToll && toll.originalToll.id) {
                console.log(`✅ Using existing database ID: ${toll.originalToll.id} for toll ${toll.laneTransactionId}`);
                return toll.originalToll.id;
            }
            
            // Otherwise, search by transaction_id
            const { data: result, error } = await supabaseAdmin
                .from('toll_charges')
                .select('id, transaction_id, toll_amount, charge_date')
                .eq('transaction_id', toll.laneTransactionId)
                .single();
            
            if (result) {
                console.log(`✅ Found toll by transaction_id: ${result.id} (${result.transaction_id}, $${result.toll_amount})`);
                return result.id;
            }
            
            console.error(`❌ Could not find toll in database:`, {
                laneTransactionId: toll.laneTransactionId,
                originalTollId: toll.originalToll?.id,
                error: error?.message
            });
            return null;
        } catch (error) {
            console.error(`❌ Error finding toll in database:`, error);
            return null;
        }
    }
    
    /**
     * Analyze personal driving tolls to understand why they didn't match
     */
    analyzePersonalDrivingTolls(tollData, matches, transponderMappings) {
        const matchedTollIds = new Set(matches.map(m => m.toll.laneTransactionId));
        const personalDrivingTolls = tollData.filter(toll => !matchedTollIds.has(toll.laneTransactionId));
        
        console.log(`📊 ANALYSIS: ${matches.length}/${tollData.length} tolls matched (${((matches.length/tollData.length)*100).toFixed(1)}%)`);
        console.log(`🚗 PERSONAL DRIVING: ${personalDrivingTolls.length} tolls (business expenses)`);
        
        // Group personal driving tolls by reason
        const unknownVehicles = new Set();
        const knownVehiclesNoTrip = new Set();
        
        for (const toll of personalDrivingTolls) {
            const tollVehicles = this.resolveTollVehicle(toll.tagOrPlate, transponderMappings);
            if (tollVehicles.length === 0) {
                unknownVehicles.add(toll.tagOrPlate);
            } else {
                knownVehiclesNoTrip.add(toll.tagOrPlate);
            }
        }
        
        console.log(`🔍 Unknown vehicles/transponders: ${unknownVehicles.size}`, Array.from(unknownVehicles));
        console.log(`⏰ Known vehicles with no trip match: ${knownVehiclesNoTrip.size}`, Array.from(knownVehiclesNoTrip));
        
        // Show sample unmatched tolls for each category
        if (unknownVehicles.size > 0) {
            console.log('📋 Sample unknown vehicle tolls:');
            personalDrivingTolls.filter(t => unknownVehicles.has(t.tagOrPlate)).slice(0, 5).forEach(toll => {
                console.log(`  - ${toll.tagOrPlate}: $${toll.amount} at ${toll.tollLocation} on ${toll.tollDate.toLocaleDateString()}`);
            });
        }
        
        if (knownVehiclesNoTrip.size > 0) {
            console.log('📋 Sample time window issues:');
            personalDrivingTolls.filter(t => knownVehiclesNoTrip.has(t.tagOrPlate)).slice(0, 5).forEach(toll => {
                console.log(`  - ${toll.tagOrPlate}: $${toll.amount} at ${toll.tollLocation} on ${toll.tollDate.toLocaleDateString()}`);
            });
        }
    }
}

module.exports = SimpleTollMatcher;