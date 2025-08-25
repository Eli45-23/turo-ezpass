const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');

// Middleware to check authentication
const requireAuth = async (req, res, next) => {
    console.log('🔐 Auth check - Session:', {
        hostId: req.session.hostId,
        sessionId: req.session.id,
        path: req.path
    });
    
    try {
        // Check for Authorization header (Supabase JWT)
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        
        if (token) {
            // Using Supabase authentication
            const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
            
            if (error || !user) {
                console.log('❌ Invalid Supabase token');
                return res.status(401).json({ success: false, error: 'Authentication required' });
            }
            
            // Get host data from database
            const { data: hostData, error: hostError } = await supabaseAdmin
                .from('hosts')
                .select('*')
                .eq('id', user.id)
                .single();
            
            if (hostError || !hostData) {
                console.log('❌ Host not found for authenticated user');
                return res.status(401).json({ success: false, error: 'User profile not found' });
            }
            
            req.session.hostId = hostData.id;
            req.session.email = hostData.email;
            req.session.fullName = hostData.full_name;
        } else {
            // Fallback to session-based auth - must have both hostId and email
            if (!req.session.hostId || !req.session.email) {
                console.log('❌ No valid session found');
                return res.status(401).json({ success: false, error: 'Authentication required' });
            }
        }
        
        console.log('✅ Authentication passed for host:', req.session.hostId);
        next();
    } catch (error) {
        console.error('❌ Authentication error:', error);
        return res.status(500).json({ success: false, error: 'Authentication failed' });
    }
};

// Generate invoice for a trip
router.post('/generate/:tripId', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const tripId = req.params.tripId;
    const { processingFee = 2.99 } = req.body;
    
    try {
        // Verify trip belongs to host
        const { data: trip, error: tripError } = await supabaseAdmin
            .from('trips')
            .select('*')
            .eq('id', tripId)
            .eq('host_id', hostId)
            .single();
        
        if (tripError || !trip) {
            return res.status(404).json({ 
                success: false, 
                error: 'Trip not found' 
            });
        }
        
        // Get all toll charges for this trip
        const { data: charges, error: chargesError } = await supabaseAdmin
            .from('toll_charges')
            .select('*')
            .eq('trip_id', tripId);
        
        if (chargesError) {
            console.error('❌ Error fetching toll charges:', chargesError);
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
        
        const tollTotal = charges.reduce((sum, c) => sum + (c.toll_amount || 0), 0);
        
        // Business validation: Don't generate invoices for zero toll amounts
        if (tollTotal <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot generate invoice: Total toll amount is $0.00. No charges to bill.',
                details: {
                    tollCharges: charges.length,
                    tollTotal: tollTotal,
                    processingFee: processingFee,
                    reason: 'Invoice generation requires actual toll charges > $0.00'
                }
            });
        }
        
        // Optional: Add minimum charge threshold (e.g., $1.00)
        const minimumCharge = 1.00;
        if (tollTotal < minimumCharge) {
            return res.status(400).json({
                success: false,
                error: `Cannot generate invoice: Total toll amount ($${tollTotal.toFixed(2)}) is below minimum threshold ($${minimumCharge.toFixed(2)}).`,
                details: {
                    tollCharges: charges.length,
                    tollTotal: tollTotal,
                    minimumRequired: minimumCharge,
                    processingFee: processingFee,
                    reason: 'Invoice generation requires minimum toll charges for cost efficiency'
                }
            });
        }
        
        const totalAmount = tollTotal + processingFee;
        const invoiceNumber = 'INV-' + Date.now() + '-' + tripId;
        
        // Create invoice
        const { data: newInvoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .insert({
                trip_id: tripId,
                invoice_number: invoiceNumber,
                total_amount: totalAmount,
                processing_fee: processingFee
            })
            .select()
            .single();
        
        if (invoiceError) {
            console.error('❌ Error creating invoice:', invoiceError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to create invoice' 
            });
        }
        
        const invoiceId = newInvoice.id;
        
        // Create invoice line items
        const lineItems = charges.map(charge => ({
            invoice_id: invoiceId,
            toll_charge_id: charge.id,
            description: `${charge.toll_location} - ${new Date(charge.toll_date).toLocaleDateString()}`,
            amount: charge.toll_amount
        }));
        
        const { error: itemsError } = await supabaseAdmin
            .from('invoice_items')
            .insert(lineItems);
        
        if (itemsError) {
            console.error('❌ Error creating invoice items:', itemsError);
            // Delete the invoice if items creation failed
            await supabaseAdmin.from('invoices').delete().eq('id', invoiceId);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to create invoice items' 
            });
        }
        
        res.json({
            success: true,
            message: 'Invoice generated successfully',
            invoice: {
                id: invoiceId,
                invoiceNumber: invoiceNumber,
                tripId: tripId,
                renterName: trip.renter_name,
                tollTotal: tollTotal,
                processingFee: processingFee,
                totalAmount: totalAmount,
                itemCount: charges.length
            }
        });
    } catch (error) {
        console.error('❌ Exception generating invoice:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate invoice' 
        });
    }
});

