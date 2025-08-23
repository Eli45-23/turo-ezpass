/**
 * Late Toll Detection Service
 * Automatically detects when new tolls arrive for already-submitted trips
 * Part of the toll memory system
 */

class LateTollDetector {
    constructor() {
        this.isRunning = false;
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        this.intervalId = null;
    }

    /**
     * Start the late toll detection service
     */
    start() {
        if (this.isRunning) {
            console.log('🔍 Late toll detector is already running');
            return;
        }

        console.log('🔍 Starting late toll detection service...');
        this.isRunning = true;
        
        // Run initial check
        this.detectLateTolls();
        
        // Schedule periodic checks
        this.intervalId = setInterval(() => {
            this.detectLateTolls();
        }, this.checkInterval);
        
        console.log(`🔍 Late toll detector started (checking every ${this.checkInterval / 60000} minutes)`);
    }

    /**
     * Stop the late toll detection service
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('🔍 Late toll detection service stopped');
    }

    /**
     * Main detection logic - finds new tolls for submitted trips
     */
    async detectLateTolls() {
        if (!global.supabaseAdmin) {
            console.error('❌ Supabase admin client not available for late toll detection');
            return;
        }

        try {
            console.log('🔍 Scanning for late tolls...');
            
            // Get all submitted trips (those with invoices) including toll_charge_ids
            const { data: submittedTrips, error: tripsError } = await global.supabaseAdmin
                .from('invoices')
                .select(`
                    trip_id,
                    created_at,
                    toll_charge_ids,
                    trips!inner(
                        id,
                        turo_trip_id,
                        renter_name,
                        host_id,
                        start_date,
                        end_date
                    )
                `)
                .order('created_at', { ascending: false });

            if (tripsError) {
                console.error('❌ Error fetching submitted trips:', tripsError);
                return;
            }

            if (!submittedTrips || submittedTrips.length === 0) {
                console.log('📝 No submitted trips found - nothing to check for late tolls');
                return;
            }

            console.log(`📋 Checking ${submittedTrips.length} submitted trips for late tolls...`);

            let lateTollsFound = 0;

            for (const invoice of submittedTrips) {
                const trip = invoice.trips;
                const submissionDate = new Date(invoice.created_at);
                
                // Parse the original invoice toll_charge_ids snapshot
                const originalTollIds = [];
                if (invoice.toll_charge_ids) {
                    try {
                        const parsedIds = JSON.parse(invoice.toll_charge_ids);
                        originalTollIds.push(...parsedIds);
                    } catch (parseError) {
                        console.error(`❌ Error parsing toll_charge_ids for invoice:`, parseError);
                    }
                }
                
                // Find ALL toll charges in the trip's exact time window (no grace period)
                const tollsInWindow = await this.getTollsInExactTripWindow(trip);
                if (!tollsInWindow) {
                    console.log(`⚠️ No tolls found in trip window for trip ${trip.id}`);
                    continue;
                }
                
                // Compute set difference: tolls in window that are NOT in original invoice snapshot
                const lateTolls = [];
                
                for (const toll of tollsInWindow) {
                    // First check: Was this toll ID in the original invoice snapshot?
                    const wasInOriginalInvoice = originalTollIds.includes(toll.id);
                    if (wasInOriginalInvoice) {
                        console.log(`🔍 Toll ${toll.id} already in original invoice - skipping`);
                        continue;
                    }
                    
                    // Second check: Is this toll already submitted to Turo in ANY invoice?
                    // This prevents already-invoiced tolls from being flagged as late
                    if (toll.submitted_to_turo === true || toll.invoice_id) {
                        console.log(`🔍 Toll ${toll.id} already submitted (invoice_id: ${toll.invoice_id}) - skipping`);
                        continue;
                    }
                    
                    // Third check: Is this a duplicate based on transaction_id or fingerprint?
                    const isDuplicateInSnapshot = await this.tollExistsInInvoiceSnapshot(toll, invoice);
                    if (isDuplicateInSnapshot) {
                        console.log(`🔍 Toll ${toll.id} is duplicate by fingerprint - skipping`);
                        continue;
                    }
                    
                    // Fourth check: Was this toll posted to E-ZPass BEFORE the invoice was submitted?
                    // If so, it's not a "late toll" - it was just missed during original invoice creation
                    if (toll.submission_date) {
                        const tollPostedDate = new Date(toll.submission_date);
                        const invoiceSubmissionDate = new Date(invoice.created_at);
                        
                        if (tollPostedDate <= invoiceSubmissionDate) {
                            console.log(`⏰ Toll ${toll.id} was posted ${tollPostedDate.toISOString()} before invoice submission ${invoiceSubmissionDate.toISOString()} - not a late toll`);
                            continue;
                        }
                    }
                    
                    // Additional safety check: Ensure toll date is strictly within trip window
                    const tollDate = new Date(toll.toll_date);
                    const tripStart = new Date(trip.start_date);
                    const tripEnd = new Date(trip.end_date);
                    
                    if (tollDate < tripStart || tollDate > tripEnd) {
                        console.log(`⚠️ Toll ${toll.id} date ${toll.toll_date} is outside trip window ${trip.start_date} to ${trip.end_date} - rejecting`);
                        continue;
                    }
                    
                    // This is a genuinely late toll (posted AFTER invoice submission AND within trip window)
                    console.log(`🚨 Confirmed late toll: ${toll.id} - posted ${toll.submission_date || 'unknown'} after invoice ${invoice.created_at}`);
                    lateTolls.push(toll);
                }

                if (lateTolls && lateTolls.length > 0) {
                    console.log(`🚨 Found ${lateTolls.length} late toll(s) for trip ${trip.id} (${trip.turo_trip_id})`);
                    
                    // Record each late toll detection
                    for (const toll of lateTolls) {
                        await this.recordLateTollDetection(trip, toll, invoice.id);
                        lateTollsFound++;
                    }
                }
            }

            if (lateTollsFound > 0) {
                console.log(`🎯 Late toll detection completed: ${lateTollsFound} late tolls found`);
            } else {
                console.log('✅ Late toll detection completed: No late tolls detected');
            }

        } catch (error) {
            console.error('❌ Error in late toll detection:', error);
        }
    }

