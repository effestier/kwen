-- Migration 042: Feed + Explore Rebuild
-- Tuned ranking RPCs, cursor pagination, trending hashtags, suggested users, search

-- =============================================
-- 1. Tune engagement score trigger to include saves + shares
-- =============================================
CREATE OR REPLACE FUNCTION public.update_post_engagement_score()
RETURNS trigger AS $$
DECLARE
  v_post_id uuid := COALESCE(NEW.post_id, OLD.post_id);
  v_age_hours float;
  v_score float;
BEGIN
  SELECT GREATEST(0.1, extract(epoch FROM (now() - created_at)) / 3600)
  INTO v_age_hours
  FROM public.posts WHERE id = v_post_id;

  v_score := (
    COALESCE((SELECT count(*) FROM public.post_likes WHERE post_id = v_post_id), 0) * 1.0
    + COALESCE((SELECT count(*) FROM public.comments WHERE post_id = v_post_id AND deleted_at IS NULL), 0) * 2.0
    + COALESCE((SELECT count(*) FROM public.saved_posts WHERE post_id = v_post_id), 0) * 1.5
    + COALESCE((SELECT shares FROM public.posts WHERE id = v_post_id), 0) * 3.0
  ) * exp(-0.05 * v_age_hours);

  UPDATE public.posts SET engagement_score = v_score WHERE id = v_post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add triggers for saves/shares engagement
DROP TRIGGER IF EXISTS trg_engagement_on_save ON public.saved_posts;
CREATE TRIGGER trg_engagement_on_save
  AFTER INSERT OR DELETE ON public.saved_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_post_engagement_score();

-- =============================================
-- 2. Rewrite get_discovery_feed with composite cursor + save/share counts
-- =============================================
DROP FUNCTION IF EXISTS public.get_discovery_feed(uuid, int, timestamptz);
DROP FUNCTION IF EXISTS public.get_discovery_feed(uuid, int, text);

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

  -- Tier 1: Following (40%)
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
    AND p.user_id = ANY(COALESCE(v_following, ARRAY[]::uuid[]))
    AND (p.visibility IS NULL OR p.visibility = 'public'
      OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows WHERE following_id = p.user_id AND follower_id = p_user_id)))
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_exclude_ids IS NULL OR array_length(p_exclude_ids, 1) IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT v_t1;

  -- Tier 2: Trending (30%) — public only, non-followed, non-private
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
    'trending'::text
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
  LIMIT v_t2;

  -- Tier 3: Discovery (20%) — random public, last 30 days
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
    'discovery'::text
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
  LIMIT v_t3;

  -- Tier 4: Fresh (10%) — newest public
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
    'fresh'::text
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND (pr.is_private IS NULL OR pr.is_private = false)
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_exclude_ids IS NULL OR array_length(p_exclude_ids, 1) IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT v_t4;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================
-- 3. Rewrite get_explore_feed with cursor + engagement velocity + author diversity
-- =============================================
DROP FUNCTION IF EXISTS public.get_explore_feed(uuid, int, int);
DROP FUNCTION IF EXISTS public.get_explore_feed(uuid, timestamptz, int);
DROP FUNCTION IF EXISTS public.get_explore_feed(uuid, int, timestamptz);

CREATE OR REPLACE FUNCTION public.get_explore_feed(
  p_user_id uuid,
  p_limit int DEFAULT 30,
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

-- =============================================
-- 4. Trending hashtags RPC
-- =============================================
CREATE OR REPLACE FUNCTION public.get_trending_hashtags(
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  hashtag text,
  post_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT ph.hashtag, count(*) AS post_count
  FROM post_hashtags ph
  JOIN posts p ON p.id = ph.post_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND p.created_at > now() - interval '7 days'
  GROUP BY ph.hashtag
  ORDER BY post_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================
-- 5. Suggested users RPC
-- =============================================
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
BEGIN
  RETURN QUERY
  WITH following AS (
    SELECT following_id FROM follows WHERE follower_id = p_user_id
  ),
  blocked AS (
    SELECT blocked_id FROM blocks WHERE blocker_id = p_user_id
    UNION
    SELECT muted_id FROM mutes WHERE muter_id = p_user_id
  ),
  -- Users followed by people I follow (friends of friends)
  fof AS (
    SELECT f2.following_id AS user_id, 'followed_by_friends'::text AS reason, count(*) AS strength
    FROM follows f1
    JOIN follows f2 ON f2.follower_id = f1.following_id
    WHERE f1.follower_id = p_user_id
      AND f2.following_id != p_user_id
      AND NOT EXISTS (SELECT 1 FROM following WHERE following_id = f2.following_id)
      AND NOT EXISTS (SELECT 1 FROM blocked WHERE blocked_id = f2.following_id)
    GROUP BY f2.following_id
    ORDER BY strength DESC
    LIMIT 20
  ),
  -- Popular users I don't follow
  popular AS (
    SELECT pr.id AS user_id, 'popular'::text AS reason, count(DISTINCT f.follower_id) AS strength
    FROM profiles pr
    JOIN follows f ON f.following_id = pr.id
    WHERE pr.id != p_user_id
      AND NOT EXISTS (SELECT 1 FROM following WHERE following_id = pr.id)
      AND NOT EXISTS (SELECT 1 FROM blocked WHERE blocked_id = pr.id)
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
    SELECT user_id, reason, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY strength DESC) AS rn
    FROM combined
  )
  SELECT
    pr.id, pr.username, pr.display_name, pr.avatar_url, pr.is_verified,
    (SELECT count(*) FROM follows f WHERE f.following_id = pr.id) AS follower_count,
    d.reason
  FROM deduped d
  JOIN profiles pr ON pr.id = d.user_id
  WHERE d.rn = 1
  ORDER BY d.reason, follower_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================
-- 6. Unified explore search RPC
-- =============================================
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
BEGIN
  SELECT array_agg(b.blocked_id) INTO v_blocked FROM blocks b WHERE b.blocker_id = p_user_id;

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
    ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================
-- 7. Backfill engagement scores with new formula
-- =============================================
UPDATE public.posts SET engagement_score = (
  COALESCE((SELECT count(*) FROM public.post_likes WHERE post_id = posts.id), 0) * 1.0
  + COALESCE((SELECT count(*) FROM public.comments WHERE post_id = posts.id AND deleted_at IS NULL), 0) * 2.0
  + COALESCE((SELECT count(*) FROM public.saved_posts WHERE post_id = posts.id), 0) * 1.5
  + COALESCE(shares, 0) * 3.0
) * exp(-0.05 * GREATEST(0.1, extract(epoch FROM (now() - created_at)) / 3600))
WHERE deleted_at IS NULL;
