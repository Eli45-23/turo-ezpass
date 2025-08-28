-- Migration: Add exec function for RLS context management
-- This allows the application to set session variables for Row-Level Security

-- Create the exec function that allows setting session variables
CREATE OR REPLACE FUNCTION exec(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only allow SET statements for app.host_id
    IF query ~ '^SET\s+app\.host_id\s*=\s*''[a-f0-9-]{36}'';\s*$' OR 
       query ~ '^SET\s+app\.host_id\s*=\s*'''';\s*$' THEN
        EXECUTE query;
    ELSE
        RAISE EXCEPTION 'Only SET app.host_id statements are allowed';
    END IF;
END;
$$;