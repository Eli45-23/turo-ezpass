-- Fix account isolation issue with transaction_id unique constraint
-- The current global unique constraint on transaction_id breaks account isolation
-- This migration fixes it by creating a compound unique constraint instead

-- Drop the incorrect global unique constraint on transaction_id
DROP INDEX IF EXISTS toll_charges_transaction_id_key;

-- Create the correct compound unique constraint for account isolation
-- This ensures transaction_id is unique within each toll_account, not globally
-- This allows the same E-ZPass transaction IDs to exist across different accounts
CREATE UNIQUE INDEX toll_charges_transaction_account_key 
ON toll_charges(transaction_id, toll_account_id);

-- Add a comment to document the fix
COMMENT ON INDEX toll_charges_transaction_account_key IS 
'Ensures transaction_id uniqueness within each account, not globally. Fixes account isolation.';