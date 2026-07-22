-- ============================================================
-- 063: Security fixes applied from audit
-- 1. add_conversation_participant: block check
-- 2. Password policy strengthen (app-level, not DB)
-- 3. Avatar upload magic byte validation (app-level)
-- ============================================================

-- ============================================================
-- FIX 1: add_conversation_participant — check block status
-- Prevents adding blocked users to conversations
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

  -- Check block status in both directions
  IF EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = auth.uid() AND blocked_id = p_user_id)
       OR (blocker_id = p_user_id AND blocked_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Cannot add blocked user to conversation';
  END IF;

  INSERT INTO conversation_participants (conversation_id, user_id, unread_count)
  VALUES (p_conversation_id, p_user_id, 0)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_conversation_participant(uuid, uuid) TO authenticated;
