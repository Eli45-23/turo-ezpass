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

// Get all transponder mappings for the host
router.get('/', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        const { data: mappings, error } = await supabaseAdmin
            .from('transponder_mappings')
            .select('*')
            .eq('host_id', hostId)
            .order('vehicle_description', { ascending: true })
            .order('transponder_number', { ascending: true });
        
        if (error) {
            console.error('❌ Error fetching transponder mappings:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch transponder mappings'
            });
        }
        
        // Convert PLATE_ONLY placeholders back to empty strings for frontend
        const processedMappings = (mappings || []).map(mapping => ({
            ...mapping,
            transponder_number: mapping.transponder_number.startsWith('PLATE_ONLY_') ? '' : mapping.transponder_number
        }));

        res.json({
            success: true,
            data: processedMappings
        });
    } catch (error) {
        console.error('❌ Exception fetching transponder mappings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transponder mappings'
        });
    }
});

// Add new transponder mapping
router.post('/', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const { transponderNumber, vehiclePlate, vehicleDescription } = req.body;
    
    if (!vehiclePlate) {
        return res.status(400).json({
            success: false,
            error: 'Vehicle plate is required'
        });
    }
    
    // Clean up inputs - handle optional transponder number
    const cleanPlate = vehiclePlate.replace(/\s+/g, '').toUpperCase();
    
    // Generate unique placeholder for plate-only entries to avoid unique constraint conflicts
    const cleanTransponder = transponderNumber 
        ? transponderNumber.replace(/\s+/g, '').toUpperCase() 
        : `PLATE_ONLY_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    try {
        const { data: newMapping, error } = await supabaseAdmin
            .from('transponder_mappings')
            .insert({
                host_id: hostId,
                transponder_number: cleanTransponder,
                vehicle_plate: cleanPlate,
                vehicle_description: vehicleDescription || '',
                is_active: true
            })
            .select()
            .single();
        
        if (error) {
            console.error('❌ Error adding transponder mapping:', error);
            
            if (error.code === '23505') { // Unique constraint violation
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
                id: newMapping.id,
                transponderNumber: transponderNumber ? cleanTransponder : '', // Return empty string for plate-only entries
                vehiclePlate: cleanPlate,
                vehicleDescription: vehicleDescription || ''
            }
        });
    } catch (error) {
        console.error('❌ Exception adding transponder mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add transponder mapping'
        });
    }
});

// Update transponder mapping
router.put('/:id', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const mappingId = req.params.id;
    const { transponderNumber, vehiclePlate, vehicleDescription, isActive } = req.body;
    
    if (!vehiclePlate) {
        return res.status(400).json({
            success: false,
            error: 'Vehicle plate is required'
        });
    }
    
    // Clean up inputs - handle optional transponder number
    const cleanPlate = vehiclePlate.replace(/\s+/g, '').toUpperCase();
    
    // For updates, if transponderNumber is empty, generate unique placeholder or keep existing
    let cleanTransponder;
    if (transponderNumber) {
        cleanTransponder = transponderNumber.replace(/\s+/g, '').toUpperCase();
    } else {
        // Generate unique placeholder for plate-only entries to avoid unique constraint conflicts
        cleanTransponder = `PLATE_ONLY_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }
    
    try {
        // First verify the mapping belongs to this host
        const { data: existing, error: checkError } = await supabaseAdmin
            .from('transponder_mappings')
            .select('id')
            .eq('id', mappingId)
            .eq('host_id', hostId)
            .single();
        
        if (checkError || !existing) {
            return res.status(404).json({
                success: false,
                error: 'Transponder mapping not found'
            });
        }
        
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('transponder_mappings')
            .update({
                transponder_number: cleanTransponder,
                vehicle_plate: cleanPlate,
                vehicle_description: vehicleDescription || '',
                is_active: isActive !== false,
                updated_at: new Date().toISOString()
            })
            .eq('id', mappingId)
            .eq('host_id', hostId)
            .select();
        
        if (updateError) {
            console.error('❌ Error updating transponder mapping:', updateError);
            
            if (updateError.code === '23505') { // Unique constraint violation
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
        
        if (!updated || updated.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transponder mapping not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Transponder mapping updated successfully'
        });
    } catch (error) {
        console.error('❌ Exception updating transponder mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update transponder mapping'
        });
    }
});

