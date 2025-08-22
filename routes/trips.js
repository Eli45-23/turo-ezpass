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

// Helper function to calculate trip duration
function calculateDuration(startDate, endDate) {
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays === 1 ? '1 day' : `${diffDays} days`;
}

// Get all trips for host
router.get('/', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        console.log('📋 Fetching trips for host:', hostId);
        
        // Get all trips for this host
        const { data: trips, error: tripsError } = await supabaseAdmin
            .from('trips')
            .select('*')
            .eq('host_id', hostId)
            .order('start_date', { ascending: false });
        
        if (tripsError) {
            console.error('❌ Failed to fetch trips:', tripsError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch trips' 
            });
        }
        
        console.log(`📊 Found ${trips?.length || 0} trips for host`);
        
        // Get all toll charges for this host's trips
        const { data: tollCharges, error: tollError } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                *,
                toll_accounts(provider, account_number)
            `)
            .eq('is_matched', true)
            .not('trip_id', 'is', null);
        
        if (tollError) {
            console.error('❌ Failed to fetch toll charges:', tollError);
        }
        
        // Get vehicle descriptions from transponder mappings
        const { data: transponderMappings, error: transponderError } = await supabaseAdmin
            .from('transponder_mappings')
            .select('vehicle_plate, vehicle_description')
            .eq('host_id', hostId)
            .eq('is_active', true);
        
        if (transponderError) {
            console.error('❌ Failed to fetch transponder mappings:', transponderError);
        }
        
        // Create lookup maps
        const tollsByTrip = {};
        const vehicleDescriptions = {};
        
        // Create vehicle description lookup
        (transponderMappings || []).forEach(mapping => {
            vehicleDescriptions[mapping.vehicle_plate] = mapping.vehicle_description;
        });
        
        // Group tolls by trip
        (tollCharges || []).forEach(toll => {
            if (toll.trip_id) {
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
                    provider: toll.toll_accounts?.provider || 'Unknown',
                    transponder: toll.transponder_id || toll.plate_number || 'Unknown',
                    transactionId: toll.transaction_id || null
                });
            }
        });
        
        // Transform trips data
        const transformedTrips = {
            completed: [],
            inProgress: [],
            upcoming: [],
            yourTolls: []
        };
        
        const now = new Date();
        
        (trips || []).forEach(trip => {
            const startDate = new Date(trip.start_date);
            const endDate = new Date(trip.end_date);
            const tripTolls = tollsByTrip[trip.id] || [];
            const tollTotal = tripTolls.reduce((sum, toll) => sum + toll.amount, 0);
            
            const tripData = {
                id: trip.turo_trip_id || trip.id,
                internalId: trip.id, // Internal database ID for API calls
                guest: trip.renter_name || 'Unknown Guest',
                vehicle: trip.vehicle_plate || 'Unknown Vehicle',
                vehicle_plate: trip.vehicle_plate,
                vehicle_description: vehicleDescriptions[trip.vehicle_plate] || '',
                startDate: trip.start_date,
                endDate: trip.end_date,
                duration: calculateDuration(startDate, endDate),
                mileage: 0, // Not available in current schema
                revenue: 0, // Will be populated from invoices if available
                tolls: tripTolls,
                tollTotal: tollTotal,
                submittedToTuro: false, // Will be updated based on invoice existence
                submittedDate: null
            };
            
            // Categorize trips based on dates and status
            if (endDate < now && trip.trip_status !== 'upcoming') {
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
        
        // Check for invoices to determine submission status
        const allTripIds = [...transformedTrips.completed, ...transformedTrips.inProgress, ...transformedTrips.upcoming]
            .map(trip => trip.internalId);
            
        if (allTripIds.length > 0) {
            const { data: invoices } = await supabaseAdmin
                .from('invoices')
                .select('trip_id, created_at')
                .in('trip_id', allTripIds);
                
            const invoicesByTripId = {};
            (invoices || []).forEach(invoice => {
                invoicesByTripId[invoice.trip_id] = invoice;
            });
            
            // Update submission status and filter out submitted trips from trips page
            [transformedTrips.completed, transformedTrips.inProgress, transformedTrips.upcoming].forEach(tripList => {
                for (let i = tripList.length - 1; i >= 0; i--) {
                    const trip = tripList[i];
                    const invoice = invoicesByTripId[trip.internalId];
                    if (invoice) {
                        // Trip has been submitted - remove from trips page (it belongs in invoices page)
                        tripList.splice(i, 1);
                    }
                }
            });
        }
        
        // Get personal tolls (unmatched toll charges)
        const { data: personalTolls, error: personalTollsError } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                *,
                toll_accounts!inner(provider, account_number, host_id)
            `)
            .eq('toll_accounts.host_id', hostId)
            .eq('is_matched', false)
            .order('toll_date', { ascending: false });
        
        if (personalTollsError) {
            console.error('❌ Failed to fetch personal tolls:', personalTollsError);
            transformedTrips.yourTolls = [];
        } else {
            transformedTrips.yourTolls = (personalTolls || []).map(toll => {
                const vehicleInfo = vehicleDescriptions[toll.plate_number] || null;
                
                return {
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
                    vehicle: vehicleInfo ? 
                        `${vehicleInfo} (${toll.plate_number})` : 
                        `${toll.toll_accounts.provider} (${toll.toll_accounts.account_number})`,
                    transponder: toll.transponder_id || toll.plate_number || 'Unknown',
                    vehicle_plate: toll.plate_number || null
                };
            });
        }
        
        console.log('📊 Trip summary:', {
            completed: transformedTrips.completed.length,
            inProgress: transformedTrips.inProgress.length,
            upcoming: transformedTrips.upcoming.length,
            personalTolls: transformedTrips.yourTolls.length
        });
        
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
router.get('/:id', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const tripId = req.params.id;
    
    try {
        console.log('📋 Fetching trip details for:', tripId, 'host:', hostId);
        
        // Find the trip by turo_trip_id or internal id
        const { data: trip, error: tripError } = await supabaseAdmin
            .from('trips')
            .select('*')
            .eq('host_id', hostId)
            .or(`turo_trip_id.eq.${tripId},id.eq.${tripId}`)
            .single();
        
        if (tripError || !trip) {
            console.error('❌ Trip not found:', tripError);
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }
        
        console.log('✅ Found trip:', trip.id);
        
        // Get toll charges for this trip
        const { data: tollCharges, error: tollError } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                *,
                toll_accounts(provider, account_number)
            `)
            .eq('trip_id', trip.id)
            .order('toll_date', { ascending: true });
        
        if (tollError) {
            console.error('❌ Failed to fetch toll charges:', tollError);
        }
        
        // Get invoice data for this trip
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select(`
                *,
                invoice_items(amount)
            `)
            .eq('trip_id', trip.id)
            .single();
        
        if (invoiceError && invoiceError.code !== 'PGRST116') {
            console.error('❌ Failed to fetch invoice:', invoiceError);
        }
        
        // Get vehicle description
        const { data: vehicleMapping, error: vehicleError } = await supabaseAdmin
            .from('transponder_mappings')
            .select('vehicle_description')
            .eq('host_id', hostId)
            .eq('vehicle_plate', trip.vehicle_plate)
            .eq('is_active', true)
            .single();
        
        if (vehicleError && vehicleError.code !== 'PGRST116') {
            console.error('❌ Failed to fetch vehicle mapping:', vehicleError);
        }
        
        const startDate = new Date(trip.start_date);
        const endDate = new Date(trip.end_date);
        const now = new Date();
        
        let status = 'upcoming';
        if (endDate < now && trip.trip_status !== 'upcoming') {
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
            provider: toll.toll_accounts?.provider || 'Unknown',
            transponder: toll.transponder_id || toll.plate_number || 'Unknown',
            transactionId: toll.transaction_id
        }));
        
        const tollTotal = tolls.reduce((sum, toll) => sum + toll.amount, 0);
        const invoiceTotal = invoice?.invoice_items?.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0) || 0;
        
        const tripDetails = {
            id: trip.turo_trip_id || trip.id,
            turoTripId: trip.turo_trip_id,
            guest: trip.renter_name || 'Unknown Guest',
            guestEmail: trip.renter_email,
            vehicle: trip.vehicle_plate || 'Unknown Vehicle',
            vehicle_description: vehicleMapping?.vehicle_description || '',
            startDate: trip.start_date,
            endDate: trip.end_date,
            status: status,
            duration: calculateDuration(startDate, endDate),
            mileage: 0, // Not available in current schema
            revenue: invoiceTotal,
            tolls: tolls,
            tollTotal: tollTotal,
            tollCount: tolls.length,
            invoice: invoice ? {
                id: invoice.id,
                status: invoice.status,
                totalAmount: invoiceTotal,
                itemCount: invoice.invoice_items?.length || 0,
                createdAt: invoice.created_at,
                sentAt: invoice.sent_at
            } : null,
            submittedToTuro: !!invoice, // True if invoice exists
            submittedDate: invoice?.created_at || null,
            createdAt: trip.created_at
        };
        
        console.log('📊 Trip details prepared:', {
            id: tripDetails.id,
            tollCount: tolls.length,
            tollTotal: tollTotal
        });
        
        res.json({
            success: true,
            data: tripDetails
        });
        
    } catch (error) {
        console.error('❌ Exception fetching trip details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch trip details'
        });
    }
});

// Submit trip to Turo and generate invoice
router.post('/:tripId/submit', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const tripId = req.params.tripId;
    
    try {
        console.log('📤 Submitting trip to Turo:', tripId, 'for host:', hostId);
        
        // Verify trip belongs to host and isn't already submitted
        const { data: trip, error: tripError } = await supabaseAdmin
            .from('trips')
            .select('*')
            .eq('id', tripId)
            .eq('host_id', hostId)
            .single();
        
        if (tripError || !trip) {
            console.error('❌ Trip not found:', tripError);
            return res.status(404).json({ 
                success: false, 
                error: 'Trip not found' 
            });
        }
        
        // Check if trip already has an invoice (already submitted)
        const { data: existingInvoice } = await supabaseAdmin
            .from('invoices')
            .select('id, created_at')
            .eq('trip_id', tripId)
            .single();
            
        if (existingInvoice) {
            return res.status(409).json({ 
                success: false, 
                error: 'Trip already submitted to Turo',
                submittedDate: existingInvoice.created_at,
                code: 'ALREADY_SUBMITTED'
            });
        }
        
        // Get toll charges for this trip
        const { data: charges, error: chargesError } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                *,
                toll_accounts(provider)
            `)
            .eq('trip_id', tripId)
            .eq('is_matched', true);
        
        if (chargesError) {
            console.error('❌ Failed to fetch toll charges:', chargesError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch toll charges' 
            });
        }
        
        if (!charges || charges.length === 0) {
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
        
        console.log('💰 Invoice details:', {
            tollTotal,
            processingFee,
            totalAmount,
            chargeCount: charges.length
        });
        
        // Use Supabase transaction-like approach with error handling
        try {
            // Note: Skip trip table update for now since submitted_to_turo/submitted_date fields don't exist yet
            // We'll track submission status through the invoices table instead
            
            // 2. Create invoice with snapshot data
            const { data: invoice, error: invoiceError } = await supabaseAdmin
                .from('invoices')
                .insert({
                    trip_id: tripId,
                    invoice_number: invoiceNumber,
                    total_amount: totalAmount,
                    processing_fee: processingFee,
                    status: 'sent',
                    toll_charge_ids: tollChargeIds,
                    snapshot_data: snapshotData
                })
                .select()
                .single();
            
            if (invoiceError) {
                throw new Error('Failed to create invoice: ' + invoiceError.message);
            }
            
            const invoiceId = invoice.id;
            console.log('📄 Created invoice:', invoiceId);
            
            // 3. Create invoice line items
            const invoiceItems = charges.map(charge => ({
                invoice_id: invoiceId,
                toll_charge_id: charge.id,
                description: `${charge.toll_location} - ${new Date(charge.toll_date).toLocaleDateString()}`,
                amount: charge.toll_amount
            }));
            
            const { error: itemsError } = await supabaseAdmin
                .from('invoice_items')
                .insert(invoiceItems);
            
            if (itemsError) {
                throw new Error('Failed to create invoice items: ' + itemsError.message);
            }
            
            console.log('📝 Created', invoiceItems.length, 'invoice items');
            
            // 4. Mark all toll charges as submitted
            const { error: updateTollsError } = await supabaseAdmin
                .from('toll_charges')
                .update({
                    submitted_to_turo: true,
                    invoice_id: invoiceId,
                    submission_date: new Date().toISOString()
                })
                .in('id', tollChargeIds);
            
            if (updateTollsError) {
                throw new Error('Failed to mark toll charges as submitted: ' + updateTollsError.message);
            }
            
            console.log('✅ Trip', tripId, 'submitted with', charges.length, 'tolls marked as submitted');
            
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
            
        } catch (transactionError) {
            console.error('❌ Transaction failed:', transactionError);
            
            // Note: Supabase doesn't support explicit rollback like SQLite
            // In a production system, you'd want to implement compensation logic here
            // For now, we'll return the error and let the user retry
            
            return res.status(500).json({
                success: false,
                error: 'Failed to submit trip: ' + transactionError.message
            });
        }
        
    } catch (error) {
        console.error('❌ Exception submitting trip:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit trip'
        });
    }
});

