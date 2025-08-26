-- MIGRATION: Fix Toll Account Host Association
-- Date: 2025-08-26
-- Issue: 174 tolls are associated with wrong host account

-- BEFORE STATE:
-- toll_account_id 50: host 2e95a231-d871-447b-85ea-07e216f76689 (eliascolon23@gmail.com) - 174 tolls
-- toll_account_id 51: host 394da1c7-6e97-4d26-a76f-c4d5aa347f3e (eliascolon35@gmail.com) - 0 tolls

-- AFTER STATE (desired):
-- toll_account_id 50: host 2e95a231-d871-447b-85ea-07e216f76689 (eliascolon23@gmail.com) - 0 tolls  
-- toll_account_id 51: host 394da1c7-6e97-4d26-a76f-c4d5aa347f3e (eliascolon35@gmail.com) - 174 tolls

-- INSTRUCTIONS:
-- 1. Run this script in your Supabase SQL editor
-- 2. This will move all 174 toll charges from account 50 to account 51
-- 3. After running, verify the toll matcher finds the 174 tolls

BEGIN;

-- Show current state
SELECT 'BEFORE MIGRATION' as phase, 
       ta.id as toll_account_id,
       ta.host_id,
       h.email,
       COUNT(tc.id) as toll_count
FROM toll_accounts ta
JOIN hosts h ON ta.host_id = h.id
LEFT JOIN toll_charges tc ON ta.id = tc.toll_account_id
WHERE ta.id IN (50, 51)
GROUP BY ta.id, ta.host_id, h.email
ORDER BY ta.id;

-- Perform the migration
UPDATE toll_charges 
SET toll_account_id = 51 
WHERE toll_account_id = 50;

-- Show final state
SELECT 'AFTER MIGRATION' as phase,
       ta.id as toll_account_id, 
       ta.host_id,
       h.email,
       COUNT(tc.id) as toll_count
FROM toll_accounts ta
JOIN hosts h ON ta.host_id = h.id
LEFT JOIN toll_charges tc ON ta.id = tc.toll_account_id
WHERE ta.id IN (50, 51)
GROUP BY ta.id, ta.host_id, h.email
ORDER BY ta.id;

COMMIT;

-- Final verification query (run separately after commit)
-- This should show 174 tolls for host 394da1c7-6e97-4d26-a76f-c4d5aa347f3e
SELECT 
    'FINAL VERIFICATION' as status,
    ta.host_id,
    h.email,
    COUNT(tc.id) as toll_count
FROM toll_accounts ta
JOIN hosts h ON ta.host_id = h.id
LEFT JOIN toll_charges tc ON ta.id = tc.toll_account_id
WHERE h.email IN ('eliascolon23@gmail.com', 'eliascolon35@gmail.com')
GROUP BY ta.host_id, h.email
ORDER BY h.email;