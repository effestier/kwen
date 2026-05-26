-- Migration 050: Story Highlights (complete, with archive support)
-- Creates highlight tables, RLS, and all RPC functions.
-- Does NOT use FK ON DELETE CASCADE on highlight_stories.story_id
-- so highlights survive when stories expire and get archived.
-- Also ensures story_archive table exists (migration 030 dependency).

-- =============================================
-- 0. Ensure story_archive exists (safe if already created by migration 030)
-- =============================================
CREATE TABLE IF NOT EXISTS public.story_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_story_id uuid,
  media_url text NOT NULL,
  media_type text DEFAULT 'image',
  visibility text DEFAULT 'public',
  overlays jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL,
  archived_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_archive_user_id ON story_archive(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_archive_archived_at ON story_archive(archived_at DESC);

-- Enable RLS if not already enabled
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'story_archive' AND rowsecurity = true) THEN
    ALTER TABLE public.story_archive ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'archive_select_own' AND tablename = 'story_archive') THEN
    CREATE POLICY "archive_select_own" ON public.story_archive FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'archive_delete_own' AND tablename = 'story_archive') THEN
    CREATE POLICY "archive_delete_own" ON public.story_archive FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Insert policy for archive trigger (SECURITY DEFINER, but belt-and-suspenders)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'archive_insert_trigger' AND tablename = 'story_archive') THEN
    CREATE POLICY "archive_insert_trigger" ON public.story_archive FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- =============================================
-- 0b. Ensure archive trigger exists
-- =============================================
CREATE OR REPLACE FUNCTION public.archive_story_before_delete()
RETURNS trigger AS $$
DECLARE
  v_overlays jsonb;
  v_has_overlays boolean;
BEGIN
  -- Check if story_overlays table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'story_overlays'
  ) INTO v_has_overlays;

  IF v_has_overlays THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'overlay_type', so.overlay_type,
        'payload', so.payload,
        'z_index', so.z_index
      )
    ), '[]'::jsonb)
    INTO v_overlays
    FROM story_overlays so
    WHERE so.story_id = OLD.id;
  ELSE
    v_overlays := '[]'::jsonb;
  END IF;

  INSERT INTO story_archive (user_id, original_story_id, media_url, media_type, visibility, overlays, created_at)
  VALUES (OLD.user_id, OLD.id, OLD.media_url, COALESCE(OLD.media_type, 'image'), COALESCE(OLD.visibility, 'public'), v_overlays, OLD.created_at)
  ON CONFLICT DO NOTHING;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_story_delete') THEN
    CREATE TRIGGER on_story_delete
      BEFORE DELETE ON public.stories
      FOR EACH ROW
      EXECUTE FUNCTION public.archive_story_before_delete();
  END IF;
END $$;

-- =============================================
-- 0c. Ensure cleanup function exists
-- =============================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS void AS $$
BEGIN
  DELETE FROM public.stories WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 1. STORY HIGHLIGHTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.story_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Highlights',
  cover_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_highlights_user_id ON story_highlights(user_id);

