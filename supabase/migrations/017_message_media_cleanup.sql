-- =============================================
-- Storage cleanup trigger for message media
-- Automatically deletes storage objects when
-- a message with media is deleted.
--
-- After migration 018, media_url stores storage
-- paths directly (not full URLs).
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_message_media()
RETURNS TRIGGER AS $$
DECLARE
  media_path text;
  thumb_path text;
BEGIN
  IF OLD.media_url IS NOT NULL AND OLD.media_url != '' THEN
    -- After migration 018, media_url is a storage path directly.
    -- Handle legacy full URLs as fallback.
    IF OLD.media_url LIKE 'http%://%/storage/v1/object/public/messages/%' THEN
      media_path := regexp_replace(OLD.media_url, '^.*?/storage/v1/object/public/messages/', '');
    ELSE
      media_path := OLD.media_url;
    END IF;

    IF media_path != '' THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'messages' AND name = media_path;
    END IF;
  END IF;

  IF OLD.thumbnail_url IS NOT NULL AND OLD.thumbnail_url != '' AND OLD.thumbnail_url != OLD.media_url THEN
    IF OLD.thumbnail_url LIKE 'http%://%/storage/v1/object/public/messages/%' THEN
      thumb_path := regexp_replace(OLD.thumbnail_url, '^.*?/storage/v1/object/public/messages/', '');
    ELSE
      thumb_path := OLD.thumbnail_url;
    END IF;

    IF thumb_path != '' THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'messages' AND name = thumb_path;
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_message_delete_cleanup ON public.messages;
CREATE TRIGGER on_message_delete_cleanup
  BEFORE DELETE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_message_media();