// Get all invoices for host
router.get('/', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        const { data: invoices, error } = await supabaseAdmin
            .from('invoices')
            .select(`
                *,
                trips!inner(
                    renter_name,
                    renter_email,
                    turo_trip_id,
                    vehicle_plate,
                    host_id
                )
            `)
            .eq('trips.host_id', hostId)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Error fetching invoices:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch invoices' 
            });
        }
        
        // Transform data to match frontend expectations
        const transformedInvoices = (invoices || []).map(invoice => {
            const issueDate = new Date(invoice.created_at);
            const dueDate = new Date(issueDate);
            dueDate.setDate(dueDate.getDate() + 30); // Due 30 days after issue date
            
            return {
                id: invoice.invoice_number,
                invoiceId: invoice.id, // Keep internal ID for API calls
                guest: invoice.trips.renter_name,
                guestEmail: invoice.trips.renter_email,
                tripId: invoice.trips.turo_trip_id,
                amount: parseFloat(invoice.total_amount || 0),
                status: invoice.status === 'sent' ? 'pending' : (invoice.status || 'pending'),
                issueDate: invoice.created_at,
                dueDate: dueDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
                processingFee: parseFloat(invoice.processing_fee || 0),
                vehicle: invoice.trips.vehicle_plate,
                submittedToTuro: true // All invoices in this list are from submitted trips
            };
        });
        
        res.json({
            success: true,
            data: transformedInvoices
        });
    } catch (error) {
        console.error('❌ Exception fetching invoices:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch invoices' 
        });
    }
});

// Get invoice details
router.get('/:invoiceId', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    
    try {
        // Get invoice with trip details
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select(`
                *,
                trips!inner(
                    renter_name,
                    renter_email,
                    turo_trip_id,
                    vehicle_plate,
                    start_date,
                    end_date,
                    host_id
                )
            `)
            .eq('id', invoiceId)
            .eq('trips.host_id', hostId)
            .single();
        
        if (invoiceError || !invoice) {
            return res.status(404).json({ 
                success: false, 
                error: 'Invoice not found' 
            });
        }
        
        // Get invoice line items
        const { data: items, error: itemsError } = await supabaseAdmin
            .from('invoice_items')
            .select(`
                *,
                toll_charges(
                    toll_date,
                    toll_location,
                    plate_number,
                    transaction_id
                )
            `)
            .eq('invoice_id', invoiceId);
        
        if (itemsError) {
            console.error('❌ Error fetching invoice items:', itemsError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch invoice items' 
            });
        }
        
        // Flatten the structure to match expected format
        const flattenedInvoice = {
            ...invoice,
            renter_name: invoice.trips.renter_name,
            renter_email: invoice.trips.renter_email,
            turo_trip_id: invoice.trips.turo_trip_id,
            vehicle_plate: invoice.trips.vehicle_plate,
            start_date: invoice.trips.start_date,
            end_date: invoice.trips.end_date
        };
        
        const flattenedItems = (items || []).map(item => ({
            ...item,
            toll_date: item.toll_charges?.toll_date,
            toll_location: item.toll_charges?.toll_location,
            plate_number: item.toll_charges?.plate_number,
            transaction_id: item.toll_charges?.transaction_id
        }));
        
        res.json({
            success: true,
            data: {
                invoice: flattenedInvoice,
                items: flattenedItems
            }
        });
    } catch (error) {
        console.error('❌ Exception fetching invoice details:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch invoice details' 
        });
    }
});

