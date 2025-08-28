-- Fix host_id mismatch for August 2025 tolls
-- Problem: Tolls uploaded by emailone@gmail.com but trips belong to nametwo@gmail.com
-- Solution: Update toll host_ids to match trip host_ids for proper matching

-- Show current state before fix
SELECT 'BEFORE FIX - Tolls by host' as status, host_id, COUNT(*) as toll_count
FROM toll_charges 
WHERE plate_number = 'LPJ3806' 
    AND toll_date >= '2025-08-01' 
    AND toll_date <= '2025-08-31'
GROUP BY host_id

UNION ALL

SELECT 'BEFORE FIX - Trips by host' as status, host_id, COUNT(*) as trip_count
FROM trips 
WHERE turo_trip_id IN ('48250243', '47812268', '47845314')
GROUP BY host_id;

-- Update toll host_ids to match trips for proper matching
-- This moves tolls from emailone@gmail.com to nametwo@gmail.com account
UPDATE toll_charges 
SET 
    host_id = 'df28be49-b5ea-4e8c-ba63-03fc47bd1c7c', -- nametwo@gmail.com
    updated_at = NOW()
WHERE host_id = '5322cf92-98a4-49fb-aaa2-64daa5610a2e' -- emailone@gmail.com
    AND plate_number = 'LPJ3806'
    AND toll_date >= '2025-08-01' 
    AND toll_date <= '2025-08-31';

-- Show results after fix
SELECT 'AFTER FIX - Tolls by host' as status, host_id, COUNT(*) as toll_count
FROM toll_charges 
WHERE plate_number = 'LPJ3806' 
    AND toll_date >= '2025-08-01' 
    AND toll_date <= '2025-08-31'
GROUP BY host_id

UNION ALL

SELECT 'AFTER FIX - Updated tolls' as status, 'df28be49-b5ea-4e8c-ba63-03fc47bd1c7c' as host_id, COUNT(*) as toll_count
FROM toll_charges 
WHERE host_id = 'df28be49-b5ea-4e8c-ba63-03fc47bd1c7c'
    AND plate_number = 'LPJ3806' 
    AND toll_date >= '2025-08-01' 
    AND toll_date <= '2025-08-31';