-- =============================================
-- 2. HIGHLIGHT STORIES TABLE
--    NO FK to stories(id) — story may be archived/expired
-- =============================================
CREATE TABLE IF NOT EXISTS public.highlight_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id uuid NOT NULL REFERENCES story_highlights(id) ON DELETE CASCADE,
  story_id uuid NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(highlight_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_highlight_stories_highlight_id ON highlight_stories(highlight_id);

-- =============================================
-- 3. RLS POLICIES
-- =============================================
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlight_stories ENABLE ROW LEVEL SECURITY;

-- Public read access to highlights
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'highlights_select_public' AND tablename = 'story_highlights') THEN
    CREATE POLICY "highlights_select_public" ON public.story_highlights FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'highlights_insert_own' AND tablename = 'story_highlights') THEN
    CREATE POLICY "highlights_insert_own" ON public.story_highlights FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'highlights_update_own' AND tablename = 'story_highlights') THEN
    CREATE POLICY "highlights_update_own" ON public.story_highlights FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'highlights_delete_own' AND tablename = 'story_highlights') THEN
    CREATE POLICY "highlights_delete_own" ON public.story_highlights FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Highlight stories: public read, owner manage
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'highlight_stories_select_public' AND tablename = 'highlight_stories') THEN
    CREATE POLICY "highlight_stories_select_public" ON public.highlight_stories FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'highlight_stories_insert_own' AND tablename = 'highlight_stories') THEN
    CREATE POLICY "highlight_stories_insert_own" ON public.highlight_stories FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM story_highlights WHERE id = highlight_id AND user_id = auth.uid())
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'highlight_stories_delete_own' AND tablename = 'highlight_stories') THEN
    CREATE POLICY "highlight_stories_delete_own" ON public.highlight_stories FOR DELETE USING (
      EXISTS (SELECT 1 FROM story_highlights WHERE id = highlight_id AND user_id = auth.uid())
    );
  END IF;
END $$;

-- =============================================
-- 4. RPC: create a highlight
-- =============================================
CREATE OR REPLACE FUNCTION public.create_highlight(p_title text)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO story_highlights (user_id, title)
  VALUES (auth.uid(), p_title)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. RPC: add story to highlight
--    Validates story exists in stories OR story_archive
-- =============================================
CREATE OR REPLACE FUNCTION public.add_story_to_highlight(
  p_highlight_id uuid,
  p_story_id uuid
)
RETURNS void AS $$
DECLARE
  max_order int;
  v_media_url text;
  v_cover_url text;
