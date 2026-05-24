-- =============================================
-- 045: Fix messages delivery-state updates (least-privilege)
--
-- Root cause: messages_update RLS requires auth.uid() = sender_id,
-- but markMessagesAsDelivered/markMessagesAsSeen update OTHER
-- people's messages. RLS blocks → 400 Bad Request.
--
-- APPROACH: Do NOT widen the UPDATE policy. Instead, create
-- SECURITY DEFINER RPC functions that:
--   1. Verify the caller is a conversation participant
--   2. Only write to delivery-state columns (delivered_at, seen_at, deleted_for)
--   3. Cannot touch content, sender_id, media_url, message_type, etc.
--
-- The existing sender-only UPDATE policy stays intact for content edits.
-- =============================================

-- Drop the broad policy if it was already applied by a prior run
DROP POLICY IF EXISTS "messages_update" ON public.messages;

-- Re-create the original sender-only policy
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE USING (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    )
  );

-- =============================================
-- RPC: mark_delivered
-- Marks messages as delivered for the calling user.
-- Only updates delivered_at. Caller must be a participant.
-- =============================================
CREATE OR REPLACE FUNCTION public.mark_messages_delivered(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is a participant
  IF NOT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a conversation participant';
  END IF;

  -- Only update delivered_at on messages NOT sent by the caller
  UPDATE messages
  SET delivered_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id != auth.uid()
    AND delivered_at IS NULL;
END;
$$;

-- =============================================
-- RPC: mark_seen
-- Marks messages as seen for the calling user.
-- Only updates seen_at. Caller must be a participant.
-- =============================================
CREATE OR REPLACE FUNCTION public.mark_messages_seen(p_conversation_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is a participant
  IF NOT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a conversation participant';
  END IF;

  -- Only update seen_at on messages NOT sent by the caller
  RETURN QUERY
  UPDATE messages
  SET seen_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id != auth.uid()
    AND seen_at IS NULL
  RETURNING id;
END;
$$;

-- =============================================
-- RPC: delete_message_for_me
-- Adds caller's user_id to deleted_for array.
-- Only modifies deleted_for column. Caller must be a participant.
-- =============================================
CREATE OR REPLACE FUNCTION public.delete_message_for_me(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  -- Get conversation_id and verify caller is a participant
  SELECT conversation_id INTO v_conversation_id
  FROM messages
  WHERE id = p_message_id;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = v_conversation_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a conversation participant';
  END IF;

  -- Append caller's ID to deleted_for array (idempotent)
  UPDATE messages
  SET deleted_for = COALESCE(deleted_for, '{}') || auth.uid()
  WHERE id = p_message_id
    AND NOT (auth.uid() = ANY(COALESCE(deleted_for, '{}')));
END;
$$;

-- =============================================
-- RPC: delete_message_for_everyone
-- Soft-deletes a message. Only the sender can do this.
-- Sets content, clears media, nullifies sensitive fields.
-- =============================================
CREATE OR REPLACE FUNCTION public.delete_message_for_everyone(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the sender can delete for everyone
  IF NOT EXISTS (
    SELECT 1 FROM messages
    WHERE id = p_message_id
    AND sender_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the sender can delete for everyone';
  END IF;

  UPDATE messages
  SET content = 'This message was deleted',
      message_type = 'text',
      media_url = NULL,
      thumbnail_url = NULL,
      mime_type = NULL,
      file_size = NULL,
      media_width = NULL,
      media_height = NULL,
      duration = NULL,
      deleted_at = now()
  WHERE id = p_message_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.mark_messages_delivered(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_messages_seen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_message_for_me(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_message_for_everyone(uuid) TO authenticated;