// Activate transponder mapping
router.put('/:id/activate', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const mappingId = req.params.id;
    
    try {
        const { data: updated, error } = await supabaseAdmin
            .from('transponder_mappings')
            .update({ 
                is_active: true, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', mappingId)
            .eq('host_id', hostId)
            .select();
        
        if (error) {
            console.error('❌ Error activating transponder mapping:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to activate transponder mapping'
            });
        }
        
        if (!updated || updated.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transponder mapping not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Transponder mapping activated successfully'
        });
    } catch (error) {
        console.error('❌ Exception activating transponder mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to activate transponder mapping'
        });
    }
});

// Deactivate transponder mapping (soft delete)
router.put('/:id/deactivate', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const mappingId = req.params.id;
    
    try {
        const { data: updated, error } = await supabaseAdmin
            .from('transponder_mappings')
            .update({ 
                is_active: false, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', mappingId)
            .eq('host_id', hostId)
            .select();
        
        if (error) {
            console.error('❌ Error deactivating transponder mapping:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to deactivate transponder mapping'
            });
        }
        
        if (!updated || updated.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transponder mapping not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Transponder mapping deactivated successfully'
        });
    } catch (error) {
        console.error('❌ Exception deactivating transponder mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to deactivate transponder mapping'
        });
    }
});

// Permanently delete transponder mapping
router.delete('/:id/permanent', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const mappingId = req.params.id;
    
    try {
        // First get the transponder details to add to blacklist
        const { data: mapping, error: getError } = await supabaseAdmin
            .from('transponder_mappings')
            .select('vehicle_plate')
            .eq('id', mappingId)
            .eq('host_id', hostId)
            .single();
        
        if (getError || !mapping) {
            return res.status(404).json({
                success: false,
                error: 'Transponder mapping not found'
            });
        }
        
        // Add to blacklist to prevent auto-discovery (using upsert to handle duplicates)
        const { error: blacklistError } = await supabaseAdmin
            .from('deleted_transponder_plates')
            .upsert({
                host_id: hostId,
                vehicle_plate: mapping.vehicle_plate,
                deleted_at: new Date().toISOString()
            }, {
                onConflict: 'host_id,vehicle_plate'
            });
        
        if (blacklistError) {
            console.error('❌ Error adding to blacklist:', blacklistError);
            // Continue with deletion even if blacklist fails
        }
        
        // Permanently delete the transponder mapping
        const { data: deleted, error: deleteError } = await supabaseAdmin
            .from('transponder_mappings')
            .delete()
            .eq('id', mappingId)
            .eq('host_id', hostId)
            .select();
        
        if (deleteError) {
            console.error('❌ Error deleting transponder mapping:', deleteError);
            return res.status(500).json({
                success: false,
                error: 'Failed to permanently delete transponder mapping'
            });
        }
        
        if (!deleted || deleted.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transponder mapping not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Transponder mapping permanently deleted and blacklisted'
        });
    } catch (error) {
        console.error('❌ Exception deleting transponder mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to permanently delete transponder mapping'
        });
    }
});

// Legacy delete endpoint for backward compatibility (now deactivates)
router.delete('/:id', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const mappingId = req.params.id;
    
    try {
        const { data: updated, error } = await supabaseAdmin
            .from('transponder_mappings')
            .update({ 
                is_active: false, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', mappingId)
            .eq('host_id', hostId)
            .select();
        
        if (error) {
            console.error('❌ Error deactivating transponder mapping:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to deactivate transponder mapping'
            });
        }
        
        if (!updated || updated.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transponder mapping not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Transponder mapping deactivated successfully'
        });
    } catch (error) {
        console.error('❌ Exception deactivating transponder mapping:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to deactivate transponder mapping'
        });
    }
});

