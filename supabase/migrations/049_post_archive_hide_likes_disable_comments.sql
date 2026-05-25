-- =============================================
-- POST ARCHIVE + HIDE LIKES + DISABLE COMMENTS
-- =============================================

-- Add columns to posts table
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS hide_likes boolean DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS disable_comments boolean DEFAULT false;

-- Index for archived posts
CREATE INDEX IF NOT EXISTS idx_posts_archived_at ON public.posts(user_id, archived_at DESC) WHERE archived_at IS NOT NULL;

-- =============================================
-- ARCHIVE POST
-- =============================================
CREATE OR REPLACE FUNCTION public.archive_post(p_post_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE posts
  SET archived_at = now()
  WHERE id = p_post_id
    AND user_id = auth.uid()
    AND archived_at IS NULL
    AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- UNARCHIVE POST (restore from archive)
-- =============================================
CREATE OR REPLACE FUNCTION public.unarchive_post(p_post_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE posts
  SET archived_at = NULL
  WHERE id = p_post_id
    AND user_id = auth.uid()
    AND archived_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- TOGGLE HIDE LIKES
-- =============================================
CREATE OR REPLACE FUNCTION public.toggle_hide_likes(p_post_id uuid)
RETURNS boolean AS $$
DECLARE
  new_val boolean;
BEGIN
  UPDATE posts
  SET hide_likes = NOT hide_likes
  WHERE id = p_post_id
    AND user_id = auth.uid()
  RETURNING hide_likes INTO new_val;

  RETURN COALESCE(new_val, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- TOGGLE DISABLE COMMENTS
-- =============================================
CREATE OR REPLACE FUNCTION public.toggle_disable_comments(p_post_id uuid)
RETURNS boolean AS $$
DECLARE
  new_val boolean;
BEGIN
  UPDATE posts
  SET disable_comments = NOT disable_comments
  WHERE id = p_post_id
    AND user_id = auth.uid()
  RETURNING disable_comments INTO new_val;

  RETURN COALESCE(new_val, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- UPDATE SELECT POLICY: exclude archived posts from feed
-- =============================================
DROP POLICY IF EXISTS "posts_select_public" ON public.posts;
CREATE POLICY "posts_select_public" ON public.posts FOR SELECT USING (
  deleted_at IS NULL
  AND archived_at IS NULL
  AND (
    visibility IS NULL OR visibility = 'public'
    OR (visibility = 'followers' AND EXISTS (SELECT 1 FROM follows WHERE following_id = user_id AND follower_id = auth.uid()))
    OR user_id = auth.uid()
  )
);

-- Owner can still see their own archived posts
DROP POLICY IF EXISTS "posts_select_own_archived" ON public.posts;
CREATE POLICY "posts_select_own_archived" ON public.posts FOR SELECT USING (
  deleted_at IS NULL
  AND user_id = auth.uid()
);
