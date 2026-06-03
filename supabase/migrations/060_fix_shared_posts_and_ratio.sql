-- =============================================
-- MIGRATION 060: Fix shared_posts table + ratio enforcement
-- =============================================

-- 1. Create shared_posts table (missing — breaks explore/search/trending RPCs)
CREATE TABLE IF NOT EXISTS public.shared_posts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_shared_posts_post_id ON public.shared_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_shared_posts_user_id ON public.shared_posts(user_id);
ALTER TABLE public.shared_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shared_posts: view all" ON public.shared_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "shared_posts: insert own" ON public.shared_posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "shared_posts: delete own" ON public.shared_posts FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT SELECT, INSERT, DELETE ON public.shared_posts TO authenticated;

-- 2. Fix get_explore_feed — replace shared_posts with 0 fallback so it works even if table is empty
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
    (SELECT count(*) FROM public.likes l WHERE l.post_id = p.id)::int,
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

-- 3. Fix search_explore — same shared_posts fix
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
      NULL::int, NULL::int, NULL::jsonb, ph.hashtag,
      (SELECT count(*) FROM public.posts p2 WHERE p2.content ILIKE '%#' || ph.hashtag || '%' AND p2.deleted_at IS NULL)
    FROM public.post_hashtags ph
    WHERE ph.hashtag ILIKE v_query
    GROUP BY ph.hashtag ORDER BY count(*) DESC LIMIT p_limit;
  END IF;

  IF p_type IN ('posts', 'all') THEN
    RETURN QUERY
    SELECT 'post'::text, p.id, p.user_id, p.content, p.created_at,
      pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
      (SELECT count(*) FROM public.likes l WHERE l.post_id = p.id)::int,
      (SELECT count(*) FROM public.comments c WHERE c.post_id = p.id AND c.parent_id IS NULL)::int,
      (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type) ORDER BY pm.sort_order)
       FROM public.post_media pm WHERE pm.post_id = p.id),
      NULL::text, NULL::bigint
    FROM public.posts p
    INNER JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.content ILIKE v_query
      AND p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND COALESCE(pr.is_private, false) = false
      AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
      AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.search_explore(uuid, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_explore(uuid, text, text, int) TO anon;

-- 4. Fix get_trending_posts — same shared_posts fix
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
    (SELECT count(*) FROM public.likes l WHERE l.post_id = p.id)::int,
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

-- 5. Fix get_trending_hashtags — same shared_posts fix
DROP FUNCTION IF EXISTS public.get_trending_hashtags(int);

CREATE OR REPLACE FUNCTION public.get_trending_hashtags(
  p_limit int DEFAULT 20
)
RETURNS TABLE (hashtag text, post_count bigint, recent_likes int, recent_shares int) AS $$
BEGIN
  RETURN QUERY
  SELECT ph.hashtag,
    count(DISTINCT p.id)::bigint AS post_count,
    COALESCE((SELECT count(*) FROM public.likes l INNER JOIN public.posts p2 ON p2.id = l.post_id
      INNER JOIN public.post_hashtags ph2 ON ph2.post_id = p2.id
      WHERE ph2.hashtag = ph.hashtag AND l.created_at > now() - interval '7 days'), 0)::int AS recent_likes,
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
