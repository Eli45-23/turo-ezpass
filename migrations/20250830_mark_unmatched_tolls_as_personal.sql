-- Mark current unmatched tolls as personal tolls
-- This addresses the issue where unmatched tolls should be categorized as personal driving

UPDATE toll_charges 
SET is_personal = true 
WHERE is_matched = false AND is_personal = false;

-- Add comment for tracking
COMMENT ON TABLE toll_charges IS 'Updated to mark existing unmatched tolls as personal tolls - 2025-08-30';