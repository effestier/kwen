-- Migration 039: Story Reply → DM Integration
-- Adds story_reply message type and story_id column to messages

-- Add 'story_reply' to message_type CHECK constraint
DO $$
BEGIN
  -- Drop existing check constraint if it exists
  ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'mixed', 'story_reply'));

-- Add story_id column to messages for story reply linking
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS story_id uuid REFERENCES stories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_story_id ON public.messages(story_id) WHERE story_id IS NOT NULL;
