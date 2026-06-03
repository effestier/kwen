-- =============================================
-- MIGRATION 061: DIAGNOSE — Run this in Supabase SQL Editor
-- It will NOT change anything, just show diagnostic info
-- =============================================

-- 1. Does shared_posts table exist?
SELECT 'shared_posts exists' as check_name, EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shared_posts' AND table_schema = 'public') as result;

-- 2. Does get_explore_feed function exist?
SELECT 'get_explore_feed exists' as check_name, EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_explore_feed' AND pronamespace = 'public'::regnamespace) as result;

-- 3. What are the function signatures?
SELECT proname, pg_get_function_identity_arguments(oid) as args, proacl as permissions
FROM pg_proc WHERE proname = 'get_explore_feed' AND pronamespace = 'public'::regnamespace;

-- 4. Try calling the function and see what happens
DO $$
DECLARE
  v_count int;
  v_record record;
BEGIN
  select count(*) into v_count from public.posts where deleted_at is null;
  RAISE NOTICE 'Total posts: %', v_count;

  select count(*) into v_count from public.posts where deleted_at is null and (visibility is null or visibility = 'public');
  RAISE NOTICE 'Public posts: %', v_count;

  select count(*) into v_count from public.profiles where coalesce(is_private, false) = false;
  RAISE NOTICE 'Public profiles: %', v_count;

  -- Try the function
  BEGIN
    select count(*) into v_count from public.get_explore_feed('00000000-0000-0000-0000-000000000000'::uuid, 5, '{}'::uuid[]);
    RAISE NOTICE 'get_explore_feed returns % rows', v_count;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'get_explore_feed ERROR: %', SQLERRM;
  END;
END $$;

-- 5. Check if blocks/mutes tables exist
SELECT 'blocks exists' as check_name, EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'blocks' AND table_schema = 'public') as result;
SELECT 'mutes exists' as check_name, EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mutes' AND table_schema = 'public') as result;

-- 6. Check grants on get_explore_feed
SELECT grantee, privilege_type FROM information_schema.role_routine_grants WHERE routine_name = 'get_explore_feed';
