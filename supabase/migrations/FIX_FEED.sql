-- =============================================
-- FIX FEED — Nuclear option to fix get_following_feed
-- Run this ENTIRE script in Supabase SQL Editor
-- =============================================

-- Step 1: Drop ALL signatures of get_following_feed
DROP FUNCTION IF EXISTS public.get_following_feed(uuid, int, int);
DROP FUNCTION IF EXISTS public.get_following_feed(uuid, int, uuid[]);
DROP FUNCTION IF EXISTS public.get_following_feed(uuid, int);

-- Step 2: Make sure is_private column exists on profiles (needed for some feed queries)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- Step 3: Recreate get_following_feed from scratch
-- This version handles NULL columns gracefully with COALESCE
CREATE OR REPLACE FUNCTION public.get_following_feed(
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
  is_hidden boolean,
  is_blocked boolean,
  display_name text,
  username text,
  avatar_url text,
  media jsonb
) AS $$
DECLARE
  v_blocked uuid[];
  v_muted uuid[];
BEGIN
  -- Get lists of blocked and muted users
  SELECT array_agg(b.blocked_id) INTO v_blocked FROM public.blocks b WHERE b.blocker_id = p_user_id;
  SELECT array_agg(m.muted_id) INTO v_muted FROM public.mutes m WHERE m.muter_id = p_user_id;

  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.content,
    p.location,
    p.created_at,
    (SELECT count(*) FROM public.post_likes pl WHERE pl.post_id = p.id)::int AS like_count,
    (SELECT count(*) FROM public.comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL)::int AS comment_count,
    COALESCE(p.shares, 0)::int AS share_count,
    EXISTS (SELECT 1 FROM public.post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS is_liked,
    EXISTS (SELECT 1 FROM public.saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) AS is_saved,
    EXISTS (SELECT 1 FROM public.post_hides ph WHERE ph.post_id = p.id AND ph.user_id = p_user_id) AS is_hidden,
    EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = p_user_id AND b.blocked_id = p.user_id) AS is_blocked,
    pr.display_name,
    pr.username,
    pr.avatar_url,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pm.id,
          'storage_path', pm.storage_path,
          'media_type', pm.media_type,
          'sort_order', pm.sort_order
        ) ORDER BY pm.sort_order
      )
      FROM public.post_media pm WHERE pm.post_id = p.id
    ) AS media
  FROM public.posts p
  INNER JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    -- Only show posts from people the user follows OR the user's own posts
    AND (
      p.user_id = p_user_id
      OR EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.follower_id = p_user_id AND f.following_id = p.user_id
      )
    )
    -- Visibility filter
    AND (
      p.visibility IS NULL
      OR p.visibility = 'public'
      OR (p.visibility = 'followers' AND EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.following_id = p.user_id AND f.follower_id = p_user_id
      ))
    )
    -- Exclude blocked users
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    -- Exclude muted users
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    -- Exclude already-loaded posts
    AND (p_exclude_ids IS NULL OR array_length(p_exclude_ids, 1) IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
  ORDER BY p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Step 4: Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_following_feed(uuid, int, uuid[]) TO authenticated;

-- Step 5: Verify
SELECT 'get_following_feed recreated and granted' AS status;
