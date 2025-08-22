const { supabaseAdmin } = require('../config/supabase');

/**
 * Enhanced Toll Matcher with Multi-Stage Matching
 * Slower but more accurate matching algorithm with pattern recognition
 */
class EnhancedTollMatcher {
    constructor() {
        // Configurable matching parameters
        this.config = {
            // Speed vs Accuracy trade-off (1-10, 10 being slowest/most accurate)
            accuracyLevel: 8,
            
            // Confidence thresholds
            autoMatchThreshold: 0.85,    // Auto-match if confidence >= 85%
            reviewThreshold: 0.65,        // Flag for review if 65-85%
            rejectThreshold: 0.45,        // Reject if < 45%
            
            // Date matching parameters
            strictDateBuffer: 1,          // ±1 day for strict matching
            normalDateBuffer: 2,          // ±2 days for normal matching
            relaxedDateBuffer: 4,         // ±4 days for relaxed matching
            
            // Delay between stages (ms) - slower = more accurate
            stageDelay: 100,              // Delay between matching stages
            tollProcessDelay: 50,         // Delay between processing each toll
            
            // Pattern learning
            enablePatternLearning: true,
            enableGeographicValidation: true,
            enableSequenceValidation: true
        };
        
        // Cache for learned patterns
        this.patternCache = {
            transponderMappings: new Map(),
            routePatterns: new Map(),
            timePatterns: new Map()
        };
    }
    
    /**
     * Set accuracy level (1-10)
     * Higher = slower but more accurate
     */
    setAccuracyLevel(level) {
        this.config.accuracyLevel = Math.max(1, Math.min(10, level));
        
        // Adjust delays based on accuracy level
        this.config.stageDelay = level * 50;        // 50-500ms between stages
        this.config.tollProcessDelay = level * 10;  // 10-100ms between tolls
        
        // Adjust date buffers
        if (level >= 8) {
            this.config.strictDateBuffer = 0.5;  // ±12 hours for very strict
            this.config.normalDateBuffer = 1;
            this.config.relaxedDateBuffer = 3;
        } else if (level >= 5) {
            this.config.strictDateBuffer = 1;
            this.config.normalDateBuffer = 2;
            this.config.relaxedDateBuffer = 4;
        } else {
            this.config.strictDateBuffer = 2;
            this.config.normalDateBuffer = 3;
            this.config.relaxedDateBuffer = 5;
        }
    }
    
