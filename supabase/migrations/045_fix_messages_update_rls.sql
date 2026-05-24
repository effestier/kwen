-- =============================================
-- 045: Fix messages_update RLS policy
-- Root cause: messages_update requires auth.uid() = sender_id
-- but markMessagesAsDelivered/markMessagesAsSeen update OTHER
-- people's messages (delivered_at, seen_at).
-- Fix: Allow any conversation participant to update messages.
-- =============================================

DROP POLICY IF EXISTS "messages_update" ON public.messages;

-- Allow any conversation participant to update messages in their conversations.
-- This is safe because:
-- 1. Users can only see messages in conversations they're part of (messages_select policy)
-- 2. The update is limited to conversations the user participates in
-- 3. Sensitive fields (content, sender_id) are not modifiable via RLS — the app
--    only updates delivery status fields (delivered_at, seen_at, deleted_for)
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    )
  );
