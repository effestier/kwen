-- =============================================
-- Migration 035: Safe Reconciliation Patch
-- Fully idempotent — runs cleanly regardless of which 030-034 objects exist
-- =============================================

-- =============================================
-- 030: STORY ARCHIVE (safe)
-- =============================================
CREATE TABLE IF NOT EXISTS public.story_archive (
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

CREATE INDEX IF NOT EXISTS idx_story_archive_user_id ON story_archive(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_archive_archived_at ON story_archive(archived_at DESC);

ALTER TABLE public.story_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "archive_select_own" ON public.story_archive;
CREATE POLICY "archive_select_own" ON public.story_archive
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "archive_delete_own" ON public.story_archive;
CREATE POLICY "archive_delete_own" ON public.story_archive
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.archive_story_before_delete()
RETURNS trigger AS $$
DECLARE
  v_overlays jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('overlay_type', so.overlay_type, 'payload', so.payload, 'z_index', so.z_index)
  ), '[]'::jsonb) INTO v_overlays
  FROM story_overlays so WHERE so.story_id = OLD.id;

  INSERT INTO story_archive (user_id, original_story_id, media_url, media_type, visibility, overlays, created_at)
  VALUES (OLD.user_id, OLD.id, OLD.media_url, OLD.media_type, OLD.visibility, v_overlays, OLD.created_at);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_story_delete ON public.stories;
CREATE TRIGGER on_story_delete BEFORE DELETE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.archive_story_before_delete();

CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS void AS $$
BEGIN DELETE FROM public.stories WHERE expires_at < now(); END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_archived_stories(p_user_id uuid, p_cursor timestamptz DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE (id uuid, media_url text, media_type text, visibility text, overlays jsonb, created_at timestamptz, archived_at timestamptz) AS $$
BEGIN
  RETURN QUERY SELECT sa.id, sa.media_url, sa.media_type, sa.visibility, sa.overlays, sa.created_at, sa.archived_at
  FROM story_archive sa WHERE sa.user_id = p_user_id AND (p_cursor IS NULL OR sa.created_at < p_cursor)
  ORDER BY sa.created_at DESC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_archive_months(p_user_id uuid)
RETURNS TABLE (month text, count bigint) AS $$
BEGIN
  RETURN QUERY SELECT to_char(sa.created_at, 'YYYY-MM') as month, count(*) as count
  FROM story_archive sa WHERE sa.user_id = p_user_id
  GROUP BY to_char(sa.created_at, 'YYYY-MM') ORDER BY month DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- 031: HIGHLIGHT REORDER + COVER (safe)
-- =============================================
CREATE OR REPLACE FUNCTION public.reorder_highlight_stories(p_highlight_id uuid, p_story_ids uuid[])
RETURNS void AS $$
DECLARE i int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM story_highlights WHERE id = p_highlight_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  FOR i IN 1..array_length(p_story_ids, 1) LOOP
    UPDATE highlight_stories SET sort_order = i
    WHERE highlight_id = p_highlight_id AND story_id = p_story_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_highlight_cover(p_highlight_id uuid, p_cover_url text)
RETURNS void AS $$
BEGIN
  UPDATE story_highlights SET cover_url = p_cover_url, updated_at = now()
  WHERE id = p_highlight_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 032: POST PUBLISHING SYSTEM (safe)
-- =============================================
CREATE TABLE IF NOT EXISTS public.post_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text, media jsonb DEFAULT '[]', location text,
  alt_texts jsonb DEFAULT '[]', visibility text DEFAULT 'public',
  updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_drafts_user_id ON post_drafts(user_id, updated_at DESC);
ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_drafts_select_own" ON public.post_drafts;
CREATE POLICY "post_drafts_select_own" ON public.post_drafts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "post_drafts_insert_own" ON public.post_drafts;
CREATE POLICY "post_drafts_insert_own" ON public.post_drafts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "post_drafts_update_own" ON public.post_drafts;
CREATE POLICY "post_drafts_update_own" ON public.post_drafts FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "post_drafts_delete_own" ON public.post_drafts;
CREATE POLICY "post_drafts_delete_own" ON public.post_drafts FOR DELETE USING (auth.uid() = user_id);

-- Add columns to posts (safe)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'edited_at') THEN
    ALTER TABLE public.posts ADD COLUMN edited_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'visibility') THEN
    ALTER TABLE public.posts ADD COLUMN visibility text DEFAULT 'public';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'alt_texts') THEN
    ALTER TABLE public.posts ADD COLUMN alt_texts jsonb DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'shares') THEN
    ALTER TABLE public.posts ADD COLUMN shares int DEFAULT 0;
  END IF;
