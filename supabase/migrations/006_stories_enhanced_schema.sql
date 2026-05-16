-- =============================================
-- PHASE 3: ENHANCED STORIES SCHEMA (FIXED)
-- =============================================

-- =============================================
-- STORY VISIBILITY ENUM
-- =============================================
DO $$ BEGIN
  CREATE TYPE story_visibility AS ENUM ('public', 'followers', 'close_friends', 'private');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- STORY OVERLAYS (Text, Stickers, Drawings)
-- =============================================
CREATE TABLE IF NOT EXISTS public.story_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  overlay_type text NOT NULL CHECK (overlay_type IN ('text', 'sticker', 'drawing', 'gif', 'poll', 'question', 'link', 'location', 'mention', 'hashtag', 'countdown', 'music')),
  payload jsonb NOT NULL DEFAULT '{}',
  z_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_overlays_story_id ON public.story_overlays(story_id);

-- =============================================
-- STORY REACTIONS (Emoji) - FIXED: using text instead of invalid type
-- =============================================
CREATE TABLE IF NOT EXISTS public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(story_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_story_reactions_story_id ON public.story_reactions(story_id);
CREATE INDEX IF NOT EXISTS idx_story_reactions_user_id ON public.story_reactions(user_id);

-- =============================================
-- STORY REPLIES (DM-style)
-- =============================================
CREATE TABLE IF NOT EXISTS public.story_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_replies_story_id ON public.story_replies(story_id);
CREATE INDEX IF NOT EXISTS idx_story_replies_recipient_id ON public.story_replies(recipient_id);

-- =============================================
-- STORY MUSIC
-- =============================================
CREATE TABLE IF NOT EXISTS public.story_music (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  track_name text NOT NULL,
  artist text,
  preview_url text,
  start_time integer DEFAULT 0,
  duration integer DEFAULT 15,
  cover_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_music_story_id ON public.story_music(story_id);

-- =============================================
-- STORY DRAFTS
-- =============================================
CREATE TABLE IF NOT EXISTS public.story_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url text,
  media_type text CHECK (media_type IN ('image', 'video')),
  visibility story_visibility DEFAULT 'public',
  overlays jsonb DEFAULT '[]',
  drawing_data jsonb,
  filters jsonb DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_drafts_user_id ON public.story_drafts(user_id);

-- =============================================
-- UPDATE EXISTING STORIES TABLE
-- =============================================
-- Add visibility column to existing stories (skip if exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'visibility') THEN
    ALTER TABLE public.stories ADD COLUMN visibility story_visibility DEFAULT 'public';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'is_close_friends') THEN
    ALTER TABLE public.stories ADD COLUMN is_close_friends boolean DEFAULT false;
  END IF;
END $$;

-- =============================================
-- RLS POLICIES FOR NEW TABLES
-- =============================================

-- Story overlays: public read, owner write
ALTER TABLE public.story_overlays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_overlays_select" ON public.story_overlays;
CREATE POLICY "story_overlays_select" ON public.story_overlays FOR SELECT USING (true);
DROP POLICY IF EXISTS "story_overlays_insert" ON public.story_overlays;
CREATE POLICY "story_overlays_insert" ON public.story_overlays FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM stories WHERE id = story_id));
DROP POLICY IF EXISTS "story_overlays_delete" ON public.story_overlays;
CREATE POLICY "story_overlays_delete" ON public.story_overlays FOR DELETE USING (auth.uid() IN (SELECT user_id FROM stories WHERE id = story_id));

-- Story reactions: public read, authenticated react
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_reactions_select" ON public.story_reactions;
CREATE POLICY "story_reactions_select" ON public.story_reactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "story_reactions_insert" ON public.story_reactions;
CREATE POLICY "story_reactions_insert" ON public.story_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "story_reactions_delete" ON public.story_reactions;
CREATE POLICY "story_reactions_delete" ON public.story_reactions FOR DELETE USING (auth.uid() = user_id);

-- Story replies: participants + story owner read/write
ALTER TABLE public.story_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_replies_select" ON public.story_replies;
CREATE POLICY "story_replies_select" ON public.story_replies FOR SELECT USING (
  auth.uid() = sender_id OR
  auth.uid() = recipient_id OR
  auth.uid() IN (SELECT user_id FROM stories WHERE id = story_id)
);
DROP POLICY IF EXISTS "story_replies_insert" ON public.story_replies;
CREATE POLICY "story_replies_insert" ON public.story_replies FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Story music: public read, owner write
ALTER TABLE public.story_music ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_music_select" ON public.story_music;
CREATE POLICY "story_music_select" ON public.story_music FOR SELECT USING (true);
DROP POLICY IF EXISTS "story_music_insert" ON public.story_music;
CREATE POLICY "story_music_insert" ON public.story_music FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM stories WHERE id = story_id));
DROP POLICY IF EXISTS "story_music_delete" ON public.story_music;
CREATE POLICY "story_music_delete" ON public.story_music FOR DELETE USING (auth.uid() IN (SELECT user_id FROM stories WHERE id = story_id));

-- Story drafts: owner only
ALTER TABLE public.story_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_drafts_select" ON public.story_drafts;
CREATE POLICY "story_drafts_select" ON public.story_drafts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "story_drafts_insert" ON public.story_drafts;
CREATE POLICY "story_drafts_insert" ON public.story_drafts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "story_drafts_update" ON public.story_drafts;
CREATE POLICY "story_drafts_update" ON public.story_drafts FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "story_drafts_delete" ON public.story_drafts;
CREATE POLICY "story_drafts_delete" ON public.story_drafts FOR DELETE USING (auth.uid() = user_id);

-- Update existing stories RLS (merge with existing policy)
DROP POLICY IF EXISTS "stories_public_read" ON public.stories;
CREATE POLICY "stories_public_read" ON public.stories FOR SELECT USING (true);

-- =============================================
-- STORY VIEWERS LIST (Additional columns for existing table)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'story_views' AND column_name = 'reaction') THEN
    ALTER TABLE public.story_views ADD COLUMN reaction text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'story_views' AND column_name = 'reply_message') THEN
    ALTER TABLE public.story_views ADD COLUMN reply_message text;
  END IF;
END $$;