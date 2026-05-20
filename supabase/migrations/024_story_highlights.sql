-- Migration 024: Story Highlights
-- Run this in Supabase SQL Editor

-- =============================================
-- STORY HIGHLIGHTS TABLE
-- =============================================
CREATE TABLE public.story_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Highlights',
  cover_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_story_highlights_user_id ON story_highlights(user_id);

-- =============================================
-- HIGHLIGHT STORIES TABLE (links stories to highlights)
-- =============================================
CREATE TABLE public.highlight_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id uuid NOT NULL REFERENCES story_highlights(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(highlight_id, story_id)
);

CREATE INDEX idx_highlight_stories_highlight_id ON highlight_stories(highlight_id);

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlight_stories ENABLE ROW LEVEL SECURITY;

-- Public read access to highlights
CREATE POLICY "highlights_select_public"
  ON public.story_highlights FOR SELECT
  USING (true);

-- Owner can manage their highlights
CREATE POLICY "highlights_insert_own"
  ON public.story_highlights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "highlights_update_own"
  ON public.story_highlights FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "highlights_delete_own"
  ON public.story_highlights FOR DELETE
  USING (auth.uid() = user_id);

-- Public read access to highlight stories
CREATE POLICY "highlight_stories_select_public"
  ON public.highlight_stories FOR SELECT
  USING (true);

-- Owner can manage their highlight stories
CREATE POLICY "highlight_stories_insert_own"
  ON public.highlight_stories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM story_highlights
      WHERE id = highlight_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "highlight_stories_delete_own"
  ON public.highlight_stories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM story_highlights
      WHERE id = highlight_id AND user_id = auth.uid()
    )
  );

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to add a story to a highlight
CREATE OR REPLACE FUNCTION public.add_story_to_highlight(
  p_highlight_id uuid,
  p_story_id uuid
)
RETURNS void AS $$
DECLARE
  max_order int;
BEGIN
  -- Check ownership
  IF NOT EXISTS (
    SELECT 1 FROM story_highlights
    WHERE id = p_highlight_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get max sort order
  SELECT COALESCE(MAX(sort_order), 0) INTO max_order
  FROM highlight_stories
  WHERE highlight_id = p_highlight_id;

  -- Insert story
  INSERT INTO highlight_stories (highlight_id, story_id, sort_order)
  VALUES (p_highlight_id, p_story_id, max_order + 1)
  ON CONFLICT (highlight_id, story_id) DO NOTHING;

  -- Update highlight cover if not set
  UPDATE story_highlights
  SET cover_url = (
    SELECT media_url FROM stories WHERE id = p_story_id
  ),
  updated_at = now()
  WHERE id = p_highlight_id AND cover_url IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove a story from a highlight
CREATE OR REPLACE FUNCTION public.remove_story_from_highlight(
  p_highlight_id uuid,
  p_story_id uuid
)
RETURNS void AS $$
BEGIN
  DELETE FROM highlight_stories
  WHERE highlight_id = p_highlight_id
    AND story_id = p_story_id
    AND EXISTS (
      SELECT 1 FROM story_highlights
      WHERE id = p_highlight_id AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get highlight with stories
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
    s.id as story_id,
    s.media_url as story_media_url,
    s.media_type as story_media_type,
    s.created_at as story_created_at
  FROM story_highlights sh
  JOIN highlight_stories hs ON hs.highlight_id = sh.id
  JOIN stories s ON s.id = hs.story_id
  WHERE sh.id = p_highlight_id
  ORDER BY hs.sort_order, s.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
