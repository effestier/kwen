-- =============================================
-- Migration 030: Story Archive
-- Auto-archives stories before deletion so they're never lost
-- =============================================

-- =============================================
-- STORY ARCHIVE TABLE
-- =============================================
CREATE TABLE public.story_archive (
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

CREATE INDEX idx_story_archive_user_id ON story_archive(user_id, created_at DESC);
CREATE INDEX idx_story_archive_archived_at ON story_archive(archived_at DESC);

-- =============================================
-- RLS: owner-only
-- =============================================
ALTER TABLE public.story_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archive_select_own" ON public.story_archive
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "archive_delete_own" ON public.story_archive
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- FUNCTION: archive a story before it's deleted
-- =============================================
CREATE OR REPLACE FUNCTION public.archive_story_before_delete()
RETURNS trigger AS $$
DECLARE
  v_overlays jsonb;
BEGIN
  -- Gather overlays for this story
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

  -- Insert into archive
  INSERT INTO story_archive (
    user_id, original_story_id, media_url, media_type,
    visibility, overlays, created_at
  ) VALUES (
    OLD.user_id, OLD.id, OLD.media_url, OLD.media_type,
    OLD.visibility, v_overlays, OLD.created_at
  );

  -- Also save to highlights if this story is in any highlight:
  -- Update highlight_stories to store media_url directly (since story will be gone)
  -- The LEFT JOIN in get_highlight_with_stories handles missing stories already

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- TRIGGER: auto-archive on story deletion
-- =============================================
DROP TRIGGER IF EXISTS on_story_delete ON public.stories;
CREATE TRIGGER on_story_delete
  BEFORE DELETE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_story_before_delete();

-- =============================================
-- FUNCTION: clean up expired stories (call from cron or manually)
-- Now just deletes — the trigger handles archiving
-- =============================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS void AS $$
BEGIN
  DELETE FROM public.stories WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: get archived stories for a user (paginated)
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
    sa.id, sa.media_url, sa.media_type, sa.visibility,
    sa.overlays, sa.created_at, sa.archived_at
  FROM story_archive sa
  WHERE sa.user_id = p_user_id
    AND (p_cursor IS NULL OR sa.created_at < p_cursor)
  ORDER BY sa.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- RPC: get archive months (for grouping)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_archive_months(p_user_id uuid)
RETURNS TABLE (
  month text,
  count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(sa.created_at, 'YYYY-MM') as month,
    count(*) as count
  FROM story_archive sa
  WHERE sa.user_id = p_user_id
  GROUP BY to_char(sa.created_at, 'YYYY-MM')
  ORDER BY month DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
