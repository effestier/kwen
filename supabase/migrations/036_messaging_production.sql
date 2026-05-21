-- Migration 036: Production messaging rebuild
-- Adds: read receipts, presence, proper unread counting, conversation ordering

-- =============================================
-- 1. Add last_message_at to conversations for proper sorting
-- =============================================
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz DEFAULT now();

-- Backfill existing conversations
UPDATE public.conversations c
SET last_message_at = (
  SELECT MAX(m.created_at)
  FROM public.messages m
  WHERE m.conversation_id = c.id
  AND m.deleted_at IS NULL
);

-- Index for sorting
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations(last_message_at DESC);

-- =============================================
-- 2. Add read receipt columns to messages
-- =============================================
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS seen_at timestamptz;

-- =============================================
-- 3. Add presence columns to profiles
-- =============================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false;

-- Index for presence queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles(last_seen_at DESC);

-- =============================================
-- 4. Trigger: auto-update unread_count and last_message_at on new message
-- =============================================
CREATE OR REPLACE FUNCTION public.on_new_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Update conversation's last_message_at
  UPDATE public.conversations
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  -- Increment unread_count for all participants except sender
  UPDATE public.conversation_participants
  SET unread_count = unread_count + 1
  WHERE conversation_id = NEW.conversation_id
    AND user_id != NEW.sender_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS on_new_message ON public.messages;
CREATE TRIGGER on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_new_message();

-- =============================================
-- 5. Trigger: auto-mark delivered when message is inserted
-- =============================================
CREATE OR REPLACE FUNCTION public.on_message_delivered()
RETURNS TRIGGER AS $$
BEGIN
  -- Mark as delivered immediately (in a real app, this would be on push notification receipt)
  NEW.delivered_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_message_delivered ON public.messages;
CREATE TRIGGER on_message_delivered
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_message_delivered();

-- =============================================
-- 6. RPC: mark conversation as read
-- =============================================
CREATE OR REPLACE FUNCTION public.mark_conversation_read(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS void AS $$
BEGIN
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

-- =============================================
-- 7. RPC: get conversations with last message preview
-- =============================================
CREATE OR REPLACE FUNCTION public.get_conversations(p_user_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_is_online boolean,
  other_last_seen_at timestamptz,
  last_message_content text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count int,
  updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.conversation_id,
    p.id as other_user_id,
    p.username as other_username,
    p.display_name as other_display_name,
    p.avatar_url as other_avatar_url,
    p.is_online as other_is_online,
    p.last_seen_at as other_last_seen_at,
    lm.content as last_message_content,
    lm.sender_id as last_message_sender_id,
    lm.created_at as last_message_created_at,
    cp.unread_count,
    c.updated_at
  FROM public.conversation_participants cp
  JOIN public.conversations c ON c.id = cp.conversation_id
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = cp.conversation_id AND cp2.user_id != p_user_id
  JOIN public.profiles p ON p.id = cp2.user_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.sender_id, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = cp.conversation_id
    AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  WHERE cp.user_id = p_user_id
  ORDER BY c.last_message_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- 8. RPC: get messages with read receipts
-- =============================================
CREATE OR REPLACE FUNCTION public.get_messages_with_receipts(
  p_conversation_id uuid,
  p_user_id uuid,
  p_limit int DEFAULT 50,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  delivered_at timestamptz,
  seen_at timestamptz,
  reply_to_message_id uuid,
  sender_username text,
  sender_display_name text,
  sender_avatar_url text
) AS $$
BEGIN
  -- Verify user is participant
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.created_at,
    m.delivered_at,
    m.seen_at,
    m.reply_to_message_id,
    p.username as sender_username,
    p.display_name as sender_display_name,
    p.avatar_url as sender_avatar_url
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND m.deleted_at IS NULL
    AND (p_cursor IS NULL OR m.created_at < p_cursor)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- 9. RPC: update user presence
-- =============================================
CREATE OR REPLACE FUNCTION public.update_user_presence(
  p_user_id uuid,
  p_is_online boolean
)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET is_online = p_is_online,
      last_seen_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- 10. Enable realtime for messages and reactions
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
