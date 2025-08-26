const { db } = require('../config/database');
const MLTollMatcher = require('./ml-toll-matcher');
const EnhancedSmartStatus = require('./enhanced-smart-status');
const EnhancedTollMatcher = require('./enhanced-toll-matcher');

/**
 * Turo Integration Service
 * Since Turo discontinued their public API, this service implements multiple methods
 * to automatically sync trip data and match with toll accounts.
 */

class TuroIntegrationService {
    constructor() {
        this.supportedMethods = [
            'email_parsing',      // Parse Turo confirmation emails
            'calendar_sync',      // Sync from calendar integrations
            'csv_import',         // Import from Turo host dashboard exports
            'manual_webhook'      // Custom webhook for Turo notifications
        ];
        
        // Initialize ML-enhanced toll matcher
        this.mlMatcher = new MLTollMatcher();
        
        // Initialize Enhanced Smart Status system
        this.enhancedSmartStatus = new EnhancedSmartStatus();
        
        // Initialize Enhanced Toll Matcher (multi-stage, slower but more accurate)
        this.enhancedMatcher = new EnhancedTollMatcher();
        
        // Feature flags for gradual ML rollout
        this.mlFeatures = {
            enhancedMatching: false,        // Use ML-enhanced matching (DISABLED for CSV-only workflow)
            multiStageMatching: true,       // Use slower, more accurate multi-stage matching
            fuzzyPlateMatching: true,       // Use fuzzy string matching for plates
            confidenceScoring: true,        // Use confidence scoring system
            patternLearning: true,          // Learn from historical patterns
            geographicIntelligence: true,   // Use geographic validation
            anomalyDetection: false,        // Detect suspicious transactions
            accuracyLevel: 8                // Speed vs accuracy (1-10, higher = slower/more accurate)
        };
    }

    /**
     * Parse Turo confirmation emails to extract trip data
     * This would integrate with email services like Gmail API, Outlook, etc.
     */
    async parseConfirmationEmail(emailContent, hostId) {
        try {
            // Extract trip data from email using regex patterns
            const tripData = this.extractTripDataFromEmail(emailContent);
            
            if (tripData) {
                // Save trip to database
                return await this.saveTripData(tripData, hostId);
            }
            
            return null;
        } catch (error) {
            console.error('Error parsing Turo email:', error);
            throw error;
        }
    }

    /**
     * Extract trip information from Turo confirmation email
     */
    extractTripDataFromEmail(emailContent) {
        const patterns = {
            tripId: /Trip\s+ID[:\s]+([A-Z0-9]+)/i,
            renterName: /Guest[:\s]+([A-Za-z\s]+)/i,
            renterEmail: /Guest\s+email[:\s]+([^\s]+@[^\s]+)/i,
            vehiclePlate: /License\s+plate[:\s]+([A-Z0-9]+)/i,
            startDate: /Trip\s+starts[:\s]+([A-Za-z]+,\s+[A-Za-z]+\s+\d+,\s+\d+\s+at\s+\d+:\d+\s+[AP]M)/i,
            endDate: /Trip\s+ends[:\s]+([A-Za-z]+,\s+[A-Za-z]+\s+\d+,\s+\d+\s+at\s+\d+:\d+\s+[AP]M)/i,
            vehicleInfo: /Vehicle[:\s]+(\d{4}\s+[A-Za-z\s]+)/i
        };

        const extracted = {};
        
        for (const [key, pattern] of Object.entries(patterns)) {
            const match = emailContent.match(pattern);
            if (match) {
                extracted[key] = match[1].trim();
            }
        }

        // Convert dates to ISO format
        if (extracted.startDate) {
            extracted.startDate = new Date(extracted.startDate).toISOString();
        }
        if (extracted.endDate) {
            extracted.endDate = new Date(extracted.endDate).toISOString();
        }

        return Object.keys(extracted).length > 3 ? extracted : null;
    }

