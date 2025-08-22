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
            
            // Get all submitted trips (those with invoices)
            const { data: submittedTrips, error: tripsError } = await global.supabaseAdmin
                .from('invoices')
                .select(`
                    trip_id,
                    created_at,
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
                
                // Find toll charges for this trip that were created after submission
                const { data: lateTolls, error: tollError } = await global.supabaseAdmin
                    .from('toll_charges')
                    .select('*')
                    .eq('trip_id', trip.id)
                    .eq('submitted_to_turo', false) // Not yet submitted
                    .gte('created_at', invoice.created_at); // Created after original submission

                if (tollError) {
                    console.error(`❌ Error checking late tolls for trip ${trip.id}:`, tollError);
                    continue;
                }

                if (lateTolls && lateTolls.length > 0) {
                    console.log(`🚨 Found ${lateTolls.length} late toll(s) for trip ${trip.id} (${trip.turo_trip_id})`);
                    
                    // Record each late toll detection
                    for (const toll of lateTolls) {
                        await this.recordLateTollDetection(trip, toll, submissionDate);
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
     * Record a late toll detection in the database
     */
    async recordLateTollDetection(trip, toll, originalSubmissionDate) {
        try {
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
                return;
            }

            // Record the late toll detection
            const { data, error: insertError } = await global.supabaseAdmin
                .from('late_tolls_detected')
                .insert({
                    trip_id: trip.id,
                    toll_charge_id: toll.id,
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
                .select('status, toll_amount')
                .order('detection_date', { ascending: false });

            if (error) {
                console.error('❌ Error fetching late toll stats:', error);
                return null;
            }

            const totalCount = stats?.length || 0;
            const totalAmount = stats?.reduce((sum, item) => sum + parseFloat(item.toll_amount || 0), 0) || 0;
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