    /**
     * Enhanced auto-matching with multi-stage algorithm
     */
    async enhancedAutoMatch(hostId, options = {}) {
        console.log('🎯 Starting Enhanced Multi-Stage Toll Matching');
        console.log('⚙️ Accuracy Level:', this.config.accuracyLevel);
        console.log('⏱️ Stage Delay:', this.config.stageDelay + 'ms');
        
        const progressCallback = options.progressCallback || (() => {});
        
        try {
            // Load initial data
            progressCallback({
                step: 'loading',
                message: 'Loading toll and trip data...',
                progress: 5
            });
            
            const processAllTolls = options.processAllTolls || false;
            const { unmatchedTolls, trips, transponderMappings } = await this.loadMatchingData(hostId, processAllTolls, options.dateFilter);
            
            // Load learned patterns
            if (this.config.enablePatternLearning) {
                await this.loadLearnedPatterns(hostId);
            }
            
            const tollType = processAllTolls ? 'all tolls' : 'unmatched tolls';
            progressCallback({
                step: 'analyzing',
                message: `Analyzing ${unmatchedTolls.length} ${tollType} against ${trips.length} trips...`,
                progress: 10
            });
            
            const matchResults = [];
            let processedCount = 0;
            
            // Process each toll through multiple stages
            for (const toll of unmatchedTolls) {
                processedCount++;
                const tollProgress = 10 + (processedCount / unmatchedTolls.length * 70);
                
                progressCallback({
                    step: 'matching',
                    message: `Processing toll ${processedCount}/${unmatchedTolls.length}: ${toll.toll_location}`,
                    progress: tollProgress,
                    tollDetails: {
                        id: toll.id,
                        location: toll.toll_location,
                        amount: toll.toll_amount,
                        date: new Date(toll.toll_date).toLocaleDateString(),
                        plate: toll.plate_number,
                        status: 'PROCESSING'
                    }
                });
                
                // Check if toll is already matched
                if (toll.is_matched && toll.trip_id) {
                    // Show already matched toll
                    progressCallback({
                        step: 'already_matched',
                        message: `✅ ALREADY MATCHED: ${toll.toll_location} → Existing Trip`,
                        progress: tollProgress,
                        tollDetails: {
                            id: toll.id,
                            location: toll.toll_location,
                            amount: toll.toll_amount,
                            date: new Date(toll.toll_date).toLocaleDateString(),
                            plate: toll.plate_number,
                            status: 'ALREADY_MATCHED',
                            reason: 'Previously matched to trip'
                        }
                    });
                } else {
                    // Multi-stage matching for this toll
                    const matchResult = await this.multiStageMatch(toll, trips, transponderMappings, progressCallback, hostId);
                    
                    if (matchResult.match) {
                        matchResults.push(matchResult);
                    
                    progressCallback({
                        step: 'matching',
                        message: `✅ MATCHED: ${toll.toll_location} → Trip ${matchResult.trip.turo_trip_id} (${Math.round(matchResult.confidence * 100)}% confidence)`,
                        progress: tollProgress,
                        tollDetails: {
                            id: toll.id,
                            location: toll.toll_location,
                            amount: toll.toll_amount,
                            date: new Date(toll.toll_date).toLocaleDateString(),
                            plate: toll.plate_number,
                            status: 'MATCHED',
                            tripId: matchResult.trip.turo_trip_id,
                            confidence: matchResult.confidence,
                            reason: matchResult.reason
                        }
                    });
                } else {
                    progressCallback({
                        step: 'processing',
                        message: `❌ NO MATCH: ${toll.toll_location} - ${matchResult.reason}`,
                        progress: tollProgress,
                        tollDetails: {
                            id: toll.id,
                            location: toll.toll_location,
                            amount: toll.toll_amount,
                            date: new Date(toll.toll_date).toLocaleDateString(),
                            plate: toll.plate_number,
                            status: 'UNMATCHED',
                            reason: matchResult.reason
                        }
                    });
                    }
                }
                
                // Delay between tolls for accuracy
                await this.delay(this.config.tollProcessDelay);
            }
            
            // Apply matches to database
            progressCallback({
                step: 'applying',
                message: `Applying ${matchResults.length} matches to database...`,
                progress: 85
            });
            
            const appliedCount = await this.applyMatches(matchResults);
            
            // Learn from successful matches
            if (this.config.enablePatternLearning && appliedCount > 0) {
                await this.learnFromMatches(matchResults, hostId);
            }
            
            progressCallback({
                step: 'completed',
                message: `Enhanced matching complete: ${appliedCount}/${unmatchedTolls.length} tolls matched`,
                progress: 100
            });
            
            return {
                totalCharges: unmatchedTolls.length,
                matchedCount: appliedCount,
                highConfidence: matchResults.filter(m => m.confidence >= 0.85).length,
                mediumConfidence: matchResults.filter(m => m.confidence >= 0.65 && m.confidence < 0.85).length,
                lowConfidence: matchResults.filter(m => m.confidence < 0.65).length,
                averageConfidence: matchResults.length > 0 ? 
                    (matchResults.reduce((sum, m) => sum + m.confidence, 0) / matchResults.length).toFixed(2) : 0
            };
            
        } catch (error) {
            console.error('❌ Enhanced matching error:', error);
            throw error;
        }
    }
    
    /**
     * Multi-stage matching algorithm for a single toll
     */
    async multiStageMatch(toll, trips, transponderMappings, progressCallback, hostId) {
        const stages = [
            { name: 'Stage 1: Exact Match', method: this.exactMatch.bind(this) },
            { name: 'Stage 2: Fuzzy Plate Match', method: this.fuzzyPlateMatch.bind(this) },
            { name: 'Stage 3: Transponder Learning', method: this.transponderPatternMatch.bind(this) },
            { name: 'Stage 4: Date Range Expansion', method: this.expandedDateMatch.bind(this) },
            { name: 'Stage 5: Pattern Recognition', method: this.patternMatch.bind(this) }
        ];
        
        for (const stage of stages) {
            // Try matching with current stage
            const result = await stage.method(toll, trips, transponderMappings, hostId);
            
            if (result.match && result.confidence >= this.config.autoMatchThreshold) {
                result.stage = stage.name;
                return result;
            }
            
            // Delay between stages for accuracy
            await this.delay(this.config.stageDelay);
        }
        
        // No match found
        return {
            match: false,
            reason: this.getBestUnmatchedReason(toll, trips)
        };
    }
    
