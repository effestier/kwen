-- 057d: Fix get_suggested_users and get_trending_hashtags (run after 057a)

DROP FUNCTION IF EXISTS public.get_suggested_users(uuid, int);
DROP FUNCTION IF EXISTS public.get_suggested_users(uuid, int, int);

CREATE OR REPLACE FUNCTION public.get_suggested_users(
  p_user_id uuid, p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid, display_name text, username text, avatar_url text,
  is_verified boolean, followers_count int, mutual_count int
) AS $$
BEGIN
  RETURN QUERY
  SELECT pr.id, pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
    (SELECT count(*) FROM public.follows f WHERE f.following_id = pr.id)::int,
    (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.follower_id
     WHERE f1.following_id = pr.id AND f2.following_id = p_user_id)::int
  FROM public.profiles pr
  WHERE pr.id != p_user_id
    AND COALESCE(pr.is_private, false) = false
    AND NOT EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p_user_id AND f.following_id = pr.id)
    AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = p_user_id AND b.blocked_id = pr.id)
  ORDER BY
    (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.follower_id
     WHERE f1.following_id = pr.id AND f2.following_id = p_user_id) DESC,
    (SELECT count(*) FROM public.follows f WHERE f.following_id = pr.id) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_suggested_users(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_trending_hashtags(p_limit int DEFAULT 10)
RETURNS TABLE (hashtag text, post_count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT ph.hashtag, count(*) AS pc
  FROM public.post_hashtags ph
  JOIN public.posts p ON p.id = ph.post_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
  GROUP BY ph.hashtag ORDER BY pc DESC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_trending_hashtags(int) TO authenticated;