// Send invoice to renter (mock implementation)
router.post('/:invoiceId/send', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    
    try {
        // Verify invoice belongs to host using Supabase
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select(`
                *,
                trips!inner(renter_email, renter_name, host_id)
            `)
            .eq('id', invoiceId)
            .eq('trips.host_id', hostId)
            .single();

        if (invoiceError || !invoice) {
            console.error('❌ Invoice not found:', invoiceError);
            return res.status(404).json({ 
                success: false, 
                error: 'Invoice not found' 
            });
        }
        
        // Mock sending email (in production, integrate with email service)
        console.log(`Sending invoice ${invoice.invoice_number} to ${invoice.trips.renter_email}`);
        
        // Update invoice status using Supabase
        const { error: updateError } = await supabaseAdmin
            .from('invoices')
            .update({
                status: 'sent',
                sent_date: new Date().toISOString()
            })
            .eq('id', invoiceId);

        if (updateError) {
            console.error('❌ Failed to update invoice status:', updateError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to update invoice status' 
            });
        }
        
        res.json({
            success: true,
            message: `Invoice sent to ${invoice.trips.renter_name} (${invoice.trips.renter_email})`
        });
    } catch (error) {
        console.error('❌ Error sending invoice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send invoice'
        });
    }
});

// Process payment through Turo (mock implementation)
router.post('/:invoiceId/charge', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    
    try {
        // Verify invoice belongs to host using Supabase
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select(`
                *,
                trips!inner(turo_trip_id, host_id)
            `)
            .eq('id', invoiceId)
            .eq('trips.host_id', hostId)
            .single();

        if (invoiceError || !invoice) {
            console.error('❌ Invoice not found:', invoiceError);
            return res.status(404).json({ 
                success: false, 
                error: 'Invoice not found' 
            });
        }
        
        // Mock Turo API call to add extra charge
        const turoChargeId = 'TURO-' + Date.now();
        console.log(`Processing Turo charge for trip ${invoice.trips.turo_trip_id}: $${invoice.total_amount}`);
        
        // Update invoice status using Supabase
        const { error: updateError } = await supabaseAdmin
            .from('invoices')
            .update({
                status: 'paid',
                paid_date: new Date().toISOString(),
                turo_charge_id: turoChargeId
            })
            .eq('id', invoiceId);

        if (updateError) {
            console.error('❌ Failed to update invoice status:', updateError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to update invoice status' 
            });
        }
        
        res.json({
            success: true,
            message: 'Charge processed through Turo successfully',
            turoChargeId: turoChargeId,
            amount: invoice.total_amount
        });
    } catch (error) {
        console.error('❌ Error processing charge:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process charge'
        });
    }
});

// Delete invoice
router.delete('/:invoiceId', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    
    try {
        // Verify invoice belongs to host using Supabase
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select(`
                *,
                trips!inner(renter_name, host_id)
            `)
            .eq('id', invoiceId)
            .eq('trips.host_id', hostId)
            .single();

        if (invoiceError || !invoice) {
            console.error('❌ Invoice not found:', invoiceError);
            return res.status(404).json({ 
                success: false, 
                error: 'Invoice not found' 
            });
        }
        
        // Delete invoice items first (foreign key constraint) using Supabase
        const { error: itemsError } = await supabaseAdmin
            .from('invoice_items')
            .delete()
            .eq('invoice_id', invoiceId);

        if (itemsError) {
            console.error('❌ Error deleting invoice items:', itemsError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to delete invoice items' 
            });
        }
        
        // Delete the invoice using Supabase
        const { error: deleteError } = await supabaseAdmin
            .from('invoices')
            .delete()
            .eq('id', invoiceId);

        if (deleteError) {
            console.error('❌ Error deleting invoice:', deleteError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to delete invoice' 
            });
        }
        
        console.log(`✅ Invoice ${invoice.invoice_number} deleted successfully`);
        
        res.json({
            success: true,
            message: `Invoice ${invoice.invoice_number} has been deleted successfully`
        });
    } catch (error) {
        console.error('❌ Error deleting invoice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete invoice'
        });
    }
});