    /**
     * Stage 1: Transponder resolution and exact time window match
     */
    async exactMatch(toll, trips, transponderMappings, hostId) {
        const tollDate = new Date(toll.toll_date);
        
        for (const trip of trips) {
            const tripStart = new Date(trip.start_date);
            const tripEnd = new Date(trip.end_date);
            
            // Extended time window: allow 2 days before trip start for preparation/travel
            const preBufferMs = 2 * 24 * 60 * 60 * 1000; // 2 days before
            const postBufferMs = 4 * 60 * 60 * 1000; // 4 hours after for late returns
            const adjustedStart = new Date(tripStart.getTime() - preBufferMs);
            const adjustedEnd = new Date(tripEnd.getTime() + postBufferMs);
            
            // Use extended time window - toll can be 2 days before to 4 hours after trip
            if (tollDate >= adjustedStart && tollDate <= adjustedEnd) {
                
                // Method 1: Direct plate match
                if (toll.plate_number && trip.vehicle_plate) {
                    const tollPlate = this.normalizePlate(toll.plate_number);
                    const tripPlate = this.normalizePlate(trip.vehicle_plate);
                    
                    if (tollPlate === tripPlate) {
                        // Calculate confidence based on how close toll is to trip window
                        const originalTripStart = new Date(trip.start_date);
                        const originalTripEnd = new Date(trip.end_date);
                        let confidence = 0.95;
                        let timeDescription = "within trip window";
                        
                        if (tollDate < originalTripStart) {
                            const hoursBefore = (originalTripStart - tollDate) / (1000 * 60 * 60);
                            if (hoursBefore <= 24) {
                                confidence = 0.90; // 1 day before
                                timeDescription = `${Math.round(hoursBefore)}h before trip`;
                            } else {
                                confidence = 0.85; // 2 days before
                                timeDescription = `${Math.round(hoursBefore/24)}d before trip`;
                            }
                        } else if (tollDate > originalTripEnd) {
                            const hoursAfter = (tollDate - originalTripEnd) / (1000 * 60 * 60);
                            confidence = 0.90;
                            timeDescription = `${Math.round(hoursAfter)}h after trip`;
                        }
                        
                        return {
                            match: true,
                            toll: toll,
                            trip: trip,
                            confidence: confidence,
                            reason: `Direct plate match: ${tollPlate} (${timeDescription})`
                        };
                    }
                }
                
                // Method 2: Transponder resolution
                if (toll.plate_number && /^\d{10,11}$/.test(toll.plate_number)) {
                    const transponderMapping = await this.resolveTransponderToPlate(toll.plate_number, hostId);
                    if (transponderMapping) {
                        const resolvedPlate = this.normalizePlate(transponderMapping.plate);
                        const tripPlate = this.normalizePlate(trip.vehicle_plate);
                        
                        if (resolvedPlate === tripPlate) {
                            // Calculate confidence based on how close toll is to trip window
                            const originalTripStart = new Date(trip.start_date);
                            const originalTripEnd = new Date(trip.end_date);
                            let confidence = 0.90;
                            let timeDescription = "within trip window";
                            
                            if (tollDate < originalTripStart) {
                                const hoursBefore = (originalTripStart - tollDate) / (1000 * 60 * 60);
                                if (hoursBefore <= 24) {
                                    confidence = 0.85; // 1 day before
                                    timeDescription = `${Math.round(hoursBefore)}h before trip`;
                                } else {
                                    confidence = 0.80; // 2 days before
                                    timeDescription = `${Math.round(hoursBefore/24)}d before trip`;
                                }
                            } else if (tollDate > originalTripEnd) {
                                const hoursAfter = (tollDate - originalTripEnd) / (1000 * 60 * 60);
                                confidence = 0.85;
                                timeDescription = `${Math.round(hoursAfter)}h after trip`;
                            }
                            
                            return {
                                match: true,
                                toll: toll,
                                trip: trip,
                                confidence: confidence,
                                reason: `Transponder match: ${toll.plate_number} → ${resolvedPlate} (${transponderMapping.description}, ${timeDescription})`
                            };
                        }
                    }
                }
                
                // Method 3: Reverse transponder lookup - check if trip plate has transponders matching toll
                if (trip.vehicle_plate) {
                    const transponders = await this.getTranspondersForPlate(trip.vehicle_plate, hostId);
                    if (transponders.includes(toll.plate_number)) {
                        return {
                            match: true,
                            toll: toll,
                            trip: trip,
                            confidence: 0.90,
                            reason: `Reverse transponder match: ${toll.plate_number} linked to ${trip.vehicle_plate}`
                        };
                    }
                }
            }
        }
        
        return { match: false };
    }
    
