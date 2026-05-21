-- Migration 037: Fix feed to respect is_private column
-- Private accounts' posts should not appear in Trending/Discovery/Fresh tiers

-- Drop existing functions first (they return different column sets)
DROP FUNCTION IF EXISTS public.get_discovery_feed(uuid, int, timestamptz);
DROP FUNCTION IF EXISTS public.get_explore_feed(uuid, int, int);

-- =============================================
-- 1. Fix get_discovery_feed to respect is_private
-- =============================================
CREATE OR REPLACE FUNCTION public.get_discovery_feed(
  p_user_id uuid,
  p_limit int DEFAULT 20,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  location text,
  created_at timestamptz,
  like_count int,
  comment_count int,
  is_liked boolean,
  is_saved boolean,
  display_name text,
  username text,
  avatar_url text,
  media jsonb,
  tier text
) AS $$
DECLARE
  v_following uuid[];
  v_blocked uuid[];
  v_muted uuid[];
  v_t1_count int;
  v_t2_count int;
  v_t3_count int;
  v_t4_count int;
BEGIN
  -- Get following list
  SELECT array_agg(f.following_id) INTO v_following
  FROM follows f WHERE f.follower_id = p_user_id;

  -- Get blocked and muted users
  SELECT array_agg(b.blocked_id) INTO v_blocked FROM blocks b WHERE b.blocker_id = p_user_id;
  SELECT array_agg(m.muted_id) INTO v_muted FROM mutes m WHERE m.muter_id = p_user_id;

  -- Calculate tier counts
  v_t1_count := GREATEST(1, p_limit * 40 / 100);
  v_t2_count := GREATEST(1, p_limit * 30 / 100);
  v_t3_count := GREATEST(1, p_limit * 20 / 100);
  v_t4_count := GREATEST(1, p_limit - v_t1_count - v_t2_count - v_t3_count);

  -- Tier 1: Following (40%)
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int as like_count,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int as comment_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id) as media,
    'following'::text as tier
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND p.user_id = ANY(COALESCE(v_following, ARRAY[]::uuid[]))
    AND (p.visibility IS NULL OR p.visibility = 'public'
      OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows WHERE following_id = p.user_id AND follower_id = p_user_id)))
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.created_at DESC
  LIMIT v_t1_count;

  -- Tier 2: Trending (30%) - only public posts from non-followed, non-private accounts
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int as like_count,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int as comment_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id) as media,
    'trending'::text as tier
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND (pr.is_private IS NULL OR pr.is_private = false)  -- FIX: exclude private accounts
    AND NOT (p.user_id = p_user_id)
    AND (v_following IS NULL OR NOT (p.user_id = ANY(v_following)))
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.engagement_score DESC NULLS LAST
  LIMIT v_t2_count;

  -- Tier 3: Discovery (20%) - only public posts from non-private accounts
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int as like_count,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int as comment_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id) as media,
    'discovery'::text as tier
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND (pr.is_private IS NULL OR pr.is_private = false)  -- FIX: exclude private accounts
    AND NOT (p.user_id = p_user_id)
    AND (v_following IS NULL OR NOT (p.user_id = ANY(v_following)))
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND p.created_at > now() - interval '30 days'
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY random()
  LIMIT v_t3_count;

  -- Tier 4: Fresh (10%) - only public posts from non-private accounts
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int as like_count,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int as comment_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id) as media,
    'fresh'::text as tier
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND (pr.is_private IS NULL OR pr.is_private = false)  -- FIX: exclude private accounts
    AND NOT (p.user_id = p_user_id)
    AND (v_following IS NULL OR NOT (p.user_id = ANY(v_following)))
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.created_at DESC
  LIMIT v_t4_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================
-- 2. Fix get_explore_feed to respect is_private
-- =============================================
CREATE OR REPLACE FUNCTION public.get_explore_feed(
  p_user_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  location text,
  created_at timestamptz,
  like_count int,
  comment_count int,
  is_liked boolean,
  is_saved boolean,
  display_name text,
  username text,
  avatar_url text,
  media jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int as like_count,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int as comment_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id) as media
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND (pr.is_private IS NULL OR pr.is_private = false)  -- FIX: exclude private accounts
    AND NOT (p.user_id = p_user_id)
    AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p_user_id AND b.blocked_id = p.user_id)
    AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = p_user_id AND m.muted_id = p.user_id)
  ORDER BY p.engagement_score DESC NULLS LAST
  OFFSET p_offset
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
