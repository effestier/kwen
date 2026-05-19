-- =============================================
-- Make messages bucket private + migrate URLs to paths
-- =============================================

-- Step 1: Migrate existing data FIRST (while bucket is still public)
-- Extract storage paths from full public URLs
UPDATE public.messages
SET media_url = regexp_replace(media_url, '^.*?/storage/v1/object/public/messages/', '')
WHERE media_url LIKE '%/storage/v1/object/public/messages/%'
  AND media_url NOT LIKE '%supabase.co/storage/v1/object/public/messages/%' IS NOT TRUE;

UPDATE public.messages
SET thumbnail_url = regexp_replace(thumbnail_url, '^.*?/storage/v1/object/public/messages/', '')
WHERE thumbnail_url LIKE '%/storage/v1/object/public/messages/%'
  AND thumbnail_url NOT LIKE '%supabase.co/storage/v1/object/public/messages/%' IS NOT TRUE;

-- Step 2: Make bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'messages';

-- Step 3: Drop the public read policy
DROP POLICY IF EXISTS "Messages Media Public Access" ON storage.objects;

-- Step 4: Restrict read access to conversation participants only
-- Users can only generate signed URLs for media in conversations they participate in
DROP POLICY IF EXISTS "Messages Media Authenticated Read" ON storage.objects;
CREATE POLICY "Messages Media Participant Read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'messages'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE cp.user_id = auth.uid()
        AND (m.media_url = storage.objects.name OR m.thumbnail_url = storage.objects.name)
    )
  );