// Get toll charges by transponder (for analysis)
router.get('/:transponderNumber/tolls', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const transponderNumber = req.params.transponderNumber.replace(/\s+/g, '').toUpperCase();
    
    try {
        const { data: tolls, error } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                *,
                toll_accounts!toll_account_id(id, host_id),
                transponder_mappings!left(vehicle_plate, vehicle_description)
            `)
            .eq('toll_accounts.host_id', hostId)
            .eq('plate_number', transponderNumber)
            .order('toll_date', { ascending: false });
        
        if (error) {
            console.error('❌ Error fetching toll charges:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch toll charges'
            });
        }
        
        const totalAmount = tolls?.reduce((sum, toll) => sum + parseFloat(toll.toll_amount || 0), 0) || 0;
        
        res.json({
            success: true,
            data: {
                transponderNumber,
                tollCount: tolls?.length || 0,
                totalAmount,
                tolls: tolls || []
            }
        });
    } catch (error) {
        console.error('❌ Exception fetching toll charges:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch toll charges'
        });
    }
});

// Bulk import transponder mappings (CSV or JSON)
router.post('/bulk-import', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const { mappings, replaceAll } = req.body;
    
    if (!mappings || !Array.isArray(mappings)) {
        return res.status(400).json({
            success: false,
            error: 'Mappings array is required'
        });
    }
    
    try {
        if (replaceAll) {
            // Clear existing mappings for this host
            const { error: deleteError } = await supabaseAdmin
                .from('transponder_mappings')
                .delete()
                .eq('host_id', hostId);
                
            if (deleteError) {
                console.error('❌ Error clearing existing mappings:', deleteError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to clear existing mappings'
                });
            }
        }
        
        let successCount = 0;
        let errors = [];
        
        // Process mappings in batches to avoid overwhelming the database
        for (let i = 0; i < mappings.length; i++) {
            const mapping = mappings[i];
            const { transponderNumber, vehiclePlate, vehicleDescription } = mapping;
            
            if (!transponderNumber || !vehiclePlate) {
                errors.push(`Row ${i + 1}: Missing transponder number or vehicle plate`);
                continue;
            }
            
            const cleanTransponder = transponderNumber.replace(/\s+/g, '').toUpperCase();
            const cleanPlate = vehiclePlate.replace(/\s+/g, '').toUpperCase();
            
            try {
                const { error } = await supabaseAdmin
                    .from('transponder_mappings')
                    .upsert({
                        host_id: hostId,
                        transponder_number: cleanTransponder,
                        vehicle_plate: cleanPlate,
                        vehicle_description: vehicleDescription || '',
                        is_active: true,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'host_id,transponder_number'
                    });
                    
                if (error) {
                    errors.push(`Row ${i + 1}: ${error.message}`);
                } else {
                    successCount++;
                }
            } catch (error) {
                errors.push(`Row ${i + 1}: ${error.message}`);
            }
        }
        
        res.json({
            success: true,
            message: `Imported ${successCount} transponder mappings`,
            data: {
                imported: successCount,
                errors: errors.length,
                errorDetails: errors
            }
        });
    } catch (error) {
        console.error('❌ Exception during bulk import:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to import transponder mappings'
        });
    }
});

// Export transponder mappings as JSON
router.get('/export', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        const { data: mappings, error } = await supabaseAdmin
            .from('transponder_mappings')
            .select('transponder_number, vehicle_plate, vehicle_description')
            .eq('host_id', hostId)
            .eq('is_active', true)
            .order('vehicle_description', { ascending: true })
            .order('transponder_number', { ascending: true });
            
        if (error) {
            console.error('❌ Error exporting transponder mappings:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to export transponder mappings'
            });
        }
        
        res.json({
            success: true,
            data: mappings || []
        });
    } catch (error) {
        console.error('❌ Exception exporting transponder mappings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export transponder mappings'
        });
    }
});

module.exports = router;