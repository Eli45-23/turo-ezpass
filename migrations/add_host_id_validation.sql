-- Migration: Add host_id validation and constraints to prevent mismatches
-- Date: 2024-01-15

-- 1. Add check constraint to ensure host_id consistency within user's data
ALTER TABLE toll_accounts 
ADD CONSTRAINT toll_accounts_host_id_consistency_check 
CHECK (
    -- Ensure host_id exists and is a valid UUID
    host_id IS NOT NULL AND 
    length(host_id) = 36 AND 
    host_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- 2. Add check constraint to toll_charges to ensure they match their account's host_id
ALTER TABLE toll_charges 
ADD CONSTRAINT toll_charges_host_id_consistency_check 
CHECK (
    -- Ensure that toll_charges host_id matches the associated toll_account
    NOT EXISTS (
        SELECT 1 FROM toll_accounts ta 
        WHERE ta.id = toll_charges.toll_account_id 
        AND ta.host_id != toll_charges.host_id
    )
);

-- 3. Create function to validate host_id consistency across related tables
CREATE OR REPLACE FUNCTION validate_host_id_consistency()
RETURNS trigger AS $$
BEGIN
    -- For toll_accounts: ensure host_id is valid
    IF TG_TABLE_NAME = 'toll_accounts' THEN
        IF NEW.host_id IS NULL OR length(NEW.host_id) != 36 THEN
            RAISE EXCEPTION 'Invalid host_id format in toll_accounts: %', NEW.host_id;
        END IF;
    END IF;
    
    -- For toll_charges: ensure host_id matches parent toll_account
    IF TG_TABLE_NAME = 'toll_charges' THEN
        IF EXISTS (
            SELECT 1 FROM toll_accounts ta 
            WHERE ta.id = NEW.toll_account_id 
            AND ta.host_id != NEW.host_id
        ) THEN
            RAISE EXCEPTION 'Host ID mismatch: toll_charge host_id (%) does not match toll_account host_id', NEW.host_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create triggers to enforce validation
DROP TRIGGER IF EXISTS validate_toll_accounts_host_id ON toll_accounts;
CREATE TRIGGER validate_toll_accounts_host_id
    BEFORE INSERT OR UPDATE ON toll_accounts
    FOR EACH ROW EXECUTE FUNCTION validate_host_id_consistency();

DROP TRIGGER IF EXISTS validate_toll_charges_host_id ON toll_charges;
CREATE TRIGGER validate_toll_charges_host_id
    BEFORE INSERT OR UPDATE ON toll_charges
    FOR EACH ROW EXECUTE FUNCTION validate_host_id_consistency();

-- 5. Create index for efficient host_id lookups and consistency checks
CREATE INDEX IF NOT EXISTS idx_toll_accounts_host_id ON toll_accounts(host_id);
CREATE INDEX IF NOT EXISTS idx_toll_charges_host_id ON toll_charges(host_id);
CREATE INDEX IF NOT EXISTS idx_toll_charges_account_host_lookup ON toll_charges(toll_account_id, host_id);

-- 6. Create monitoring view to detect host_id mismatches
CREATE OR REPLACE VIEW host_id_mismatch_monitor AS
SELECT 
    'toll_charges' as table_name,
    tc.id as record_id,
    tc.host_id as record_host_id,
    ta.host_id as expected_host_id,
    tc.toll_account_id,
    ta.provider,
    tc.charge_date,
    tc.amount
FROM toll_charges tc
JOIN toll_accounts ta ON tc.toll_account_id = ta.id
WHERE tc.host_id != ta.host_id

UNION ALL

SELECT 
    'transponder_plate_mappings' as table_name,
    tpm.id as record_id,
    tpm.host_id as record_host_id,
    ta.host_id as expected_host_id,
    tpm.toll_account_id,
    ta.provider,
    null as charge_date,
    null as amount
FROM transponder_plate_mappings tpm
JOIN toll_accounts ta ON tpm.toll_account_id = ta.id
WHERE tpm.host_id != ta.host_id;

-- 7. Create function to fix host_id mismatches (emergency use only)
CREATE OR REPLACE FUNCTION fix_host_id_mismatches(target_host_id UUID)
RETURNS TABLE(fixed_table TEXT, fixed_count INTEGER) AS $$
DECLARE
    toll_charges_fixed INTEGER := 0;
    transponder_mappings_fixed INTEGER := 0;
BEGIN
    -- Fix toll_charges
    UPDATE toll_charges 
    SET host_id = target_host_id
    FROM toll_accounts ta
    WHERE toll_charges.toll_account_id = ta.id 
    AND ta.host_id = target_host_id 
    AND toll_charges.host_id != target_host_id;
    
    GET DIAGNOSTICS toll_charges_fixed = ROW_COUNT;
    
    -- Fix transponder_plate_mappings
    UPDATE transponder_plate_mappings 
    SET host_id = target_host_id
    FROM toll_accounts ta
    WHERE transponder_plate_mappings.toll_account_id = ta.id 
    AND ta.host_id = target_host_id 
    AND transponder_plate_mappings.host_id != target_host_id;
    
    GET DIAGNOSTICS transponder_mappings_fixed = ROW_COUNT;
    
    -- Return results
    RETURN QUERY VALUES 
        ('toll_charges', toll_charges_fixed),
        ('transponder_plate_mappings', transponder_mappings_fixed);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fix_host_id_mismatches IS 'Emergency function to fix host_id mismatches. Use with caution.';