    /**
     * Stage 2: Fuzzy plate matching with small time buffer
     */
    async fuzzyPlateMatch(toll, trips, transponderMappings, hostId) {
        const tollDate = new Date(toll.toll_date);
        const bufferMs = 4 * 60 * 60 * 1000; // 4-hour buffer for timezone differences
        
        let bestMatch = null;
        let bestSimilarity = 0;
        
        for (const trip of trips) {
            const tripStart = new Date(trip.start_date);
            const tripEnd = new Date(trip.end_date);
            const adjustedStart = new Date(tripStart.getTime() - bufferMs);
            const adjustedEnd = new Date(tripEnd.getTime() + bufferMs);
            
            if (tollDate >= adjustedStart && tollDate <= adjustedEnd) {
                if (toll.plate_number && trip.vehicle_plate) {
                    const similarity = this.calculatePlateSimilarity(toll.plate_number, trip.vehicle_plate);
                    
                    if (similarity > bestSimilarity && similarity >= 0.8) { // Higher threshold
                        bestSimilarity = similarity;
                        bestMatch = trip;
                    }
                }
            }
        }
        
        if (bestMatch) {
            return {
                match: true,
                toll: toll,
                trip: bestMatch,
                confidence: 0.6 + (bestSimilarity * 0.3), // 60-90% confidence
                reason: `Fuzzy plate match (${Math.round(bestSimilarity * 100)}% similar) with time buffer`
            };
        }
        
        return { match: false };
    }
    
    /**
     * Stage 3: Transponder pattern matching
     */
    async transponderPatternMatch(toll, trips, transponderMappings, hostId) {
        // Check if toll uses transponder
        if (!toll.plate_number || !/^\d{10,11}$/.test(toll.plate_number)) {
            return { match: false };
        }
        
        const transponderNum = toll.plate_number;
        const tollDate = new Date(toll.toll_date);
        const bufferMs = this.config.normalDateBuffer * 24 * 60 * 60 * 1000;
        
        // Check learned patterns
        if (this.patternCache.transponderMappings.has(transponderNum)) {
            const learnedPlate = this.patternCache.transponderMappings.get(transponderNum);
            
            for (const trip of trips) {
                if (this.normalizePlate(trip.vehicle_plate) === this.normalizePlate(learnedPlate)) {
                    const startDate = new Date(trip.start_date);
                    const endDate = new Date(trip.end_date);
                    const adjustedStart = new Date(startDate.getTime() - bufferMs);
                    const adjustedEnd = new Date(endDate.getTime() + bufferMs);
                    
                    if (tollDate >= adjustedStart && tollDate <= adjustedEnd) {
                        return {
                            match: true,
                            toll: toll,
                            trip: trip,
                            confidence: 0.75,
                            reason: `Transponder pattern match (learned: ${transponderNum} → ${learnedPlate})`
                        };
                    }
                }
            }
        }
        
        return { match: false };
    }
    
