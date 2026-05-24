-- =============================================
-- 043: Fix cross-tier duplicate posts in get_discovery_feed
-- H9: Posts from followed users could appear in both Tier 1 and Tier 2
-- Fix: Use temp table to collect all tiers, then deduplicate by post id
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
  v_t1 int;
  v_t2 int;
  v_t3 int;
  v_t4 int;
BEGIN
  SELECT array_agg(f.following_id) INTO v_following FROM follows f WHERE f.follower_id = p_user_id;
  SELECT array_agg(b.blocked_id) INTO v_blocked FROM blocks b WHERE b.blocker_id = p_user_id;
  SELECT array_agg(m.muted_id) INTO v_muted FROM mutes m WHERE m.muter_id = p_user_id;

  v_t1 := GREATEST(1, p_limit * 40 / 100);
  v_t2 := GREATEST(1, p_limit * 30 / 100);
  v_t3 := GREATEST(1, p_limit * 20 / 100);
  v_t4 := GREATEST(1, p_limit - v_t1 - v_t2 - v_t3);

  -- H9: Collect all tiers into a temp table, deduplicate by post id
  CREATE TEMP TABLE _feed_candidates ON COMMIT DROP AS
  (
    -- Tier 1: Following (40%)
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
      'following'::text AS tier,
      1 AS tier_priority
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.deleted_at IS NULL
      AND p.user_id = ANY(COALESCE(v_following, ARRAY[]::uuid[]))
      AND (p.visibility IS NULL OR p.visibility = 'public'
        OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows WHERE following_id = p.user_id AND follower_id = p_user_id)))
      AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
      AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
      AND (p_exclude_ids IS NULL OR array_length(p_exclude_ids, 1) IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT v_t1
  )
  UNION ALL
  (
    -- Tier 2: Trending (30%) — public only, non-followed, non-private
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
      'trending'::text,
      2
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND (pr.is_private IS NULL OR pr.is_private = false)
      AND p.user_id != p_user_id
      AND (v_following IS NULL OR NOT (p.user_id = ANY(v_following)))
      AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
      AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
      AND (p_exclude_ids IS NULL OR array_length(p_exclude_ids, 1) IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
    ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC, p.id DESC
    LIMIT v_t2
  )
  UNION ALL
  (
    -- Tier 3: Discovery (20%) — random public, last 30 days
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
      'discovery'::text,
      3
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND (pr.is_private IS NULL OR pr.is_private = false)
      AND p.user_id != p_user_id
      AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
      AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
      AND p.created_at > now() - interval '30 days'
      AND (p_exclude_ids IS NULL OR array_length(p_exclude_ids, 1) IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
    ORDER BY random()
    LIMIT v_t3
  )
  UNION ALL
  (
    -- Tier 4: Fresh (10%) — newest public
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
      'fresh'::text,
      4
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND (pr.is_private IS NULL OR pr.is_private = false)
      AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
      AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
      AND (p_exclude_ids IS NULL OR array_length(p_exclude_ids, 1) IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT v_t4
  );

  -- H9: Return deduplicated results — keep the highest-priority tier for each post
  RETURN QUERY
  SELECT DISTINCT ON (fc.id)
    fc.id, fc.user_id, fc.content, fc.location, fc.created_at,
    fc.lc, fc.cc, fc.sc, fc.shc,
    fc.il, fc.isv,
    fc.display_name, fc.username, fc.avatar_url, fc.is_verified,
    fc.med,
    fc.tier
  FROM _feed_candidates fc
  ORDER BY fc.id, fc.tier_priority;

  DROP TABLE IF EXISTS _feed_candidates;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
