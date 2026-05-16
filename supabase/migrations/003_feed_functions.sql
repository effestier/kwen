-- OpenSocial Feed Functions
-- Run this after 002_rls_policies.sql

-- =============================================
-- TIMELINE FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION get_timeline(
  p_user_id uuid,
  p_limit int DEFAULT 20,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  location text,
  media_url text,
  created_at timestamptz,
  like_count bigint,
  comment_count bigint,
  is_liked boolean,
  is_saved boolean,
  user_display_name text,
  user_username text,
  user_avatar_url text,
  user_is_verified boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.content,
    p.location,
    p.media_url,
    p.created_at,
    (SELECT COUNT(*)::bigint FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT COUNT(*)::bigint FROM comments c WHERE c.post_id = p.id) AS comment_count,
    EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS is_liked,
    EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) AS is_saved,
    pf.display_name,
    pf.username,
    pf.avatar_url,
    pf.is_verified
  FROM posts p
  JOIN profiles pf ON pf.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND p.user_id IN (
      SELECT following_id FROM follows WHERE follower_id = p_user_id
      UNION ALL
      SELECT p_user_id
    )
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.created_at DESC
  LIMIT p_limit;
END;
$$;

-- =============================================
-- EXPLORE FUNCTION (non-following posts)
-- =============================================
CREATE OR REPLACE FUNCTION get_explore_posts(
  p_user_id uuid,
  p_limit int DEFAULT 20,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  location text,
  media_url text,
  created_at timestamptz,
  like_count bigint,
  comment_count bigint,
  is_liked boolean,
  is_saved boolean,
  user_display_name text,
  user_username text,
  user_avatar_url text,
  user_is_verified boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.content,
    p.location,
    p.media_url,
    p.created_at,
    (SELECT COUNT(*)::bigint FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT COUNT(*)::bigint FROM comments c WHERE c.post_id = p.id) AS comment_count,
    EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS is_liked,
    EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) AS is_saved,
    pf.display_name,
    pf.username,
    pf.avatar_url,
    pf.is_verified
  FROM posts p
  JOIN profiles pf ON pf.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (
      p_user_id IS NULL
      OR p.user_id NOT IN (
        SELECT COALESCE(following_id, '00000000-0000-0000-0000-000000000000'::uuid)
        FROM follows
        WHERE follower_id = p_user_id
      )
    )
    AND (p_user_id IS NULL OR p.user_id != p_user_id)
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.created_at DESC
  LIMIT p_limit;
END;
$$;

-- =============================================
-- GET USER PROFILE FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION get_profile(
  p_username text,
  p_current_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  website text,
  is_verified boolean,
  created_at timestamptz,
  is_following boolean,
  posts_count bigint,
  followers_count bigint,
  following_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pf.id,
    pf.username,
    pf.display_name,
    pf.avatar_url,
    pf.bio,
    pf.website,
    pf.is_verified,
    pf.created_at,
    CASE
      WHEN p_current_user_id IS NULL THEN false
      ELSE EXISTS(
        SELECT 1 FROM follows
        WHERE follower_id = p_current_user_id
        AND following_id = pf.id
      )
    END AS is_following,
    (SELECT COUNT(*)::bigint FROM posts WHERE user_id = pf.id AND deleted_at IS NULL) AS posts_count,
    (SELECT COUNT(*)::bigint FROM follows WHERE following_id = pf.id) AS followers_count,
    (SELECT COUNT(*)::bigint FROM follows WHERE follower_id = pf.id) AS following_count
  FROM profiles pf
  WHERE pf.username = p_username;
END;
$$;

-- =============================================
-- GET USER POSTS FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION get_user_posts(
  p_user_id uuid,
  p_current_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  location text,
  created_at timestamptz,
  like_count bigint,
  comment_count bigint,
  is_liked boolean,
  is_saved boolean,
  user_display_name text,
  user_username text,
  user_avatar_url text,
  user_is_verified boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.content,
    p.location,
    p.created_at,
    (SELECT COUNT(*)::bigint FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT COUNT(*)::bigint FROM comments c WHERE c.post_id = p.id) AS comment_count,
    EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_current_user_id) AS is_liked,
    EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_current_user_id) AS is_saved,
    pf.display_name,
    pf.username,
    pf.avatar_url,
    pf.is_verified
  FROM posts p
  JOIN profiles pf ON pf.id = p.user_id
  WHERE p.user_id = p_user_id
    AND p.deleted_at IS NULL
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.created_at DESC
  LIMIT p_limit;
END;
$$;