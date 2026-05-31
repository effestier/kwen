-- ============================================================
-- 054: Fix ALL broken RLS policies from 052/053 security hardening
--
-- Issues fixed:
-- 1. conversation_participants: Can't read other participants (names/avatars show "User")
-- 2. conversation_participants: INSERT too restrictive for fallback conversation creation
-- 3. story_views: Users can't read their own view records (seen dots broken)
-- 4. close_friends: Feed can't check if user is in someone's close_friends list
-- 5. stories: Multiple overlapping SELECT policies cause unintended visibility
-- 6. handle_new_user trigger: Missing ON CONFLICT causes signup errors
-- 7. get_following_feed: Missing SET search_path + missing archived_at filter
-- ============================================================

-- ============================================================
-- FIX 1: conversation_participants SELECT
-- ============================================================
DROP POLICY IF EXISTS "conversation_participants_all" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_select" ON public.conversation_participants;

CREATE POLICY "conversation_participants_select" ON public.conversation_participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "conversation_participants_update" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_update_own" ON public.conversation_participants;

CREATE POLICY "conversation_participants_update_own" ON public.conversation_participants
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "conversation_participants_delete_own" ON public.conversation_participants;

CREATE POLICY "conversation_participants_delete_own" ON public.conversation_participants
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "conversation_participants_insert" ON public.conversation_participants;

CREATE POLICY "conversation_participants_insert" ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM conversations WHERE id = conversation_id)
  );

-- ============================================================
-- FIX 1b: RPC to add other user to conversation (bypasses RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is already a participant
  IF NOT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a conversation participant';
  END IF;

  INSERT INTO conversation_participants (conversation_id, user_id, unread_count)
  VALUES (p_conversation_id, p_user_id, 0)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_conversation_participant(uuid, uuid) TO authenticated;

-- ============================================================
-- FIX 2: story_views SELECT
-- ============================================================
DROP POLICY IF EXISTS "story_views_select_owner" ON public.story_views;

CREATE POLICY "story_views_select_viewer" ON public.story_views
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM stories WHERE id = story_id AND user_id = auth.uid())
  );

-- ============================================================
-- FIX 3: close_friends SELECT
-- ============================================================
DROP POLICY IF EXISTS "close_friends_select_own" ON public.close_friends;

CREATE POLICY "close_friends_select" ON public.close_friends
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() = friend_id
  );

-- ============================================================
-- FIX 4: Consolidate stories SELECT policies
-- ============================================================
DROP POLICY IF EXISTS "stories_select" ON public.stories;
DROP POLICY IF EXISTS "stories_public_read" ON public.stories;
DROP POLICY IF EXISTS "stories_select_visibility" ON public.stories;

CREATE POLICY "stories_select_final" ON public.stories
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      expires_at > now()
      AND (
        visibility IS NULL OR visibility = 'public'
        OR (visibility = 'followers' AND EXISTS (
          SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = user_id
        ))
        OR (visibility = 'close_friends' AND EXISTS (
          SELECT 1 FROM close_friends WHERE user_id = stories.user_id AND friend_id = auth.uid()
        ))
      )
    )
  );

-- ============================================================
-- FIX 5: handle_new_user ON CONFLICT DO NOTHING
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================
-- FIX 6: get_following_feed with search_path + archived_at
-- ============================================================
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
  v_following uuid[];
  v_blocked uuid[];
  v_muted uuid[];
BEGIN
  SELECT array_agg(f.following_id) INTO v_following FROM follows f WHERE f.follower_id = p_user_id;
  SELECT array_agg(b.blocked_id) INTO v_blocked FROM blocks b WHERE b.blocker_id = p_user_id;
  SELECT array_agg(m.muted_id) INTO v_muted FROM mutes m WHERE m.muter_id = p_user_id;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int,
    (SELECT count(*) FROM saved_posts sp WHERE sp.post_id = p.id)::int,
    COALESCE(p.shares, 0)::int,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id),
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id),
    pr.display_name, pr.username, pr.avatar_url, pr.is_verified,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id)
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND p.archived_at IS NULL
    AND (p_exclude_ids IS NULL OR NOT (p.id = ANY(p_exclude_ids)))
    AND (
      p.user_id = p_user_id
      OR (
        v_following IS NOT NULL
        AND p.user_id = ANY(v_following)
        AND (p.visibility IS NULL OR p.visibility = 'public'
          OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows WHERE following_id = p.user_id AND follower_id = p_user_id))
        )
      )
    )
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
  ORDER BY p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
