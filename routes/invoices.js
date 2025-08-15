const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (!req.session.hostId) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
        });
    }
    next();
};

// Generate invoice for a trip
router.post('/generate/:tripId', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const tripId = req.params.tripId;
    const { processingFee = 2.99 } = req.body;
    
    // Verify trip belongs to host
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
            
            // Get all toll charges for this trip
            db.all(
                `SELECT * FROM toll_charges WHERE trip_id = ?`,
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
                    
                    const tollTotal = charges.reduce((sum, c) => sum + c.toll_amount, 0);
                    
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
                    db.run(
                        `INSERT INTO invoices (trip_id, invoice_number, total_amount, processing_fee)
                         VALUES (?, ?, ?, ?)`,
                        [tripId, invoiceNumber, totalAmount, processingFee],
                        function(err) {
                            if (err) {
                                return res.status(500).json({ 
                                    success: false, 
                                    error: 'Failed to create invoice' 
                                });
                            }
                            
                            const invoiceId = this.lastID;
                            
                            // Create invoice line items
                            charges.forEach(charge => {
                                db.run(
                                    `INSERT INTO invoice_items (invoice_id, toll_charge_id, description, amount)
                                     VALUES (?, ?, ?, ?)`,
                                    [invoiceId, charge.id, 
                                     `${charge.toll_location} - ${new Date(charge.toll_date).toLocaleDateString()}`,
                                     charge.toll_amount]
                                );
                            });
                            
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
                        }
                    );
                }
            );
        }
    );
});

// Get all invoices for host
router.get('/', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    
    db.all(
        `SELECT 
            i.*,
            t.renter_name,
            t.renter_email,
            t.turo_trip_id,
            t.vehicle_plate
         FROM invoices i
         JOIN trips t ON i.trip_id = t.id
         WHERE t.host_id = ?
         ORDER BY i.created_at DESC`,
        [hostId],
        (err, invoices) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to fetch invoices' 
                });
            }
            
            res.json({
                success: true,
                data: invoices
            });
        }
    );
});

// Get invoice details
router.get('/:invoiceId', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const invoiceId = req.params.invoiceId;
    
    // Get invoice with trip details
    db.get(
        `SELECT 
            i.*,
            t.renter_name,
            t.renter_email,
            t.turo_trip_id,
            t.vehicle_plate,
            t.start_date,
            t.end_date
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
            
            // Get invoice line items
            db.all(
                `SELECT 
                    ii.*,
                    tc.toll_date,
                    tc.toll_location,
                    tc.plate_number,
                    tc.transaction_id
                 FROM invoice_items ii
                 JOIN toll_charges tc ON ii.toll_charge_id = tc.id
                 WHERE ii.invoice_id = ?`,
                [invoiceId],
                (err, items) => {
                    if (err) {
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to fetch invoice items' 
                        });
                    }
                    
                    res.json({
                        success: true,
                        data: {
                            invoice: invoice,
                            items: items
                        }
                    });
                }
            );
        }
    );
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

module.exports = router;