END $$;

-- post_mentions
CREATE TABLE IF NOT EXISTS public.post_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_mentions_post_id ON post_mentions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_mentions_user_id ON post_mentions(user_id);
ALTER TABLE public.post_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_mentions_select_public" ON public.post_mentions;
CREATE POLICY "post_mentions_select_public" ON public.post_mentions FOR SELECT USING (true);
DROP POLICY IF EXISTS "post_mentions_insert_own" ON public.post_mentions;
CREATE POLICY "post_mentions_insert_own" ON public.post_mentions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid() AND deleted_at IS NULL));
DROP POLICY IF EXISTS "post_mentions_delete_own" ON public.post_mentions;
CREATE POLICY "post_mentions_delete_own" ON public.post_mentions FOR DELETE
  USING (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));

-- post_hashtags
CREATE TABLE IF NOT EXISTS public.post_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag text NOT NULL, created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_tag ON post_hashtags(hashtag);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_post_id ON post_hashtags(post_id);
ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_hashtags_select_public" ON public.post_hashtags;
CREATE POLICY "post_hashtags_select_public" ON public.post_hashtags FOR SELECT USING (true);
DROP POLICY IF EXISTS "post_hashtags_insert_own" ON public.post_hashtags;
CREATE POLICY "post_hashtags_insert_own" ON public.post_hashtags FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid() AND deleted_at IS NULL));
DROP POLICY IF EXISTS "post_hashtags_delete_own" ON public.post_hashtags;
CREATE POLICY "post_hashtags_delete_own" ON public.post_hashtags FOR DELETE
  USING (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));

-- post_tagged_users
CREATE TABLE IF NOT EXISTS public.post_tagged_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_index int NOT NULL DEFAULT 0, x real, y real,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id, media_index)
);
CREATE INDEX IF NOT EXISTS idx_post_tagged_users_post_id ON post_tagged_users(post_id);
ALTER TABLE public.post_tagged_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_tagged_users_select_public" ON public.post_tagged_users;
CREATE POLICY "post_tagged_users_select_public" ON public.post_tagged_users FOR SELECT USING (true);
DROP POLICY IF EXISTS "post_tagged_users_insert_own" ON public.post_tagged_users;
CREATE POLICY "post_tagged_users_insert_own" ON public.post_tagged_users FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));
DROP POLICY IF EXISTS "post_tagged_users_delete_own" ON public.post_tagged_users;
CREATE POLICY "post_tagged_users_delete_own" ON public.post_tagged_users FOR DELETE
  USING (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));

-- post_edit_history
CREATE TABLE IF NOT EXISTS public.post_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  content text, location text, edited_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_edit_history_post_id ON post_edit_history(post_id, edited_at DESC);
ALTER TABLE public.post_edit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_edit_history_select_public" ON public.post_edit_history;
DROP POLICY IF EXISTS "post_edit_history_select_own" ON public.post_edit_history;
CREATE POLICY "post_edit_history_select_own" ON public.post_edit_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));
DROP POLICY IF EXISTS "post_edit_history_insert_own" ON public.post_edit_history;
CREATE POLICY "post_edit_history_insert_own" ON public.post_edit_history FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));

-- RPCs (032)
CREATE OR REPLACE FUNCTION public.edit_post(p_post_id uuid, p_content text, p_location text DEFAULT NULL, p_visibility text DEFAULT NULL, p_alt_texts jsonb DEFAULT NULL)
RETURNS void AS $$
DECLARE v_old_content text; v_old_location text;
BEGIN
  SELECT content, location INTO v_old_content, v_old_location FROM posts WHERE id = p_post_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found or not authorized'; END IF;
  INSERT INTO post_edit_history (post_id, content, location) VALUES (p_post_id, v_old_content, v_old_location);
  UPDATE posts SET content = p_content, location = COALESCE(p_location, location), visibility = COALESCE(p_visibility, visibility),
    alt_texts = COALESCE(p_alt_texts, alt_texts), edited_at = now(), updated_at = now()
  WHERE id = p_post_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.soft_delete_post(p_post_id uuid)
