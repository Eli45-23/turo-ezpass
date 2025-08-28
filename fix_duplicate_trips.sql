-- Fix duplicate trip toll mapping issue
-- Update toll charges to point to the correct trip IDs for the current host
-- Trip ID mappings: 
-- 1988 (df28...) -> 2120 (5322...) for trip 47755522
-- 1989 (df28...) -> 2121 (5322...) for trip 47765845  
-- 1990 (df28...) -> 2122 (5322...) for trip 47812268
-- 1991 (df28...) -> 2123 (5322...) for trip 47845314
-- 1992 (df28...) -> 2124 (5322...) for trip 48250243

UPDATE toll_charges 
SET 
  trip_id = CASE 
    WHEN trip_id = 1988 THEN 2120
    WHEN trip_id = 1989 THEN 2121
    WHEN trip_id = 1990 THEN 2122
    WHEN trip_id = 1991 THEN 2123
    WHEN trip_id = 1992 THEN 2124
    ELSE trip_id
  END,
  host_id = '5322cf92-98a4-49fb-aaa2-64daa5610a2e',
  updated_at = now()
WHERE trip_id IN (1988, 1989, 1990, 1991, 1992)
  AND is_matched = true;

-- Delete duplicate trips that belong to the other host
DELETE FROM trips 
WHERE id IN (1988, 1989, 1990, 1991, 1992)
  AND host_id = 'df28be49-b5ea-4e8c-ba63-03fc47bd1c7c';