// Get late tolls detected for submitted trips
router.get('/late-tolls', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    console.log('🔎 Late tolls endpoint hit - Debug info:', {
        hostId: hostId,
        sessionId: req.session.id,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    try {
        // Note: This assumes a late_tolls_detected table exists
        // For now, we'll return an empty array as this feature may not be fully implemented
        const { data: lateTolls, error: lateTollsError } = await supabaseAdmin
            .from('late_tolls_detected')
            .select(`
                *,
                trips!inner(
                    turo_trip_id,
                    vehicle_plate,
                    renter_name,
                    start_date,
                    end_date,
                    host_id
                ),
                toll_charges!inner(
                    toll_location,
                    toll_amount,
                    toll_date,
                    transaction_id
                )
            `)
            .eq('trips.host_id', hostId)
            .order('detection_date', { ascending: false });
        
        if (lateTollsError) {
            console.error('❌ Failed to fetch late tolls:', lateTollsError);
            // If table doesn't exist, return empty array
            if (lateTollsError.code === '42P01') {
                console.log('ℹ️ Late tolls table not found, returning empty array');
                return res.json({
                    success: true,
                    data: [],
                    count: 0
                });
            }
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch late tolls'
            });
        }
        
        const processedLateTolls = (lateTolls || []).map(toll => ({
            id: toll.id,
            tripId: toll.trips.turo_trip_id,
            vehicle: toll.trips.vehicle_plate,
            guest: toll.trips.renter_name,
            tripStartDate: toll.trips.start_date,
            tripEndDate: toll.trips.end_date,
            tollLocation: toll.toll_charges?.toll_location,
            tollAmount: parseFloat(toll.toll_charges?.toll_amount || 0),
            tollDate: toll.toll_charges?.toll_date,
            transactionId: toll.toll_charges?.transaction_id,
            detectionDate: toll.detection_date,
            status: toll.status,
            originalInvoice: null,
            originalInvoiceAmount: 0,
            resolutionNotes: toll.resolution_notes,
            resolvedAt: toll.resolved_at
        }));
        
        console.log('📊 Found', processedLateTolls.length, 'late tolls');
        
        res.json({
            success: true,
            data: processedLateTolls,
            count: processedLateTolls.length
        });
        
    } catch (error) {
        console.error('❌ Exception fetching late tolls:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch late tolls'
        });
    }
});

