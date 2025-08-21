const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');

// Middleware to check authentication (UUID-based like dashboard.js)
const requireAuth = async (req, res, next) => {
    console.log('🔐 Auth check - Session:', {
        hostId: req.session.hostId,
        sessionId: req.session.id,
        path: req.path,
        cookies: req.headers.cookie
    });
    
    try {
        // Check if we have a UUID in session
        if (!req.session.hostId || typeof req.session.hostId === 'number') {
            console.log('🔧 No UUID hostId in session - creating/getting UUID for user');
            
            const userEmail = req.session.email || 'eliascolon23@gmail.com';
            
            // Check if host already exists in Supabase
            const { data: existingHost, error } = await supabaseAdmin
                .from('hosts')
                .select('id')
                .eq('email', userEmail)
                .single();
            
            if (existingHost) {
                console.log('✅ Found existing host UUID:', existingHost.id);
                req.session.hostId = existingHost.id;
                req.session.email = userEmail;
            } else {
                // Create new host record
                const { data: newHost, error: createError } = await supabaseAdmin
                    .from('hosts')
                    .insert({
                        email: userEmail,
                        full_name: 'User'
                    })
                    .select()
                    .single();
                
                if (createError) {
                    console.error('❌ Failed to create host:', createError);
                    return res.status(500).json({ success: false, error: 'Authentication failed' });
                }
                
                console.log('✅ Created new host UUID:', newHost.id);
                req.session.hostId = newHost.id;
                req.session.email = userEmail;
            }
        }
        
        console.log('✅ Authentication passed for host:', req.session.hostId);
        next();
    } catch (error) {
        console.error('❌ Authentication error:', error);
        return res.status(500).json({ success: false, error: 'Authentication failed' });
    }
};