    /**
     * Get all tolls that fall within the EXACT trip time window (no grace period)
     * Enhanced with strict validation and better logging
     */
    async getTollsInExactTripWindow(trip) {
        try {
            // Validate trip dates first
            const tripStart = new Date(trip.start_date);
            const tripEnd = new Date(trip.end_date);
            
            if (!trip.start_date || !trip.end_date || isNaN(tripStart.getTime()) || isNaN(tripEnd.getTime())) {
                console.error(`❌ Invalid trip dates for trip ${trip.id}: start=${trip.start_date}, end=${trip.end_date}`);
                return null;
            }
            
            if (tripStart >= tripEnd) {
                console.error(`❌ Invalid trip date range for trip ${trip.id}: start (${trip.start_date}) >= end (${trip.end_date})`);
                return null;
            }
            
            console.log(`🔍 Checking trip ${trip.id} window: ${trip.start_date} to ${trip.end_date}`);
            
            // Query ALL tolls assigned to this trip, then filter by time window
            // This fixes the issue where tolls outside the trip window were incorrectly assigned
            const { data: assignedTolls, error } = await global.supabaseAdmin
                .from('toll_charges')
                .select('*')
                .eq('trip_id', trip.id);
            
            if (error) {
                console.error(`❌ Error fetching tolls for trip ${trip.id}:`, error);
                return null;
            }
            
            if (!assignedTolls || assignedTolls.length === 0) {
                console.log(`📝 No tolls assigned to trip ${trip.id}`);
                return [];
            }
            
            // Filter tolls to only include those within the EXACT trip time window
            const tollsInWindow = [];
            const outsideWindow = [];
            
            for (const toll of assignedTolls) {
                if (!toll.toll_date) {
                    console.warn(`⚠️ Toll ${toll.id} has no toll_date - skipping`);
                    continue;
                }
                
                const tollDate = new Date(toll.toll_date);
                if (isNaN(tollDate.getTime())) {
                    console.warn(`⚠️ Toll ${toll.id} has invalid toll_date: ${toll.toll_date} - skipping`);
                    continue;
                }
                
                // Strict boundary check with millisecond precision
                if (tollDate >= tripStart && tollDate <= tripEnd) {
                    tollsInWindow.push(toll);
                    console.log(`✅ Toll ${toll.id} (${toll.toll_location}, ${toll.toll_date}) is within trip window`);
                } else {
                    outsideWindow.push(toll);
                }
            }
            
            console.log(`🔍 Trip ${trip.id}: ${assignedTolls.length} total tolls, ${tollsInWindow.length} within window, ${outsideWindow.length} outside`);
            
            // Log any tolls that are outside the window for debugging
            if (outsideWindow.length > 0) {
                console.warn(`⚠️ Found ${outsideWindow.length} tolls outside trip window for trip ${trip.id}:`);
                outsideWindow.forEach(toll => {
                    const tollDate = new Date(toll.toll_date);
                    const beforeAfter = tollDate < tripStart ? 'BEFORE' : 'AFTER';
                    const timeDiff = Math.abs(tollDate.getTime() - (tollDate < tripStart ? tripStart.getTime() : tripEnd.getTime()));
                    const hoursDiff = Math.round(timeDiff / (1000 * 60 * 60) * 100) / 100;
                    
                    console.warn(`   - Toll ${toll.id}: ${toll.toll_date} (${toll.toll_location}) is ${hoursDiff}h ${beforeAfter} trip window`);
                });
                
                // Log a warning if tolls are being incorrectly assigned
                console.warn(`🚨 These tolls should be unassigned from trip ${trip.id} as they fall outside the trip window`);
            }
            
            return tollsInWindow;
            
        } catch (error) {
            console.error(`❌ Error in getTollsInExactTripWindow for trip ${trip?.id}:`, error);
            return null;
        }
    }

