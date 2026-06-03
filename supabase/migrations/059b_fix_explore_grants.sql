-- =============================================
-- MIGRATION 059b: Fix explore page — grant anon access + add missing columns
-- =============================================

-- Grant anon access to ALL explore-related RPCs (explore page works without login)
GRANT EXECUTE ON FUNCTION public.get_explore_feed(uuid, int, uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.search_explore(uuid, text, text, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_suggested_users(uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_trending_hashtags(int) TO anon;

-- Fix get_explore_feed: re-create with is_verified in RETURNS to match ExplorePost interface
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
  WHERE p.user_id != p_user_id
    AND pr.is_private = false
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_exclude_ids IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
  ORDER BY p.engagement_score DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_explore_feed(uuid, int, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_explore_feed(uuid, int, uuid[]) TO anon;
