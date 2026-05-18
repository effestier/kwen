-- =============================================
-- Add media support to messages table
-- =============================================

-- Add message_type column (text, image, or mixed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'message_type'
  ) THEN
    ALTER TABLE public.messages
      ADD COLUMN message_type text NOT NULL DEFAULT 'text'
      CHECK (message_type IN ('text', 'image', 'mixed'));
  END IF;
END $$;

-- Add media_url column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'media_url'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN media_url text;
  END IF;
END $$;

-- Add media_metadata column (JSON for width, height, size, etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'media_metadata'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN media_metadata jsonb;
  END IF;
END $$;

-- Create storage bucket for message media
INSERT INTO storage.buckets (id, name, public)
VALUES ('messages', 'messages', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for messages bucket
DROP POLICY IF EXISTS "Messages Media Public Access" ON storage.objects;
CREATE POLICY "Messages Media Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'messages');

DROP POLICY IF EXISTS "Messages Media Owner Upload" ON storage.objects;
CREATE POLICY "Messages Media Owner Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'messages'
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Messages Media Owner Delete" ON storage.objects;
CREATE POLICY "Messages Media Owner Delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'messages'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