    /**
     * Create a toll fingerprint for duplicate detection
     */
    createTollFingerprint(toll) {
        // Normalize the location by removing common variations
        const location = (toll.toll_location || '').toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^\w]/g, '');
        
        // Format date to YYYY-MM-DD for consistent matching
        let dateString = '';
        if (toll.toll_date) {
            const date = new Date(toll.toll_date);
            dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
        }
        
        // Normalize plate number
        const plate = (toll.plate_number || '').toUpperCase().replace(/[^\w]/g, '');
        
        // Use amount as string with 2 decimal places
        const amount = parseFloat(toll.toll_amount || 0).toFixed(2);
        
        return `${plate}_${location}_${dateString}_${amount}`;
    }

    /**
     * Check if toll exists in invoice snapshot by transaction_id or fingerprint
     */
    async tollExistsInInvoiceSnapshot(toll, invoice) {
        // If toll has transaction_id and it's in the invoice snapshot, it's a duplicate
        if (toll.transaction_id && invoice.toll_charge_ids) {
            try {
                const originalTollIds = JSON.parse(invoice.toll_charge_ids);
                
                // Check if any of the original tolls have the same transaction_id
                for (const tollId of originalTollIds) {
                    const { data: originalToll, error } = await global.supabaseAdmin
                        .from('toll_charges')
                        .select('transaction_id')
                        .eq('id', tollId)
                        .single();
                    
                    if (!error && originalToll && originalToll.transaction_id === toll.transaction_id) {
                        console.log(`🔍 Found duplicate by transaction_id: ${toll.transaction_id}`);
                        return true;
                    }
                }
            } catch (parseError) {
                console.error('Error parsing toll_charge_ids:', parseError);
            }
        }
        
        // If no transaction_id match, check by fingerprint
        const tollFingerprint = this.createTollFingerprint(toll);
        
        if (invoice.toll_charge_ids) {
            try {
                const originalTollIds = JSON.parse(invoice.toll_charge_ids);
                
                // Get all original tolls and check their fingerprints
                const { data: originalTolls, error } = await global.supabaseAdmin
                    .from('toll_charges')
                    .select('*')
                    .in('id', originalTollIds);
                
                if (error) {
                    console.error('Error fetching original tolls for fingerprint check:', error);
                    return false;
                }
                
                for (const originalToll of originalTolls) {
                    const originalFingerprint = this.createTollFingerprint(originalToll);
                    if (originalFingerprint === tollFingerprint) {
                        console.log(`🔍 Found duplicate by fingerprint: ${tollFingerprint}`);
                        return true;
                    }
                }
            } catch (parseError) {
                console.error('Error parsing toll_charge_ids for fingerprint check:', parseError);
            }
        }
        
        return false;
    }

    /**
     * Record a late toll detection in the database
     */
    async recordLateTollDetection(trip, toll, originalInvoiceId) {
        try {
            // CRITICAL VALIDATION: Double-check that toll is within trip boundaries before recording
            const tollDate = new Date(toll.toll_date);
            const tripStart = new Date(trip.start_date);
            const tripEnd = new Date(trip.end_date);
            
            if (tollDate < tripStart || tollDate > tripEnd) {
                console.error(`🚨 CRITICAL: Attempted to record late toll ${toll.id} outside trip boundaries!`);
                console.error(`   Toll date: ${toll.toll_date}`);
                console.error(`   Trip window: ${trip.start_date} to ${trip.end_date}`);
                console.error(`   Trip: ${trip.turo_trip_id || trip.id}`);
                console.error(`🚫 REJECTING this late toll detection - it would be invalid`);
                return;
            }
            
            // Check if this late toll was already detected
            const { data: existing, error: existingError } = await global.supabaseAdmin
                .from('late_tolls_detected')
                .select('id')
                .eq('trip_id', trip.id)
                .eq('toll_charge_id', toll.id)
                .single();

            if (existingError && existingError.code !== 'PGRST116') { // PGRST116 = no rows
                console.error('❌ Error checking existing late toll:', existingError);
                return;
            }

            if (existing) {
                // Already recorded, skip
                console.log(`🔍 Late toll ${toll.id} already recorded for trip ${trip.turo_trip_id || trip.id} - skipping`);
                return;
            }

            // Record the late toll detection
            const { data, error: insertError } = await global.supabaseAdmin
                .from('late_tolls_detected')
                .insert({
                    trip_id: trip.id,
                    toll_charge_id: toll.id,
                    original_invoice_id: originalInvoiceId,
                    amount: toll.toll_amount,
                    status: 'new'
                })
                .select()
                .single();

            if (insertError) {
                console.error('❌ Error recording late toll detection:', insertError);
                return;
            }

            console.log(`📝 Recorded late toll detection: Trip ${trip.turo_trip_id}, Amount: $${toll.toll_amount}, Location: ${toll.toll_location}`);

            // TODO: Send notification to host about late toll
            // This would integrate with the notification system

        } catch (error) {
            console.error('❌ Error recording late toll detection:', error);
        }
    }

    /**
     * Get statistics about late toll detections
     */
    async getStats() {
        try {
            const { data: stats, error } = await global.supabaseAdmin
                .from('late_tolls_detected')
                .select('status, amount')
                .order('detection_date', { ascending: false });

            if (error) {
                console.error('❌ Error fetching late toll stats:', error);
                return null;
            }

            const totalCount = stats?.length || 0;
            const totalAmount = stats?.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0) || 0;
            const byStatus = stats?.reduce((acc, item) => {
                acc[item.status] = (acc[item.status] || 0) + 1;
                return acc;
            }, {}) || {};

            return {
                totalDetected: totalCount,
                totalAmount: totalAmount,
                statusBreakdown: byStatus,
                recentDetections: stats?.slice(0, 10) || []
            };

        } catch (error) {
            console.error('❌ Error getting late toll stats:', error);
            return null;
        }
    }
}

module.exports = LateTollDetector;