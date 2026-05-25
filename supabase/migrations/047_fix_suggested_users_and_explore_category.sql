-- M24: Fix get_suggested_users sorting by numeric strength instead of text reason
-- Current: ORDER BY d.reason, follower_count DESC — sorts alphabetically by reason string
-- Fix: Add strength to deduped CTE, sort by strength DESC, follower_count DESC

CREATE OR REPLACE FUNCTION public.get_suggested_users(
  p_user_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_verified boolean,
  follower_count bigint,
  reason text
) AS $$
DECLARE
  following uuid[];
  blocked uuid[];
BEGIN
  SELECT array_agg(f.following_id) INTO following FROM follows f WHERE f.follower_id = p_user_id;
  SELECT array_agg(b.blocked_id) INTO blocked FROM blocks b WHERE b.blocker_id = p_user_id;

  RETURN QUERY
  WITH fof AS (
    SELECT f2.following_id AS user_id, 'friend_of_friend'::text AS reason, count(DISTINCT f2.follower_id) AS strength
    FROM follows f1
    JOIN follows f2 ON f2.follower_id = f1.following_id
    WHERE f1.follower_id = p_user_id
      AND f2.following_id != p_user_id
      AND (following IS NULL OR NOT (f2.following_id = ANY(following)))
      AND (blocked IS NULL OR NOT (f2.following_id = ANY(blocked)))
    GROUP BY f2.following_id
    ORDER BY strength DESC
    LIMIT 20
  ),
  popular AS (
    SELECT pr.id AS user_id, 'popular'::text AS reason, count(DISTINCT f.follower_id) AS strength
    FROM profiles pr
    JOIN follows f ON f.following_id = pr.id
    WHERE pr.id != p_user_id
      AND (following IS NULL OR NOT (pr.id = ANY(following)))
      AND (blocked IS NULL OR NOT (pr.id = ANY(blocked)))
      AND (pr.is_private IS NULL OR pr.is_private = false)
    GROUP BY pr.id
    ORDER BY strength DESC
    LIMIT 20
  ),
  combined AS (
    SELECT * FROM fof
    UNION ALL
    SELECT * FROM popular
  ),
  deduped AS (
    SELECT user_id, reason, strength, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY strength DESC) AS rn
    FROM combined
  )
  SELECT
    pr.id, pr.username, pr.display_name, pr.avatar_url, pr.is_verified,
    (SELECT count(*) FROM follows f WHERE f.following_id = pr.id) AS follower_count,
    d.reason
  FROM deduped d
  JOIN profiles pr ON pr.id = d.user_id
  WHERE d.rn = 1
  ORDER BY d.strength DESC, follower_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- M22: Add server-side category filtering to get_explore_feed
-- Current: client filters after fetching 30 posts, so "Videos" tab might show 0-2 results
-- Fix: Add p_category parameter that filters by media_type before ranking

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
      -- Engagement velocity: engagement per hour since creation
      (COALESCE(p.engagement_score, 0) / GREATEST(0.5, extract(epoch FROM (now() - p.created_at)) / 3600)) AS velocity,
      -- Author diversity: row number within author
      ROW_NUMBER() OVER (PARTITION BY p.user_id ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC) AS author_rank
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND (pr.is_private IS NULL OR pr.is_private = false)
      AND p.user_id != p_user_id
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p_user_id AND b.blocked_id = p.user_id)
      AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = p_user_id AND m.muted_id = p.user_id)
      -- Exclude already-seen posts for pagination
      AND (p_exclude_ids IS NULL OR array_length(p_exclude_ids, 1) IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
      -- M22: Server-side category filtering
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
  WHERE r.author_rank <= 3  -- max 3 posts per author per page
  ORDER BY r.velocity DESC NULLS LAST, r.created_at DESC, r.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
