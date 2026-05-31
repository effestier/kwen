-- Security fixes for messaging, conversations, and content validation

-- ============================================================
-- H1: Restrict messages UPDATE to sender-only for content fields
-- Non-senders should only update delivered_at/seen_at via RPC
-- ============================================================

-- Drop the overly broad participant UPDATE policy
DROP POLICY IF EXISTS "messages_update" ON public.messages;

-- Re-create with sender-only check for content changes
-- Participants can still update delivered_at/seen_at via the SECURITY DEFINER RPCs
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- ============================================================
-- H4: Fix conversation_participants INSERT
-- Users should only add THEMSELVES, not other users
-- ============================================================

DROP POLICY IF EXISTS "conversation_participants_insert" ON public.conversation_participants;

CREATE POLICY "conversation_participants_insert" ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id
    )
  );

-- ============================================================
-- H7: Add DB-level content length constraints
-- Prevents denial-of-wallet via oversized content
-- ============================================================

ALTER TABLE public.comments
  ADD CONSTRAINT check_comment_content_length
  CHECK (char_length(content) <= 2000);

ALTER TABLE public.messages
  ADD CONSTRAINT check_message_content_length
  CHECK (char_length(content) <= 5000);

-- ============================================================
-- M5: get_user_media_stats — add auth check
-- Prevents leaking any user's storage data
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_media_stats(target_user_id uuid)
RETURNS TABLE (
  total_count bigint,
  image_count bigint,
  video_count bigint,
  total_size bigint,
  image_size bigint,
  video_size bigint
) AS $$
BEGIN
  -- Only allow checking your own stats
  IF auth.uid() IS NULL OR auth.uid() != target_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE type = 'image') as image_count,
    COUNT(*) FILTER (WHERE type = 'video') as video_count,
    COALESCE(SUM(compressed_size), 0) as total_size,
    COALESCE(SUM(compressed_size) FILTER (WHERE type = 'image'), 0) as image_size,
    COALESCE(SUM(compressed_size) FILTER (WHERE type = 'video'), 0) as video_size
  FROM public.media
  WHERE user_id = target_user_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- M2: Add DELETE policies for story sticker tables
-- ============================================================

CREATE POLICY "story_polls_delete" ON public.story_polls
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE id = story_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "story_questions_delete" ON public.story_questions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE id = story_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "story_countdowns_delete" ON public.story_countdowns
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE id = story_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- M8: Validate notification INSERT
-- Prevents creating fake notifications for any type
-- ============================================================

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT
  WITH CHECK (
    -- Actor must be authenticated
    auth.uid() = actor_id
    AND (
      -- Follow: actor must actually follow the user
      (type = 'follow' AND EXISTS (
        SELECT 1 FROM follows WHERE follower_id = actor_id AND following_id = user_id
      ))
      OR
      -- Like: actor must actually like the post
      (type = 'like' AND post_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM post_likes WHERE user_id = actor_id AND post_id = NEW.post_id
      ))
      OR
      -- Comment: actor must actually have the comment
      (type = 'comment' AND comment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM comments WHERE user_id = actor_id AND id = NEW.comment_id
      ))
      OR
      -- Mention: mention must actually exist
      (type = 'mention' AND post_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM post_mentions WHERE mentioned_user_id = user_id AND post_id = NEW.post_id
      ))
      OR
      -- Story reply
      (type = 'story_reply' AND story_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM stories WHERE id = NEW.story_id AND user_id = NEW.user_id
      ))
      OR
      -- Story reaction
      (type = 'story_reaction' AND story_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM stories WHERE id = NEW.story_id AND user_id = NEW.user_id
      ))
    )
  );

-- ============================================================
-- M1: mark_conversation_read — add auth check
-- Prevents any user from marking another user's conversations as read
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_conversation_read(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS void AS $$
BEGIN
  -- Only allow marking your own conversations as read
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Reset unread count and update last_read_at
  UPDATE public.conversation_participants
  SET unread_count = 0,
      last_read_at = now()
  WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id;

  -- Mark all messages from others as seen
  UPDATE public.messages
  SET seen_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id != p_user_id
    AND seen_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- M2: update_user_presence — add auth check
-- Prevents spoofing another user's online status
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_user_presence(
  p_user_id uuid,
  p_is_online boolean
)
RETURNS void AS $$
BEGIN
  -- Only allow updating your own presence
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles
  SET is_online = p_is_online,
      last_seen_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- M3: get_or_create_conversation — add auth check
-- Prevents creating spam conversations between arbitrary users
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(p_user1 uuid, p_user2 uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  -- Caller must be one of the two users
  IF auth.uid() IS NULL OR (auth.uid() != p_user1 AND auth.uid() != p_user2) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Try to find existing conversation between these two users
  SELECT cp1.conversation_id INTO v_conversation_id
  FROM conversation_participants cp1
  JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = p_user1 AND cp2.user_id = p_user2
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- No existing conversation — create one atomically
  PERFORM pg_advisory_xact_lock(
    hashtext(LEAST(p_user1::text, p_user2::text)),
    hashtext(GREATEST(p_user1::text, p_user2::text))
  );

  -- Double-check after acquiring lock
  SELECT cp1.conversation_id INTO v_conversation_id
  FROM conversation_participants cp1
  JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = p_user1 AND cp2.user_id = p_user2
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- Create conversation + participants
  INSERT INTO conversations DEFAULT VALUES RETURNING id INTO v_conversation_id;
  INSERT INTO conversation_participants (conversation_id, user_id, unread_count)
  VALUES (v_conversation_id, p_user1, 0), (v_conversation_id, p_user2, 0);

  RETURN v_conversation_id;
END;
$$;

-- ============================================================
-- M13: Sanitize display_name in handle_new_user trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_display_name text;
BEGIN
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  v_display_name := LEFT(COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), 100);

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    v_username,
    v_display_name,
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;

-- ============================================================
-- H6: Add auth check to is_close_friend
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_close_friend(p_owner_id uuid, p_viewer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM close_friends
    WHERE user_id = p_owner_id AND friend_id = p_viewer_id
  );
END;
$$;
