-- =============================================
-- STORIES SCHEMA PATCH - Safe incremental update
-- =============================================

-- 1. Create story_visibility enum type if not exists
DO $$ BEGIN
  CREATE TYPE story_visibility AS ENUM ('public', 'followers', 'close_friends', 'private');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add missing columns to stories table (safe - only if not exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'media_type') THEN
    ALTER TABLE public.stories ADD COLUMN media_type text DEFAULT 'image';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'visibility') THEN
    ALTER TABLE public.stories ADD COLUMN visibility story_visibility DEFAULT 'public';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'is_close_friends') THEN
    ALTER TABLE public.stories ADD COLUMN is_close_friends boolean DEFAULT false;
  END IF;
END $$;

-- 3. Create story_overlays table if not exists
CREATE TABLE IF NOT EXISTS public.story_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  overlay_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  z_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 4. Create story_reactions table if not exists
CREATE TABLE IF NOT EXISTS public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(story_id, user_id, emoji)
);

-- 5. Create story_replies table if not exists
CREATE TABLE IF NOT EXISTS public.story_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 6. Create story_music table if not exists
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

-- 7. Create story_drafts table if not exists
CREATE TABLE IF NOT EXISTS public.story_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url text,
  media_type text,
  visibility story_visibility DEFAULT 'public',
  overlays jsonb DEFAULT '[]',
  drawing_data jsonb,
  filters jsonb DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 8. Add optional columns to story_views if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'story_views' AND column_name = 'reaction') THEN
    ALTER TABLE public.story_views ADD COLUMN reaction text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'story_views' AND column_name = 'reply_message') THEN
    ALTER TABLE public.story_views ADD COLUMN reply_message text;
  END IF;
END $$;

-- 9. Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_story_overlays_story_id ON public.story_overlays(story_id);
CREATE INDEX IF NOT EXISTS idx_story_reactions_story_id ON public.story_reactions(story_id);
CREATE INDEX IF NOT EXISTS idx_story_reactions_user_id ON public.story_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_story_replies_story_id ON public.story_replies(story_id);
CREATE INDEX IF NOT EXISTS idx_story_replies_recipient_id ON public.story_replies(recipient_id);
CREATE INDEX IF NOT EXISTS idx_story_music_story_id ON public.story_music(story_id);
CREATE INDEX IF NOT EXISTS idx_story_drafts_user_id ON public.story_drafts(user_id);

-- 10. RLS - Enable and create policies for story_overlays
ALTER TABLE public.story_overlays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_overlays_select" ON public.story_overlays;
CREATE POLICY "story_overlays_select" ON public.story_overlays FOR SELECT USING (true);
DROP POLICY IF EXISTS "story_overlays_insert" ON public.story_overlays;
CREATE POLICY "story_overlays_insert" ON public.story_overlays FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM stories WHERE id = story_id));
DROP POLICY IF EXISTS "story_overlays_delete" ON public.story_overlays;
CREATE POLICY "story_overlays_delete" ON public.story_overlays FOR DELETE USING (auth.uid() IN (SELECT user_id FROM stories WHERE id = story_id));

-- 11. RLS for story_reactions
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_reactions_select" ON public.story_reactions;
CREATE POLICY "story_reactions_select" ON public.story_reactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "story_reactions_insert" ON public.story_reactions;
CREATE POLICY "story_reactions_insert" ON public.story_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "story_reactions_delete" ON public.story_reactions;
CREATE POLICY "story_reactions_delete" ON public.story_reactions FOR DELETE USING (auth.uid() = user_id);

-- 12. RLS for story_replies
ALTER TABLE public.story_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_replies_select" ON public.story_replies;
CREATE POLICY "story_replies_select" ON public.story_replies FOR SELECT USING (
  auth.uid() = sender_id OR
  auth.uid() = recipient_id OR
  auth.uid() IN (SELECT user_id FROM stories WHERE id = story_id)
);
DROP POLICY IF EXISTS "story_replies_insert" ON public.story_replies;
CREATE POLICY "story_replies_insert" ON public.story_replies FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- 13. RLS for story_music
ALTER TABLE public.story_music ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_music_select" ON public.story_music;
CREATE POLICY "story_music_select" ON public.story_music FOR SELECT USING (true);
DROP POLICY IF EXISTS "story_music_insert" ON public.story_music;
CREATE POLICY "story_music_insert" ON public.story_music FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM stories WHERE id = story_id));
DROP POLICY IF EXISTS "story_music_delete" ON public.story_music;
CREATE POLICY "story_music_delete" ON public.story_music FOR DELETE USING (auth.uid() IN (SELECT user_id FROM stories WHERE id = story_id));

-- 14. RLS for story_drafts
ALTER TABLE public.story_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_drafts_select" ON public.story_drafts;
CREATE POLICY "story_drafts_select" ON public.story_drafts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "story_drafts_insert" ON public.story_drafts;
CREATE POLICY "story_drafts_insert" ON public.story_drafts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "story_drafts_update" ON public.story_drafts;
CREATE POLICY "story_drafts_update" ON public.story_drafts FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "story_drafts_delete" ON public.story_drafts;
CREATE POLICY "story_drafts_delete" ON public.story_drafts FOR DELETE USING (auth.uid() = user_id);

-- 15. Ensure stories has public read policy
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stories_public_read" ON public.stories;
CREATE POLICY "stories_public_read" ON public.stories FOR SELECT USING (true);

-- 16. Refresh schema cache
NOTIFY pgrst, 'reload schema';