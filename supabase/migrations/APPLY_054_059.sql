-- =============================================
-- KWEN Pending Migrations — 054 (cascade only) + 057a-057d + 058 + 059
-- Run this in Supabase Dashboard SQL Editor
-- Safe to run multiple times (idempotent)
-- =============================================

-- =============================================
-- STEP 0: Diagnostics — uncomment to check current state
-- =============================================
-- SELECT 'get_following_feed exists' AS check_item,
--   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_following_feed') AS result;
-- SELECT 'is_private column exists' AS check_item,
--   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_private') AS result;
-- SELECT 'posts table exists' AS check_item,
--   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts') AS result;
-- SELECT 'profiles table exists' AS check_item,
--   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') AS result;
-- SELECT 'follows table exists' AS check_item,
--   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'follows') AS result;
-- SELECT 'blocks table exists' AS check_item,
--   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'blocks') AS result;
-- SELECT 'mutes table exists' AS check_item,
--   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mutes') AS result;

-- =============================================
-- MIGRATION 054 (cascade only): get_following_feed SET search_path
-- =============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_following_feed') THEN
    ALTER FUNCTION public.get_following_feed(uuid, int, uuid[]) SET search_path = public;
  END IF;
END $$;

-- =============================================
-- MIGRATION 057a: Add is_private column to profiles
-- =============================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- =============================================
-- MIGRATION 057b: Fix get_explore_feed RPC
-- =============================================

DROP FUNCTION IF EXISTS public.get_explore_feed(uuid, int, int);
DROP FUNCTION IF EXISTS public.get_explore_feed(uuid, int, uuid[]);

CREATE OR REPLACE FUNCTION public.get_explore_feed(
  p_user_id uuid,
  p_limit int DEFAULT 20,
  p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  location text,
  created_at timestamptz,
  like_count int,
  comment_count int,
  share_count int,
  is_liked boolean,
  is_saved boolean,
  display_name text,
  username text,
  avatar_url text,
  is_verified boolean,
  media jsonb
) AS $$
DECLARE
  v_blocked uuid[];
  v_muted uuid[];
