-- Clear Cross-Host Contaminated Matches
-- This fixes the issue where 40 tolls from one host were incorrectly matched to trips from another host

-- Reset all cross-host matched tolls back to unmatched state
UPDATE toll_charges 
SET 
    trip_id = NULL,
    is_matched = false,
    match_confidence = NULL,
    match_timestamp = NULL
WHERE id IN (
    SELECT tc.id
    FROM toll_charges tc
    JOIN toll_accounts ta ON tc.toll_account_id = ta.id
    LEFT JOIN trips t ON tc.trip_id = t.id
    WHERE tc.is_matched = true
    AND tc.trip_id IS NOT NULL
    AND (t.id IS NULL OR ta.host_id != t.host_id)
);