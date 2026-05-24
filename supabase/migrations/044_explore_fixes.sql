-- =============================================
-- 044: Explore correctness fixes (H29, H31)
-- =============================================

-- H29: get_explore_feed had unused cursor params (p_cursor_time, p_cursor_id)
-- that were never used in WHERE clause. Remove them to avoid confusion.
-- The page already uses p_exclude_ids for pagination which works correctly.
DROP FUNCTION IF EXISTS public.get_explore_feed(uuid, int, timestamptz, uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.get_explore_feed(
  p_user_id uuid,
  p_limit int DEFAULT 30,
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


-- H31: search_explore doesn't filter muted users
-- Add mute filtering to user search and post search sections
DROP FUNCTION IF EXISTS public.search_explore(uuid, text, text, int);

CREATE OR REPLACE FUNCTION public.search_explore(
  p_user_id uuid,
  p_query text,
  p_type text DEFAULT 'all',  -- 'users', 'tags', 'posts', 'all'
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  result_type text,
  id uuid,
  user_id uuid,
  content text,
  created_at timestamptz,
  display_name text,
  username text,
  avatar_url text,
  is_verified boolean,
  like_count int,
  comment_count int,
  media jsonb,
  hashtag text,
  post_count bigint
) AS $$
DECLARE
  v_query text := '%' || p_query || '%';
  v_blocked uuid[];
  v_muted uuid[];
BEGIN
  SELECT array_agg(b.blocked_id) INTO v_blocked FROM blocks b WHERE b.blocker_id = p_user_id;
  SELECT array_agg(m.muted_id) INTO v_muted FROM mutes m WHERE m.muter_id = p_user_id;

  -- Users
  IF p_type IN ('users', 'all') THEN
    RETURN QUERY
    SELECT
      'user'::text, pr.id, NULL::uuid, NULL::text, pr.created_at,
      pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
      NULL::int, NULL::int, NULL::jsonb, NULL::text, NULL::bigint
    FROM profiles pr
    WHERE (pr.username ILIKE v_query OR pr.display_name ILIKE v_query)
      AND pr.id != p_user_id
      AND (v_blocked IS NULL OR NOT (pr.id = ANY(v_blocked)))
      AND (v_muted IS NULL OR NOT (pr.id = ANY(v_muted)))  -- H31: filter muted users
    ORDER BY
      CASE WHEN pr.username ILIKE p_query THEN 0 ELSE 1 END,
      (SELECT count(*) FROM follows f WHERE f.following_id = pr.id) DESC
    LIMIT p_limit;
  END IF;

  -- Hashtags
  IF p_type IN ('tags', 'all') THEN
    RETURN QUERY
    SELECT
      'tag'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamptz,
      NULL::text, NULL::text, NULL::text, NULL::boolean,
      NULL::int, NULL::int, NULL::jsonb, ph.hashtag, count(*) AS pc
    FROM post_hashtags ph
    JOIN posts p ON p.id = ph.post_id
    WHERE ph.hashtag ILIKE v_query
      AND p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
    GROUP BY ph.hashtag
    ORDER BY pc DESC
    LIMIT p_limit;
  END IF;

  -- Posts
  IF p_type IN ('posts', 'all') THEN
    RETURN QUERY
    SELECT
      'post'::text, p.id, p.user_id, p.content, p.created_at,
      pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
      (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int,
      (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int,
      (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
       FROM post_media pm WHERE pm.post_id = p.id),
      NULL::text, NULL::bigint
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE p.content ILIKE v_query
      AND p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND (pr.is_private IS NULL OR pr.is_private = false)
      AND p.user_id != p_user_id
      AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
      AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))  -- H31: filter muted users' posts
    ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
