-- Reactions table
CREATE TABLE public.message_reactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) <= 10),
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- One reaction per user per message
CREATE UNIQUE INDEX idx_message_reactions_user_msg ON public.message_reactions(message_id, user_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS: only conversation participants can read reactions
CREATE POLICY "message_reactions_select" ON public.message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reactions.message_id AND cp.user_id = auth.uid()
    )
  );

-- RLS: participants can insert their own reactions
CREATE POLICY "message_reactions_insert" ON public.message_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS: users can delete their own reactions
CREATE POLICY "message_reactions_delete" ON public.message_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Reply-to column on messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

-- Soft delete tracking (array of user IDs who deleted for themselves)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_for uuid[] DEFAULT '{}';

-- Index for reply lookups
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
