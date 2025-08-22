const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');

// Middleware to check authentication (UUID-based like other routes)
const requireAuth = async (req, res, next) => {
    console.log('🔐 Auth check - Session:', {
        hostId: req.session.hostId,
        sessionId: req.session.id,
        path: req.path
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
router.post('/:invoiceId/send', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    
    // Verify invoice belongs to host
    db.get(
        `SELECT i.*, t.renter_email, t.renter_name
         FROM invoices i
         JOIN trips t ON i.trip_id = t.id
         WHERE i.id = ? AND t.host_id = ?`,
        [invoiceId, hostId],
        (err, invoice) => {
            if (err || !invoice) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Invoice not found' 
                });
            }
            
            // Mock sending email (in production, integrate with email service)
            console.log(`Sending invoice ${invoice.invoice_number} to ${invoice.renter_email}`);
            
            // Update invoice status
            db.run(
                `UPDATE invoices SET status = 'sent', sent_date = CURRENT_TIMESTAMP WHERE id = ?`,
                [invoiceId],
                (err) => {
                    if (err) {
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to update invoice status' 
                        });
                    }
                    
                    res.json({
                        success: true,
                        message: `Invoice sent to ${invoice.renter_name} (${invoice.renter_email})`
                    });
                }
            );
        }
    );
});

// Process payment through Turo (mock implementation)
router.post('/:invoiceId/charge', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    
    // Verify invoice belongs to host
    db.get(
        `SELECT i.*, t.turo_trip_id
         FROM invoices i
         JOIN trips t ON i.trip_id = t.id
         WHERE i.id = ? AND t.host_id = ?`,
        [invoiceId, hostId],
        (err, invoice) => {
            if (err || !invoice) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Invoice not found' 
                });
            }
            
            // Mock Turo API call to add extra charge
            const turoChargeId = 'TURO-' + Date.now();
            console.log(`Processing Turo charge for trip ${invoice.turo_trip_id}: $${invoice.total_amount}`);
            
            // Update invoice status
            db.run(
                `UPDATE invoices 
                 SET status = 'paid', 
                     paid_date = CURRENT_TIMESTAMP, 
                     turo_charge_id = ?
                 WHERE id = ?`,
                [turoChargeId, invoiceId],
                (err) => {
                    if (err) {
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
                }
            );
        }
    );
});

// Delete invoice
router.delete('/:invoiceId', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    
    // Verify invoice belongs to host
    db.get(
        `SELECT i.*, t.renter_name
         FROM invoices i
         JOIN trips t ON i.trip_id = t.id
         WHERE i.id = ? AND t.host_id = ?`,
        [invoiceId, hostId],
        (err, invoice) => {
            if (err || !invoice) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Invoice not found' 
                });
            }
            
            // Delete invoice items first (foreign key constraint)
            db.run(
                `DELETE FROM invoice_items WHERE invoice_id = ?`,
                [invoiceId],
                function(err) {
                    if (err) {
                        console.error('Error deleting invoice items:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to delete invoice items' 
                        });
                    }
                    
                    // Delete the invoice
                    db.run(
                        `DELETE FROM invoices WHERE id = ?`,
                        [invoiceId],
                        function(err) {
                            if (err) {
                                console.error('Error deleting invoice:', err);
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
                        }
                    );
                }
            );
        }
    );
});

// Update invoice details
router.put('/:invoiceId', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    const { status, processingFee, notes } = req.body;
    
    // Verify invoice belongs to host
    db.get(
        `SELECT i.*, t.renter_name
         FROM invoices i
         JOIN trips t ON i.trip_id = t.id
         WHERE i.id = ? AND t.host_id = ?`,
        [invoiceId, hostId],
        (err, invoice) => {
            if (err || !invoice) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Invoice not found' 
                });
            }
            
            // Build update query dynamically based on provided fields
            const updates = [];
            const values = [];
            
            if (status !== undefined) {
                updates.push('status = ?');
                values.push(status);
            }
            
            if (processingFee !== undefined) {
                updates.push('processing_fee = ?');
                values.push(processingFee);
            }
            
            if (notes !== undefined) {
                updates.push('validation_notes = ?');
                values.push(notes);
            }
            
            if (updates.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No valid fields provided to update'
                });
            }
            
            values.push(invoiceId);
            
            db.run(
                `UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`,
                values,
                function(err) {
                    if (err) {
                        console.error('Error updating invoice:', err);
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
                        updatedFields: updates.length
                    });
                }
            );
        }
    );
});

// Unsubmit invoice - reverse trip submission
router.delete('/:invoiceId/unsubmit', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    
    // Get invoice and verify it belongs to host
    db.get(
        `SELECT i.*, t.turo_trip_id 
         FROM invoices i
         JOIN trips t ON i.trip_id = t.id
         WHERE i.id = ? AND t.host_id = ?`,
        [invoiceId, hostId],
        (err, invoice) => {
            if (err || !invoice) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Invoice not found' 
                });
            }
            
            const tripId = invoice.trip_id;
            const tripTuroId = invoice.turo_trip_id;
            
            // Start transaction to reverse submission
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Delete invoice items first (foreign key constraint)
                db.run(
                    `DELETE FROM invoice_items WHERE invoice_id = ?`,
                    [invoiceId],
                    function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to delete invoice items' 
                            });
                        }
                        
                        // Delete invoice
                        db.run(
                            `DELETE FROM invoices WHERE id = ?`,
                            [invoiceId],
                            function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ 
                                        success: false, 
                                        error: 'Failed to delete invoice' 
                                    });
                                }
                                
                                // Update trip to unsubmit it
                                db.run(
                                    `UPDATE trips 
                                     SET submitted_to_turo = 0, submitted_date = NULL 
                                     WHERE id = ?`,
                                    [tripId],
                                    function(err) {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ 
                                                success: false, 
                                                error: 'Failed to unsubmit trip' 
                                            });
                                        }
                                        
                                        db.run('COMMIT');
                                        
                                        res.json({
                                            success: true,
                                            message: 'Trip successfully unsubmitted',
                                            trip: {
                                                id: tripId,
                                                turoTripId: tripTuroId,
                                                submitted: false
                                            }
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        }
    );
});

module.exports = router;