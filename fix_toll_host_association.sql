-- Fix toll account association
-- Move 174 tolls from wrong host account to correct one

-- Current situation:
-- - toll_account_id 50 belongs to host 2e95a231-d871-447b-85ea-07e216f76689 (eliascolon23@gmail.com) - has 174 tolls
-- - toll_account_id 51 belongs to host 394da1c7-6e97-4d26-a76f-c4d5aa347f3e (eliascolon35@gmail.com) - has 0 tolls
-- 
-- Goal: Move all 174 tolls from account 50 to account 51

BEGIN;

-- First, verify the current state
SELECT 'BEFORE MIGRATION - Toll counts by account' as status;
SELECT 
    ta.id as toll_account_id,
    ta.host_id,
    ta.username,
    COUNT(tc.id) as toll_count
FROM toll_accounts ta
LEFT JOIN toll_charges tc ON ta.id = tc.toll_account_id
WHERE ta.id IN (50, 51)
GROUP BY ta.id, ta.host_id, ta.username
ORDER BY ta.id;

-- Update all toll charges from account 50 to account 51
UPDATE toll_charges 
SET toll_account_id = 51 
WHERE toll_account_id = 50;

-- Verify the update worked
SELECT 'AFTER MIGRATION - Toll counts by account' as status;
SELECT 
    ta.id as toll_account_id,
    ta.host_id,
    ta.username,
    COUNT(tc.id) as toll_count
FROM toll_accounts ta
LEFT JOIN toll_charges tc ON ta.id = tc.toll_account_id
WHERE ta.id IN (50, 51)
GROUP BY ta.id, ta.host_id, ta.username
ORDER BY ta.id;

-- Show final verification - tolls should now belong to correct host
SELECT 'FINAL VERIFICATION - Tolls by host' as status;
SELECT 
    ta.host_id,
    h.email,
    COUNT(tc.id) as toll_count
FROM toll_accounts ta
JOIN hosts h ON ta.host_id = h.id
LEFT JOIN toll_charges tc ON ta.id = tc.toll_account_id
WHERE ta.id IN (50, 51)
GROUP BY ta.host_id, h.email
ORDER BY ta.host_id;

COMMIT;