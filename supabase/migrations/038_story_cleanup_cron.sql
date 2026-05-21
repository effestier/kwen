-- Migration 038: Story cleanup cron job
-- Ensures expired stories are archived and deleted automatically

-- =============================================
-- 1. Enable pg_cron extension (if not already enabled)
-- =============================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =============================================
-- 2. Schedule cleanup to run every hour
-- =============================================
-- This will archive and delete expired stories
-- The on_story_delete trigger handles archiving before deletion

SELECT cron.schedule(
  'cleanup-expired-stories',  -- job name
  '0 * * * *',                -- every hour at minute 0
  $$SELECT cleanup_expired_stories()$$
);

-- =============================================
-- 3. Schedule rate_limits cleanup daily
-- =============================================
SELECT cron.schedule(
  'cleanup-rate-limits',      -- job name
  '0 3 * * *',                -- daily at 3 AM
  $$SELECT cleanup_rate_limits()$$
);

-- =============================================
-- 4. Verify cron jobs are scheduled
-- =============================================
-- SELECT * FROM cron.job;