    /**
     * Stage 4: Expanded date range matching with transponder resolution
     */
    async expandedDateMatch(toll, trips, transponderMappings, hostId) {
        const tollDate = new Date(toll.toll_date);
        const bufferMs = this.config.relaxedDateBuffer * 24 * 60 * 60 * 1000;
        
        for (const trip of trips) {
            const tripStart = new Date(trip.start_date);
            const tripEnd = new Date(trip.end_date);
            const adjustedStart = new Date(tripStart.getTime() - bufferMs);
            const adjustedEnd = new Date(tripEnd.getTime() + bufferMs);
            
            if (tollDate >= adjustedStart && tollDate <= adjustedEnd) {
                // Check vehicle matches with expanded time window
                
                // Method 1: Direct plate match
                if (toll.plate_number && trip.vehicle_plate) {
                    const tollPlate = this.normalizePlate(toll.plate_number);
                    const tripPlate = this.normalizePlate(trip.vehicle_plate);
                    
                    if (tollPlate === tripPlate) {
                        return {
                            match: true,
                            toll: toll,
                            trip: trip,
                            confidence: 0.65,
                            reason: `Plate match within expanded window (±${this.config.relaxedDateBuffer} days)`
                        };
                    }
                }
                
                // Method 2: Transponder resolution
                if (toll.plate_number && /^\d{10,11}$/.test(toll.plate_number)) {
                    const transponderMapping = await this.resolveTransponderToPlate(toll.plate_number, hostId);
                    if (transponderMapping) {
                        const resolvedPlate = this.normalizePlate(transponderMapping.plate);
                        const tripPlate = this.normalizePlate(trip.vehicle_plate);
                        
                        if (resolvedPlate === tripPlate) {
                            return {
                                match: true,
                                toll: toll,
                                trip: trip,
                                confidence: 0.60,
                                reason: `Transponder match within expanded window: ${toll.plate_number} → ${resolvedPlate}`
                            };
                        }
                    }
                }
            }
        }
        
        return { match: false };
    }
    
