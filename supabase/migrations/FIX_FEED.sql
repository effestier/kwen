-- =============================================
-- FIX FEED — Complete rebuild of get_following_feed
-- Run this ENTIRE script in Supabase SQL Editor
-- Safe to run multiple times (idempotent)
-- =============================================

-- Step 1: Create post_hides table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.post_hides (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- RLS on post_hides
ALTER TABLE public.post_hides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_hides_select" ON public.post_hides;
CREATE POLICY "post_hides_select" ON public.post_hides FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "post_hides_insert" ON public.post_hides FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_hides_insert" ON public.post_hides FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "post_hides_delete" ON public.post_hides FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "post_hides_delete" ON public.post_hides FOR DELETE USING (auth.uid() = user_id);

-- Step 2: Make sure is_private column exists on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- Step 3: Drop ALL old signatures of get_following_feed
DROP FUNCTION IF EXISTS public.get_following_feed(uuid, int, int);
DROP FUNCTION IF EXISTS public.get_following_feed(uuid, int, uuid[]);
DROP FUNCTION IF EXISTS public.get_following_feed(uuid, int);

-- Step 4: Recreate get_following_feed from scratch
-- Returns columns matching the FeedPost interface in feed-client.tsx
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
    (SELECT count(*) FROM public.post_likes pl WHERE pl.post_id = p.id)::int,
    (SELECT count(*) FROM public.comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int,
    (SELECT count(*) FROM public.saved_posts sp WHERE sp.post_id = p.id)::int,
    COALESCE(p.shares, 0)::int,
    EXISTS (SELECT 1 FROM public.post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id),
    EXISTS (SELECT 1 FROM public.saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id),
    pr.display_name,
    pr.username,
    pr.avatar_url,
    COALESCE(pr.is_verified, false),
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
    )
  FROM public.posts p
  INNER JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND p.archived_at IS NULL
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

-- Step 5: Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_following_feed(uuid, int, uuid[]) TO authenticated;

-- Step 6: Verify
SELECT 'get_following_feed rebuilt and granted' AS status;
