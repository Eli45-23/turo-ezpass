const { supabaseAdmin, db } = require('../config/supabase');

/**
 * Improved Personal Toll Detector
 * 
 * This script addresses the gaps in the current personal toll detection:
 * 1. Includes auto-discovered transponder mappings
 * 2. Adds time window buffers for early pickup/late return
 * 3. Better transponder resolution logic
 * 4. Comprehensive audit and reporting
 */
class ImprovedPersonalTollDetector {
    constructor() {
        this.config = {
            // Time buffers for trip boundary tolerance
            earlyPickupBuffer: 4,    // hours before trip start
            lateReturnBuffer: 4,     // hours after trip end
            
            // Extended buffers for edge cases
            extendedBuffer: 24,      // hours for suspicious cases
            
            // Matching confidence levels
            highConfidence: 0.95,    // Exact match
            mediumConfidence: 0.75,  // With time buffer
            lowConfidence: 0.50      // Extended buffer or partial match
        };
        
        this.results = {
            totalTolls: 0,
            alreadyPersonal: 0,
            alreadyMatched: 0,
            newPersonalTolls: 0,
            suspiciousTolls: 0,
            errors: []
        };
    }
    
    /**
     * Main detection function
     */
    async detectPersonalTolls(hostId, options = {}) {
        console.log('🔍 Starting Improved Personal Toll Detection');
        console.log('⚙️ Configuration:', this.config);
        
        try {
            // Step 1: Load comprehensive transponder mappings (including auto-discovered)
            const transponderMappings = await this.loadAllTransponderMappings(hostId);
            console.log(`📋 Loaded ${transponderMappings.size} total transponder mappings`);
            
            // Step 2: Get all unclassified tolls
            const unclassifiedTolls = await this.getUnclassifiedTolls(hostId);
            console.log(`🔍 Found ${unclassifiedTolls.length} unclassified tolls`);
            this.results.totalTolls = unclassifiedTolls.length;
            
            if (unclassifiedTolls.length === 0) {
                console.log('✅ No unclassified tolls found - all tolls properly categorized');
                return this.results;
            }
            
            // Step 3: Load all trips for this host
            const trips = await this.loadHostTrips(hostId);
            console.log(`📅 Loaded ${trips.length} trips for analysis`);
            
            // Step 4: Analyze each unclassified toll
            const analysis = [];
            for (const toll of unclassifiedTolls) {
                const tollAnalysis = await this.analyzeToll(toll, trips, transponderMappings, hostId);
                analysis.push(tollAnalysis);
                
                if (tollAnalysis.shouldBePersonal) {
                    this.results.newPersonalTolls++;
                } else if (tollAnalysis.suspicious) {
                    this.results.suspiciousTolls++;
                }
            }
            
            // Step 5: Mark confirmed personal tolls
            if (options.markPersonal !== false) {
                await this.markPersonalTolls(analysis, hostId);
            }
            
            // Step 6: Generate report
            this.generateReport(analysis);
            
            return {
                ...this.results,
                analysis: analysis,
                report: this.getDetailedReport(analysis)
            };
            
        } catch (error) {
            console.error('❌ Error in personal toll detection:', error);
            this.results.errors.push(error.message);
            return this.results;
        }
    }
    