RETURNS void AS $$
BEGIN UPDATE posts SET deleted_at = now() WHERE id = p_post_id AND user_id = auth.uid(); END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.restore_post(p_post_id uuid)
RETURNS void AS $$
BEGIN UPDATE posts SET deleted_at = NULL WHERE id = p_post_id AND user_id = auth.uid() AND deleted_at IS NOT NULL; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_share_count(p_post_id uuid)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE posts SET shares = COALESCE(shares, 0) + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old posts_select policy (from migration 002)
DROP POLICY IF EXISTS "posts_select" ON public.posts;

-- =============================================
-- 033: VISIBILITY + SOFT-DELETE INTEGRITY (safe)
-- =============================================

-- Visibility-aware SELECT
DROP POLICY IF EXISTS "posts_select_public" ON public.posts;
CREATE POLICY "posts_select_public" ON public.posts FOR SELECT USING (
  deleted_at IS NULL AND (
    visibility IS NULL OR visibility = 'public'
    OR (visibility = 'followers' AND EXISTS (SELECT 1 FROM follows WHERE following_id = user_id AND follower_id = auth.uid()))
    OR user_id = auth.uid()
  )
);

-- Soft-delete guard on UPDATE
DROP POLICY IF EXISTS "posts_update" ON public.posts;
CREATE POLICY "posts_update" ON public.posts FOR UPDATE USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Drop hard-delete policy
DROP POLICY IF EXISTS "posts_delete" ON public.posts;

-- Parent post liveness checks
DROP POLICY IF EXISTS "post_likes_insert" ON public.post_likes;
CREATE POLICY "post_likes_insert" ON public.post_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM posts WHERE id = post_id AND deleted_at IS NULL));

DROP POLICY IF EXISTS "saved_posts_insert" ON public.saved_posts;
CREATE POLICY "saved_posts_insert" ON public.saved_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM posts WHERE id = post_id AND deleted_at IS NULL));

DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM posts WHERE id = post_id AND deleted_at IS NULL));

-- Discovery feed with visibility
CREATE OR REPLACE FUNCTION public.get_discovery_feed(p_user_id uuid, p_cursor timestamptz DEFAULT NULL, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, user_id uuid, content text, location text, media_url text, created_at timestamptz, engagement_score float, tier int, profile jsonb, media jsonb, comment_count bigint, like_count bigint, is_liked boolean, is_saved boolean) AS $$
DECLARE v_t1 int := greatest(1, p_limit * 40 / 100); v_t2 int := greatest(1, p_limit * 30 / 100); v_t3 int := greatest(1, p_limit * 20 / 100); v_t4 int := greatest(1, p_limit * 10 / 100);
BEGIN
  RETURN QUERY
  WITH blocked AS (SELECT blocked_id FROM blocks WHERE blocker_id = p_user_id UNION SELECT muter_id FROM mutes WHERE muted_id = p_user_id),
  t1 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.media_url, p.created_at, p.engagement_score, 1 as tier FROM posts p
    WHERE p.deleted_at IS NULL AND (p.visibility IS NULL OR p.visibility = 'public' OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows WHERE following_id = p.user_id AND follower_id = p_user_id)) OR p.user_id = p_user_id)
      AND (p.user_id = p_user_id OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = p_user_id))
      AND p.user_id NOT IN (SELECT blocked_id FROM blocked) AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY p.created_at DESC LIMIT v_t1
  ),
  t2 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.media_url, p.created_at, p.engagement_score, 2 as tier FROM posts p
    WHERE p.deleted_at IS NULL AND (p.visibility IS NULL OR p.visibility = 'public') AND p.user_id != p_user_id
      AND p.user_id NOT IN (SELECT following_id FROM follows WHERE follower_id = p_user_id)
      AND p.user_id NOT IN (SELECT blocked_id FROM blocked) AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY p.engagement_score DESC NULLS LAST LIMIT v_t2
  ),
  t3 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.media_url, p.created_at, p.engagement_score, 3 as tier FROM posts p
    WHERE p.deleted_at IS NULL AND (p.visibility IS NULL OR p.visibility = 'public') AND p.user_id != p_user_id
      AND p.user_id NOT IN (SELECT blocked_id FROM blocked) AND p.created_at > now() - interval '30 days'
      AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY random() LIMIT v_t3
  ),
  t4 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.media_url, p.created_at, p.engagement_score, 4 as tier FROM posts p
    WHERE p.deleted_at IS NULL AND (p.visibility IS NULL OR p.visibility = 'public')
      AND p.user_id NOT IN (SELECT blocked_id FROM blocked) AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY p.created_at DESC LIMIT v_t4
  ),
  combined AS (SELECT * FROM t1 UNION ALL SELECT * FROM t2 UNION ALL SELECT * FROM t3 UNION ALL SELECT * FROM t4)
  SELECT DISTINCT ON (c.id) c.id, c.user_id, c.content, c.location, c.media_url, c.created_at, c.engagement_score, c.tier,
    to_jsonb(pr.*) - 'id' as profile,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order) FROM post_media pm WHERE pm.post_id = c.id), '[]'::jsonb) as media,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = c.id AND cm.deleted_at IS NULL) as comment_count,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = c.id) as like_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = c.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = c.id AND sp.user_id = p_user_id) as is_saved
  FROM combined c JOIN profiles pr ON pr.id = c.user_id
  ORDER BY c.id, c.tier, c.engagement_score DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Explore feed: public only
