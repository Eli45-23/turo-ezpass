const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');

// Session-based authentication middleware
const requireAuth = async (req, res, next) => {
    console.log('🔐 Late Tolls Auth check - Session:', {
        hostId: req.session.hostId,
        sessionId: req.session.id,
        path: req.path
    });
    
    try {
        // Check if user has valid session with hostId
        if (!req.session.hostId || !req.session.email) {
            console.log('❌ No valid session found');
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        
        console.log('✅ Authentication passed for host:', req.session.hostId);
        next();
        
    } catch (error) {
        console.error('❌ Auth middleware error:', error);
        return res.status(500).json({ success: false, error: 'Authentication failed' });
    }
};

/**
 * GET /late-tolls
 * Get all late tolls for the authenticated host
 * Late tolls are tolls discovered after their trip was already invoiced
 */
router.get('/', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        console.log(`⏰ Fetching late tolls for host: ${hostId}`);
        
        // Get late tolls for this host only
        const { data: lateTolls, error: tollError } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                *,
                toll_accounts!inner(
                    host_id,
                    provider,
                    account_number
                ),
                trips!inner(
                    id,
                    turo_trip_id,
                    renter_name,
                    vehicle_plate,
                    start_date,
                    end_date
                ),
                invoices!left(
                    id,
                    invoice_number,
                    created_at
                )
            `)
            .eq('toll_accounts.host_id', hostId)
            .eq('is_late', true)
            .order('toll_date', { ascending: false });
        
        if (tollError) {
            console.error('❌ Failed to fetch late tolls:', tollError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch late tolls'
            });
        }
        
        // Format tolls for frontend
        const formattedTolls = (lateTolls || []).map(toll => ({
            id: toll.id,
            date: new Date(toll.toll_date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }),
            time: new Date(toll.toll_date).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            }),
            location: toll.toll_location || 'Unknown Location',
            amount: parseFloat(toll.toll_amount || 0),
            plate: toll.plate_number || 'Unknown',
            transponder: toll.transponder_id || 'N/A',
            provider: toll.toll_accounts?.provider || 'Unknown',
            transactionId: toll.transaction_id,
            trip: {
                id: toll.trips?.id,
                turoTripId: toll.trips?.turo_trip_id,
                renterName: toll.trips?.renter_name,
                vehiclePlate: toll.trips?.vehicle_plate,
                startDate: toll.trips?.start_date,
                endDate: toll.trips?.end_date
            },
            originalInvoice: {
                id: toll.invoices?.id,
                invoiceNumber: toll.invoices?.invoice_number,
                createdAt: toll.invoices?.created_at
            }
        }));
        
        // Group by trip
        const tollsByTrip = {};
        formattedTolls.forEach(toll => {
            const tripId = toll.trip.turoTripId;
            if (!tollsByTrip[tripId]) {
                tollsByTrip[tripId] = {
                    trip: toll.trip,
                    tolls: [],
                    totalAmount: 0
                };
            }
            tollsByTrip[tripId].tolls.push(toll);
            tollsByTrip[tripId].totalAmount += toll.amount;
        });
        
        // Calculate totals
        const totalAmount = formattedTolls.reduce((sum, toll) => sum + toll.amount, 0);
        const totalCount = formattedTolls.length;
        const affectedTrips = Object.keys(tollsByTrip).length;
        
        console.log(`⏰ Found ${totalCount} late tolls affecting ${affectedTrips} trips, totaling $${totalAmount.toFixed(2)}`);
        
        res.json({
            success: true,
            data: {
                lateTollsByTrip: tollsByTrip,
                allLateTolls: formattedTolls,
                summary: {
                    totalCount,
                    totalAmount: totalAmount.toFixed(2),
                    affectedTrips
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching late tolls:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /late-tolls/detect/:hostId
 * Detect late tolls for new uploads
 * Called after CSV upload to check if new tolls fall within already-invoiced trips
 */
router.post('/detect/:hostId', requireAuth, async (req, res) => {
    const hostId = req.params.hostId;
    const sessionHostId = req.session.hostId;
    
    // Security check - only allow detection for authenticated host
    if (hostId !== sessionHostId) {
        return res.status(403).json({
            success: false,
            error: 'Access denied - can only detect late tolls for your own account'
        });
    }
    
    try {
        console.log(`⏰ Detecting late tolls for host: ${hostId}`);
        
        // Get all recently uploaded unmatched tolls
        const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
        
        const { data: recentTolls, error: tollError } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                *,
                toll_accounts!inner(host_id)
            `)
            .eq('toll_accounts.host_id', hostId)
            .eq('is_matched', false)
            .eq('is_personal', false)
            .eq('is_late', false)
            .gte('created_at', recentCutoff.toISOString());
        
        if (tollError) {
            console.error('❌ Failed to fetch recent tolls:', tollError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch recent tolls'
            });
        }
        
        // Get all invoiced trips for this host
        const { data: invoicedTrips, error: tripError } = await supabaseAdmin
            .from('trips')
            .select(`
                id,
                turo_trip_id,
                start_date,
                end_date,
                renter_name,
                vehicle_plate,
                invoices!inner(
                    id,
                    invoice_number,
                    included_toll_ids
                )
            `)
            .eq('host_id', hostId);
        
        if (tripError) {
            console.error('❌ Failed to fetch invoiced trips:', tripError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch invoiced trips'
            });
        }
        
        let lateTollsDetected = 0;
        
        // Check each recent toll against invoiced trips
        for (const toll of recentTolls || []) {
            const tollDate = new Date(toll.toll_date);
            
            // Check if toll falls within any invoiced trip's time window
            for (const trip of invoicedTrips || []) {
                const tripStart = new Date(trip.start_date);
                const tripEnd = new Date(trip.end_date);
                
                // Check if toll is within trip time window
                if (tollDate >= tripStart && tollDate <= tripEnd) {
                    // Check if this toll ID was already included in the original invoice
                    const includedTollIds = trip.invoices?.included_toll_ids || [];
                    
                    if (!includedTollIds.includes(toll.id.toString())) {
                        console.log(`⏰ Late toll detected: Toll ${toll.id} for invoiced trip ${trip.turo_trip_id}`);
                        
                        // Mark as late toll
                        const { error: updateError } = await supabaseAdmin
                            .from('toll_charges')
                            .update({
                                is_late: true,
                                trip_id: trip.id,
                                original_invoice_id: trip.invoices.id
                            })
                            .eq('id', toll.id);
                        
                        if (!updateError) {
                            lateTollsDetected++;
                        }
                    }
                    break; // Found matching trip, no need to check others
                }
            }
        }
        
        console.log(`⏰ Late toll detection complete: ${lateTollsDetected} late tolls detected`);
        
        res.json({
            success: true,
            data: {
                lateTollsDetected,
                message: `Detection complete: ${lateTollsDetected} late tolls found`
            }
        });
        
    } catch (error) {
        console.error('❌ Error detecting late tolls:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;