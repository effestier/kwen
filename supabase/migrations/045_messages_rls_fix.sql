-- =============================================
-- 045: Fix messages_update RLS policy
-- Issue: Current policy only allows sender to update their own messages.
-- markMessagesAsDelivered and markMessagesAsSeen update messages from
-- OTHER users (setting delivered_at/seen_at). RLS blocks these → 400.
-- Fix: Allow any conversation participant to update delivered_at and seen_at.
-- =============================================

DROP POLICY IF EXISTS "messages_update" ON public.messages;

CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE USING (
    -- Sender can update their own messages (content, media, etc.)
    (auth.uid() = sender_id AND EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    ))
    OR
    -- Any participant can update read receipts (delivered_at, seen_at)
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
      AND user_id = auth.uid()
    )
  );