// Acknowledge/resolve a late toll
router.put('/late-tolls/:lateTollId/resolve', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const lateTollId = req.params.lateTollId;
    const { status, notes } = req.body;
    
    // Validate status
    const validStatuses = ['acknowledged', 'resolved', 'waived'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid status. Must be acknowledged, resolved, or waived'
        });
    }
    
    try {
        console.log('🔧 Resolving late toll:', lateTollId, 'status:', status);
        
        // Verify late toll belongs to host
        const { data: lateToll, error: fetchError } = await supabaseAdmin
            .from('late_tolls_detected')
            .select(`
                *,
                trips!inner(host_id)
            `)
            .eq('id', lateTollId)
            .eq('trips.host_id', hostId)
            .single();
        
        if (fetchError || !lateToll) {
            console.error('❌ Late toll not found:', fetchError);
            return res.status(404).json({
                success: false,
                error: 'Late toll not found'
            });
        }
        
        // Update the late toll status
        const { error: updateError } = await supabaseAdmin
            .from('late_tolls_detected')
            .update({
                status: status,
                resolution_notes: notes || null,
                resolved_at: new Date().toISOString()
            })
            .eq('id', lateTollId);
        
        if (updateError) {
            console.error('❌ Failed to update late toll:', updateError);
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
        
    } catch (error) {
        console.error('❌ Exception resolving late toll:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to resolve late toll'
        });
    }
});


