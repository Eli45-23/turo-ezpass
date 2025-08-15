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

// Get all transponder mappings for the host
router.get('/', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    
    db.all(
        `SELECT * FROM transponder_mappings 
         WHERE host_id = ? 
         ORDER BY vehicle_description, transponder_number`,
        [hostId],
        (err, mappings) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch transponder mappings'
                });
            }
            
            res.json({
                success: true,
                data: mappings
            });
        }
    );
});

// Add new transponder mapping
router.post('/', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const { transponderNumber, vehiclePlate, vehicleDescription } = req.body;
    
    if (!transponderNumber || !vehiclePlate) {
        return res.status(400).json({
            success: false,
            error: 'Transponder number and vehicle plate are required'
        });
    }
    
    // Clean up inputs
    const cleanTransponder = transponderNumber.replace(/\s+/g, '').toUpperCase();
    const cleanPlate = vehiclePlate.replace(/\s+/g, '').toUpperCase();
    
    db.run(
        `INSERT INTO transponder_mappings 
         (host_id, transponder_number, vehicle_plate, vehicle_description) 
         VALUES (?, ?, ?, ?)`,
        [hostId, cleanTransponder, cleanPlate, vehicleDescription || ''],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({
                        success: false,
                        error: 'This transponder number is already mapped'
                    });
                }
                return res.status(500).json({
                    success: false,
                    error: 'Failed to add transponder mapping'
                });
            }
            
            res.json({
                success: true,
                message: 'Transponder mapping added successfully',
                data: {
                    id: this.lastID,
                    transponderNumber: cleanTransponder,
                    vehiclePlate: cleanPlate,
                    vehicleDescription: vehicleDescription || ''
                }
            });
        }
    );
});

// Update transponder mapping
router.put('/:id', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const mappingId = req.params.id;
    const { transponderNumber, vehiclePlate, vehicleDescription, isActive } = req.body;
    
    if (!transponderNumber || !vehiclePlate) {
        return res.status(400).json({
            success: false,
            error: 'Transponder number and vehicle plate are required'
        });
    }
    
    // Clean up inputs
    const cleanTransponder = transponderNumber.replace(/\s+/g, '').toUpperCase();
    const cleanPlate = vehiclePlate.replace(/\s+/g, '').toUpperCase();
    
    // First verify the mapping belongs to this host
    db.get(
        `SELECT id FROM transponder_mappings WHERE id = ? AND host_id = ?`,
        [mappingId, hostId],
        (err, existing) => {
            if (err || !existing) {
                return res.status(404).json({
                    success: false,
                    error: 'Transponder mapping not found'
                });
            }
            
            db.run(
                `UPDATE transponder_mappings 
                 SET transponder_number = ?, vehicle_plate = ?, vehicle_description = ?, 
                     is_active = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND host_id = ?`,
                [cleanTransponder, cleanPlate, vehicleDescription || '', isActive !== false, mappingId, hostId],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            return res.status(409).json({
                                success: false,
                                error: 'This transponder number is already mapped to another vehicle'
                            });
                        }
                        return res.status(500).json({
                            success: false,
                            error: 'Failed to update transponder mapping'
                        });
                    }
                    
                    if (this.changes === 0) {
                        return res.status(404).json({
                            success: false,
                            error: 'Transponder mapping not found'
                        });
                    }
                    
                    res.json({
                        success: true,
                        message: 'Transponder mapping updated successfully'
                    });
                }
            );
        }
    );
});

// Activate transponder mapping
router.put('/:id/activate', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const mappingId = req.params.id;
    
    db.run(
        `UPDATE transponder_mappings SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND host_id = ?`,
        [mappingId, hostId],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to activate transponder mapping'
                });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Transponder mapping not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Transponder mapping activated successfully'
            });
        }
    );
});

// Deactivate transponder mapping (soft delete)
router.put('/:id/deactivate', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const mappingId = req.params.id;
    
    db.run(
        `UPDATE transponder_mappings SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND host_id = ?`,
        [mappingId, hostId],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to deactivate transponder mapping'
                });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Transponder mapping not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Transponder mapping deactivated successfully'
            });
        }
    );
});

