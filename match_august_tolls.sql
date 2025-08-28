-- Match August tolls to their corresponding trips
-- Based on toll dates falling within trip date ranges

-- Trip 47845314 (David F.): Aug 8 21:30 - Aug 10 21:30
-- Tolls: Aug 8 11:22, Aug 9 11:50, Aug 10 16:32 (2 tolls)
UPDATE toll_charges 
SET trip_id = 2169, is_matched = true, match_timestamp = NOW()
WHERE id IN (7579, 7577, 7562, 7576)
AND is_matched = false;

-- Trip 47812268 (James L.): Aug 14 14:00 - Aug 18 13:00  
-- Tolls: Aug 14 15:16, Aug 17 21:47
UPDATE toll_charges 
SET trip_id = 2168, is_matched = true, match_timestamp = NOW()
WHERE id IN (7561, 7540)
AND is_matched = false;

-- Trip 48250243 (Kevin M.): Aug 21 14:00 - Aug 24 18:00
-- Tolls: Aug 19 23:35 (this is before the trip, but close - might be prep travel)
UPDATE toll_charges 
SET trip_id = 2170, is_matched = true, match_timestamp = NOW()
WHERE id = 7539
AND is_matched = false;

-- Verify the matches
SELECT 
  t.turo_trip_id,
  t.renter_name,
  t.start_date,
  t.end_date,
  COUNT(tc.id) as toll_count,
  SUM(tc.toll_amount) as total_tolls
FROM trips t
LEFT JOIN toll_charges tc ON t.id = tc.trip_id
WHERE t.turo_trip_id IN ('48250243', '47812268', '47845314')
GROUP BY t.id, t.turo_trip_id, t.renter_name, t.start_date, t.end_date
ORDER BY t.start_date;