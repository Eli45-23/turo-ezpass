-- CRITICAL DATABASE FIX REQUIRED
-- This SQL must be run on the production database to fix CSV upload errors

-- Drop the incorrect trigger that tries to set user_id field
-- The trips table uses host_id, not user_id
DROP TRIGGER IF EXISTS set_user_id_trips ON trips;

-- Optional: Also drop the function if it's not used elsewhere
-- DROP FUNCTION IF EXISTS set_user_id();

-- Verification query to confirm trigger is removed:
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'trips'::regclass AND tgname = 'set_user_id_trips';