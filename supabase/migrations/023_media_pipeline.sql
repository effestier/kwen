-- Migration 023: Media Pipeline - Central media tracking table + storage buckets
-- Run this in Supabase SQL Editor

-- =============================================
-- MEDIA TABLE (central tracking for all uploads)
-- =============================================
CREATE TABLE public.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('image', 'video')),
  storage_layer text NOT NULL DEFAULT 'supabase' CHECK (storage_layer IN ('supabase', 'r2')),
  storage_path text NOT NULL,
  url text NOT NULL,
  thumbnail_url text,
  original_size bigint NOT NULL,
  compressed_size bigint,
  width int,
  height int,
  duration int,
  format text,
  mime_type text,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_media_user_id ON media(user_id);
CREATE INDEX idx_media_type ON media(type);
CREATE INDEX idx_media_created_at ON media(created_at DESC);
CREATE INDEX idx_media_deleted_at ON media(deleted_at) WHERE deleted_at IS NULL;

-- =============================================
-- STORAGE BUCKETS (new ones for pipeline)
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES
  ('images', 'images', true, 10485760),
  ('videos', 'videos', true, 104857600)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- RLS POLICIES FOR MEDIA TABLE
-- =============================================
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

-- Public read access to media
DROP POLICY IF EXISTS "media_select_public" ON public.media;
CREATE POLICY "media_select_public"
  ON public.media FOR SELECT
  USING (deleted_at IS NULL);

-- Owner can insert their own media
DROP POLICY IF EXISTS "media_insert_own" ON public.media;
CREATE POLICY "media_insert_own"
  ON public.media FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Owner can update their own media
DROP POLICY IF EXISTS "media_update_own" ON public.media;
CREATE POLICY "media_update_own"
  ON public.media FOR UPDATE
  USING (auth.uid() = user_id);

-- Owner can soft-delete their own media
DROP POLICY IF EXISTS "media_delete_own" ON public.media;
CREATE POLICY "media_delete_own"
  ON public.media FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- STORAGE POLICIES FOR NEW BUCKETS
-- =============================================

-- Images bucket: public read, authenticated upload
CREATE POLICY "Images Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'images');

CREATE POLICY "Images Authenticated Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Images Owner Delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Videos bucket: public read, authenticated upload
CREATE POLICY "Videos Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

CREATE POLICY "Videos Authenticated Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Videos Owner Delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================
-- FUNCTION: Soft-delete media and clean up storage
-- =============================================
CREATE OR REPLACE FUNCTION public.soft_delete_media(media_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.media
  SET deleted_at = now()
  WHERE id = media_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- FUNCTION: Get user media stats (for storage monitoring)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_user_media_stats(target_user_id uuid)
RETURNS TABLE (
  total_count bigint,
  image_count bigint,
  video_count bigint,
  total_size bigint,
  image_size bigint,
  video_size bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE type = 'image') as image_count,
    COUNT(*) FILTER (WHERE type = 'video') as video_count,
    COALESCE(SUM(compressed_size), 0) as total_size,
    COALESCE(SUM(compressed_size) FILTER (WHERE type = 'image'), 0) as image_size,
    COALESCE(SUM(compressed_size) FILTER (WHERE type = 'video'), 0) as video_size
  FROM public.media
  WHERE user_id = target_user_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