// Permanently delete transponder mapping
router.delete('/:id/permanent', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const mappingId = req.params.id;
    
    // First get the transponder details to add to blacklist
    db.get(
        `SELECT vehicle_plate FROM transponder_mappings WHERE id = ? AND host_id = ?`,
        [mappingId, hostId],
        (err, mapping) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to find transponder mapping'
                });
            }
            
            if (!mapping) {
                return res.status(404).json({
                    success: false,
                    error: 'Transponder mapping not found'
                });
            }
            
            // Begin transaction to ensure both operations succeed
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Add to blacklist to prevent auto-discovery
                db.run(
                    `INSERT OR IGNORE INTO deleted_transponder_plates 
                     (host_id, vehicle_plate, deleted_at) 
                     VALUES (?, ?, datetime('now'))`,
                    [hostId, mapping.vehicle_plate],
                    function(blacklistErr) {
                        if (blacklistErr) {
                            db.run('ROLLBACK');
                            return res.status(500).json({
                                success: false,
                                error: 'Failed to add to deletion blacklist'
                            });
                        }
                        
                        // Permanently delete the transponder mapping
                        db.run(
                            `DELETE FROM transponder_mappings WHERE id = ? AND host_id = ?`,
                            [mappingId, hostId],
                            function(deleteErr) {
                                if (deleteErr) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({
                                        success: false,
                                        error: 'Failed to permanently delete transponder mapping'
                                    });
                                }
                                
                                if (this.changes === 0) {
                                    db.run('ROLLBACK');
                                    return res.status(404).json({
                                        success: false,
                                        error: 'Transponder mapping not found'
                                    });
                                }
                                
                                // Commit transaction
                                db.run('COMMIT', (commitErr) => {
                                    if (commitErr) {
                                        return res.status(500).json({
                                            success: false,
                                            error: 'Failed to commit deletion'
                                        });
                                    }
                                    
                                    res.json({
                                        success: true,
                                        message: 'Transponder mapping permanently deleted and blacklisted'
                                    });
                                });
                            }
                        );
                    }
                );
            });
        }
    );
});

// Legacy delete endpoint for backward compatibility (now deactivates)
router.delete('/:id', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const mappingId = req.params.id;
    
    db.run(
        `UPDATE transponder_mappings SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND host_id = ?`,
        [mappingId, hostId],
        function(err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to deactivate transponder mapping'
                });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Transponder mapping not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Transponder mapping deactivated successfully'
            });
        }
    );
});

// Get toll charges by transponder (for analysis)
router.get('/:transponderNumber/tolls', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const transponderNumber = req.params.transponderNumber.replace(/\s+/g, '').toUpperCase();
    
    db.all(
        `SELECT tc.*, tm.vehicle_plate, tm.vehicle_description
         FROM toll_charges tc
         JOIN toll_accounts ta ON tc.toll_account_id = ta.id
         LEFT JOIN transponder_mappings tm ON tm.transponder_number = tc.plate_number AND tm.host_id = ta.host_id
         WHERE ta.host_id = ? AND tc.plate_number = ?
         ORDER BY tc.toll_date DESC`,
        [hostId, transponderNumber],
        (err, tolls) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch toll charges'
                });
            }
            
            res.json({
                success: true,
                data: {
                    transponderNumber,
                    tollCount: tolls.length,
                    totalAmount: tolls.reduce((sum, toll) => sum + toll.toll_amount, 0),
                    tolls: tolls
                }
            });
        }
    );
});

// Bulk import transponder mappings (CSV or JSON)
router.post('/bulk-import', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    const { mappings, replaceAll } = req.body;
    
    if (!mappings || !Array.isArray(mappings)) {
        return res.status(400).json({
            success: false,
            error: 'Mappings array is required'
        });
    }
    
    db.serialize(() => {
        if (replaceAll) {
            // Clear existing mappings for this host
            db.run(`DELETE FROM transponder_mappings WHERE host_id = ?`, [hostId]);
        }
        
        let successCount = 0;
        let errors = [];
        
        mappings.forEach((mapping, index) => {
            const { transponderNumber, vehiclePlate, vehicleDescription } = mapping;
            
            if (!transponderNumber || !vehiclePlate) {
                errors.push(`Row ${index + 1}: Missing transponder number or vehicle plate`);
                return;
            }
            
            const cleanTransponder = transponderNumber.replace(/\s+/g, '').toUpperCase();
            const cleanPlate = vehiclePlate.replace(/\s+/g, '').toUpperCase();
            
            db.run(
                `INSERT OR REPLACE INTO transponder_mappings 
                 (host_id, transponder_number, vehicle_plate, vehicle_description) 
                 VALUES (?, ?, ?, ?)`,
                [hostId, cleanTransponder, cleanPlate, vehicleDescription || ''],
                function(err) {
                    if (err) {
                        errors.push(`Row ${index + 1}: ${err.message}`);
                    } else {
                        successCount++;
                    }
                }
            );
        });
        
        // Allow time for async operations to complete
        setTimeout(() => {
            res.json({
                success: true,
                message: `Imported ${successCount} transponder mappings`,
                data: {
                    imported: successCount,
                    errors: errors.length,
                    errorDetails: errors
                }
            });
        }, 500);
    });
});

// Export transponder mappings as JSON
router.get('/export', requireAuth, (req, res) => {
    const hostId = req.session.hostId;
    
    db.all(
        `SELECT transponder_number, vehicle_plate, vehicle_description 
         FROM transponder_mappings 
         WHERE host_id = ? AND is_active = 1
         ORDER BY vehicle_description, transponder_number`,
        [hostId],
        (err, mappings) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to export transponder mappings'
                });
            }
            
            res.json({
                success: true,
                data: mappings
            });
        }
    );
});

module.exports = router;