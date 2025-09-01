-- Personal Toll Detection Audit Script
-- This script checks for potential issues with personal toll detection
-- Run this to identify tolls that should be marked as personal but aren't

-- Check if is_personal column exists
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'toll_charges' AND column_name = 'is_personal';

-- Summary of toll statuses
SELECT 
    COUNT(*) as total_tolls,
    COUNT(CASE WHEN is_matched = true THEN 1 END) as matched_tolls,
    COUNT(CASE WHEN is_personal = true THEN 1 END) as personal_tolls,
    COUNT(CASE WHEN is_matched = false AND is_personal = false THEN 1 END) as unclassified_tolls,
    COUNT(CASE WHEN trip_id IS NOT NULL THEN 1 END) as tolls_with_trip_id
FROM toll_charges;

-- Unclassified tolls by host (potential personal tolls)
SELECT 
    ta.host_id,
    h.email as host_email,
    COUNT(*) as unclassified_toll_count,
    SUM(tc.toll_amount) as total_amount,
    MIN(tc.toll_date) as earliest_toll,
    MAX(tc.toll_date) as latest_toll
FROM toll_charges tc
JOIN toll_accounts ta ON tc.toll_account_id = ta.id
LEFT JOIN hosts h ON ta.host_id = h.id
WHERE tc.is_matched = false 
  AND tc.is_personal = false
GROUP BY ta.host_id, h.email
ORDER BY unclassified_toll_count DESC;

-- Tolls that might be incorrectly classified (near trip boundaries)
WITH trip_boundary_analysis AS (
    SELECT 
        tc.id as toll_id,
        tc.transaction_id,
        tc.toll_date,
        tc.toll_location,
        tc.toll_amount,
        tc.plate_number,
        tc.transponder_id,
        tc.is_matched,
        tc.is_personal,
        t.id as trip_id,
        t.turo_trip_id,
        t.start_date as trip_start,
        t.end_date as trip_end,
        t.vehicle_plate,
        ta.host_id,
        -- Calculate time differences
        EXTRACT(EPOCH FROM (tc.toll_date - t.start_date))/3600 as hours_after_start,
        EXTRACT(EPOCH FROM (t.end_date - tc.toll_date))/3600 as hours_before_end
    FROM toll_charges tc
    JOIN toll_accounts ta ON tc.toll_account_id = ta.id
    LEFT JOIN trips t ON ta.host_id = t.host_id
    WHERE tc.is_personal = true  -- Check personal tolls
      AND (
        -- Toll within 4 hours of any trip
        (tc.toll_date BETWEEN t.start_date - INTERVAL '4 hours' AND t.end_date + INTERVAL '4 hours')
        -- Same vehicle
        AND (
          UPPER(REPLACE(tc.plate_number, ' ', '')) = UPPER(REPLACE(t.vehicle_plate, ' ', ''))
          OR EXISTS (
            SELECT 1 FROM transponder_mappings tm
            WHERE tm.transponder_number = tc.transponder_id
              AND UPPER(REPLACE(tm.vehicle_plate, ' ', '')) = UPPER(REPLACE(t.vehicle_plate, ' ', ''))
              AND tm.host_id = ta.host_id
              AND tm.is_active = true
          )
        )
      )
)
SELECT *
FROM trip_boundary_analysis
WHERE hours_after_start BETWEEN -4 AND 72  -- 4 hours before start to 3 days after start
  AND hours_before_end BETWEEN -72 AND 4   -- 3 days before end to 4 hours after end
ORDER BY host_id, toll_date;

-- Transponder mapping coverage analysis
SELECT 
    'Unmapped Transponders' as category,
    COUNT(DISTINCT tc.transponder_id) as count
FROM toll_charges tc
JOIN toll_accounts ta ON tc.toll_account_id = ta.id
WHERE tc.transponder_id IS NOT NULL
  AND tc.transponder_id != 'N/A'
  AND NOT EXISTS (
    SELECT 1 FROM transponder_mappings tm
    WHERE tm.transponder_number = tc.transponder_id
      AND tm.host_id = ta.host_id
      AND tm.is_active = true
  )

UNION ALL

SELECT 
    'Total Transponder Tolls' as category,
    COUNT(*) as count
FROM toll_charges tc
WHERE tc.transponder_id IS NOT NULL
  AND tc.transponder_id != 'N/A'

UNION ALL

SELECT 
    'Mapped Transponders' as category,
    COUNT(DISTINCT tm.transponder_number) as count
FROM transponder_mappings tm
WHERE tm.is_active = true;

-- Sample of unmapped transponder tolls that might be personal
SELECT 
    ta.host_id,
    tc.transponder_id,
    tc.plate_number,
    COUNT(*) as toll_count,
    SUM(tc.toll_amount) as total_amount,
    MIN(tc.toll_date) as earliest_toll,
    MAX(tc.toll_date) as latest_toll,
    ARRAY_AGG(DISTINCT tc.toll_location ORDER BY tc.toll_location) as locations
FROM toll_charges tc
JOIN toll_accounts ta ON tc.toll_account_id = ta.id
WHERE tc.transponder_id IS NOT NULL
  AND tc.transponder_id != 'N/A'
  AND tc.is_matched = false
  AND tc.is_personal = false
  AND NOT EXISTS (
    SELECT 1 FROM transponder_mappings tm
    WHERE tm.transponder_number = tc.transponder_id
      AND tm.host_id = ta.host_id
      AND tm.is_active = true
  )
GROUP BY ta.host_id, tc.transponder_id, tc.plate_number
ORDER BY ta.host_id, toll_count DESC
LIMIT 20;

-- Auto-discovered mappings that are excluded from matching
SELECT 
    tm.host_id,
    tm.transponder_number,
    tm.vehicle_plate,
    tm.vehicle_description,
    tm.is_active,
    COUNT(tc.id) as related_tolls
FROM transponder_mappings tm
LEFT JOIN toll_charges tc ON tc.transponder_id = tm.transponder_number
LEFT JOIN toll_accounts ta ON tc.toll_account_id = ta.id AND ta.host_id = tm.host_id
WHERE tm.vehicle_description ILIKE 'Auto-discovered%'
GROUP BY tm.host_id, tm.transponder_number, tm.vehicle_plate, tm.vehicle_description, tm.is_active
ORDER BY tm.host_id, related_tolls DESC;