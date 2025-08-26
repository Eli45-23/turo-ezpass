-- Update trip status for consistency
-- Trip #48250243 (Aug 21-24, 2025) should be "Completed" not "In-progress"

-- INSTRUCTIONS:
-- Run this in Supabase SQL editor to update trip status for consistency

-- Show current status
SELECT 'BEFORE UPDATE' as phase, 
       turo_trip_id, 
       renter_name, 
       start_date, 
       end_date, 
       trip_status,
       CASE 
         WHEN end_date < NOW() THEN 'should_be_completed'
         WHEN start_date <= NOW() AND end_date >= NOW() THEN 'should_be_in_progress'  
         WHEN start_date > NOW() THEN 'should_be_upcoming'
       END as suggested_status
FROM trips 
WHERE host_id = '394da1c7-6e97-4d26-a76f-c4d5aa347f3e'
  AND trip_status = 'In-progress'
ORDER BY start_date;

-- Update trip #48250243 to Completed status (ended Aug 24, 2025)
UPDATE trips 
SET trip_status = 'Completed'
WHERE turo_trip_id = '48250243' 
  AND host_id = '394da1c7-6e97-4d26-a76f-c4d5aa347f3e'
  AND end_date < NOW();

-- Show final status  
SELECT 'AFTER UPDATE' as phase,
       turo_trip_id, 
       renter_name, 
       start_date, 
       end_date, 
       trip_status,
       CASE 
         WHEN end_date < NOW() THEN 'should_be_completed'
         WHEN start_date <= NOW() AND end_date >= NOW() THEN 'should_be_in_progress'  
         WHEN start_date > NOW() THEN 'should_be_upcoming'
       END as suggested_status
FROM trips 
WHERE host_id = '394da1c7-6e97-4d26-a76f-c4d5aa347f3e'
  AND (trip_status = 'In-progress' OR turo_trip_id = '48250243')
ORDER BY start_date;