const express = require('express');
const router = express.Router();
const { supabaseAdmin, db } = require('../config/supabase');
const { formatEasternTime } = require('../utils/timezone-utils');

// Custom auth middleware for trips route that doesn't destroy session aggressively
const requireAuth = async (req, res, next) => {
    try {
        // Check for Authorization header (Supabase JWT)
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        
        if (token) {
            // Using Supabase authentication
            const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
            
            if (!error && user) {
                // Get host data from database
                const { data: hostData, error: hostError } = await supabaseAdmin
                    .from('hosts')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                
                if (!hostError && hostData) {
                    // Set session data for backward compatibility
                    req.session = req.session || {};
                    req.session.hostId = hostData.id;
                    req.session.email = hostData.email;
                    req.session.fullName = hostData.full_name;
                    
                    // Store host info for route handlers
                    req.host = hostData;
                    req.user = user;
                    
                    return next();
                }
            }
        }
        
        // Fallback to session-based authentication
        if (!req.session || !req.session.hostId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        // Verify session is still valid in database using Supabase
        const { data: hostData, error: hostError } = await supabaseAdmin
            .from('hosts')
            .select('*')
            .eq('id', req.session.hostId)
            .single();
        
        if (hostError || !hostData) {
            // Don't destroy session - just return 401
            return res.status(401).json({
                success: false,
                error: 'Session expired'
            });
        }
        
        // Store host info for use in route handlers
        req.host = hostData;
        next();
        
    } catch (error) {
        console.error('❌ Authentication error:', error);
        return res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
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
        
        // Get all trips for this host using explicit host filtering
        const tripsResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('trips')
                .select('*')
                .eq('host_id', hostId)
                .order('start_date', { ascending: false });
        });
        
        const { data: trips, error: tripsError } = tripsResult;
        
        if (tripsError) {
            console.error('❌ Failed to fetch trips:', tripsError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch trips' 
            });
        }
        
        console.log(`📊 Found ${trips?.length || 0} trips for host`);
        
        // Get all toll charges for this host using explicit host filtering
        const tollChargesResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('toll_charges')
                .select(`
                    *,
                    toll_accounts!inner(provider, account_number, host_id)
                `)
                .eq('toll_accounts.host_id', hostId)
                .not('trip_id', 'is', null);
        });
        
        const { data: tollCharges, error: tollError } = tollChargesResult;
        
        if (tollError) {
            console.error('❌ Failed to fetch toll charges:', tollError);
        }
        
        // Get vehicle descriptions from transponder mappings using explicit host filtering
        const transponderResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('transponder_mappings')
                .select('transponder_number, vehicle_plate, vehicle_description')
                .eq('host_id', hostId)
                .eq('is_active', true);
        });
        
        const { data: transponderMappings, error: transponderError } = transponderResult;
        
        if (transponderError) {
            console.error('❌ Failed to fetch transponder mappings:', transponderError);
        }
        
        // Create lookup maps
        const tollsByTrip = {};
        const vehicleDescriptions = {};
        const transponderToPlate = {};
        
        // Create vehicle description lookup and transponder-to-plate mapping
        (transponderMappings || []).forEach(mapping => {
            vehicleDescriptions[mapping.vehicle_plate] = mapping.vehicle_description;
            
            // Handle transponder-to-plate mapping (handle null/empty transponder numbers for plate-only entries)
            if (mapping.transponder_number && !mapping.transponder_number.startsWith('PLATE_ONLY_')) {
                transponderToPlate[mapping.transponder_number] = mapping.vehicle_plate;
            }
        });
        
        // Group tolls by trip
        (tollCharges || []).forEach(toll => {
            if (toll.trip_id) {
                if (!tollsByTrip[toll.trip_id]) tollsByTrip[toll.trip_id] = [];
                // Determine plate number from transponder mapping or direct plate
                let plateNumber = toll.plate_number;
                if (toll.transponder_id && transponderToPlate[toll.transponder_id]) {
                    plateNumber = transponderToPlate[toll.transponder_id];
                }
                
                tollsByTrip[toll.trip_id].push({
                    id: toll.id,
                    location: toll.toll_location || 'Unknown Location',
                    amount: parseFloat(toll.toll_amount || 0),
                    time: formatEasternTime(toll.toll_date, true),
                    tollDate: new Date(toll.toll_date), // Store original date for sorting
                    provider: toll.toll_accounts?.provider || 'Unknown',
                    transponder: toll.transponder_id || toll.plate_number || 'Unknown',
                    transponderId: toll.transponder_id || null,
                    plateNumber: plateNumber || toll.plate_number || 'Unknown',
                    transactionId: toll.transaction_id || null
                });
            }
        });
        
        // Sort tolls within each trip from most recent to oldest
        Object.keys(tollsByTrip).forEach(tripId => {
            tollsByTrip[tripId].sort((a, b) => b.tollDate - a.tollDate);
        });
        
        // Transform trips data
        const transformedTrips = {
            completed: [],
            inProgress: [],
            upcoming: [],
            yourTolls: [],
            unmatchedTolls: [],
            lateTolls: []
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
            
            // Categorize trips based on dates only (per user requirements)
            if (endDate < now) {
                // Include ALL completed trips, regardless of toll amount
                transformedTrips.completed.push({
                    ...tripData,
                    status: 'completed'
                });
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
            const invoicesResult = await db.withHostContext(hostId, async () => {
                return await supabaseAdmin
                    .from('invoices')
                    .select('trip_id, created_at')
                    .in('trip_id', allTripIds);
            });
            
            const { data: invoices } = invoicesResult;
                
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
        
        // Get personal tolls (explicitly marked as personal) using explicit host filtering
        const personalTollsResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('toll_charges')
                .select(`
                    *,
                    toll_accounts!inner(provider, account_number, host_id)
                `)
                .eq('toll_accounts.host_id', hostId)
                .eq('is_personal', true)
                .order('toll_date', { ascending: false });
        });
        
        const { data: personalTolls, error: personalTollsError } = personalTollsResult;
        
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
        
        // Get unmatched tolls (not matched to trips and not marked as personal) using explicit host filtering
        const unmatchedTollsResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('toll_charges')
                .select(`
                    *,
                    toll_accounts!inner(provider, account_number, host_id)
                `)
                .eq('toll_accounts.host_id', hostId)
                .eq('is_matched', false)
                .eq('is_personal', false)
                .order('toll_date', { ascending: false });
        });
        
        const { data: unmatchedTolls, error: unmatchedTollsError } = unmatchedTollsResult;
        
        if (unmatchedTollsError) {
            console.error('❌ Failed to fetch unmatched tolls:', unmatchedTollsError);
            transformedTrips.unmatchedTolls = [];
        } else {
            transformedTrips.unmatchedTolls = (unmatchedTolls || []).map(toll => {
                const vehicleInfo = vehicleDescriptions[toll.plate_number] || null;
                
                return {
                    id: toll.id,
                    type: 'Unmatched Toll',
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
        
        // Get late tolls detected for submitted trips using explicit host filtering
        const lateTollsResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('late_tolls_detected')
                .select(`
                    *,
                    trips!inner(
                        id,
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
                        transaction_id,
                        submission_date
                    )
                `)
                .eq('trips.host_id', hostId)
                .order('detection_date', { ascending: false });
        });
        
        const { data: lateTolls, error: lateTollsError } = lateTollsResult;

        if (!lateTollsError && lateTolls && lateTolls.length > 0) {
            // Group late tolls by trip
            const lateTollsByTrip = {};
            
            lateTolls.forEach(lateToll => {
                const tripId = lateToll.trips.turo_trip_id;
                if (!lateTollsByTrip[tripId]) {
                    lateTollsByTrip[tripId] = {
                        id: tripId,
                        internalId: lateToll.trips.id,
                        guest: lateToll.trips.renter_name,
                        vehicle: lateToll.trips.vehicle_plate,
                        startDate: lateToll.trips.start_date,
                        endDate: lateToll.trips.end_date,
                        detectionDate: lateToll.detection_date,
                        status: lateToll.status,
                        lateTolls: [],
                        lateTollTotal: 0
                    };
                }
                
                // Add the toll to this trip
                const tollData = {
                    id: lateToll.id,
                    location: lateToll.toll_charges.toll_location || 'Unknown Location',
                    date: lateToll.toll_charges.toll_date,
                    amount: parseFloat(lateToll.toll_charges.toll_amount || 0),
                    transactionId: lateToll.toll_charges.transaction_id,
                    postedDate: lateToll.toll_charges.submission_date, // Posted date from E-ZPass CSV
                    detectionDate: lateToll.detection_date, // Keep for fallback
                    time: lateToll.toll_charges.toll_date ? 
                        new Date(lateToll.toll_charges.toll_date).toLocaleDateString() + ' ' +
                        new Date(lateToll.toll_charges.toll_date).toLocaleTimeString('en-US', { 
                            hour: 'numeric', 
                            minute: '2-digit', 
                            hour12: true 
                        }) : 'Unknown'
                };
                
                lateTollsByTrip[tripId].lateTolls.push(tollData);
                lateTollsByTrip[tripId].lateTollTotal += tollData.amount;
                
                // Keep track of the most recent status and detection date for the trip
                if (lateToll.detection_date > lateTollsByTrip[tripId].detectionDate) {
                    lateTollsByTrip[tripId].detectionDate = lateToll.detection_date;
                    lateTollsByTrip[tripId].status = lateToll.status;
                }
            });
            
            // Convert to array and add additional trip properties
            transformedTrips.lateTolls = Object.values(lateTollsByTrip)
                .map(trip => {
                    const startDate = new Date(trip.startDate);
                    const endDate = new Date(trip.endDate);
                    
                    return {
                        ...trip,
                        duration: calculateDuration(startDate, endDate),
                        vehicle_description: vehicleDescriptions[trip.vehicle] || '',
                        tolls: trip.lateTolls, // For compatibility with existing card renderer
                        tollTotal: trip.lateTollTotal // For compatibility with existing card renderer
                    };
                })
                .sort((a, b) => new Date(b.startDate) - new Date(a.startDate)); // Sort by trip start date (most recent first)
        }
        
        console.log('📊 Trip summary:', {
            completed: transformedTrips.completed.length,
            inProgress: transformedTrips.inProgress.length,
            upcoming: transformedTrips.upcoming.length,
            personalTolls: transformedTrips.yourTolls.length,
            lateTolls: transformedTrips.lateTolls.length
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
        // Get late tolls using explicit host filtering
        const lateTollsResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
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
        });
        
        const { data: lateTolls, error: lateTollsError } = lateTollsResult;
        
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
        
        // Verify late toll belongs to host using explicit host filtering
        const lateTollResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('late_tolls_detected')
                .select(`
                    *,
                    trips!inner(host_id)
                `)
                .eq('id', lateTollId)
                .eq('trips.host_id', hostId)
                .single();
        });
        
        const { data: lateToll, error: fetchError } = lateTollResult;
        
        if (fetchError || !lateToll) {
            console.error('❌ Late toll not found:', fetchError);
            return res.status(404).json({
                success: false,
                error: 'Late toll not found'
            });
        }
        
        // Update the late toll status using explicit host filtering
        const updateResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('late_tolls_detected')
                .update({
                    status: status,
                    resolution_notes: notes || null,
                    resolved_at: new Date().toISOString()
                })
                .eq('id', lateTollId);
            // Note: The lateTollId was already verified to belong to host above
        });
        
        const { error: updateError } = updateResult;
        
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

