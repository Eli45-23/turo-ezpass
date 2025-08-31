const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');

// Session-based authentication middleware
const requireAuth = async (req, res, next) => {
    console.log('🔐 Personal Tolls Auth check - Session:', {
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
 * GET /personal-tolls
 * Get all personal tolls for the authenticated host
 * Personal tolls are tolls that don't match any rental trip (host was driving personally)
 */
router.get('/', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        console.log(`🏠 Fetching personal tolls for host: ${hostId}`);
        
        // Get personal tolls for this host only
        const { data: personalTolls, error: tollError } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                *,
                toll_accounts!inner(
                    host_id,
                    provider,
                    account_number
                )
            `)
            .eq('toll_accounts.host_id', hostId)
            .eq('is_personal', true)
            .order('toll_date', { ascending: false });
        
        if (tollError) {
            console.error('❌ Failed to fetch personal tolls:', tollError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch personal tolls'
            });
        }
        
        // Format tolls for frontend
        const formattedTolls = (personalTolls || []).map(toll => ({
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
            transactionId: toll.transaction_id
        }));
        
        // Calculate totals
        const totalAmount = formattedTolls.reduce((sum, toll) => sum + toll.amount, 0);
        const totalCount = formattedTolls.length;
        
        console.log(`✅ Found ${totalCount} personal tolls totaling $${totalAmount.toFixed(2)}`);
        
        res.json({
            success: true,
            data: {
                personalTolls: formattedTolls,
                summary: {
                    totalCount,
                    totalAmount: totalAmount.toFixed(2)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching personal tolls:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /personal-tolls/mark-unmatched
 * Mark all current unmatched tolls as personal (one-time migration)
 */
router.post('/mark-unmatched', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    
    try {
        console.log(`🔄 Marking all unmatched tolls as personal for host: ${hostId}`);
        
        // First, get all toll accounts for this host
        const { data: tollAccounts, error: accountsError } = await supabaseAdmin
            .from('toll_accounts')
            .select('id')
            .eq('host_id', hostId)
            .eq('is_active', true);
            
        if (accountsError) {
            console.error('❌ Error fetching toll accounts:', accountsError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch toll accounts'
            });
        }
        
        const tollAccountIds = tollAccounts.map(account => account.id);
        
        // Update all unmatched tolls to be personal for this host
        const { data, error: updateError } = await supabaseAdmin
            .from('toll_charges')
            .update({ is_personal: true })
            .in('toll_account_id', tollAccountIds)
            .eq('is_matched', false)
            .eq('is_personal', false)
            .select('id');
        
        if (updateError) {
            console.error('❌ Failed to mark unmatched tolls as personal:', updateError);
            return res.status(500).json({
                success: false,
                error: 'Failed to mark unmatched tolls as personal'
            });
        }
        
        const updatedCount = data ? data.length : 0;
        console.log(`✅ Marked ${updatedCount} unmatched tolls as personal`);
        
        res.json({
            success: true,
            data: {
                updatedCount,
                message: `Successfully marked ${updatedCount} unmatched tolls as personal`
            }
        });
        
    } catch (error) {
        console.error('❌ Error marking unmatched tolls as personal:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /personal-tolls/unmark/:tollId
 * Remove personal marking from a toll (make it available for trip matching again)
 */
router.post('/unmark/:tollId', requireAuth, async (req, res) => {
    const hostId = req.session.hostId;
    const tollId = req.params.tollId;
    
    try {
        console.log(`🏠 Unmarking personal toll ${tollId} for host: ${hostId}`);
        
        // Verify toll belongs to this host and is currently marked as personal
        const { data: toll, error: tollError } = await supabaseAdmin
            .from('toll_charges')
            .select(`
                id,
                is_personal,
                toll_accounts!inner(host_id)
            `)
            .eq('id', tollId)
            .eq('toll_accounts.host_id', hostId)
            .eq('is_personal', true)
            .single();
        
        if (tollError || !toll) {
            return res.status(404).json({
                success: false,
                error: 'Personal toll not found or access denied'
            });
        }
        
        // Unmark as personal toll
        const { error: updateError } = await supabaseAdmin
            .from('toll_charges')
            .update({ 
                is_personal: false,
                is_matched: false
            })
            .eq('id', tollId);
        
        if (updateError) {
            console.error('❌ Failed to unmark personal toll:', updateError);
            return res.status(500).json({
                success: false,
                error: 'Failed to unmark personal toll'
            });
        }
        
        console.log(`✅ Successfully unmarked personal toll ${tollId}`);
        
        res.json({
            success: true,
            message: 'Personal toll unmarked - now available for trip matching'
        });
        
    } catch (error) {
        console.error('❌ Error unmarking personal toll:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;