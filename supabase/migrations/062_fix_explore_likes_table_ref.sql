-- =============================================
-- MIGRATION 062: Fix explore RPCs — likes → post_likes
-- =============================================
-- Migration 060 introduced `public.likes` references but the actual table
-- is `public.post_likes`. This broke get_explore_feed, get_trending_posts,
-- and get_trending_hashtags. search_explore was not affected (not re-created).
-- Fix: replace all `public.likes l` with `public.post_likes pl`.

-- 1. Fix get_explore_feed
DROP FUNCTION IF EXISTS public.get_explore_feed(uuid, int, uuid[]);

CREATE OR REPLACE FUNCTION public.get_explore_feed(
  p_user_id uuid, p_limit int DEFAULT 30, p_exclude_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  id uuid, user_id uuid, content text, created_at timestamptz,
  like_count int, comment_count int, save_count int, share_count int,
  display_name text, username text, avatar_url text, is_verified boolean, media jsonb
) AS $$
DECLARE
  v_blocked uuid[];
  v_muted uuid[];
BEGIN
  SELECT array_agg(b.blocked_id) INTO v_blocked FROM public.blocks b WHERE b.blocker_id = p_user_id;
  SELECT array_agg(m.muted_id) INTO v_muted FROM public.mutes m WHERE m.muter_id = p_user_id;

  RETURN QUERY
  SELECT p.id, p.user_id, p.content, p.created_at,
    (SELECT count(*) FROM public.post_likes pl WHERE pl.post_id = p.id)::int,
    (SELECT count(*) FROM public.comments c WHERE c.post_id = p.id AND c.parent_id IS NULL)::int,
    (SELECT count(*) FROM public.saved_posts sp WHERE sp.post_id = p.id)::int,
    (SELECT count(*) FROM public.shared_posts sh WHERE sh.post_id = p.id)::int,
    pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type) ORDER BY pm.sort_order)
     FROM public.post_media pm WHERE pm.post_id = p.id)
  FROM public.posts p
  INNER JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND p.id != ALL(p_exclude_ids)
    AND p.user_id != p_user_id
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND COALESCE(pr.is_private, false) = false
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
  ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_explore_feed(uuid, int, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_explore_feed(uuid, int, uuid[]) TO anon;

-- 2. Fix get_trending_posts
DROP FUNCTION IF EXISTS public.get_trending_posts(int);

CREATE OR REPLACE FUNCTION public.get_trending_posts(
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid, user_id uuid, content text, created_at timestamptz,
  like_count int, comment_count int, save_count int, share_count int,
  display_name text, username text, avatar_url text, is_verified boolean, media jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.user_id, p.content, p.created_at,
    (SELECT count(*) FROM public.post_likes pl WHERE pl.post_id = p.id)::int,
    (SELECT count(*) FROM public.comments c WHERE c.post_id = p.id AND c.parent_id IS NULL)::int,
    (SELECT count(*) FROM public.saved_posts sp WHERE sp.post_id = p.id)::int,
    (SELECT count(*) FROM public.shared_posts sh WHERE sh.post_id = p.id)::int,
    pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type) ORDER BY pm.sort_order)
     FROM public.post_media pm WHERE pm.post_id = p.id)
  FROM public.posts p
  INNER JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND COALESCE(pr.is_private, false) = false
  ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_trending_posts(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trending_posts(int) TO anon;

-- 3. Fix get_trending_hashtags
DROP FUNCTION IF EXISTS public.get_trending_hashtags(int);

CREATE OR REPLACE FUNCTION public.get_trending_hashtags(
  p_limit int DEFAULT 20
)
RETURNS TABLE (hashtag text, post_count bigint, recent_likes int, recent_shares int) AS $$
BEGIN
  RETURN QUERY
  SELECT ph.hashtag,
    count(DISTINCT p.id)::bigint AS post_count,
    COALESCE((SELECT count(*) FROM public.post_likes pl INNER JOIN public.posts p2 ON p2.id = pl.post_id
      INNER JOIN public.post_hashtags ph2 ON ph2.post_id = p2.id
      WHERE ph2.hashtag = ph.hashtag AND pl.created_at > now() - interval '7 days'), 0)::int AS recent_likes,
    COALESCE((SELECT count(*) FROM public.shared_posts sh INNER JOIN public.posts p3 ON p3.id = sh.post_id
      INNER JOIN public.post_hashtags ph3 ON ph3.post_id = p3.id
      WHERE ph3.hashtag = ph.hashtag AND sh.created_at > now() - interval '7 days'), 0)::int AS recent_shares
  FROM public.post_hashtags ph
  INNER JOIN public.posts p ON p.id = ph.post_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
  GROUP BY ph.hashtag ORDER BY post_count DESC, recent_likes DESC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_trending_hashtags(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trending_hashtags(int) TO anon;
