-- =============================================
-- 048: Fix feed = following only, explore = all posts
-- =============================================
-- Problem 1: get_discovery_feed mixes following (40%) + trending (30%) + discovery (20%) + fresh (10%)
--   User wants: feed = ONLY posts from people you follow
-- Problem 2: get_explore_feed excludes current user's own posts
--   User wants: explore = ALL posts ever made on the platform (public)

-- =============================================
-- Fix Feed: Following-only feed
-- =============================================
DROP FUNCTION IF EXISTS public.get_discovery_feed(uuid, int, timestamptz, uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.get_discovery_feed(
  p_user_id uuid,
  p_limit int DEFAULT 20,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
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
  save_count int,
  share_count int,
  is_liked boolean,
  is_saved boolean,
  display_name text,
  username text,
  avatar_url text,
  is_verified boolean,
  media jsonb,
  tier text
) AS $$
DECLARE
  v_following uuid[];
  v_blocked uuid[];
  v_muted uuid[];
BEGIN
  SELECT array_agg(f.following_id) INTO v_following FROM follows f WHERE f.follower_id = p_user_id;
  SELECT array_agg(b.blocked_id) INTO v_blocked FROM blocks b WHERE b.blocker_id = p_user_id;
  SELECT array_agg(m.muted_id) INTO v_muted FROM mutes m WHERE m.muter_id = p_user_id;

  -- If user follows nobody, return empty
  IF v_following IS NULL OR array_length(v_following, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int,
    (SELECT count(*) FROM saved_posts sp WHERE sp.post_id = p.id)::int,
    COALESCE(p.shares, 0)::int,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id),
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id),
    pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id),
    'following'::text
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND p.user_id = ANY(v_following)
    AND (p.visibility IS NULL OR p.visibility = 'public'
      OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows WHERE following_id = p.user_id AND follower_id = p_user_id)))
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_exclude_ids IS NULL OR array_length(p_exclude_ids, 1) IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================
-- Fix Explore: Show ALL public posts (including own)
-- =============================================
DROP FUNCTION IF EXISTS public.get_explore_feed(uuid, int, timestamptz, uuid, uuid[], text);

CREATE OR REPLACE FUNCTION public.get_explore_feed(
  p_user_id uuid,
  p_limit int DEFAULT 30,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_category text DEFAULT 'all'
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  location text,
  created_at timestamptz,
  like_count int,
  comment_count int,
  save_count int,
  share_count int,
  is_liked boolean,
  is_saved boolean,
  display_name text,
  username text,
  avatar_url text,
  is_verified boolean,
  media jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      p.id, p.user_id, p.content, p.location, p.created_at,
      (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int AS lc,
      (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int AS cc,
      (SELECT count(*) FROM saved_posts sp WHERE sp.post_id = p.id)::int AS sc,
      COALESCE(p.shares, 0)::int AS shc,
      EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS il,
      EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) AS isv,
      pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
      (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
       FROM post_media pm WHERE pm.post_id = p.id) AS med,
      (COALESCE(p.engagement_score, 0) / GREATEST(0.5, extract(epoch FROM (now() - p.created_at)) / 3600)) AS velocity,
      ROW_NUMBER() OVER (PARTITION BY p.user_id ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC) AS author_rank
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND (pr.is_private IS NULL OR pr.is_private = false)
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p_user_id AND b.blocked_id = p.user_id)
      AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = p_user_id AND m.muted_id = p.user_id)
      AND (p_exclude_ids IS NULL OR array_length(p_exclude_ids, 1) IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
      -- Category filter (server-side)
      AND (
        p_category = 'all'
        OR (p_category = 'photos' AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.media_type = 'image') AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.media_type = 'video'))
        OR (p_category = 'videos' AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.media_type = 'video'))
        OR (p_category = 'reels' AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.media_type = 'video') AND (SELECT count(*) FROM post_media pm WHERE pm.post_id = p.id) = 1)
        OR (p_category = 'text' AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id))
      )
  )
  SELECT
    r.id, r.user_id, r.content, r.location, r.created_at,
    r.lc, r.cc, r.sc, r.shc, r.il, r.isv,
    r.display_name, r.username, r.avatar_url, r.is_verified, r.med
  FROM ranked r
  WHERE r.author_rank <= 5  -- max 5 posts per author per page (was 3, user wants to see all)
  ORDER BY r.velocity DESC NULLS LAST, r.created_at DESC, r.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