// Get all trips for host
router.get('/', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        // Get trips with transponder mappings using Supabase
        const { data: trips, error: tripsError } = await supabaseAdmin
            .from('trips')
            .select(`
                id,
                turo_trip_id,
                renter_name,
                vehicle_plate,
                start_date,
                end_date,
                trip_status,
                renter_email,
                created_at,
                transponder_mappings!inner(vehicle_description)
            `)
            .eq('host_id', hostId)
            .or('trip_status.is.null,and(trip_status.not.ilike.%cancel%,trip_status.not.ilike.%decline%,trip_status.not.ilike.%expired%,trip_status.not.ilike.%terminated%,trip_status.not.ilike.%rejected%)')
            .or('submitted_to_turo.eq.false,submitted_to_turo.is.null')
            .order('start_date', { ascending: false });
        
        if (tripsError) {
            console.error('❌ Failed to fetch trips:', tripsError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch trips' 
            });
        }
        
        // Transform trips data to match frontend expectations
        const transformedTrips = {
            completed: [],
            inProgress: [],
            upcoming: [],
            yourTolls: []
        };
        
        const now = new Date();
        
        // Get toll charges for all trips using Supabase
        const { data: tollCharges, error: tollError } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                *,
                toll_accounts!inner(provider, host_id)
            `)
            .eq('toll_accounts.host_id', hostId)
            .eq('is_matched', true)
            .not('trip_id', 'is', null)
            .or('submitted_to_turo.eq.false,submitted_to_turo.is.null');
        
        if (tollError) {
            console.error('❌ Failed to fetch toll charges:', tollError);
        }
        
        // Get revenue data from invoices using Supabase
        const { data: revenueData, error: revenueError } = await supabaseAdmin
            .from('invoices')
            .select(`
                trip_id,
                invoice_items(amount)
            `)
            .eq('trips.host_id', hostId);
        
        if (revenueError) {
            console.error('❌ Failed to fetch revenue data:', revenueError);
        }
                            
                            // Create lookup maps for efficiency
                            const tollsByTrip = {};
                            const revenueByTrip = {};
                            
                            if (tollCharges) {
                                tollCharges.forEach(toll => {
                                    if (!tollsByTrip[toll.trip_id]) tollsByTrip[toll.trip_id] = [];
                                    tollsByTrip[toll.trip_id].push({
                                        id: toll.id,
                                        location: toll.toll_location || 'Unknown Location',
                                        amount: parseFloat(toll.toll_amount || 0),
                                        time: new Date(toll.toll_date).toLocaleString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true
                                        }),
                                        provider: toll.provider || 'Unknown',
                                        transponder: toll.transponder_id || toll.plate_number || 'Unknown',
                                        transactionId: toll.transaction_id || null
                                    });
                                });
                            }
                            
                            if (revenueData) {
                                revenueData.forEach(rev => {
                                    revenueByTrip[rev.trip_id] = parseFloat(rev.total_revenue || 0);
                                });
                            }
                            
                            trips.forEach(trip => {
                                const startDate = new Date(trip.start_date);
                                const endDate = new Date(trip.end_date);
                                const tripTolls = tollsByTrip[trip.trip_internal_id] || []; // Use internal trip ID for lookup
                                const tollTotal = tripTolls.reduce((sum, toll) => sum + toll.amount, 0);
                                const revenue = revenueByTrip[trip.trip_internal_id] || 0;
                                
                                const tripData = {
                                    id: trip.trip_turo_id || trip.trip_internal_id,
                                    internalId: trip.trip_internal_id, // Internal database ID for API calls
                                    guest: trip.guest || 'Unknown Guest',
                                    vehicle: trip.vehicle_plate || 'Unknown Vehicle',
                                    vehicle_plate: trip.vehicle_plate,
                                    vehicle_description: trip.vehicle_description,
                                    startDate: trip.start_date,
                                    endDate: trip.end_date,
                                    duration: calculateDuration(startDate, endDate),
                                    mileage: 0, // Mileage data not available in current schema
                                    revenue: revenue,
                                    tolls: tripTolls,
                                    tollTotal: tollTotal,
                                    submittedToTuro: trip.submitted_to_turo ? true : false,
                                    submittedDate: trip.submitted_date
                                };
                                
                                // Categorize trips based on dates and status
                                if (endDate < now && trip.status !== 'upcoming') {
                                    // Only include completed trips that have toll charges > $0
                                    if (tollTotal > 0) {
                                        transformedTrips.completed.push({
                                            ...tripData,
                                            status: 'completed'
                                        });
                                    }
                                } else if (startDate <= now && endDate >= now) {
                                    transformedTrips.inProgress.push({
                                        ...tripData,
                                        status: 'in-progress'
                                    });
                                } else if (startDate > now) {
                                    transformedTrips.upcoming.push({
                                        ...tripData,
                                        status: 'upcoming'
                                    });
                                }
                            });
                            
                            // Get personal tolls (unmatched toll charges) with vehicle info using Supabase
                            const { data: personalTolls, error: personalTollsError } = await supabaseAdmin
                                .from('toll_charges')
                                .select(`
                                    *,
                                    toll_accounts!inner(provider, account_number, host_id),
                                    transponder_mappings(vehicle_plate, vehicle_description)
                                `)
                                .eq('toll_accounts.host_id', hostId)
                                .eq('is_matched', false)
                                .order('toll_date', { ascending: false });
                            
                            if (personalTollsError) {
                                console.error('❌ Failed to fetch personal tolls:', personalTollsError);
                                transformedTrips.yourTolls = [];
                            } else {
                                transformedTrips.yourTolls = (personalTolls || []).map(toll => ({
                                    id: toll.id,
                                    type: 'Personal Driving',
                                    date: toll.toll_date,
                                    time: new Date(toll.toll_date).toLocaleTimeString('en-US', { 
                                        hour: 'numeric', 
                                        minute: '2-digit',
                                        hour12: true 
                                    }),
                                    location: toll.toll_location || 'Unknown Location',
                                    amount: parseFloat(toll.toll_amount || 0),
                                    vehicle: toll.transponder_mappings?.vehicle_description ? 
                                        `${toll.transponder_mappings.vehicle_description} (${toll.transponder_mappings.vehicle_plate})` : 
                                        `${toll.toll_accounts.provider} (${toll.toll_accounts.account_number})`,
                                    transponder: toll.transponder_id || toll.plate_number || 'Unknown',
                                    vehicle_plate: toll.transponder_mappings?.vehicle_plate || null
                                }));
                            }
                            
                            res.json({
                                success: true,
                                data: transformedTrips
                            });
    } catch (error) {
        console.error('❌ Exception fetching trips:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch trips'
        });
    }
});

// Get detailed trip information
router.get('/:id', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const tripId = req.params.id;
    
    // First find the trip (by turo_trip_id or id)
    db.get(
        `SELECT 
            id,
            turo_trip_id,
            renter_name as guest,
            renter_email,
            vehicle_plate,
            start_date,
            end_date,
            trip_status as status,
            created_at
         FROM trips 
         WHERE host_id = ? AND (turo_trip_id = ? OR id = ?)`,
        [hostId, tripId, tripId],
        (err, trip) => {
            if (err) {
                console.error('❌ Failed to fetch trip details:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to fetch trip details' 
                });
            }
            
            if (!trip) {
                return res.status(404).json({
                    success: false,
                    error: 'Trip not found'
                });
            }
            
            // Get toll charges for this trip
            db.all(
                `SELECT tc.*, ta.provider, ta.account_number
                 FROM toll_charges tc
                 JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                 WHERE ta.host_id = ? AND tc.trip_id = ?
                 ORDER BY tc.toll_date ASC`,
                [hostId, trip.id],
                (err, tollCharges) => {
                    if (err) {
                        console.error('❌ Failed to fetch toll charges for trip:', err);
                    }
                    
                    // Get invoice data for this trip
                    db.get(
                        `SELECT i.*, SUM(ii.amount) as total_amount, COUNT(ii.id) as item_count
                         FROM invoices i
                         LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
                         JOIN trips t ON i.trip_id = t.id
                         WHERE t.host_id = ? AND i.trip_id = ?
                         GROUP BY i.id`,
                        [hostId, trip.id],
                        (err, invoice) => {
                            if (err) {
                                console.error('❌ Failed to fetch invoice for trip:', err);
                            }
                            
                            const startDate = new Date(trip.start_date);
                            const endDate = new Date(trip.end_date);
                            const now = new Date();
                            
                            let status = 'upcoming';
                            if (endDate < now && trip.status !== 'upcoming') {
                                status = 'completed';
                            } else if (startDate <= now && endDate >= now) {
                                status = 'in-progress';
                            }
                            
                            const tolls = (tollCharges || []).map(toll => ({
                                id: toll.id,
                                location: toll.toll_location || 'Unknown Location',
                                amount: parseFloat(toll.toll_amount || 0),
                                date: toll.toll_date,
                                time: new Date(toll.toll_date).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                }),
                                provider: toll.provider || 'Unknown',
                                transponder: toll.transponder_id || toll.plate_number || 'Unknown',
                                transactionId: toll.transaction_id
                            }));
                            
                            const tollTotal = tolls.reduce((sum, toll) => sum + toll.amount, 0);
                            
                            const tripDetails = {
                                id: trip.turo_trip_id || trip.id,
                                turoTripId: trip.turo_trip_id,
                                guest: trip.guest || 'Unknown Guest',
                                guestEmail: trip.renter_email,
                                vehicle: trip.vehicle_plate || 'Unknown Vehicle',
                                startDate: trip.start_date,
                                endDate: trip.end_date,
                                status: status,
                                duration: calculateDuration(startDate, endDate),
                                mileage: 0, // Not available in current schema
                                revenue: invoice ? parseFloat(invoice.total_amount || 0) : 0,
                                tolls: tolls,
                                tollTotal: tollTotal,
                                tollCount: tolls.length,
                                invoice: invoice ? {
                                    id: invoice.id,
                                    status: invoice.status,
                                    totalAmount: parseFloat(invoice.total_amount || 0),
                                    itemCount: parseInt(invoice.item_count || 0),
                                    createdAt: invoice.created_at,
                                    sentAt: invoice.sent_at
                                } : null,
                                createdAt: trip.created_at
                            };
                            
                            res.json({
                                success: true,
                                data: tripDetails
                            });
                        }
                    );
                }
            );
        }
    );
});

// Submit trip to Turo and generate invoice
router.post('/:tripId/submit', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const tripId = req.params.tripId;
    
    // Verify trip belongs to host and isn't already submitted
    db.get(
        `SELECT * FROM trips WHERE id = ? AND host_id = ?`,
        [tripId, hostId],
        (err, trip) => {
            if (err || !trip) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Trip not found' 
                });
            }
            
            if (trip.submitted_to_turo) {
                return res.status(409).json({ 
                    success: false, 
                    error: 'Trip already submitted to Turo',
                    submittedDate: trip.submitted_date,
                    code: 'ALREADY_SUBMITTED'
                });
            }
            
            // Get toll charges for this trip
            db.all(
                `SELECT tc.*, ta.provider
                 FROM toll_charges tc
                 JOIN toll_accounts ta ON tc.toll_account_id = ta.id
                 WHERE tc.trip_id = ? AND tc.is_matched = 1`,
                [tripId],
                (err, charges) => {
                    if (err) {
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to fetch toll charges' 
                        });
                    }
                    
                    if (charges.length === 0) {
                        return res.status(400).json({ 
                            success: false, 
                            error: 'No toll charges found for this trip' 
                        });
                    }
                    
                    const tollTotal = charges.reduce((sum, c) => sum + parseFloat(c.toll_amount || 0), 0);
                    const processingFee = 2.99;
                    const totalAmount = tollTotal + processingFee;
                    const invoiceNumber = 'INV-' + Date.now() + '-' + tripId;
                    
                    // Prepare toll snapshot data
                    const tollChargeIds = charges.map(c => c.id);
                    const snapshotData = {
                        timestamp: new Date().toISOString(),
                        tollCount: charges.length,
                        tollTotal: tollTotal,
                        charges: charges.map(c => ({
                            id: c.id,
                            location: c.toll_location,
                            amount: c.toll_amount,
                            date: c.toll_date,
                            transactionId: c.transaction_id
                        }))
                    };
                    
                    // Start transaction to update trip and create invoice with snapshot
                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');
                        
                        // Mark trip as submitted
                        db.run(
                            `UPDATE trips 
                             SET submitted_to_turo = 1, submitted_date = CURRENT_TIMESTAMP 
                             WHERE id = ?`,
                            [tripId],
                            function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ 
                                        success: false, 
                                        error: 'Failed to update trip submission status' 
                                    });
                                }
                                
                                // Create invoice with snapshot data
                                db.run(
                                    `INSERT INTO invoices (trip_id, invoice_number, total_amount, processing_fee, status, toll_charge_ids, snapshot_data)
                                     VALUES (?, ?, ?, ?, 'sent', ?, ?)`,
                                    [tripId, invoiceNumber, totalAmount, processingFee, JSON.stringify(tollChargeIds), JSON.stringify(snapshotData)],
                                    function(err) {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ 
                                                success: false, 
                                                error: 'Failed to create invoice' 
                                            });
                                        }
                                        
                                        const invoiceId = this.lastID;
                                        
                                        // Create invoice line items
                                        let itemsCreated = 0;
                                        charges.forEach(charge => {
                                            db.run(
                                                `INSERT INTO invoice_items (invoice_id, toll_charge_id, description, amount)
                                                 VALUES (?, ?, ?, ?)`,
                                                [invoiceId, charge.id, 
                                                 `${charge.toll_location} - ${new Date(charge.toll_date).toLocaleDateString()}`,
                                                 charge.toll_amount],
                                                function(err) {
                                                    if (err) {
                                                        db.run('ROLLBACK');
                                                        return res.status(500).json({ 
                                                            success: false, 
                                                            error: 'Failed to create invoice items' 
                                                        });
                                                    }
                                                    
                                                    itemsCreated++;
                                                    if (itemsCreated === charges.length) {
                                                        // Mark all toll charges as submitted
                                                        let tollsMarked = 0;
                                                        charges.forEach(charge => {
                                                            db.run(
                                                                `UPDATE toll_charges 
                                                                 SET submitted_to_turo = 1, 
                                                                     invoice_id = ?, 
                                                                     submission_date = CURRENT_TIMESTAMP 
                                                                 WHERE id = ?`,
                                                                [invoiceId, charge.id],
                                                                function(err) {
                                                                    if (err) {
                                                                        db.run('ROLLBACK');
                                                                        return res.status(500).json({ 
                                                                            success: false, 
                                                                            error: 'Failed to mark toll charges as submitted' 
                                                                        });
                                                                    }
                                                                    
                                                                    tollsMarked++;
                                                                    if (tollsMarked === charges.length) {
                                                                        db.run('COMMIT');
                                                                        
                                                                        console.log(`✅ Trip ${tripId} submitted with ${charges.length} tolls marked as submitted`);
                                                                        
                                                                        res.json({
                                                                            success: true,
                                                                            message: 'Trip submitted to Turo successfully',
                                                                            trip: {
                                                                                id: tripId,
                                                                                submitted: true,
                                                                                submittedDate: new Date().toISOString()
                                                                            },
                                                                            invoice: {
                                                                                id: invoiceId,
                                                                                invoiceNumber: invoiceNumber,
                                                                                totalAmount: totalAmount,
                                                                                tollTotal: tollTotal,
                                                                                processingFee: processingFee,
                                                                                itemCount: charges.length,
                                                                                status: 'sent',
                                                                                tollChargeIds: tollChargeIds,
                                                                                snapshotCreated: true
                                                                            }
                                                                        });
                                                                    }
                                                                }
                                                            );
                                                        });
                                                    }
                                                }
                                            );
                                        });
                                    }
                                );
                            }
                        );
                    });
                }
            );
        }
    );
});

// Get late tolls detected for submitted trips
router.get('/late-tolls', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    
    console.log('🔎 Late tolls endpoint hit - Debug info:', {
        hostId: hostId,
        sessionId: req.session.id,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    db.all(
        `SELECT 
            lt.*,
            t.turo_trip_id,
            t.vehicle_plate,
            t.renter_name as guest,
            t.start_date,
            t.end_date,
            tc.toll_location,
            tc.toll_amount,
            tc.toll_date,
            tc.transaction_id,
            i.invoice_number,
            i.total_amount as original_invoice_amount
         FROM late_tolls_detected lt
         JOIN trips t ON lt.trip_id = t.id
         JOIN toll_charges tc ON lt.toll_charge_id = tc.id
         LEFT JOIN invoices i ON lt.original_invoice_id = i.id
         WHERE t.host_id = ?
         ORDER BY lt.detection_date DESC`,
        [hostId],
        (err, lateTolls) => {
            if (err) {
                console.error('❌ Failed to fetch late tolls:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch late tolls'
                });
            }
            
            const processedLateTolls = lateTolls.map(toll => ({
                id: toll.id,
                tripId: toll.turo_trip_id,
                vehicle: toll.vehicle_plate,
                guest: toll.guest,
                tripStartDate: toll.start_date,
                tripEndDate: toll.end_date,
                tollLocation: toll.toll_location,
                tollAmount: parseFloat(toll.toll_amount),
                tollDate: toll.toll_date,
                transactionId: toll.transaction_id,
                detectionDate: toll.detection_date,
                status: toll.status,
                originalInvoice: toll.invoice_number,
                originalInvoiceAmount: parseFloat(toll.original_invoice_amount || 0),
                resolutionNotes: toll.resolution_notes,
                resolvedAt: toll.resolved_at
            }));
            
            res.json({
                success: true,
                data: processedLateTolls,
                count: processedLateTolls.length
            });
        }
    );
});

// Acknowledge/resolve a late toll
router.put('/late-tolls/:lateToollId/resolve', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const lateTollId = req.params.lateToollId;
    const { status, notes } = req.body;
    
    // Validate status
    const validStatuses = ['acknowledged', 'resolved', 'waived'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid status. Must be acknowledged, resolved, or waived'
        });
    }
    
    // Verify late toll belongs to host
    db.get(
        `SELECT lt.*, t.host_id 
         FROM late_tolls_detected lt
         JOIN trips t ON lt.trip_id = t.id
         WHERE lt.id = ? AND t.host_id = ?`,
        [lateTollId, hostId],
        (err, lateToll) => {
            if (err || !lateToll) {
                return res.status(404).json({
                    success: false,
                    error: 'Late toll not found'
                });
            }
            
            db.run(
                `UPDATE late_tolls_detected 
                 SET status = ?, resolution_notes = ?, resolved_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [status, notes || null, lateTollId],
                function(err) {
                    if (err) {
                        console.error('❌ Failed to update late toll:', err);
                        return res.status(500).json({
                            success: false,
                            error: 'Failed to update late toll'
                        });
                    }
                    
                    console.log(`✅ Late toll ${lateTollId} marked as ${status}`);
                    
                    res.json({
                        success: true,
                        message: `Late toll marked as ${status}`,
                        lateTollId: lateTollId,
                        status: status,
                        resolvedAt: new Date().toISOString()
                    });
                }
            );
        }
    );
});

// Helper function to calculate trip duration
function calculateDuration(startDate, endDate) {
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays === 1 ? '1 day' : `${diffDays} days`;
}

module.exports = router;