// Update invoice details
router.put('/:invoiceId', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    const { status, processingFee, notes } = req.body;
    
    try {
        // Verify invoice belongs to host using Supabase
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select(`
                *,
                trips!inner(renter_name, host_id)
            `)
            .eq('id', invoiceId)
            .eq('trips.host_id', hostId)
            .single();

        if (invoiceError || !invoice) {
            console.error('❌ Invoice not found:', invoiceError);
            return res.status(404).json({ 
                success: false, 
                error: 'Invoice not found' 
            });
        }
        
        // Build update object dynamically based on provided fields
        const updateData = {};
        let updatedFieldsCount = 0;
        
        if (status !== undefined) {
            updateData.status = status;
            updatedFieldsCount++;
        }
        
        if (processingFee !== undefined) {
            updateData.processing_fee = processingFee;
            updatedFieldsCount++;
        }
        
        if (notes !== undefined) {
            updateData.validation_notes = notes;
            updatedFieldsCount++;
        }
        
        if (updatedFieldsCount === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields provided to update'
            });
        }
        
        // Update invoice using Supabase
        const { error: updateError } = await supabaseAdmin
            .from('invoices')
            .update(updateData)
            .eq('id', invoiceId);

        if (updateError) {
            console.error('❌ Error updating invoice:', updateError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to update invoice' 
            });
        }
        
        console.log(`✅ Invoice ${invoice.invoice_number} updated successfully`);
        
        res.json({
            success: true,
            message: `Invoice ${invoice.invoice_number} updated successfully`,
            invoiceId: parseInt(invoiceId),
            updatedFields: updatedFieldsCount
        });
    } catch (error) {
        console.error('❌ Error updating invoice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update invoice'
        });
    }
});

// Unsubmit invoice - reverse trip submission
router.delete('/:invoiceId/unsubmit', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    
    try {
        // Get invoice and verify it belongs to host using Supabase
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select(`
                *,
                trips!inner(id, turo_trip_id, host_id)
            `)
            .eq('id', invoiceId)
            .eq('trips.host_id', hostId)
            .single();

        if (invoiceError || !invoice) {
            console.error('❌ Invoice not found:', invoiceError);
            return res.status(404).json({ 
                success: false, 
                error: 'Invoice not found' 
            });
        }
        
        const tripId = invoice.trips.id;
        const tripTuroId = invoice.trips.turo_trip_id;
        
        // Delete invoice items first (foreign key constraint)
        const { error: itemsError } = await supabaseAdmin
            .from('invoice_items')
            .delete()
            .eq('invoice_id', invoiceId);

        if (itemsError) {
            console.error('❌ Error deleting invoice items:', itemsError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to delete invoice items' 
            });
        }
        
        // Delete invoice
        const { error: deleteError } = await supabaseAdmin
            .from('invoices')
            .delete()
            .eq('id', invoiceId);

        if (deleteError) {
            console.error('❌ Error deleting invoice:', deleteError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to delete invoice' 
            });
        }
        
        // Note: Skip trip table update since submitted_to_turo/submitted_date fields don't exist
        // We track submission status through the existence of invoices instead
        
        res.json({
            success: true,
            message: 'Trip successfully unsubmitted',
            trip: {
                id: tripId,
                turoTripId: tripTuroId,
                submitted: false
            }
        });
    } catch (error) {
        console.error('❌ Error unsubmitting invoice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unsubmit invoice'
        });
    }
});

module.exports = router;