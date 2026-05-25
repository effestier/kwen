-- M6: Atomic getOrCreateConversation RPC to prevent TOCTOU duplicate conversations
-- Two simultaneous calls to getOrCreateConversation can both pass the "no conversation exists"
-- check and both INSERT, creating duplicate conversations for the same user pair.

CREATE OR REPLACE FUNCTION get_or_create_conversation(p_user1 uuid, p_user2 uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
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
  -- Use advisory lock to prevent duplicate creation for the same user pair
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

-- M1: Fix reaction DELETE realtime — change REPLICA IDENTITY to FULL
-- Default replica identity only sends PK columns in DELETE events via realtime.
-- The message_reactions DELETE handler needs message_id, user_id, and emoji from payload.old.
ALTER TABLE message_reactions REPLICA IDENTITY FULL;