CREATE OR REPLACE FUNCTION public.get_explore_feed(p_user_id uuid, p_cursor timestamptz DEFAULT NULL, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, user_id uuid, content text, location text, media_url text, created_at timestamptz, engagement_score float, profile jsonb, media jsonb, comment_count bigint, like_count bigint, is_liked boolean, is_saved boolean) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.user_id, p.content, p.location, p.media_url, p.created_at, p.engagement_score,
    to_jsonb(pr.*) - 'id' as profile,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order) FROM post_media pm WHERE pm.post_id = p.id), '[]'::jsonb) as media,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL) as comment_count,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id) as like_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved
  FROM posts p JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL AND (p.visibility IS NULL OR p.visibility = 'public')
    AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = p_user_id)
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.engagement_score DESC NULLS LAST LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- 033+034: MEDIA CLEANUP + PURGE (safe)
-- =============================================
CREATE OR REPLACE FUNCTION public.cleanup_post_media_on_delete()
RETURNS trigger AS $$
BEGIN
  DELETE FROM storage.objects WHERE (bucket_id, name) IN (
    SELECT split_part(substring(pm.storage_path from '/storage/v1/object/public/(.+)'), '/', 1),
           substring(pm.storage_path from '/storage/v1/object/public/[^/]+/(.*)')
    FROM post_media pm WHERE pm.post_id = OLD.id AND pm.storage_path LIKE '%/storage/v1/object/public/%'
  );
  DELETE FROM storage.objects WHERE bucket_id = 'posts' AND name IN (
    SELECT storage_path FROM post_media WHERE post_id = OLD.id AND storage_path NOT LIKE '%/storage/v1/object/public/%'
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_hard_delete ON public.posts;
CREATE TRIGGER on_post_hard_delete BEFORE DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_post_media_on_delete();

CREATE OR REPLACE FUNCTION public.purge_old_deleted_posts()
RETURNS void AS $$
BEGIN
  -- Only allow service_role or cron (no user-facing auth context)
  -- When called from pg_cron, current_setting('request.jwt.claims', true) is NULL
  -- When called by a user, it will have jwt claims with a 'sub' (user_id)
  IF current_setting('request.jwt.claims', true) IS NOT NULL THEN
    -- This is a user request, not a cron job — block it
    RAISE EXCEPTION 'This function can only be called from a scheduled job';
  END IF;
  DELETE FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_user ON comment_likes(comment_id, user_id);

-- pg_cron (silent fail on free tier, no duplicate jobs)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  -- Only schedule if job doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-deleted-posts') THEN
    PERFORM cron.schedule('purge-old-deleted-posts', '0 3 * * *', 'SELECT public.purge_old_deleted_posts()');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
