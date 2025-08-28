-- Fix toll_account #70 host_id mismatch
-- This moves the August tolls from the wrong host to the correct host
-- This fixes the $0.00 tolls issue for August trips

UPDATE toll_accounts 
SET host_id = '5322cf92-98a4-49fb-aaa2-64daa5610a2e' 
WHERE id = 70;

-- Verify the fix
SELECT 
  ta.id,
  ta.host_id,
  ta.provider,
  COUNT(tc.id) as toll_count
FROM toll_accounts ta
LEFT JOIN toll_charges tc ON tc.toll_account_id = ta.id
WHERE ta.id IN (70, 76)
GROUP BY ta.id, ta.host_id, ta.provider
ORDER BY ta.id;