    /**
     * Load ALL transponder mappings (including auto-discovered)
     */
    async loadAllTransponderMappings(hostId) {
        const mappings = new Map();
        
        try {
            const { data, error } = await supabaseAdmin
                .from('transponder_mappings')
                .select('transponder_number, vehicle_plate, vehicle_description, is_active')
                .eq('host_id', hostId)
                .eq('is_active', true);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                data.forEach(mapping => {
                    const normalizedPlate = this.normalizePlate(mapping.vehicle_plate);
                    mappings.set(mapping.transponder_number, {
                        plate: normalizedPlate,
                        description: mapping.vehicle_description,
                        isAutoDiscovered: mapping.vehicle_description?.startsWith('Auto-discovered')
                    });
                    
                    console.log(`🔗 Loaded mapping: ${mapping.transponder_number} → ${normalizedPlate} (${mapping.vehicle_description || 'user-defined'})`);
                });
            }
            
            return mappings;
        } catch (error) {
            console.error('❌ Error loading transponder mappings:', error);
            return new Map();
        }
    }
    
    /**
     * Get all unclassified tolls (not matched and not personal)
     */
    async getUnclassifiedTolls(hostId) {
        try {
            const { data, error } = await supabaseAdmin
                .from('toll_charges')
                .select(`
                    *,
                    toll_accounts!inner(host_id, provider, account_number)
                `)
                .eq('toll_accounts.host_id', hostId)
                .eq('is_matched', false)
                .eq('is_personal', false)
                .order('toll_date', { ascending: false });
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('❌ Error loading unclassified tolls:', error);
            return [];
        }
    }
    
    /**
     * Load all trips for the host
     */
    async loadHostTrips(hostId) {
        try {
            const { data, error } = await supabaseAdmin
                .from('trips')
                .select('*')
                .eq('host_id', hostId)
                .not('trip_status', 'ilike', '%cancel%')
                .not('trip_status', 'ilike', '%decline%')
                .order('start_date', { ascending: false });
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('❌ Error loading trips:', error);
            return [];
        }
    }
    
    /**
     * Analyze a single toll to determine if it should be personal
     */
    async analyzeToll(toll, trips, transponderMappings, hostId) {
        const analysis = {
            tollId: toll.id,
            transactionId: toll.transaction_id,
            tollDate: new Date(toll.toll_date),
            tollLocation: toll.toll_location,
            tollAmount: toll.toll_amount,
            plateNumber: toll.plate_number,
            transponderId: toll.transponder_id,
            shouldBePersonal: false,
            suspicious: false,
            confidence: 0,
            reason: '',
            nearbyTrips: [],
            vehicleResolution: null
        };
        
        console.log(`\\n🔍 Analyzing toll: ${toll.transaction_id} - $${toll.toll_amount} at ${toll.toll_location}`);
        console.log(`   Date: ${analysis.tollDate.toLocaleString()}`);
        console.log(`   Plate: ${toll.plate_number}, Transponder: ${toll.transponder_id}`);
        
        // Step 1: Resolve vehicle identity
        analysis.vehicleResolution = this.resolveTollVehicle(toll, transponderMappings);
        console.log(`   Resolved vehicles: [${analysis.vehicleResolution.plates.join(', ')}]`);
        
        // Step 2: Find nearby trips
        analysis.nearbyTrips = this.findNearbyTrips(toll, trips, analysis.vehicleResolution.plates);
        
        // Step 3: Determine classification
        if (analysis.nearbyTrips.length === 0) {
            // No nearby trips at all - likely personal
            analysis.shouldBePersonal = true;
            analysis.confidence = this.config.highConfidence;
            analysis.reason = 'No matching trips found for vehicle within extended time window';
        } else {
            // Check if any trips actually match within reasonable buffers
            const exactMatches = analysis.nearbyTrips.filter(trip => trip.withinTripWindow);
            const bufferMatches = analysis.nearbyTrips.filter(trip => trip.withinBufferWindow);
            
            if (exactMatches.length > 0) {
                // Should have been matched - suspicious
                analysis.suspicious = true;
                analysis.confidence = this.config.lowConfidence;
                analysis.reason = `Toll falls within trip window but wasn't matched - possible matching bug`;
            } else if (bufferMatches.length > 0) {
                // Close to trip boundaries - might be early pickup or late return
                analysis.suspicious = true;
                analysis.confidence = this.config.mediumConfidence;
                analysis.reason = 'Toll near trip boundaries - possible early pickup or late return';
            } else {
                // Outside reasonable buffers - likely personal
                analysis.shouldBePersonal = true;
                analysis.confidence = this.config.highConfidence;
                analysis.reason = 'Toll outside reasonable trip boundaries - likely personal driving';
            }
        }
        
        console.log(`   → ${analysis.shouldBePersonal ? 'PERSONAL' : analysis.suspicious ? 'SUSPICIOUS' : 'MATCHED'} (${analysis.confidence}): ${analysis.reason}`);
        
        return analysis;
    }
    
    /**
     * Resolve vehicle identity from toll (improved version)
     */
    resolveTollVehicle(toll, transponderMappings) {
        const resolution = {
            plates: [],
            transponderResolved: false,
            directPlate: false,
            autoDiscovered: false
        };
        
        // Check transponder mapping first
        if (toll.transponder_id && transponderMappings.has(toll.transponder_id)) {
            const mapping = transponderMappings.get(toll.transponder_id);
            resolution.plates.push(mapping.plate);
            resolution.transponderResolved = true;
            resolution.autoDiscovered = mapping.isAutoDiscovered;
            console.log(`   🔗 Transponder ${toll.transponder_id} → ${mapping.plate} (${mapping.isAutoDiscovered ? 'auto-discovered' : 'user-defined'})`);
        }
        
        // Check direct plate
        if (toll.plate_number && toll.plate_number !== 'N/A') {
            const normalizedPlate = this.normalizePlate(toll.plate_number);
            if (!resolution.plates.includes(normalizedPlate)) {
                resolution.plates.push(normalizedPlate);
                resolution.directPlate = true;
                console.log(`   🏷️ Direct plate: ${normalizedPlate}`);
            }
        }
        
        return resolution;
    }
    
    /**
     * Find trips near the toll date
     */
    findNearbyTrips(toll, trips, plates) {
        const tollDate = new Date(toll.toll_date);
        const nearbyTrips = [];
        
        for (const trip of trips) {
            const tripStart = new Date(trip.start_date);
            const tripEnd = new Date(trip.end_date);
            const normalizedTripPlate = this.normalizePlate(trip.vehicle_plate);
            
            // Check if vehicle matches
            if (!plates.includes(normalizedTripPlate)) {
                continue;
            }
            
            // Calculate time differences
            const hoursAfterStart = (tollDate - tripStart) / (1000 * 60 * 60);
            const hoursBeforeEnd = (tripEnd - tollDate) / (1000 * 60 * 60);
            
            // Check different time windows
            const withinTripWindow = tollDate >= tripStart && tollDate <= tripEnd;
            const withinBufferWindow = hoursAfterStart >= -this.config.earlyPickupBuffer && 
                                     hoursBeforeEnd >= -this.config.lateReturnBuffer;
            const withinExtendedWindow = hoursAfterStart >= -this.config.extendedBuffer && 
                                       hoursBeforeEnd >= -this.config.extendedBuffer;
            
            if (withinExtendedWindow) {
                nearbyTrips.push({
                    tripId: trip.id,
                    turoTripId: trip.turo_trip_id,
                    vehiclePlate: trip.vehicle_plate,
                    startDate: tripStart,
                    endDate: tripEnd,
                    withinTripWindow,
                    withinBufferWindow,
                    withinExtendedWindow,
                    hoursAfterStart: Math.round(hoursAfterStart * 100) / 100,
                    hoursBeforeEnd: Math.round(hoursBeforeEnd * 100) / 100
                });
            }
        }
        
        return nearbyTrips.sort((a, b) => Math.abs(a.hoursAfterStart) - Math.abs(b.hoursAfterStart));
    }
    
    /**
     * Mark tolls as personal
     */
    async markPersonalTolls(analysis, hostId) {
        const tollsToMark = analysis.filter(a => a.shouldBePersonal).map(a => a.tollId);
        
        if (tollsToMark.length === 0) {
            console.log('✅ No new personal tolls to mark');
            return;
        }
        
        try {
            console.log(`🏠 Marking ${tollsToMark.length} tolls as personal...`);
            
            const { data, error } = await supabaseAdmin
                .from('toll_charges')
                .update({ is_personal: true })
                .in('id', tollsToMark)
                .select('id, transaction_id');
            
            if (error) throw error;
            
            console.log(`✅ Successfully marked ${data.length} tolls as personal`);
            
        } catch (error) {
            console.error('❌ Error marking tolls as personal:', error);
            this.results.errors.push(`Failed to mark tolls as personal: ${error.message}`);
        }
    }
    
    /**
     * Generate detailed report
     */
    generateReport(analysis) {
        console.log('\\n📊 PERSONAL TOLL DETECTION REPORT');
        console.log('=====================================');
        console.log(`Total tolls analyzed: ${this.results.totalTolls}`);
        console.log(`New personal tolls identified: ${this.results.newPersonalTolls}`);
        console.log(`Suspicious tolls requiring review: ${this.results.suspiciousTolls}`);
        console.log(`Errors encountered: ${this.results.errors.length}`);
        
        if (this.results.newPersonalTolls > 0) {
            console.log('\\n🏠 NEW PERSONAL TOLLS:');
            analysis.filter(a => a.shouldBePersonal).forEach(a => {
                console.log(`  • ${a.transactionId}: $${a.tollAmount} at ${a.tollLocation} on ${a.tollDate.toLocaleDateString()}`);
                console.log(`    Reason: ${a.reason}`);
            });
        }
        
        if (this.results.suspiciousTolls > 0) {
            console.log('\\n⚠️ SUSPICIOUS TOLLS (Review Required):');
            analysis.filter(a => a.suspicious).forEach(a => {
                console.log(`  • ${a.transactionId}: $${a.tollAmount} at ${a.tollLocation} on ${a.tollDate.toLocaleDateString()}`);
                console.log(`    Reason: ${a.reason}`);
                console.log(`    Nearby trips: ${a.nearbyTrips.length}`);
            });
        }
        
        if (this.results.errors.length > 0) {
            console.log('\\n❌ ERRORS:');
            this.results.errors.forEach(error => {
                console.log(`  • ${error}`);
            });
        }
    }
    
    /**
     * Get detailed report object
     */
    getDetailedReport(analysis) {
        return {
            summary: this.results,
            personalTolls: analysis.filter(a => a.shouldBePersonal),
            suspiciousTolls: analysis.filter(a => a.suspicious),
            recommendations: this.generateRecommendations(analysis)
        };
    }
    
    /**
     * Generate recommendations for improving detection
     */
    generateRecommendations(analysis) {
        const recommendations = [];
        
        // Check for transponder mapping gaps
        const unmappedTransponders = new Set();
        analysis.forEach(a => {
            if (a.transponderId && !a.vehicleResolution.transponderResolved) {
                unmappedTransponders.add(a.transponderId);
            }
        });
        
        if (unmappedTransponders.size > 0) {
            recommendations.push({
                type: 'transponder_mapping',
                priority: 'high',
                message: `${unmappedTransponders.size} unmapped transponders found`,
                action: 'Add transponder mappings in the Transponders section',
                transponders: Array.from(unmappedTransponders)
            });
        }
        
        // Check for auto-discovered mappings being ignored
        const autoDiscoveredCount = analysis.filter(a => 
            a.vehicleResolution.autoDiscovered
        ).length;
        
        if (autoDiscoveredCount > 0) {
            recommendations.push({
                type: 'auto_discovered_mappings',
                priority: 'medium',
                message: `${autoDiscoveredCount} tolls using auto-discovered mappings`,
                action: 'Consider including auto-discovered mappings in matching logic'
            });
        }
        
        return recommendations;
    }
    
    /**
     * Normalize plate number
     */
    normalizePlate(plate) {
        if (!plate) return '';
        return plate
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .replace(/^[A-Z]{2}/, '');
    }
}

// Export for use in other scripts
module.exports = ImprovedPersonalTollDetector;

// Allow running directly
if (require.main === module) {
    const detector = new ImprovedPersonalTollDetector();
    
    // Get hostId from command line or use test value
    const hostId = process.argv[2];
    
    if (!hostId) {
        console.error('❌ Usage: node improved-personal-toll-detector.js <hostId>');
        process.exit(1);
    }
    
    detector.detectPersonalTolls(hostId, { markPersonal: true })
        .then(results => {
            console.log('\\n✅ Detection complete');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Detection failed:', error);
            process.exit(1);
        });
}