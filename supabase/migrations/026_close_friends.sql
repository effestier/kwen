-- Migration 026: Close Friends List
-- Run this in Supabase SQL Editor

-- =============================================
-- CLOSE FRIENDS TABLE
-- =============================================
CREATE TABLE public.close_friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX idx_close_friends_user_id ON close_friends(user_id);
CREATE INDEX idx_close_friends_friend_id ON close_friends(friend_id);

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;

-- Users can see their own close friends list
CREATE POLICY "close_friends_select_own"
  ON public.close_friends FOR SELECT
  USING (auth.uid() = user_id);

-- Users can add to their own close friends list
CREATE POLICY "close_friends_insert_own"
  ON public.close_friends FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can remove from their own close friends list
CREATE POLICY "close_friends_delete_own"
  ON public.close_friends FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Check if user is in close friends list
CREATE OR REPLACE FUNCTION public.is_close_friend(
  p_owner_id uuid,
  p_viewer_id uuid
)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM close_friends
    WHERE user_id = p_owner_id AND friend_id = p_viewer_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get close friends list for a user
CREATE OR REPLACE FUNCTION public.get_close_friends(p_user_id uuid)
RETURNS TABLE (
  friend_id uuid,
  username text,
  display_name text,
  avatar_url text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cf.friend_id,
    p.username,
    p.display_name,
    p.avatar_url
  FROM close_friends cf
  JOIN profiles p ON p.id = cf.friend_id
  WHERE cf.user_id = p_user_id
  ORDER BY p.username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- UPDATE STORIES RLS FOR VISIBILITY
-- =============================================

-- Drop old permissive policy
DROP POLICY IF EXISTS "stories_public_read" ON public.stories;
DROP POLICY IF EXISTS "stories_select" ON public.stories;

-- New visibility-aware policy
CREATE POLICY "stories_select_visibility" ON public.stories FOR SELECT
  USING (
    -- Own stories always visible
    auth.uid() = user_id
    -- Public stories visible to all
    OR visibility = 'public' OR visibility IS NULL
    -- Followers stories: viewer follows the owner
    OR (visibility = 'followers' AND EXISTS (
      SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = user_id
    ))
    -- Close friends stories: viewer is in owner's close friends list
    OR (visibility = 'close_friends' AND EXISTS (
      SELECT 1 FROM close_friends WHERE user_id = stories.user_id AND friend_id = auth.uid()
    ))
  );
