-- Migration: Add Personal Tolls and Late Tolls Support
-- This adds the database schema needed to properly categorize tolls per your requirements

-- Add columns to support Personal Tolls and Late Tolls categorization
ALTER TABLE toll_charges ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT FALSE;
ALTER TABLE toll_charges ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT FALSE;  
ALTER TABLE toll_charges ADD COLUMN IF NOT EXISTS original_invoice_id BIGINT REFERENCES invoices(id);

-- Add column to track which toll IDs were included in each invoice
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS included_toll_ids TEXT[];

-- Add indexes for better performance on personal/late toll queries
CREATE INDEX IF NOT EXISTS idx_toll_charges_personal ON toll_charges(is_personal) WHERE is_personal = TRUE;
CREATE INDEX IF NOT EXISTS idx_toll_charges_late ON toll_charges(is_late) WHERE is_late = TRUE;

-- Add index for host-based queries (critical for isolation)
CREATE INDEX IF NOT EXISTS idx_toll_charges_host_id ON toll_charges(toll_account_id);
CREATE INDEX IF NOT EXISTS idx_trips_host_id ON trips(host_id);

-- Comment on new columns
COMMENT ON COLUMN toll_charges.is_personal IS 'Marks tolls that belong to host personally (not matched to any rental trip)';
COMMENT ON COLUMN toll_charges.is_late IS 'Marks tolls discovered after the trip was already invoiced';
COMMENT ON COLUMN toll_charges.original_invoice_id IS 'References the invoice where this toll was first supposed to be included';
COMMENT ON COLUMN invoices.included_toll_ids IS 'Array of toll_charge IDs that were included in this invoice to prevent duplicates';

SELECT 'Schema migration completed - Personal and Late tolls support added' as result;