BEGIN
  -- Check ownership
  IF NOT EXISTS (
    SELECT 1 FROM story_highlights
    WHERE id = p_highlight_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Verify the story exists (active or archived)
  SELECT media_url INTO v_media_url
  FROM stories WHERE id = p_story_id;

  IF v_media_url IS NULL THEN
    SELECT media_url INTO v_media_url
    FROM story_archive
    WHERE original_story_id = p_story_id OR id = p_story_id
    LIMIT 1;
  END IF;

  IF v_media_url IS NULL THEN
    RAISE EXCEPTION 'Story not found';
  END IF;

  -- Get max sort order
  SELECT COALESCE(MAX(sort_order), 0) INTO max_order
  FROM highlight_stories
  WHERE highlight_id = p_highlight_id;

  -- Insert
  INSERT INTO highlight_stories (highlight_id, story_id, sort_order)
  VALUES (p_highlight_id, p_story_id, max_order + 1)
  ON CONFLICT (highlight_id, story_id) DO NOTHING;

  -- Update highlight cover if not set
  SELECT cover_url INTO v_cover_url FROM story_highlights WHERE id = p_highlight_id;
  IF v_cover_url IS NULL THEN
    UPDATE story_highlights
    SET cover_url = v_media_url, updated_at = now()
    WHERE id = p_highlight_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 6. RPC: remove story from highlight
-- =============================================
CREATE OR REPLACE FUNCTION public.remove_story_from_highlight(
  p_highlight_id uuid,
  p_story_id uuid
)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM story_highlights
    WHERE id = p_highlight_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM highlight_stories
  WHERE highlight_id = p_highlight_id AND story_id = p_story_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 7. RPC: get highlight with stories
--    Looks in BOTH stories and story_archive
-- =============================================
CREATE OR REPLACE FUNCTION public.get_highlight_with_stories(p_highlight_id uuid)
RETURNS TABLE (
  highlight_id uuid,
  highlight_title text,
  highlight_cover text,
  story_id uuid,
  story_media_url text,
  story_media_type text,
  story_created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sh.id as highlight_id,
    sh.title as highlight_title,
    sh.cover_url as highlight_cover,
    hs.story_id,
    COALESCE(s.media_url, sa.media_url) as story_media_url,
    COALESCE(s.media_type, sa.media_type, 'image') as story_media_type,
    COALESCE(s.created_at, sa.created_at) as story_created_at
  FROM story_highlights sh
  JOIN highlight_stories hs ON hs.highlight_id = sh.id
  LEFT JOIN stories s ON s.id = hs.story_id
  LEFT JOIN story_archive sa ON sa.original_story_id = hs.story_id OR (sa.original_story_id IS NULL AND sa.id = hs.story_id)
  WHERE sh.id = p_highlight_id
  ORDER BY hs.sort_order, COALESCE(s.created_at, sa.created_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 8. RPC: reorder highlight stories
-- =============================================
CREATE OR REPLACE FUNCTION public.reorder_highlight_stories(
  p_highlight_id uuid,
  p_story_ids uuid[]
)
RETURNS void AS $$
DECLARE
  i int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM story_highlights
    WHERE id = p_highlight_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR i IN 1..array_length(p_story_ids, 1) LOOP
    UPDATE highlight_stories
    SET sort_order = i
    WHERE highlight_id = p_highlight_id AND story_id = p_story_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 9. RPC: update highlight cover
-- =============================================
CREATE OR REPLACE FUNCTION public.update_highlight_cover(
  p_highlight_id uuid,
  p_cover_url text
)
RETURNS void AS $$
BEGIN
  UPDATE story_highlights
  SET cover_url = p_cover_url, updated_at = now()
  WHERE id = p_highlight_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 10. RPC: get archived stories (paginated, for archive page)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_archived_stories(
  p_user_id uuid,
  p_cursor timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  media_url text,
  media_type text,
  visibility text,
  overlays jsonb,
  created_at timestamptz,
  archived_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id,
    sa.media_url,
    sa.media_type,
    sa.visibility,
    sa.overlays,
    sa.created_at,
    sa.archived_at
  FROM story_archive sa
  WHERE sa.user_id = p_user_id
    AND (p_cursor IS NULL OR sa.created_at < p_cursor)
  ORDER BY sa.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- 11. RPC: get all available stories for highlight picking
--     Returns stories from both tables, using original_story_id for archived ones
-- =============================================
CREATE OR REPLACE FUNCTION public.get_user_available_stories(
  p_user_id uuid,
  p_limit int DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  media_url text,
  media_type text,
  created_at timestamptz,
  is_archived boolean
) AS $$
BEGIN
  RETURN QUERY
  -- Active stories (including expired but not yet cleaned by cron)
  SELECT s.id, s.media_url, COALESCE(s.media_type, 'image'), s.created_at, false
  FROM stories s
  WHERE s.user_id = p_user_id

  UNION ALL

  -- Archived stories (use original_story_id as the id so highlights reference it)
  SELECT
    COALESCE(sa.original_story_id, sa.id),
    sa.media_url,
    COALESCE(sa.media_type, 'image'),
    sa.created_at,
    true
  FROM story_archive sa
  WHERE sa.user_id = p_user_id
    AND COALESCE(sa.original_story_id, sa.id) NOT IN (
      SELECT s2.id FROM stories s2 WHERE s2.user_id = p_user_id
    )

  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- 11. RPC: get archive months (updated to include expired active stories)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_archive_months(p_user_id uuid)
RETURNS TABLE (
  month text,
  count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT sub.month, SUM(sub.cnt) as count FROM (
    SELECT to_char(sa.created_at, 'YYYY-MM') as month, count(*) as cnt
    FROM story_archive sa
    WHERE sa.user_id = p_user_id
    GROUP BY to_char(sa.created_at, 'YYYY-MM')
    UNION ALL
    SELECT to_char(s.created_at, 'YYYY-MM') as month, count(*) as cnt
    FROM stories s
    WHERE s.user_id = p_user_id AND s.expires_at < now()
    GROUP BY to_char(s.created_at, 'YYYY-MM')
  ) sub
  GROUP BY sub.month
  ORDER BY month DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