    /**
     * Import trips from CSV export from Turo host dashboard - Enhanced with Smart Status
     */
    async importFromCSV(csvData, hostId) {
        try {
            console.log('🧠 Starting enhanced CSV import with smart status detection...');
            
            const trips = this.parseCSVData(csvData);
            const results = [];
            const intelligenceStats = {
                totalTrips: trips.length,
                highConfidence: 0,
                mediumConfidence: 0,
                lowConfidence: 0,
                needsReview: 0
            };
            
            // First, save all trips to database
            for (const trip of trips) {
                const result = await this.saveTripData(trip, hostId);
                results.push(result);
            }
            
            // Then, run enhanced smart status analysis on each trip
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                if (result.id) {
                    try {
                        // Get the saved trip for analysis
                        const savedTrip = await this.getTripById(result.id);
                        if (savedTrip) {
                            // Run enhanced smart status analysis
                            const smartAnalysis = await this.enhancedSmartStatus.getEnhancedSmartStatus(savedTrip, hostId);
                            
                            // Update result with intelligence data
                            results[i].smartStatus = smartAnalysis;
                            
                            // Update statistics
                            if (smartAnalysis.confidence >= 0.85) {
                                intelligenceStats.highConfidence++;
                            } else if (smartAnalysis.confidence >= 0.65) {
                                intelligenceStats.mediumConfidence++;
                            } else {
                                intelligenceStats.lowConfidence++;
                            }
                            
                            if (smartAnalysis.needsReview) {
                                intelligenceStats.needsReview++;
                            }
                            
                            console.log(`✅ Trip ${savedTrip.turo_trip_id}: ${smartAnalysis.status} (${(smartAnalysis.confidence * 100).toFixed(1)}% confidence)`);
                        }
                    } catch (statusError) {
                        console.error(`⚠️ Smart status analysis failed for trip ${result.id}:`, statusError);
                    }
                }
            }
            
            // Update user patterns after import
            await this.updateUserPatterns(hostId);
            
            console.log('🎯 Enhanced CSV import complete:', intelligenceStats);
            
            return {
                results,
                intelligenceStats,
                enhancedImport: true
            };
            
        } catch (error) {
            console.error('Error importing CSV data:', error);
            throw error;
        }
    }

    /**
     * Parse CSV data from Turo host dashboard export
     */
    parseCSVData(csvData) {
        console.log('Parsing CSV data, length:', csvData.length);
        const lines = csvData.split('\n').filter(line => line.trim() !== '');
        console.log('CSV lines found:', lines.length);
        
        if (lines.length < 2) {
            throw new Error('CSV file must have at least a header row and one data row');
        }
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        console.log('CSV headers:', headers);
        const trips = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            console.log(`Processing row ${i}:`, values);
            
            if (values.length >= headers.length - 1) { // Allow for slight variations
                const trip = {};
                // Handle real Turo CSV format
                let guestFirstName = '';
                let guestLastName = '';
                
                headers.forEach((header, index) => {
                    const value = values[index] ? values[index].trim().replace(/"/g, '') : '';
                    
                    switch (header) {
                        // Real Turo CSV format
                        case 'reservation id':
                        case 'trip id':
                        case 'booking id':
                            trip.turoTripId = value;
                            break;
                        case 'guest':
                        case 'guest name':
                        case 'renter name':
                            trip.renterName = value;
                            break;
                        case 'guest first name':
                            guestFirstName = value;
                            break;
                        case 'guest last name':
                            guestLastName = value;
                            break;
                        case 'guest email':
                        case 'renter email':
                            trip.renterEmail = value;
                            break;
                        case 'vehicle':
                        case 'vehicle name':
                        case 'license plate':
                        case 'plate':
                            // Extract license plate from vehicle description if available
                            if (value && value.includes('(') && value.includes(')')) {
                                const plateMatch = value.match(/\(([^)]+)\)/);
                                if (plateMatch) {
                                    // Extract just the plate part, e.g., "NY #LPJ3806" -> "LPJ3806"
                                    const plateInfo = plateMatch[1];
                                    const plateNumber = plateInfo.replace(/^[A-Z]+\s*#/, ''); // Remove state prefix
                                    trip.vehiclePlate = plateNumber;
                                }
                            } else if (value && !value.includes('(')) {
                                trip.vehiclePlate = value;
                            }
                            break;
                        case 'trip start':
                        case 'start date':
                        case 'pickup date':
                            if (value) {
                                try {
                                    trip.startDate = new Date(value).toISOString();
                                } catch (e) {
                                    console.warn('Invalid start date:', value);
                                }
                            }
                            break;
                        case 'trip end':
                        case 'end date':
                        case 'return date':
                            if (value) {
                                try {
                                    trip.endDate = new Date(value).toISOString();
                                } catch (e) {
                                    console.warn('Invalid end date:', value);
                                }
                            }
                            break;
                        case 'trip status':
                        case 'status':
                            // Store trip status for filtering
                            trip.tripStatus = value.toLowerCase();
                            break;
                    }
                });
                
                // Combine first and last name if available
                if (guestFirstName && guestLastName) {
                    trip.renterName = `${guestFirstName} ${guestLastName}`;
                }
                
                // Set default license plate if missing (since Turo CSV doesn't include this)
                if (!trip.vehiclePlate) {
                    trip.vehiclePlate = 'UNKNOWN';
                }
                
                console.log('Processed trip:', trip);
                
                // Filter out canceled, declined, or incomplete trips
                if (trip.turoTripId && trip.renterName && trip.startDate && trip.endDate) {
                    // Only import active/completed trips - exclude canceled, declined, expired, etc.
                    const validStatuses = ['completed', 'active', 'confirmed', 'ongoing', 'finished'];
                    const canceledStatuses = ['canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'];
                    
                    let shouldIncludeTrip = true;
                    
                    // Check trip status first
                    if (trip.tripStatus) {
                        if (canceledStatuses.some(status => trip.tripStatus.includes(status))) {
                            console.log(`🚫 Skipping canceled/declined trip ${trip.turoTripId} (${trip.renterName}) - Status: ${trip.tripStatus}`);
                            shouldIncludeTrip = false;
                        } else if (validStatuses.some(status => trip.tripStatus.includes(status))) {
                            console.log(`✅ Including active trip ${trip.turoTripId} (${trip.renterName}) - Status: ${trip.tripStatus}`);
                        } else {
                            console.log(`⚠️ Unknown status for trip ${trip.turoTripId}: ${trip.tripStatus} - including by default`);
                        }
                    } else {
                        console.log(`ℹ️ No status provided for trip ${trip.turoTripId} - including by default`);
                    }
                    
                    // Additional date-based filtering for better categorization
                    if (shouldIncludeTrip) {
                        const now = new Date();
                        const tripStartDate = new Date(trip.startDate);
                        const tripEndDate = new Date(trip.endDate);
                        
                        if (tripStartDate > now) {
                            console.log(`📅 Trip ${trip.turoTripId} is upcoming (starts: ${tripStartDate.toLocaleDateString()})`);
                        } else if (tripEndDate < now) {
                            console.log(`✅ Trip ${trip.turoTripId} is completed (ended: ${tripEndDate.toLocaleDateString()})`);
                        } else {
                            console.log(`🔄 Trip ${trip.turoTripId} is currently active`);
                        }
                        
                        trips.push(trip);
                    }
                } else {
                    console.warn('Skipping incomplete trip:', trip);
                }
            }
        }
        
        return trips;
    }

    /**
     * Save trip data to database
     */
    async saveTripData(tripData, hostId) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT OR IGNORE INTO trips 
                 (host_id, turo_trip_id, renter_name, renter_email, vehicle_plate, start_date, end_date, trip_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    hostId,
                    tripData.turoTripId || tripData.tripId,
                    tripData.renterName,
                    tripData.renterEmail,
                    tripData.vehiclePlate,
                    tripData.startDate,
                    tripData.endDate,
                    tripData.tripStatus || 'active'
                ],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            id: this.lastID,
                            changes: this.changes,
                            tripData: tripData
                        });
                    }
                }
            );
        });
    }

    /**
     * Automatically match tolls to trips after sync - ML Enhanced
     */
    async autoMatchTolls(hostId, options = {}) {
        console.log('🚀 Starting ML-enhanced toll matching...');
        console.log('🔧 Options received:', JSON.stringify(options, null, 2));
        console.log('📞 Progress callback available:', !!options.progressCallback);
        
        // Send initial progress update
        if (options.progressCallback) {
            console.log('📡 Sending initial progress update...');
            options.progressCallback({
                step: 'starting',
                message: 'Initializing toll matching process...',
                progress: 0
            });
        } else {
            console.log('❌ No progress callback provided!');
        }
        
        try {
            // Choose matching algorithm based on feature flags
            if (this.mlFeatures.enhancedMatching) {
                console.log('🤖 Using ML-enhanced matching algorithm');
                
                if (options.progressCallback) {
                    options.progressCallback({
                        step: 'ml_loading',
                        message: 'Loading ML-enhanced matching algorithm...',
                        progress: 10
                    });
                }
                
                const mlResult = await this.mlMatcher.enhancedAutoMatch(hostId, options);
                
                // Log detailed ML results
                console.log(`📊 ML Matching Results:
                - Total charges processed: ${mlResult.totalCharges}
                - Potential matches found: ${mlResult.potentialMatches}
                - Applied matches: ${mlResult.appliedMatches}
                  • High confidence: ${mlResult.highConfidence}
                  • Medium confidence: ${mlResult.mediumConfidence}
                - Flagged for review: ${mlResult.needsReview}
                - Average confidence: ${mlResult.averageConfidence}`);
                
                if (options.progressCallback) {
                    options.progressCallback({
                        step: 'completed',
                        message: `ML matching completed! ${mlResult.appliedMatches}/${mlResult.totalCharges} tolls matched`,
                        progress: 100,
                        results: mlResult
                    });
                }
                
                // Return in legacy format for compatibility
                return {
                    matchedCount: mlResult.appliedMatches,
                    totalCharges: mlResult.totalCharges,
                    mlEnhanced: true,
                    appliedMatches: mlResult.appliedMatches,
                    averageConfidence: mlResult.averageConfidence,
                    confidence: {
                        average: mlResult.averageConfidence,
                        highConfidence: mlResult.highConfidence,
                        mediumConfidence: mlResult.mediumConfidence,
                        needsReview: mlResult.needsReview
                    }
                };
            } else if (this.mlFeatures.multiStageMatching) {
                console.log('🎯 Using Enhanced Multi-Stage matching algorithm');
                console.log('⚙️ Accuracy Level:', this.mlFeatures.accuracyLevel);
                
                if (options.progressCallback) {
                    options.progressCallback({
                        step: 'enhanced_loading',
                        message: `Loading enhanced matching (accuracy level ${this.mlFeatures.accuracyLevel})...`,
                        progress: 10
                    });
                }
                
                // Configure accuracy level
                this.enhancedMatcher.setAccuracyLevel(this.mlFeatures.accuracyLevel);
                
                // Add option to process all tolls (not just unmatched)
                if (options.processAllTolls) {
                    options.processAllTolls = true;
                }
                
                const enhancedResult = await this.enhancedMatcher.enhancedAutoMatch(hostId, options);
                
                // Log detailed enhanced results
                console.log(`📊 Enhanced Matching Results:
                - Total charges processed: ${enhancedResult.totalCharges}
                - Applied matches: ${enhancedResult.matchedCount}
                  • High confidence: ${enhancedResult.highConfidence}
                  • Medium confidence: ${enhancedResult.mediumConfidence}
                  • Low confidence: ${enhancedResult.lowConfidence}
                - Average confidence: ${enhancedResult.averageConfidence}`);
                
                // Return in legacy format for compatibility
                return {
                    matchedCount: enhancedResult.matchedCount,
                    totalCharges: enhancedResult.totalCharges,
                    enhancedMatching: true,
                    appliedMatches: enhancedResult.matchedCount,
                    averageConfidence: enhancedResult.averageConfidence,
                    confidence: {
                        average: enhancedResult.averageConfidence,
                        highConfidence: enhancedResult.highConfidence,
                        mediumConfidence: enhancedResult.mediumConfidence,
                        lowConfidence: enhancedResult.lowConfidence
                    }
                };
            } else {
                // Fall back to legacy matching for compatibility
                console.log('📝 Using legacy matching algorithm');
                
                if (options.progressCallback) {
                    options.progressCallback({
                        step: 'legacy_loading',
                        message: 'Using legacy matching algorithm...',
                        progress: 20
                    });
                }
                
                const result = await this.legacyAutoMatchTolls(hostId, options);
                
                if (options.progressCallback) {
                    options.progressCallback({
                        step: 'completed',
                        message: `Legacy matching completed! ${result.matchedCount}/${result.totalCharges} tolls matched`,
                        progress: 100,
                        results: result
                    });
                }
                
                return result;
            }
            
        } catch (error) {
            console.error('❌ ML matching failed, falling back to legacy matching:', error);
            
            if (options.progressCallback) {
                options.progressCallback({
                    step: 'fallback',
                    message: 'ML matching failed, using legacy algorithm...',
                    progress: 30
                });
            }
            
            const result = await this.legacyAutoMatchTolls(hostId, options);
            
            if (options.progressCallback) {
                options.progressCallback({
                    step: 'completed',
                    message: `Fallback matching completed! ${result.matchedCount}/${result.totalCharges} tolls matched`,
                    progress: 100,
                    results: result
                });
            }
            
            return result;
        }
    }

    /**
     * Legacy toll matching algorithm (for fallback)
     */
    async legacyAutoMatchTolls(hostId, options = {}) {
        try {
            // Get all unmatched toll charges using Supabase
            const { data: unmatchedCharges, error: tollError } = await supabaseAdmin
                .from('toll_charges')
                .select(`
                    *,
                    toll_accounts!inner(host_id)
                `)
                .eq('toll_accounts.host_id', hostId)
                .eq('is_matched', false);
                
            if (tollError) {
                throw tollError;
            }
            
            // Get all active/completed trips for matching - exclude canceled trips
            const { data: trips, error: tripError } = await supabaseAdmin
                .from('trips')
                .select('*')
                .eq('host_id', hostId)
                .not('trip_status', 'in', '("canceled","cancelled","declined","expired","terminated","rejected")')
                .order('start_date', { ascending: false });
                
            if (tripError) {
                throw tripError;
            }
            
            // Get transponder mappings from database for accurate matching
            const { data: transponderMappings, error: mappingErr } = await supabaseAdmin
                .from('transponder_mappings')
                .select('transponder_number, vehicle_plate, vehicle_description')
                .eq('host_id', hostId)
                .eq('is_active', true);
                
            const transponderMap = {};
            if (!mappingErr && transponderMappings) {
                transponderMappings.forEach(mapping => {
                    transponderMap[mapping.transponder_number] = mapping.vehicle_plate;
                });
                console.log(`📡 Loaded ${transponderMappings.length} transponder mappings for matching`);
            }
            
            let matchedCount = 0;
            const matches = [];
            
            // Send progress update: processing charges
            if (options.progressCallback) {
                options.progressCallback({
                    step: 'processing',
                    message: `Processing ${unmatchedCharges.length} unmatched tolls...`,
                    progress: 50
                });
            }
            
            unmatchedCharges.forEach((charge, index) => {
                const matchResult = this.findLegacyMatchWithDetails(charge, trips, transponderMap);
                
                if (matchResult.matchingTrip) {
                    matches.push({
                        chargeId: charge.id,
                        tripId: matchResult.matchingTrip.id,
                        confidence: this.calculateMatchConfidence(charge, matchResult.matchingTrip)
                    });
                    
                    // Send progress update for each match found
                    if (options.progressCallback) {
                        options.progressCallback({
                            step: 'matching',
                            message: `✅ MATCHED: ${charge.toll_location} ($${charge.toll_amount}) → Trip ${matchResult.matchingTrip.turo_trip_id}`,
                            progress: 50 + Math.floor((index + 1) / unmatchedCharges.length * 30),
                            tollDetails: {
                                id: charge.id,
                                location: charge.toll_location,
                                amount: charge.toll_amount,
                                date: new Date(charge.toll_date).toLocaleDateString(),
                                plate: charge.plate_number,
                                status: 'MATCHED',
                                tripId: matchResult.matchingTrip.turo_trip_id,
                                confidence: this.calculateMatchConfidence(charge, matchResult.matchingTrip),
                                reason: matchResult.reason
                            }
                        });
                    }
                } else {
                    // Send progress update for unmatched tolls with reason
                    if (options.progressCallback) {
                        options.progressCallback({
                            step: 'processing',
                            message: `❌ NO MATCH: ${charge.toll_location} ($${charge.toll_amount}) - ${matchResult.reason}`,
                            progress: 50 + Math.floor((index + 1) / unmatchedCharges.length * 30),
                            tollDetails: {
                                id: charge.id,
                                location: charge.toll_location,
                                amount: charge.toll_amount,
                                date: new Date(charge.toll_date).toLocaleDateString(),
                                plate: charge.plate_number,
                                status: 'UNMATCHED',
                                reason: matchResult.reason
                            }
                        });
                    }
                }
            });
    
            // Send progress update: applying matches  
            if (options.progressCallback) {
                options.progressCallback({
                    step: 'applying',
                    message: `Applying ${matches.length} matches to database...`,
                    progress: 85
                });
            }
            
            // Apply matches to database using Supabase with host isolation checks
            for (const match of matches) {
                try {
                    // CRITICAL SECURITY: Verify host isolation before applying match
                    // Get the toll's host_id through toll_account relationship
                    const { data: tollData, error: tollError } = await supabaseAdmin
                        .from('toll_charges')
                        .select(`
                            id,
                            toll_accounts!inner(host_id)
                        `)
                        .eq('id', match.chargeId)
                        .single();
                    
                    if (tollError || !tollData) {
                        console.error(`❌ SECURITY: Failed to get toll host for charge ${match.chargeId}:`, tollError);
                        continue;
                    }
                    
                    // Get the trip's host_id
                    const { data: tripData, error: tripError } = await supabaseAdmin
                        .from('trips')
                        .select('id, host_id, turo_trip_id')
                        .eq('id', match.tripId)
                        .single();
                        
                    if (tripError || !tripData) {
                        console.error(`❌ SECURITY: Failed to get trip host for trip ${match.tripId}:`, tripError);
                        continue;
                    }
                    
                    const tollHostId = tollData.toll_accounts?.host_id;
                    const tripHostId = tripData.host_id;
                    
                    if (tollHostId !== tripHostId) {
                        console.error(`🚫 SECURITY: Cross-host match blocked in legacy matcher! Toll ${match.chargeId} (host: ${tollHostId}) → Trip ${match.tripId} (host: ${tripHostId})`);
                        console.error(`🚫 This would cause data contamination between accounts - match rejected`);
                        continue;
                    }
                    
                    console.log(`🔍 LEGACY: Host validation passed - Applying match - Toll ID ${match.chargeId} → Trip ID ${match.tripId} (${tripData.turo_trip_id})`);
                    
                    // Now apply the match
                    const { error } = await supabaseAdmin
                        .from('toll_charges')
                        .update({ 
                            trip_id: match.tripId, 
                            is_matched: true 
                        })
                        .eq('id', match.chargeId);
                        
                    if (!error) {
                        matchedCount++;
                    } else {
                        console.error(`❌ Failed to apply legacy match for toll ${match.chargeId}:`, error);
                    }
                } catch (error) {
                    console.error(`❌ Exception in legacy match security check for toll ${match.chargeId}:`, error);
                }
            }
            
            return {
                matchedCount,
                totalCharges: unmatchedCharges.length,
                matches: matches,
                mlEnhanced: false
            };
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Legacy matching logic (extracted for fallback use)
     */
    findLegacyMatch(charge, trips, transponderMap) {
        return trips.find(trip => {
            const chargeDate = new Date(charge.toll_date);
            const startDate = new Date(trip.start_date);
            const endDate = new Date(trip.end_date);
            
            // Add buffer time for trip matching (2 days before/after for better matching)
            const bufferMs = 2 * 24 * 60 * 60 * 1000;
            const adjustedStart = new Date(startDate.getTime() - bufferMs);
            const adjustedEnd = new Date(endDate.getTime() + bufferMs);
            
            const dateMatch = chargeDate >= adjustedStart && chargeDate <= adjustedEnd;
            
            // Enhanced matching using transponder mappings
            let plateMatch = true;
            if (charge.plate_number && trip.vehicle_plate) {
                const rawChargePlate = charge.plate_number.replace(/\s+/g, '').toUpperCase();
                const tripPlate = trip.vehicle_plate.replace(/\s+/g, '').toUpperCase();
                const isTransponder = /^\d{10,11}$/.test(rawChargePlate);
                
                if (isTransponder) {
                    // Check if we have a transponder mapping for this number
                    const mappedPlate = transponderMap[rawChargePlate];
                    if (mappedPlate) {
                        const cleanMappedPlate = mappedPlate.replace(/\s+/g, '').toUpperCase();
                        plateMatch = cleanMappedPlate === tripPlate;
                    } else {
                        // No mapping found, use date-based matching for transponders
                        plateMatch = true;
                    }
                } else {
                    // Remove state prefixes (NY, NJ, etc.) from plate numbers
                    const cleanChargePlate = rawChargePlate.replace(/^[A-Z]{2}\s*/, '');
                    
                    // Direct license plate matching with state prefix removal
                    plateMatch = cleanChargePlate === tripPlate || 
                                rawChargePlate === tripPlate || 
                                cleanChargePlate.includes(tripPlate) || 
                                tripPlate.includes(cleanChargePlate);
                }
            }
            
            return dateMatch && plateMatch;
        });
    }

    /**
     * Enhanced matching logic with detailed reasons for why tolls don't match
     */
    findLegacyMatchWithDetails(charge, trips, transponderMap) {
        const chargeDate = new Date(charge.toll_date);
        const bufferMs = 2 * 24 * 60 * 60 * 1000; // 2 days buffer
        
        // Check each trip and provide detailed reasons
        for (const trip of trips) {
            const startDate = new Date(trip.start_date);
            const endDate = new Date(trip.end_date);
            const adjustedStart = new Date(startDate.getTime() - bufferMs);
            const adjustedEnd = new Date(endDate.getTime() + bufferMs);
            
            const dateMatch = chargeDate >= adjustedStart && chargeDate <= adjustedEnd;
            
            // Check plate matching
            let plateMatch = true;
            let plateReason = '';
            
            if (charge.plate_number && trip.vehicle_plate) {
                const rawChargePlate = charge.plate_number.replace(/\s+/g, '').toUpperCase();
                const tripPlate = trip.vehicle_plate.replace(/\s+/g, '').toUpperCase();
                const isTransponder = /^\d{10,11}$/.test(rawChargePlate);
                
                if (isTransponder) {
                    const mappedPlate = transponderMap[rawChargePlate];
                    if (mappedPlate) {
                        const cleanMappedPlate = mappedPlate.replace(/\s+/g, '').toUpperCase();
                        plateMatch = cleanMappedPlate === tripPlate;
                        if (!plateMatch) {
                            plateReason = `transponder ${rawChargePlate} maps to ${mappedPlate}, not ${trip.vehicle_plate}`;
                        }
                    } else {
                        plateMatch = true; // Use date-based matching for unmapped transponders
                        plateReason = `transponder ${rawChargePlate} (no mapping found)`;
                    }
                } else {
                    const cleanChargePlate = rawChargePlate.replace(/^[A-Z]{2}\s*/, '');
                    plateMatch = cleanChargePlate === tripPlate || 
                                rawChargePlate === tripPlate || 
                                cleanChargePlate.includes(tripPlate) || 
                                tripPlate.includes(cleanChargePlate);
                    
                    if (!plateMatch) {
                        plateReason = `plate ${charge.plate_number} doesn't match trip plate ${trip.vehicle_plate}`;
                    }
                }
            }
            
            // If both date and plate match, return successful match
            if (dateMatch && plateMatch) {
                return {
                    matchingTrip: trip,
                    reason: `Date and plate match (Trip: ${trip.turo_trip_id || trip.id})`
                };
            }
        }
        
        // If no match found, find the best reason why
        let bestReason = 'No trips found in date range';
        
        // Check if any trips are in date range
        const tripsInDateRange = trips.filter(trip => {
            const startDate = new Date(trip.start_date);
            const endDate = new Date(trip.end_date);
            const adjustedStart = new Date(startDate.getTime() - bufferMs);
            const adjustedEnd = new Date(endDate.getTime() + bufferMs);
            return chargeDate >= adjustedStart && chargeDate <= adjustedEnd;
        });
        
        if (tripsInDateRange.length > 0) {
            const closestTrip = tripsInDateRange[0];
            bestReason = `Trip ${closestTrip.turo_trip_id || closestTrip.id} in date range but plate mismatch: toll plate ${charge.plate_number}, trip plate ${closestTrip.vehicle_plate}`;
        } else {
            // Find closest trip by date
            const closestTrip = trips.reduce((closest, trip) => {
                const tripStart = new Date(trip.start_date);
                const chargeDistance = Math.abs(chargeDate - tripStart);
                const closestDistance = Math.abs(chargeDate - new Date(closest.start_date));
                return chargeDistance < closestDistance ? trip : closest;
            }, trips[0]);
            
            if (closestTrip) {
                const daysDiff = Math.abs(chargeDate - new Date(closestTrip.start_date)) / (1000 * 60 * 60 * 24);
                bestReason = `Closest trip ${closestTrip.turo_trip_id || closestTrip.id} is ${Math.round(daysDiff)} days away`;
            }
        }
        
        return {
            matchingTrip: null,
            reason: bestReason
        };
    }

    /**
     * Calculate match confidence score between toll charge and trip (Legacy)
     */
    calculateMatchConfidence(charge, trip) {
        let confidence = 0.5; // Base confidence
        
        // Exact plate match
        if (charge.plate_number === trip.vehicle_plate) {
            confidence += 0.4;
        }
        
        // Date proximity (closer dates = higher confidence)
        const chargeDate = new Date(charge.toll_date);
        const tripStart = new Date(trip.start_date);
        const tripEnd = new Date(trip.end_date);
        
        if (chargeDate >= tripStart && chargeDate <= tripEnd) {
            confidence += 0.3; // Within trip period
        }
        
        return Math.min(confidence, 1.0);
    }

    /**
     * Train the ML model from user corrections
     */
    async trainFromCorrection(originalChargeId, correctedTripId, feedback) {
        if (!this.mlFeatures.patternLearning) {
            console.log('📝 Pattern learning disabled, skipping training');
            return;
        }

        try {
            // Get the original charge and correct trip details
            const charge = await this.getChargeById(originalChargeId);
            const trip = await this.getTripById(correctedTripId);
            
            if (charge && trip) {
                console.log(`🎓 Learning from user correction: Charge ${originalChargeId} -> Trip ${correctedTripId}`);
                await this.mlMatcher.learnFromMatch(charge, trip, 1.0); // High confidence from user correction
                
                // Store the training feedback
                await this.storeFeedback(originalChargeId, correctedTripId, feedback);
            }
        } catch (error) {
            console.error('❌ Error training from correction:', error);
        }
    }

    /**
     * Get matching suggestions with confidence scores
     */
    async getMatchingSuggestions(chargeId, limit = 5) {
        try {
            const charge = await this.getChargeById(chargeId);
            if (!charge) return [];

            const hostId = await this.getHostIdFromCharge(chargeId);
            const trips = await this.mlMatcher.getActiveTrips(hostId);
            const transponderMappings = await this.mlMatcher.getTransponderMappings(hostId);
            
            const suggestions = [];
            
            for (const trip of trips) {
                const confidence = await this.mlMatcher.calculateAdvancedConfidence(charge, trip, transponderMappings);
                const factors = await this.mlMatcher.getConfidenceFactors(charge, trip, transponderMappings);
                
                if (confidence >= 0.1) { // Include even low-confidence matches for suggestions
                    suggestions.push({
                        trip,
                        confidence,
                        factors,
                        recommendation: this.getRecommendation(confidence)
                    });
                }
            }
            
            // Sort by confidence and limit results
            return suggestions
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, limit);
                
        } catch (error) {
            console.error('❌ Error getting matching suggestions:', error);
            return [];
        }
    }

    /**
     * Analyze matching performance
     */
    async analyzeMatchingPerformance(hostId, days = 30) {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));
            
            return new Promise((resolve) => {
                db.all(`
                    SELECT 
                        COUNT(*) as total_charges,
                        SUM(CASE WHEN is_matched = 1 THEN 1 ELSE 0 END) as matched_charges,
                        SUM(CASE WHEN validation_status = 'auto_high' THEN 1 ELSE 0 END) as high_confidence,
                        SUM(CASE WHEN validation_status = 'auto_medium' THEN 1 ELSE 0 END) as medium_confidence,
                        AVG(CASE WHEN is_matched = 1 THEN toll_amount ELSE NULL END) as avg_matched_amount,
                        COUNT(DISTINCT tc.toll_location) as unique_locations
                    FROM toll_charges tc
                    JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                    WHERE ta.host_id = ? AND tc.created_at >= ? AND tc.created_at <= ?
                `, [hostId, startDate.toISOString(), endDate.toISOString()], (err, results) => {
                    if (err || !results.length) {
                        resolve({
                            accuracy: 0,
                            totalCharges: 0,
                            matchedCharges: 0,
                            confidenceDistribution: { high: 0, medium: 0, low: 0 }
                        });
                        return;
                    }
                    
                    const stats = results[0];
                    const accuracy = stats.total_charges > 0 ? 
                        (stats.matched_charges / stats.total_charges * 100).toFixed(2) : 0;
                    
                    resolve({
                        accuracy: parseFloat(accuracy),
                        totalCharges: stats.total_charges,
                        matchedCharges: stats.matched_charges,
                        confidenceDistribution: {
                            high: stats.high_confidence,
                            medium: stats.medium_confidence,
                            low: stats.matched_charges - stats.high_confidence - stats.medium_confidence
                        },
                        averageMatchedAmount: stats.avg_matched_amount,
                        uniqueLocations: stats.unique_locations
                    });
                });
            });
        } catch (error) {
            console.error('❌ Error analyzing performance:', error);
            return { accuracy: 0, totalCharges: 0, matchedCharges: 0 };
        }
    }

    /**
     * Detect anomalous transactions
     */
    async detectAnomalies(hostId) {
        if (!this.mlFeatures.anomalyDetection) {
            return [];
        }

        try {
            return new Promise((resolve) => {
                db.all(`
                    SELECT tc.*, t.vehicle_plate, t.renter_name,
                           (tc.toll_amount - vehicle_avg.avg_amount) as amount_deviation,
                           (julianday(tc.toll_date) - julianday(t.start_date)) as date_deviation
                    FROM toll_charges tc
                    JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                    LEFT JOIN trips t ON tc.trip_id = t.id
                    LEFT JOIN (
                        SELECT t2.vehicle_plate, AVG(tc2.toll_amount) as avg_amount
                        FROM trips t2
                        JOIN toll_charges tc2 ON t2.id = tc2.trip_id
                        WHERE t2.host_id = ?
                        GROUP BY t2.vehicle_plate
                    ) vehicle_avg ON t.vehicle_plate = vehicle_avg.vehicle_plate
                    WHERE ta.host_id = ? 
                    AND (
                        tc.toll_amount > 50 OR  -- Unusually high amounts
                        ABS(tc.toll_amount - vehicle_avg.avg_amount) > 20 OR  -- Significant deviation from vehicle average
                        tc.toll_date < datetime('now', '-7 days') AND tc.is_matched = 0  -- Old unmatched charges
                    )
                    ORDER BY tc.toll_date DESC
                    LIMIT 20
                `, [hostId, hostId], (err, anomalies) => {
                    if (err) {
                        resolve([]);
                        return;
                    }
                    
                    const processedAnomalies = anomalies.map(anomaly => ({
                        ...anomaly,
                        anomalyType: this.classifyAnomaly(anomaly),
                        severity: this.calculateAnomalySeverity(anomaly),
                        recommendation: this.getAnomalyRecommendation(anomaly)
                    }));
                    
                    resolve(processedAnomalies);
                });
            });
        } catch (error) {
            console.error('❌ Error detecting anomalies:', error);
            return [];
        }
    }

    /**
     * Utility methods for ML features
     */
    getRecommendation(confidence) {
        if (confidence >= 0.85) return 'AUTO_MATCH';
        if (confidence >= 0.65) return 'REVIEW_SUGGESTED';
        if (confidence >= 0.45) return 'MANUAL_REVIEW';
        return 'NO_MATCH';
    }

    classifyAnomaly(anomaly) {
        if (anomaly.toll_amount > 50) return 'HIGH_AMOUNT';
        if (Math.abs(anomaly.amount_deviation) > 20) return 'AMOUNT_DEVIATION';
        if (anomaly.is_matched === 0) return 'UNMATCHED_OLD';
        return 'OTHER';
    }

    calculateAnomalySeverity(anomaly) {
        let severity = 0;
        if (anomaly.toll_amount > 100) severity += 3;
        else if (anomaly.toll_amount > 50) severity += 2;
        
        if (Math.abs(anomaly.amount_deviation) > 30) severity += 2;
        else if (Math.abs(anomaly.amount_deviation) > 15) severity += 1;
        
        if (anomaly.is_matched === 0) severity += 1;
        
        if (severity >= 4) return 'HIGH';
        if (severity >= 2) return 'MEDIUM';
        return 'LOW';
    }

    getAnomalyRecommendation(anomaly) {
        switch (anomaly.anomalyType) {
            case 'HIGH_AMOUNT':
                return 'Verify this high-value toll charge is legitimate';
            case 'AMOUNT_DEVIATION':
                return 'Amount significantly differs from typical charges for this vehicle';
            case 'UNMATCHED_OLD':
                return 'Old unmatched charge may need manual review';
            default:
                return 'Review this transaction for potential issues';
        }
    }

    // Helper methods for database queries
    async getChargeById(chargeId) {
        return new Promise((resolve) => {
            db.get('SELECT * FROM toll_charges WHERE id = ?', [chargeId], (err, charge) => {
                resolve(err ? null : charge);
            });
        });
    }

    async getTripById(tripId) {
        return new Promise((resolve) => {
            db.get('SELECT * FROM trips WHERE id = ?', [tripId], (err, trip) => {
                resolve(err ? null : trip);
            });
        });
    }

    async getHostIdFromCharge(chargeId) {
        return new Promise((resolve) => {
            db.get(`
                SELECT ta.host_id 
                FROM toll_charges tc 
                JOIN toll_accounts ta ON tc.toll_account_id = ta.id 
                WHERE tc.id = ?
            `, [chargeId], (err, result) => {
                resolve(err ? null : result?.host_id);
            });
        });
    }

    async storeFeedback(chargeId, tripId, feedback) {
        return new Promise((resolve) => {
            db.run(`
                INSERT OR REPLACE INTO performance_metrics 
                (metric_category, metric_name, metric_value, total_count, error_details, measured_at)
                VALUES ('toll_matching', 'user_feedback', 1, 1, ?, CURRENT_TIMESTAMP)
            `, [JSON.stringify({ chargeId, tripId, feedback })], () => {
                resolve();
            });
        });
    }

    /**
     * Set up email forwarding instructions for automatic processing
     */
    getEmailSetupInstructions(hostId) {
        return {
            forwardingEmail: `turo-sync-${hostId}@your-domain.com`,
            instructions: [
                "1. Forward all Turo confirmation emails to the forwarding email above",
                "2. Set up Gmail/Outlook rules to auto-forward emails from 'no-reply@turo.com'",
                "3. Include emails with subjects containing 'Trip confirmed', 'Booking confirmation'",
                "4. The system will automatically parse and create trips from these emails"
            ],
            gmailFilter: {
                from: "no-reply@turo.com",
                subject: "Trip confirmed OR Booking confirmation",
                forward: `turo-sync-${hostId}@your-domain.com`
            }
        };
    }

    /**
     * Process webhook from custom Turo integration (if available)
     */
    async processWebhook(webhookData, hostId) {
        try {
            const tripData = {
                turoTripId: webhookData.trip_id,
                renterName: webhookData.guest_name,
                renterEmail: webhookData.guest_email,
                vehiclePlate: webhookData.vehicle.license_plate,
                startDate: webhookData.start_time,
                endDate: webhookData.end_time
            };
            
            const result = await this.saveTripData(tripData, hostId);
            
            // Auto-match tolls after adding trip
            const matchResult = await this.autoMatchTolls(hostId);
            
            return {
                trip: result,
                tollMatches: matchResult
            };
        } catch (error) {
            console.error('Error processing webhook:', error);
            throw error;
        }
    }

    /**
     * Helper method to get trip by ID for smart status analysis
     */
    async getTripById(tripId) {
        return new Promise((resolve) => {
            db.get('SELECT * FROM trips WHERE id = ?', [tripId], (err, trip) => {
                resolve(err ? null : trip);
            });
        });
    }

    /**
     * Update user patterns after CSV import for better future predictions
     */
    async updateUserPatterns(hostId) {
        return new Promise((resolve) => {
            // Calculate user's trip patterns from all their trips
            db.get(`
                SELECT 
                    COUNT(*) as total_trips,
                    SUM(CASE WHEN trip_status IN ('canceled', 'cancelled') THEN 1 ELSE 0 END) as canceled_trips,
                    AVG(
                        CASE 
                            WHEN trip_status = 'extended' 
                            THEN (julianday(actual_end_date) - julianday(end_date)) * 24 
                            ELSE 0 
                        END
                    ) as avg_extension_hours,
                    COUNT(*) FILTER (
                        WHERE EXISTS (SELECT 1 FROM toll_charges tc WHERE tc.trip_id = t.id)
                    ) as trips_with_tolls
                FROM trips t
                WHERE t.host_id = ?
                AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
            `, [hostId], (err, stats) => {
                if (err || !stats) {
                    resolve();
                    return;
                }

                // Update or insert user patterns
                db.run(`
                    INSERT OR REPLACE INTO user_trip_patterns 
                    (host_id, total_trips, canceled_trips, extended_trips, avg_extension_hours, 
                     trips_with_tolls, avg_tolls_per_trip, pattern_confidence, data_points, last_updated)
                    VALUES (?, ?, ?, 0, ?, ?, 
                            CASE WHEN ? > 0 THEN CAST(? AS DECIMAL) / ? ELSE 0 END,
                            CASE WHEN ? >= 10 THEN 0.8 WHEN ? >= 5 THEN 0.6 ELSE 0.4 END,
                            ?, CURRENT_TIMESTAMP)
                `, [
                    hostId,
                    stats.total_trips,
                    stats.canceled_trips,
                    stats.avg_extension_hours || 0,
                    stats.trips_with_tolls,
                    stats.trips_with_tolls,
                    stats.trips_with_tolls,
                    stats.trips_with_tolls,
                    stats.total_trips,
                    stats.total_trips,
                    stats.total_trips
                ], (updateErr) => {
                    if (!updateErr) {
                        console.log(`📊 Updated pattern data for host ${hostId}: ${stats.total_trips} trips, ${stats.trips_with_tolls} with tolls`);
                    }
                    resolve();
                });
            });
        });
    }

    /**
     * Bulk smart status update for multiple trips
     */
    async bulkSmartStatusUpdate(hostId, options = {}) {
        console.log('🔄 Starting bulk smart status update...');
        
        return new Promise((resolve) => {
            // Get all trips for this host that need status analysis
            db.all(`
                SELECT t.* 
                FROM trips t
                LEFT JOIN trip_status_intelligence tsi ON t.id = tsi.trip_id
                WHERE t.host_id = ?
                AND (t.trip_status IS NULL OR t.trip_status NOT IN ('canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected'))
                AND (tsi.id IS NULL OR tsi.analyzed_at < datetime('now', '-1 day'))
                ORDER BY t.start_date DESC
                ${options.limit ? `LIMIT ${options.limit}` : ''}
            `, [hostId], async (err, trips) => {
                if (err) {
                    resolve({ success: false, error: err.message });
                    return;
                }

                const updates = {
                    totalAnalyzed: trips.length,
                    autoCompleted: 0,
                    flaggedForReview: 0,
                    needsUserInput: [],
                    errors: 0
                };

                // Process each trip
                for (const trip of trips) {
                    try {
                        const smartAnalysis = await this.enhancedSmartStatus.getEnhancedSmartStatus(trip, hostId);
                        
                        if (smartAnalysis.confidence >= 0.9) {
                            // High confidence - auto-apply
                            updates.autoCompleted++;
                        } else if (smartAnalysis.confidence >= 0.6) {
                            // Medium confidence - flag for review
                            updates.flaggedForReview++;
                        } else {
                            // Low confidence - needs user input
                            updates.needsUserInput.push({
                                tripId: trip.turo_trip_id,
                                renterName: trip.renter_name,
                                suggestions: [smartAnalysis.status],
                                confidence: smartAnalysis.confidence,
                                reasoning: smartAnalysis.reasoning
                            });
                        }
                        
                    } catch (error) {
                        console.error(`❌ Error analyzing trip ${trip.turo_trip_id}:`, error);
                        updates.errors++;
                    }
                }

                console.log('🎯 Bulk smart status update complete:', updates);
                resolve({ success: true, updates });
            });
        });
    }
}

module.exports = TuroIntegrationService;