BEGIN
  SELECT array_agg(b.blocked_id) INTO v_blocked FROM public.blocks b WHERE b.blocker_id = p_user_id;
  SELECT array_agg(m.muted_id) INTO v_muted FROM public.mutes m WHERE m.muter_id = p_user_id;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM public.post_likes pl WHERE pl.post_id = p.id)::int,
    (SELECT count(*) FROM public.comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int,
    (SELECT count(*) FROM public.shared_posts sh WHERE sh.post_id = p.id)::int,
    EXISTS (SELECT 1 FROM public.post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id),
    EXISTS (SELECT 1 FROM public.saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id),
    pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM public.post_media pm WHERE pm.post_id = p.id)
  FROM public.posts p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND COALESCE(pr.is_private, false) = false
    AND p.user_id != p_user_id
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_exclude_ids IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
  ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_explore_feed(uuid, int, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_explore_feed(uuid, int, uuid[]) TO anon;

-- =============================================
-- MIGRATION 057c: Fix search_explore RPC
-- =============================================

DROP FUNCTION IF EXISTS public.search_explore(uuid, text, text, int);

CREATE OR REPLACE FUNCTION public.search_explore(
  p_user_id uuid, p_query text, p_type text DEFAULT 'all', p_limit int DEFAULT 20
)
RETURNS TABLE (
  result_type text, id uuid, user_id uuid, content text, created_at timestamptz,
  display_name text, username text, avatar_url text, is_verified boolean,
  like_count int, comment_count int, media jsonb, hashtag text, post_count bigint
) AS $$
DECLARE
  v_query text := '%' || p_query || '%';
  v_blocked uuid[];
  v_muted uuid[];
BEGIN
  SELECT array_agg(b.blocked_id) INTO v_blocked FROM public.blocks b WHERE b.blocker_id = p_user_id;
  SELECT array_agg(m.muted_id) INTO v_muted FROM public.mutes m WHERE m.muter_id = p_user_id;

  IF p_type IN ('users', 'all') THEN
    RETURN QUERY
    SELECT 'user'::text, pr.id, NULL::uuid, NULL::text, pr.created_at,
      pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
      NULL::int, NULL::int, NULL::jsonb, NULL::text, NULL::bigint
    FROM public.profiles pr
    WHERE (pr.username ILIKE v_query OR pr.display_name ILIKE v_query)
      AND pr.id != p_user_id
      AND (v_blocked IS NULL OR NOT (pr.id = ANY(v_blocked)))
      AND (v_muted IS NULL OR NOT (pr.id = ANY(v_muted)))
    ORDER BY CASE WHEN pr.username ILIKE p_query THEN 0 ELSE 1 END,
      (SELECT count(*) FROM public.follows f WHERE f.following_id = pr.id) DESC
    LIMIT p_limit;
  END IF;

  IF p_type IN ('tags', 'all') THEN
    RETURN QUERY
    SELECT 'tag'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamptz,
      NULL::text, NULL::text, NULL::text, NULL::boolean,
      NULL::int, NULL::int, NULL::jsonb, ph.hashtag, count(*) AS pc
    FROM public.post_hashtags ph
    JOIN public.posts p ON p.id = ph.post_id
    WHERE ph.hashtag ILIKE v_query AND p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
    GROUP BY ph.hashtag ORDER BY pc DESC LIMIT p_limit;
  END IF;

  IF p_type IN ('posts', 'all') THEN
    RETURN QUERY
    SELECT 'post'::text, p.id, p.user_id, p.content, p.created_at,
      pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
      (SELECT count(*) FROM public.post_likes pl WHERE pl.post_id = p.id)::int,
      (SELECT count(*) FROM public.comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int,
      (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
       FROM public.post_media pm WHERE pm.post_id = p.id),
      NULL::text, NULL::bigint
    FROM public.posts p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.content ILIKE v_query AND p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND COALESCE(pr.is_private, false) = false
      AND p.user_id != p_user_id
      AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
      AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.search_explore(uuid, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_explore(uuid, text, text, int) TO anon;

-- =============================================
-- MIGRATION 057d: Fix get_suggested_users and get_trending_hashtags
-- =============================================

DROP FUNCTION IF EXISTS public.get_suggested_users(uuid, int);
DROP FUNCTION IF EXISTS public.get_suggested_users(uuid, int, int);

CREATE OR REPLACE FUNCTION public.get_suggested_users(
  p_user_id uuid, p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid, display_name text, username text, avatar_url text,
  is_verified boolean, followers_count int, mutual_count int
) AS $$
BEGIN
  RETURN QUERY
  SELECT pr.id, pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
    (SELECT count(*) FROM public.follows f WHERE f.following_id = pr.id)::int,
    (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.follower_id
     WHERE f1.following_id = pr.id AND f2.following_id = p_user_id)::int
  FROM public.profiles pr
  WHERE pr.id != p_user_id
    AND COALESCE(pr.is_private, false) = false
    AND NOT EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p_user_id AND f.following_id = pr.id)
    AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = p_user_id AND b.blocked_id = pr.id)
  ORDER BY
    (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.follower_id
     WHERE f1.following_id = pr.id AND f2.following_id = p_user_id) DESC,
    (SELECT count(*) FROM public.follows f WHERE f.following_id = pr.id) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_suggested_users(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_suggested_users(uuid, int) TO anon;

CREATE OR REPLACE FUNCTION public.get_trending_hashtags(p_limit int DEFAULT 10)
RETURNS TABLE (hashtag text, post_count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT ph.hashtag, count(*) AS pc
  FROM public.post_hashtags ph
  JOIN public.posts p ON p.id = ph.post_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
  GROUP BY ph.hashtag ORDER BY pc DESC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_trending_hashtags(int) TO authenticated;

-- =============================================
-- MIGRATION 058: Mention notifications trigger
-- =============================================

CREATE OR REPLACE FUNCTION create_mention_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id uuid;
  mentioned_user_id uuid;
BEGIN
  SELECT user_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
  mentioned_user_id := NEW.user_id;

  IF post_author_id = mentioned_user_id THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = mentioned_user_id
      AND COALESCE((settings->>'mentions_notifications')::boolean, true) = false
    ) THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  INSERT INTO notifications (user_id, type, actor_id, post_id, is_read)
  SELECT mentioned_user_id, 'mention', post_author_id, NEW.post_id, false
  WHERE NOT EXISTS (
    SELECT 1 FROM notifications
    WHERE user_id = mentioned_user_id
    AND type = 'mention'
    AND actor_id = post_author_id
    AND post_id = NEW.post_id
    AND created_at > now() - interval '1 hour'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_post_mention_notification ON public.post_mentions;
CREATE TRIGGER on_post_mention_notification
  AFTER INSERT ON post_mentions
  FOR EACH ROW
  EXECUTE FUNCTION create_mention_notification();

-- =============================================
-- MIGRATION 059: Grant EXECUTE on get_following_feed
-- (The function was defined in 048/050/054 but never granted)
-- =============================================

GRANT EXECUTE ON FUNCTION public.get_following_feed(uuid, int, uuid[]) TO authenticated;

-- =============================================
-- STEP LAST: Verify the fix
-- Uncomment to test the feed function directly:
-- SELECT * FROM public.get_following_feed(
--   'YOUR_USER_ID_HERE'::uuid,  -- replace with your actual user id
--   20,
--   ARRAY[]::uuid[]
-- );
