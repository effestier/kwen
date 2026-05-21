-- =============================================
-- Migration 034: Fix media cleanup trigger + schedule purge
-- =============================================

-- =============================================
-- FIX: media cleanup trigger — extract relative path from URL
-- post_media.storage_path stores full public URLs like:
--   https://xxx.supabase.co/storage/v1/object/public/images/user-id/file.webp
-- storage.objects.name stores relative paths like:
--   user-id/file.webp
-- storage.objects.bucket_id stores the bucket name like:
--   images, videos, posts
-- =============================================
CREATE OR REPLACE FUNCTION public.cleanup_post_media_on_delete()
RETURNS trigger AS $$
BEGIN
  -- Delete storage objects matching post media
  -- Parse full URL → extract bucket_id and relative name
  DELETE FROM storage.objects
  WHERE (bucket_id, name) IN (
    SELECT
      -- Extract bucket: segment after /storage/v1/object/public/
      split_part(
        substring(pm.storage_path from '/storage/v1/object/public/(.+)'),
        '/', 1
      ),
      -- Extract path: everything after /storage/v1/object/public/{bucket}/
      substring(pm.storage_path from '/storage/v1/object/public/[^/]+/(.*)')
    FROM post_media pm
    WHERE pm.post_id = OLD.id
      AND pm.storage_path LIKE '%/storage/v1/object/public/%'
  );

  -- Also try deleting from the legacy 'posts' bucket with raw storage_path
  -- (in case some old records store relative paths)
  DELETE FROM storage.objects
  WHERE bucket_id = 'posts'
  AND name IN (
    SELECT storage_path FROM post_media
    WHERE post_id = OLD.id
      AND storage_path NOT LIKE '%/storage/v1/object/public/%'
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SCHEDULE: pg_cron for 30-day purge
-- On Supabase free tier, pg_cron may not be available.
-- This will succeed on Pro/Enterprise, fail silently on Free.
-- For free tier: call purge_old_deleted_posts() via Supabase Edge Function
-- on an external cron (e.g., cron-job.org, GitHub Actions).
-- The function is a plain SELECT, callable via:
--   supabase.rpc('purge_old_deleted_posts')
-- =============================================
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'purge-old-deleted-posts',
    '0 3 * * *',
    'SELECT public.purge_old_deleted_posts()'
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available on this plan — skip silently
  NULL;
END $$;
