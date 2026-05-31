-- ============================================================
-- FIX: conversation_participants SELECT policy
-- Users need to see OTHER participants in their conversations
-- to display names, avatars, and presence in the DM list.
-- The old "conversation_participants_all" policy only allowed
-- reading your own rows (auth.uid() = user_id), which broke
-- the conversation list — everyone showed as "User" with no avatar.
-- ============================================================

DROP POLICY IF EXISTS "conversation_participants_all" ON public.conversation_participants;

-- Allow users to read participants in conversations they belong to
CREATE POLICY "conversation_participants_select" ON public.conversation_participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- Allow users to update their own participant row (unread_count, last_read_at)
CREATE POLICY "conversation_participants_update_own" ON public.conversation_participants
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own participant row (leave conversation)
CREATE POLICY "conversation_participants_delete_own" ON public.conversation_participants
  FOR DELETE
  USING (auth.uid() = user_id);
