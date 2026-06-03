-- =============================================
-- FEED DIAGNOSTIC SCRIPT (Supabase-compatible)
-- Run each section in Supabase SQL Editor and report the output
-- =============================================

-- 1. Does get_following_feed exist? What signature?
SELECT
  p.proname AS function_name,
  pg_get_function_result(p.oid) AS returns,
  proargnames AS arg_names,
  proargtypes::regtype[] AS arg_types
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'get_following_feed' AND n.nspname = 'public';

-- 2. Does the authenticated role have EXECUTE permission?
SELECT
  has_function_privilege('authenticated', 'get_following_feed(uuid, integer, uuid[])', 'execute') AS can_execute;

-- 3. Do required tables exist?
SELECT 'posts' AS table_name, EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts') AS exists
UNION ALL
SELECT 'profiles', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles')
UNION ALL
SELECT 'follows', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'follows')
UNION ALL
SELECT 'post_media', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'post_media')
UNION ALL
SELECT 'post_likes', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'post_likes')
UNION ALL
SELECT 'comments', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comments')
UNION ALL
SELECT 'saved_posts', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'saved_posts')
UNION ALL
SELECT 'shared_posts', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shared_posts')
UNION ALL
SELECT 'blocks', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'blocks')
UNION ALL
SELECT 'mutes', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mutes')
UNION ALL
SELECT 'post_hides', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'post_hides');

-- 4. Do required columns on posts exist?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'posts'
ORDER BY ordinal_position;

-- 5. Count posts and check visibility values
SELECT visibility, count(*) FROM public.posts GROUP BY visibility;

-- 6. Count follows
SELECT count(*) AS total_follows FROM public.follows;

-- 7. Try calling get_following_feed directly (replace YOUR_USER_ID with your actual UUID)
-- If this returns 0 rows or errors, that's the problem
-- SELECT * FROM public.get_following_feed('YOUR_USER_ID'::uuid, 5, ARRAY[]::uuid[]);
