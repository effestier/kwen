-- =============================================
-- Add metadata columns for optimized message media
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'thumbnail_url'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN thumbnail_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'mime_type'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN mime_type text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'file_size'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN file_size integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'media_width'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN media_width integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'media_height'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN media_height integer;
  END IF;
END $$;
