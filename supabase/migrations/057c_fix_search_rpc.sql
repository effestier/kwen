-- 057c: Fix search_explore RPC (run after 057a)

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
