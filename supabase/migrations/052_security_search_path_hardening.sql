-- Security hardening: Set search_path on ALL SECURITY DEFINER functions
-- Prevents search_path injection attacks where an attacker creates malicious
-- objects in the public schema that get resolved before legitimate ones.
--
-- This migration is idempotent — safe to run multiple times.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true  -- SECURITY DEFINER
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public',
        r.schema_name, r.function_name, r.args
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log but continue — some functions may have issues
      RAISE NOTICE 'Could not set search_path on %.%(%): %', r.schema_name, r.function_name, r.args, SQLERRM;
    END;
  END LOOP;
END $$;