// Get detailed trip information
router.get('/:id', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const tripId = req.params.id;
    
    try {
        console.log('📋 Fetching trip details for:', tripId, 'host:', hostId);
        
        // Find the trip by turo_trip_id or internal id using RLS-aware context
        const tripResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('trips')
                .select('*')
                .or(`turo_trip_id.eq.${tripId},id.eq.${tripId}`)
                .single();
        });
        
        const { data: trip, error: tripError } = tripResult;
        
        if (tripError || !trip) {
            console.error('❌ Trip not found:', tripError);
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }
        
        console.log('✅ Found trip:', trip.id);
        
        // Get toll charges for this trip using RLS-aware context
        const tollChargesResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('toll_charges')
                .select(`
                    *,
                    toll_accounts(provider, account_number)
                `)
                .eq('trip_id', trip.id)
                .order('toll_date', { ascending: false });
        });
        
        const { data: tollCharges, error: tollError } = tollChargesResult;
        
        if (tollError) {
            console.error('❌ Failed to fetch toll charges:', tollError);
        }
        
        // Get invoice data for this trip using explicit host filtering
        const invoiceResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('invoices')
                .select(`
                    *,
                    invoice_items(amount)
                `)
                .eq('trip_id', trip.id)
                .single();
            // Note: trip.id is already filtered by host above
        });
        
        const { data: invoice, error: invoiceError } = invoiceResult;
        
        if (invoiceError && invoiceError.code !== 'PGRST116') {
            console.error('❌ Failed to fetch invoice:', invoiceError);
        }
        
        // Get vehicle description using explicit host filtering
        const vehicleMappingResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('transponder_mappings')
                .select('vehicle_description')
                .eq('host_id', hostId)
                .eq('vehicle_plate', trip.vehicle_plate)
                .eq('is_active', true)
                .single();
        });
        
        const { data: vehicleMapping, error: vehicleError } = vehicleMappingResult;
        
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
        
        // Verify trip belongs to host using explicit host filtering
        const tripResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('trips')
                .select('*')
                .eq('id', tripId)
                .eq('host_id', hostId)
                .single();
        });
        
        const { data: trip, error: tripError } = tripResult;
        
        if (tripError || !trip) {
            console.error('❌ Trip not found:', tripError);
            return res.status(404).json({ 
                success: false, 
                error: 'Trip not found' 
            });
        }
        
        // Check if trip already has an invoice using explicit host filtering
        const existingInvoiceResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('invoices')
                .select('id, created_at')
                .eq('trip_id', trip.id)
                .single();
            // Note: tripId was already verified to belong to host above
        });
        
        const { data: existingInvoice } = existingInvoiceResult;
            
        if (existingInvoice) {
            return res.status(409).json({ 
                success: false, 
                error: 'Trip already submitted to Turo',
                submittedDate: existingInvoice.created_at,
                code: 'ALREADY_SUBMITTED'
            });
        }
        
        // Get toll charges for this trip using explicit host filtering
        const chargesResult = await db.withHostContext(hostId, async () => {
            return await supabaseAdmin
                .from('toll_charges')
                .select(`
                    *,
                    toll_accounts!inner(provider, host_id)
                `)
                .eq('trip_id', tripId)
                .eq('toll_accounts.host_id', hostId)
                .eq('is_matched', true);
        });
        
        const { data: charges, error: chargesError } = chargesResult;
        
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
            
            // 2. Create invoice with snapshot data using service role (bypasses RLS)
            const invoiceResult = await supabaseAdmin
                .from('invoices')
                .insert({
                    trip_id: trip.id,
                    host_id: hostId,
                    invoice_number: invoiceNumber,
                    total_amount: totalAmount,
                    processing_fee: processingFee,
                    status: 'sent',
                    toll_charge_ids: JSON.stringify(tollChargeIds),
                    snapshot_data: JSON.stringify(snapshotData)
                })
                .select()
                .single();
            
            const { data: invoice, error: invoiceError } = invoiceResult;
            
            if (invoiceError) {
                throw new Error('Failed to create invoice: ' + invoiceError.message);
            }
            
            const invoiceId = invoice.id;
            console.log('📄 Created invoice:', invoiceId);
            
            // 3. Create invoice line items
            const invoiceItems = charges.map(charge => ({
                invoice_id: invoiceId,
                host_id: hostId,
                toll_charge_id: charge.id,
                description: `${charge.toll_location} - ${new Date(charge.toll_date).toLocaleDateString()}`,
                amount: charge.toll_amount
            }));
            
            const itemsResult = await supabaseAdmin
                .from('invoice_items')
                .insert(invoiceItems);
            
            const { error: itemsError } = itemsResult;
            
            if (itemsError) {
                throw new Error('Failed to create invoice items: ' + itemsError.message);
            }
            
            console.log('📝 Created', invoiceItems.length, 'invoice items');
            
            // 4. Mark all toll charges as submitted using RLS-aware context
            const updateTollsResult = await db.withHostContext(hostId, async () => {
                return await supabaseAdmin
                    .from('toll_charges')
                    .update({
                        submitted_to_turo: true,
                        invoice_id: invoiceId,
                        submission_date: new Date().toISOString()
                    })
                    .in('id', tollChargeIds);
            });
            
            const { error: updateTollsError } = updateTollsResult;
            
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


module.exports = router;