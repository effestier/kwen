-- Migration 061: Add 'video' to message_type CHECK constraint
-- Video messages are sent via DMs like images, but need their own type for proper rendering

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'mixed', 'story_reply', 'voice', 'video'));