    /**
     * Stage 5: Pattern-based matching (time patterns, route patterns)
     */
    async patternMatch(toll, trips, transponderMappings, hostId) {
        const tollDate = new Date(toll.toll_date);
        const tollHour = tollDate.getHours();
        const tollDayOfWeek = tollDate.getDay();
        
        // Look for trips with similar time patterns
        for (const trip of trips) {
            const tripStart = new Date(trip.start_date);
            const tripEnd = new Date(trip.end_date);
            
            // Check if toll occurred during trip period (very relaxed)
            const weekBuffer = 7 * 24 * 60 * 60 * 1000; // ±1 week
            if (Math.abs(tollDate - tripStart) <= weekBuffer || Math.abs(tollDate - tripEnd) <= weekBuffer) {
                // Check time-of-day pattern
                const tripStartHour = tripStart.getHours();
                const tripEndHour = tripEnd.getHours();
                
                if (Math.abs(tollHour - tripStartHour) <= 2 || Math.abs(tollHour - tripEndHour) <= 2) {
                    return {
                        match: true,
                        toll: toll,
                        trip: trip,
                        confidence: 0.45,
                        reason: `Pattern match: Similar time of day (${tollHour}:00)`
                    };
                }
            }
        }
        
        return { match: false };
    }
    
    
    /**
     * Helper: Calculate plate similarity using Levenshtein distance
     */
    calculatePlateSimilarity(plate1, plate2) {
        const p1 = this.normalizePlate(plate1);
        const p2 = this.normalizePlate(plate2);
        
        if (p1 === p2) return 1.0;
        
        // Calculate Levenshtein distance
        const matrix = [];
        for (let i = 0; i <= p2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= p1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= p2.length; i++) {
            for (let j = 1; j <= p1.length; j++) {
                if (p2.charAt(i - 1) === p1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        const distance = matrix[p2.length][p1.length];
        const maxLength = Math.max(p1.length, p2.length);
        
        return 1 - (distance / maxLength);
    }
    
    /**
     * Helper: Normalize plate number for comparison
     */
    normalizePlate(plate) {
        if (!plate) return '';
        return plate
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')  // Remove special chars
            .replace(/^[A-Z]{2}/, '');   // Remove state prefix
    }
    
    /**
     * Helper: Get best reason for unmatched toll
     */
    getBestUnmatchedReason(toll, trips) {
        const tollDate = new Date(toll.toll_date);
        
        if (trips.length === 0) {
            return 'No trips found for this host';
        }
        
        // Find closest trip by date
        let closestTrip = null;
        let closestDistance = Infinity;
        
        for (const trip of trips) {
            const tripStart = new Date(trip.start_date);
            const distance = Math.abs(tollDate - tripStart);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestTrip = trip;
            }
        }
        
        if (closestTrip) {
            const daysDiff = Math.round(closestDistance / (1000 * 60 * 60 * 24));
            
            if (toll.plate_number && /^\d{10,11}$/.test(toll.plate_number)) {
                return `Transponder ${toll.plate_number} - no trips found within reasonable time range`;
            } else {
                return `No matching trips found within time range for plate ${toll.plate_number}`;
            }
        }
        
        return 'No matching trips found';
    }
    
    /**
     * Resolve transponder ID to plate number using mappings
     * ONLY uses user-defined mappings (not auto-discovered)
     */
    async resolveTransponderToPlate(transponderId, hostId) {
        try {
            const { data: mapping, error } = await supabaseAdmin
                .from('transponder_mappings')
                .select('vehicle_plate, vehicle_description')
                .eq('host_id', hostId)
                .eq('transponder_number', transponderId)
                .eq('is_active', true)
                .or('vehicle_description.is.null,not.vehicle_description.like.Auto-discovered%')
                .single();

            if (error || !mapping) {
                return null;
            }

            // Additional safety check: skip any auto-discovered mappings
            if (!mapping.vehicle_description || !mapping.vehicle_description.startsWith('Auto-discovered')) {
                console.log(`🔗 Transponder resolved: ${transponderId} → ${mapping.vehicle_plate} (${mapping.vehicle_description})`);
                return {
                    plate: mapping.vehicle_plate,
                    description: mapping.vehicle_description
                };
            } else {
                console.log(`🚫 Skipping auto-discovered transponder: ${transponderId}`);
                return null;
            }
        } catch (error) {
            console.error('❌ Error resolving transponder:', error);
            return null;
        }
    }

    /**
     * Get all transponder IDs for a given plate number
     * ONLY returns user-defined mappings (not auto-discovered)
     */
    async getTranspondersForPlate(plateNumber, hostId) {
        try {
            const normalizedPlate = this.normalizePlate(plateNumber);
            const { data: mappings, error } = await supabaseAdmin
                .from('transponder_mappings')
                .select('transponder_number, vehicle_description')
                .eq('host_id', hostId)
                .eq('vehicle_plate', normalizedPlate)
                .eq('is_active', true)
                .or('vehicle_description.is.null,not.vehicle_description.like.Auto-discovered%');

            if (error || !mappings) {
                return [];
            }

            // Filter out any auto-discovered mappings as additional safety
            const userDefinedTransponders = mappings
                .filter(m => !m.vehicle_description || !m.vehicle_description.startsWith('Auto-discovered'))
                .map(m => m.transponder_number);
                
            if (userDefinedTransponders.length > 0) {
                console.log(`🔗 Found user-defined transponders for ${plateNumber}: ${userDefinedTransponders.join(', ')}`);
            }
            return userDefinedTransponders;
        } catch (error) {
            console.error('❌ Error getting transponders for plate:', error);
            return [];
        }
    }

    /**
     * Load matching data from database
     */
    async loadMatchingData(hostId, processAllTolls = false, dateFilter = null) {
        try {
            const data = {
                unmatchedTolls: [],
                trips: [],
                transponderMappings: []
            };
            
            // Build date filter for Supabase query
            let tollsQuery = supabaseAdmin
                .from('toll_charges')
                .select(`
                    *,
                    toll_accounts!inner(host_id)
                `)
                .eq('toll_accounts.host_id', hostId);

            // Apply is_matched filter if not processing all tolls
            if (!processAllTolls) {
                tollsQuery = tollsQuery.eq('is_matched', false);
            }
            
            // Apply date filters
            if (dateFilter) {
                if (dateFilter.filterType === 'custom' && dateFilter.fromDate && dateFilter.toDate) {
                    // Custom date range
                    tollsQuery = tollsQuery
                        .gte('toll_date', dateFilter.fromDate)
                        .lte('toll_date', dateFilter.toDate);
                    console.log(`📅 Enhanced Matcher: Using custom date range ${dateFilter.fromDate} to ${dateFilter.toDate}`);
                } else if (dateFilter.filterType === 'days' && dateFilter.days) {
                    // Days back from now
                    const daysAgo = new Date();
                    daysAgo.setDate(daysAgo.getDate() - dateFilter.days);
                    tollsQuery = tollsQuery.gte('toll_date', daysAgo.toISOString());
                    console.log(`📅 Enhanced Matcher: Looking back ${dateFilter.days} days`);
                }
            } else {
                console.log('📅 Enhanced Matcher: No date filter applied - processing all data');
            }

            // Get tolls
            const { data: tolls, error: tollsError } = await tollsQuery;
            if (tollsError) throw tollsError;
            data.unmatchedTolls = tolls || [];
            
            // Get trips
            const { data: trips, error: tripsError } = await supabaseAdmin
                .from('trips')
                .select('*')
                .eq('host_id', hostId)
                .not('trip_status', 'in', '(canceled,cancelled,declined)')
                .order('start_date', { ascending: false });

            if (tripsError) throw tripsError;
            data.trips = trips || [];
            
            // Get transponder mappings (user-defined only)
            const { data: mappings, error: mappingsError } = await supabaseAdmin
                .from('transponder_mappings')
                .select('*')
                .eq('host_id', hostId)
                .eq('is_active', true)
                .or('vehicle_description.is.null,not.vehicle_description.like.Auto-discovered%');

            if (mappingsError) throw mappingsError;
            
            // Additional safety filter
            data.transponderMappings = (mappings || []).filter(m => 
                !m.vehicle_description || !m.vehicle_description.startsWith('Auto-discovered')
            );
            
            console.log(`🔗 Loaded ${data.transponderMappings.length} user-defined transponder mappings for enhanced matching`);
            return data;
        } catch (error) {
            console.error('❌ Error loading matching data:', error);
            throw error;
        }
    }
    
    /**
     * Load learned patterns from previous matches
     */
    async loadLearnedPatterns(hostId) {
        try {
            // Load successful transponder matches using Supabase
            const { data: patterns, error } = await supabaseAdmin
                .from('toll_charges')
                .select(`
                    plate_number,
                    trips!inner(vehicle_plate, host_id)
                `)
                .eq('trips.host_id', hostId)
                .like('plate_number', '%[0-9]%')
                .gte('plate_number.length', 10);

            if (!error && patterns) {
                patterns.forEach(p => {
                    if (/^\d{10,11}$/.test(p.plate_number)) {
                        this.patternCache.transponderMappings.set(p.plate_number, p.trips.vehicle_plate);
                    }
                });
            }
        } catch (error) {
            console.error('❌ Error loading learned patterns:', error);
        }
    }
    
    /**
     * Apply matches to database
     */
    async applyMatches(matchResults) {
        let appliedCount = 0;
        
        for (const result of matchResults) {
            if (result.confidence >= this.config.autoMatchThreshold) {
                try {
                    const { error } = await supabaseAdmin
                        .from('toll_charges')
                        .update({
                            trip_id: result.trip.id,
                            is_matched: true,
                            match_confidence: result.confidence
                        })
                        .eq('id', result.toll.id);

                    if (!error) appliedCount++;
                } catch (error) {
                    console.error('❌ Error applying match:', error);
                }
            }
        }
        
        return appliedCount;
    }
    
    /**
     * Learn from successful matches
     */
    async learnFromMatches(matchResults, hostId) {
        // Store successful transponder mappings
        for (const result of matchResults) {
            if (result.confidence >= 0.85 && /^\d{10,11}$/.test(result.toll.plate_number)) {
                this.patternCache.transponderMappings.set(
                    result.toll.plate_number, 
                    result.trip.vehicle_plate
                );
            }
        }
    }
    
    /**
     * Helper: Check if two plates are fuzzy matches using Levenshtein distance
     */
    isFuzzyPlateMatch(plate1, plate2) {
        const similarity = this.calculatePlateSimilarity(plate1, plate2);
        return similarity >= 0.8; // 80% similarity threshold
    }
    
    /**
     * Helper: Delay function for controlled pacing
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = EnhancedTollMatcher;