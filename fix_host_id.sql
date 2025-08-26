-- Fix host_id mismatch for toll_account #46
-- This will move all 179 toll_charges to the correct host

UPDATE toll_accounts 
SET host_id = '2e95a231-d871-447b-85ea-07e216f76689' 
WHERE id = 46;

-- Verify the fix
SELECT 
  ta.id,
  ta.host_id,
  ta.provider,
  COUNT(tc.id) as toll_count
FROM toll_accounts ta
LEFT JOIN toll_charges tc ON tc.toll_account_id = ta.id
GROUP BY ta.id, ta.host_id, ta.provider;