-- Migration 051: Add 'voice' to message_type CHECK constraint
-- Migration 041 added duration column but forgot to update the CHECK constraint

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'mixed', 'story_reply', 'voice'));
