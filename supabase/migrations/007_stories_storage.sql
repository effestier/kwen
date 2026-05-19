-- =============================================
-- PHASE 4: STORIES STORAGE BUCKETS (FIXED)
-- =============================================

-- =============================================
-- CREATE STORAGE BUCKETS
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('story-thumbnails', 'story-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('story-drafts', 'story-drafts', false)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- STORAGE POLICIES - Use OR REPLACE to avoid errors
-- =============================================

-- Main stories bucket policies (already exists but ensure they're correct)
DROP POLICY IF EXISTS "Stories Public Access" ON storage.objects;
CREATE POLICY "Stories Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'stories');

DROP POLICY IF EXISTS "Stories Owner Upload" ON storage.objects;
CREATE POLICY "Stories Owner Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'stories' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Stories Owner Delete" ON storage.objects;
CREATE POLICY "Stories Owner Delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'stories' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Story Thumbnails: Public read, owner upload
DROP POLICY IF EXISTS "Story Thumbnails Public Access" ON storage.objects;
CREATE POLICY "Story Thumbnails Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'story-thumbnails');

DROP POLICY IF EXISTS "Story Thumbnails Owner Upload" ON storage.objects;
CREATE POLICY "Story Thumbnails Owner Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'story-thumbnails' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Story Drafts: Owner only access
DROP POLICY IF EXISTS "Story Drafts Owner Access" ON storage.objects;
CREATE POLICY "Story Drafts Owner Access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'story-drafts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- =============================================
-- STORAGE FUNCTIONS
-- =============================================

-- Function to get story media with proper path
CREATE OR REPLACE FUNCTION get_story_media_url(p_filename text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
BEGIN
  SELECT public_url INTO v_url
  FROM storage.objects
  WHERE bucket_id = 'stories' AND name = p_filename;

  RETURN v_url;
END;
$$;

-- Function to clean up expired stories
CREATE OR REPLACE FUNCTION cleanup_expired_stories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete expired stories
  DELETE FROM public.stories
  WHERE expires_at < NOW();

  -- Delete orphaned overlays
  DELETE FROM public.story_overlays
  WHERE story_id NOT IN (SELECT id FROM public.stories);

  -- Delete orphaned music
  DELETE FROM public.story_music
  WHERE story_id NOT IN (SELECT id FROM public.stories);

  -- Delete old draft media files (older than 7 days)
  DELETE FROM storage.objects
  WHERE bucket_id = 'story-drafts'
  AND created_at < NOW() - INTERVAL '7 days';
END;
$$;