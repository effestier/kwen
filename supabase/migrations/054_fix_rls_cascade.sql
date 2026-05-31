-- ============================================================
-- 054: Fix ALL broken RLS policies from 052/053 security hardening
--
-- Issues fixed:
-- 1. conversation_participants: Can't read other participants (names/avatars show "User")
-- 2. conversation_participants: INSERT too restrictive for fallback conversation creation
-- 3. story_views: Users can't read their own view records (seen dots broken)
-- 4. close_friends: Feed can't check if user is in someone's close_friends list
-- 5. get_following_feed: missing SET search_path (050 overwrote 048's version)
-- 6. notifications: 053 used NEW.post_id (invalid in RLS WITH CHECK)
-- 7. handle_new_user: missing ON CONFLICT DO NOTHING
-- 8. messages: mark_messages_seen + add_to_deleted_for RPCs
-- ============================================================

-- 1. conversation_participants: Allow reading other participants
DROP POLICY IF EXISTS "conversation_participants_all" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_select" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_update" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_update_own" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_delete_own" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_insert" ON public.conversation_participants;

CREATE POLICY "conversation_participants_select" ON public.conversation_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "conversation_participants_update_own" ON public.conversation_participants
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "conversation_participants_delete_own" ON public.conversation_participants
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "conversation_participants_insert" ON public.conversation_participants
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM conversations WHERE id = conversation_id)
  );

-- 2. story_views: Allow reading your OWN view records
DROP POLICY IF EXISTS "story_views_select_owner" ON public.story_views;
DROP POLICY IF EXISTS "story_views_select_viewer" ON public.story_views;

CREATE POLICY "story_views_select_viewer" ON public.story_views
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM stories WHERE id = story_id AND user_id = auth.uid())
  );

-- 3. close_friends: Allow checking if you're on someone's list
DROP POLICY IF EXISTS "close_friends_select_own" ON public.close_friends;
DROP POLICY IF EXISTS "close_friends_select" ON public.close_friends;

CREATE POLICY "close_friends_select" ON public.close_friends
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.uid() = friend_id
  );

-- 4. stories: Consolidate overlapping SELECT policies
DROP POLICY IF EXISTS "stories_select" ON public.stories;
DROP POLICY IF EXISTS "stories_public_read" ON public.stories;
DROP POLICY IF EXISTS "stories_select_visibility" ON public.stories;
DROP POLICY IF EXISTS "stories_select_final" ON public.stories;

CREATE POLICY "stories_select_final" ON public.stories
  FOR SELECT USING (
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

-- 5. get_following_feed: Ensure SET search_path
ALTER FUNCTION public.get_following_feed(uuid, int, uuid[]) SET search_path = public;

-- 6. notifications INSERT: Fix NEW.post_id syntax (invalid in RLS)
-- Only check base types (like, comment, follow, mention) since story_id
-- column and story types may not exist on all environments.
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() = actor_id
    AND (
      (type = 'follow' AND EXISTS (
        SELECT 1 FROM follows WHERE follower_id = actor_id AND following_id = user_id
      ))
      OR (type = 'like' AND post_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM post_likes WHERE user_id = actor_id AND post_id = notifications.post_id
      ))
      OR (type = 'comment' AND comment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM comments WHERE user_id = actor_id AND id = notifications.comment_id
      ))
      OR (type = 'mention' AND post_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM post_mentions WHERE user_id = notifications.user_id AND post_id = notifications.post_id
      ))
    )
  );

-- 7. handle_new_user: Add ON CONFLICT DO NOTHING
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_username text;
  v_display_name text;
BEGIN
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  v_display_name := LEFT(COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), 100);

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (NEW.id, v_username, v_display_name, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 8. messages RPCs
DROP FUNCTION IF EXISTS public.mark_messages_seen(uuid);
DROP FUNCTION IF EXISTS public.add_to_deleted_for(uuid, uuid);

CREATE OR REPLACE FUNCTION public.mark_messages_seen(p_conversation_id uuid)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.messages SET seen_at = now()
  WHERE conversation_id = p_conversation_id AND sender_id != auth.uid() AND seen_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.mark_messages_seen(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_to_deleted_for(p_message_id uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.messages
  SET deleted_for = COALESCE(deleted_for, '{}') || ARRAY[p_user_id]
  WHERE id = p_message_id AND NOT (p_user_id = ANY(COALESCE(deleted_for, '{}')));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.add_to_deleted_for(uuid, uuid) TO authenticated;
