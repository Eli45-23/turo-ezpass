-- Migration: Add host_id validation and constraints to prevent mismatches
-- Date: 2024-01-15
-- Updated: Focuses on toll_account validation and toll_charges relationship validation

-- 1. Add check constraint to ensure host_id consistency within toll_accounts
ALTER TABLE toll_accounts 
ADD CONSTRAINT toll_accounts_host_id_consistency_check 
CHECK (
    -- Ensure host_id exists and is a valid UUID
    host_id IS NOT NULL AND 
    length(host_id) = 36 AND 
    host_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- 2. Create function to validate toll_account relationships
CREATE OR REPLACE FUNCTION validate_toll_charge_account_consistency()
RETURNS trigger AS $$
DECLARE
    account_host_id UUID;
BEGIN
    -- Get the host_id from the associated toll_account
    SELECT host_id INTO account_host_id 
    FROM toll_accounts 
    WHERE id = NEW.toll_account_id;
    
    -- Validate the account belongs to a valid host
    IF account_host_id IS NULL THEN
        RAISE EXCEPTION 'Invalid toll_account_id: % does not exist', NEW.toll_account_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create function to validate toll_accounts
CREATE OR REPLACE FUNCTION validate_toll_account_host_id()
RETURNS trigger AS $$
BEGIN
    -- Ensure host_id is valid UUID format
    IF NEW.host_id IS NULL OR length(NEW.host_id::text) != 36 THEN
        RAISE EXCEPTION 'Invalid host_id format in toll_accounts: %', NEW.host_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create triggers to enforce validation
DROP TRIGGER IF EXISTS validate_toll_accounts_host_id ON toll_accounts;
CREATE TRIGGER validate_toll_accounts_host_id
    BEFORE INSERT OR UPDATE ON toll_accounts
    FOR EACH ROW EXECUTE FUNCTION validate_toll_account_host_id();

DROP TRIGGER IF EXISTS validate_toll_charge_account ON toll_charges;
CREATE TRIGGER validate_toll_charge_account
    BEFORE INSERT OR UPDATE ON toll_charges
    FOR EACH ROW EXECUTE FUNCTION validate_toll_charge_account_consistency();

-- 5. Create indexes for efficient lookups and consistency checks
CREATE INDEX IF NOT EXISTS idx_toll_accounts_host_id ON toll_accounts(host_id);
CREATE INDEX IF NOT EXISTS idx_toll_charges_account_id ON toll_charges(toll_account_id);
CREATE INDEX IF NOT EXISTS idx_toll_charges_trip_id ON toll_charges(trip_id);
CREATE INDEX IF NOT EXISTS idx_toll_charges_plate ON toll_charges(plate_number);
CREATE INDEX IF NOT EXISTS idx_toll_charges_transponder ON toll_charges(transponder_id);

-- 6. Create monitoring view to detect orphaned records
CREATE OR REPLACE VIEW host_id_mismatch_monitor AS
SELECT 
    'toll_charges' as table_name,
    tc.id as record_id,
    ta.host_id as account_host_id,
    tc.toll_account_id,
    ta.provider,
    tc.toll_date as charge_date,
    tc.toll_amount as amount,
    'orphaned_toll_charge' as issue_type
FROM toll_charges tc
LEFT JOIN toll_accounts ta ON tc.toll_account_id = ta.id
WHERE ta.id IS NULL

UNION ALL

SELECT 
    'transponder_mappings' as table_name,
    tm.id as record_id,
    tm.host_id as account_host_id,
    NULL as toll_account_id,
    'Transponder Mapping' as provider,
    NULL as charge_date,
    NULL as amount,
    'active_transponder_mapping' as issue_type
FROM transponder_mappings tm
WHERE tm.is_active = true;

-- 7. Create function to clean up orphaned records (emergency use only)
CREATE OR REPLACE FUNCTION cleanup_orphaned_toll_charges()
RETURNS TABLE(cleanup_action TEXT, record_count INTEGER) AS $$
DECLARE
    orphaned_count INTEGER := 0;
BEGIN
    -- Delete toll_charges that reference non-existent toll_accounts
    DELETE FROM toll_charges tc
    WHERE NOT EXISTS (
        SELECT 1 FROM toll_accounts ta 
        WHERE ta.id = tc.toll_account_id
    );
    
    GET DIAGNOSTICS orphaned_count = ROW_COUNT;
    
    -- Return results
    RETURN QUERY VALUES ('orphaned_toll_charges_deleted', orphaned_count);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_orphaned_toll_charges IS 'Emergency function to clean up orphaned toll charges. Use with caution.';