// Generate supplemental invoice for late tolls
router.post('/late-tolls/generate-invoice', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const { lateTollIds, description } = req.body;

    try {
        console.log(`📄 Generating supplemental invoice for ${lateTollIds.length} late tolls`);

        if (!lateTollIds || lateTollIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No late tolls selected for invoice generation'
            });
        }

        // Fetch the late tolls with trip and toll charge information
        const { data: lateTolls, error: fetchError } = await supabaseAdmin
            .from('late_tolls_detected')
            .select(`
                *,
                trips!inner(id, turo_trip_id, renter_name, renter_email, vehicle_plate),
                toll_charges!inner(id, toll_amount, toll_location, toll_date, transaction_id)
            `)
            .in('id', lateTollIds)
            .eq('host_id', hostId);

        if (fetchError) {
            console.error('❌ Error fetching late tolls for invoice:', fetchError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch late toll data'
            });
        }

        if (!lateTolls || lateTolls.length !== lateTollIds.length) {
            return res.status(400).json({
                success: false,
                error: 'Some late tolls not found or access denied'
            });
        }

        // Calculate totals
        const tollTotal = lateTolls.reduce((sum, lt) => sum + parseFloat(lt.toll_charges.toll_amount || 0), 0);
        const processingFee = 2.99; // Standard processing fee
        const totalAmount = tollTotal + processingFee;
        const invoiceNumber = 'SUP-INV-' + Date.now() + '-LT';

        // Create supplemental invoice
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .insert({
                trip_id: lateTolls[0].trip_id, // Use first trip as primary reference
                host_id: hostId,
                invoice_number: invoiceNumber,
                invoice_type: 'supplemental',
                description: description || `Supplemental invoice for ${lateTolls.length} late toll(s)`,
                toll_total: tollTotal,
                processing_fee: processingFee,
                total_amount: totalAmount,
                status: 'sent',
                created_at: new Date().toISOString(),
                snapshot_data: {
                    type: 'supplemental_late_tolls',
                    timestamp: new Date().toISOString(),
                    late_toll_count: lateTolls.length,
                    original_submission_dates: lateTolls.map(lt => lt.original_submission_date),
                    late_tolls: lateTolls.map(lt => ({
                        id: lt.id,
                        detection_date: lt.detection_date,
                        toll_amount: lt.toll_charges.toll_amount,
                        toll_location: lt.toll_charges.toll_location,
                        toll_date: lt.toll_charges.toll_date,
                        transaction_id: lt.toll_charges.transaction_id
                    }))
                }
            })
            .select()
            .single();

        if (invoiceError) {
            console.error('❌ Error creating supplemental invoice:', invoiceError);
            return res.status(500).json({
                success: false,
                error: 'Failed to create supplemental invoice'
            });
        }

        // Create invoice items for each late toll
        const invoiceItems = lateTolls.map(lateToll => ({
            invoice_id: invoice.id,
            toll_charge_id: lateToll.toll_charges.id,
            description: `Late Toll: ${lateToll.toll_charges.toll_location}`,
            amount: lateToll.toll_charges.toll_amount,
            toll_date: lateToll.toll_charges.toll_date,
            toll_location: lateToll.toll_charges.toll_location,
            transaction_id: lateToll.toll_charges.transaction_id
        }));

        // Add processing fee as an item
        invoiceItems.push({
            invoice_id: invoice.id,
            toll_charge_id: null,
            description: 'Processing Fee',
            amount: processingFee,
            toll_date: null,
            toll_location: 'Processing Fee',
            transaction_id: 'PROCESSING_FEE'
        });

        const { error: itemsError } = await supabaseAdmin
            .from('invoice_items')
            .insert(invoiceItems);

        if (itemsError) {
            console.error('❌ Error creating invoice items:', itemsError);
            // Try to clean up the invoice
            await supabaseAdmin.from('invoices').delete().eq('id', invoice.id);
            return res.status(500).json({
                success: false,
                error: 'Failed to create invoice items'
            });
        }

        // Mark the late tolls as invoiced
        const { error: updateLateTollsError } = await supabaseAdmin
            .from('late_tolls_detected')
            .update({
                status: 'invoiced',
                supplemental_invoice_id: invoice.id,
                resolved_at: new Date().toISOString()
            })
            .in('id', lateTollIds);

        if (updateLateTollsError) {
            console.warn('⚠️ Error updating late toll status to invoiced:', updateLateTollsError);
            // Don't fail the request, invoice was created successfully
        }

        // Mark the toll charges as submitted
        const tollChargeIds = lateTolls.map(lt => lt.toll_charges.id);
        const { error: updateTollChargesError } = await supabaseAdmin
            .from('toll_charges')
            .update({
                submitted_to_turo: true,
                invoice_id: invoice.id,
                submission_date: new Date().toISOString()
            })
            .in('id', tollChargeIds);

        if (updateTollChargesError) {
            console.warn('⚠️ Error marking toll charges as submitted:', updateTollChargesError);
            // Don't fail the request, invoice was created successfully
        }

        console.log(`✅ Supplemental invoice created: ${invoiceNumber} for $${totalAmount.toFixed(2)}`);

        res.json({
            success: true,
            message: 'Supplemental invoice generated successfully',
            invoice: {
                id: invoice.id,
                invoice_number: invoiceNumber,
                total_amount: totalAmount,
                toll_total: tollTotal,
                processing_fee: processingFee,
                item_count: lateTolls.length,
                type: 'supplemental'
            }
        });

    } catch (error) {
        console.error('❌ Exception generating supplemental invoice:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;