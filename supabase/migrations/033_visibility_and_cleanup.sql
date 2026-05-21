-- =============================================
-- Migration 033: Visibility Enforcement + Soft-Delete Integrity + Cleanup
-- =============================================

-- =============================================
-- 1. VISIBILITY-AWARE RLS POLICY FOR POSTS
-- =============================================
DROP POLICY IF EXISTS "posts_select_public" ON public.posts;
CREATE POLICY "posts_select_public" ON public.posts
  FOR SELECT USING (
    deleted_at IS NULL AND (
      visibility IS NULL OR visibility = 'public'
      OR (visibility = 'followers' AND EXISTS (
        SELECT 1 FROM follows WHERE following_id = user_id AND follower_id = auth.uid()
      ))
      OR user_id = auth.uid()
    )
  );

-- =============================================
-- 2. SOFT-DELETE GUARD ON posts_update
-- =============================================
DROP POLICY IF EXISTS "posts_update" ON public.posts;
CREATE POLICY "posts_update" ON public.posts
  FOR UPDATE USING (auth.uid() = user_id AND deleted_at IS NULL);

-- =============================================
-- 3. DROP HARD-DELETE POLICY (use soft_delete_post RPC instead)
-- =============================================
DROP POLICY IF EXISTS "posts_delete" ON public.posts;

-- =============================================
-- 4. PARENT POST LIVENESS CHECK ON INSERT POLICIES
-- =============================================
-- post_likes: can't like deleted posts
DROP POLICY IF EXISTS "post_likes_insert" ON public.post_likes;
CREATE POLICY "post_likes_insert" ON public.post_likes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM posts WHERE id = post_id AND deleted_at IS NULL)
  );

-- saved_posts: can't save deleted posts
DROP POLICY IF EXISTS "saved_posts_insert" ON public.saved_posts;
CREATE POLICY "saved_posts_insert" ON public.saved_posts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM posts WHERE id = post_id AND deleted_at IS NULL)
  );

-- comments: can't comment on deleted posts
DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM posts WHERE id = post_id AND deleted_at IS NULL)
  );

-- post_mentions: can't mention on deleted posts
DROP POLICY IF EXISTS "post_mentions_insert_own" ON public.post_mentions;
CREATE POLICY "post_mentions_insert_own" ON public.post_mentions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid() AND deleted_at IS NULL)
  );

-- post_hashtags: can't hashtag deleted posts
DROP POLICY IF EXISTS "post_hashtags_insert_own" ON public.post_hashtags;
CREATE POLICY "post_hashtags_insert_own" ON public.post_hashtags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid() AND deleted_at IS NULL)
  );

-- =============================================
-- 5. EDIT HISTORY: owner-only read
-- =============================================
DROP POLICY IF EXISTS "post_edit_history_select_public" ON public.post_edit_history;
CREATE POLICY "post_edit_history_select_own" ON public.post_edit_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid())
  );

-- =============================================
-- 6. FIX get_discovery_feed: add visibility filtering
-- =============================================
CREATE OR REPLACE FUNCTION public.get_discovery_feed(
  p_user_id uuid,
  p_cursor timestamptz DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid, user_id uuid, content text, location text, media_url text,
  created_at timestamptz, engagement_score float, tier int,
  profile jsonb, media jsonb, comment_count bigint, like_count bigint,
  is_liked boolean, is_saved boolean
) AS $$
DECLARE
  v_limit_t1 int := greatest(1, p_limit * 40 / 100);
  v_limit_t2 int := greatest(1, p_limit * 30 / 100);
  v_limit_t3 int := greatest(1, p_limit * 20 / 100);
  v_limit_t4 int := greatest(1, p_limit * 10 / 100);
BEGIN
  RETURN QUERY
  WITH blocked AS (
    SELECT blocked_id FROM blocks WHERE blocker_id = p_user_id
    UNION SELECT muter_id FROM mutes WHERE muted_id = p_user_id
  ),
  -- Tier 1: Following (40%) — show own + followers-only + public from followed users
  t1 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.media_url, p.created_at,
           p.engagement_score, 1 as tier
    FROM posts p
    WHERE p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public'
           OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows WHERE following_id = p.user_id AND follower_id = p_user_id))
           OR p.user_id = p_user_id)
      AND (p.user_id = p_user_id OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = p_user_id))
      AND p.user_id NOT IN (SELECT blocked_id FROM blocked)
      AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY p.created_at DESC
    LIMIT v_limit_t1
  ),
  -- Tier 2: Trending (30%) — public posts only from non-followed
  t2 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.media_url, p.created_at,
           p.engagement_score, 2 as tier
    FROM posts p
    WHERE p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND p.user_id != p_user_id
      AND p.user_id NOT IN (SELECT following_id FROM follows WHERE follower_id = p_user_id)
      AND p.user_id NOT IN (SELECT blocked_id FROM blocked)
      AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY p.engagement_score DESC NULLS LAST
    LIMIT v_limit_t2
  ),
  -- Tier 3: Discovery (20%) — public posts only, random
  t3 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.media_url, p.created_at,
           p.engagement_score, 3 as tier
    FROM posts p
    WHERE p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND p.user_id != p_user_id
      AND p.user_id NOT IN (SELECT blocked_id FROM blocked)
      AND p.created_at > now() - interval '30 days'
      AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY random()
    LIMIT v_limit_t3
  ),
  -- Tier 4: Fresh (10%) — newest public posts
  t4 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.media_url, p.created_at,
           p.engagement_score, 4 as tier
    FROM posts p
    WHERE p.deleted_at IS NULL
      AND (p.visibility IS NULL OR p.visibility = 'public')
      AND p.user_id NOT IN (SELECT blocked_id FROM blocked)
      AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY p.created_at DESC
    LIMIT v_limit_t4
  ),
  combined AS (
    SELECT * FROM t1 UNION ALL SELECT * FROM t2 UNION ALL SELECT * FROM t3 UNION ALL SELECT * FROM t4
  )
  SELECT DISTINCT ON (c.id)
    c.id, c.user_id, c.content, c.location, c.media_url, c.created_at, c.engagement_score, c.tier,
    to_jsonb(pr.*) - 'id' as profile,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order) FROM post_media pm WHERE pm.post_id = c.id), '[]'::jsonb) as media,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = c.id AND cm.deleted_at IS NULL) as like_count,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = c.id) as like_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = c.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = c.id AND sp.user_id = p_user_id) as is_saved
  FROM combined c
  JOIN profiles pr ON pr.id = c.user_id
  ORDER BY c.id, c.tier, c.engagement_score DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- 7. FIX get_explore_feed: public only
-- =============================================
CREATE OR REPLACE FUNCTION public.get_explore_feed(
  p_user_id uuid,
  p_cursor timestamptz DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid, user_id uuid, content text, location text, media_url text,
  created_at timestamptz, engagement_score float,
  profile jsonb, media jsonb, comment_count bigint, like_count bigint,
  is_liked boolean, is_saved boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.media_url, p.created_at, p.engagement_score,
    to_jsonb(pr.*) - 'id' as profile,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order) FROM post_media pm WHERE pm.post_id = p.id), '[]'::jsonb) as media,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL) as comment_count,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id) as like_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = p_user_id)
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.engagement_score DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- 8. MEDIA CLEANUP: trigger on hard-delete
-- =============================================
CREATE OR REPLACE FUNCTION public.cleanup_post_media_on_delete()
RETURNS trigger AS $$
BEGIN
  -- Delete storage objects for post media
  DELETE FROM storage.objects
  WHERE bucket_id IN ('posts', 'images', 'videos')
  AND name IN (
    SELECT storage_path FROM post_media WHERE post_id = OLD.id
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_hard_delete ON public.posts;
CREATE TRIGGER on_post_hard_delete
  BEFORE DELETE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_post_media_on_delete();

-- =============================================
-- 9. PURGE: hard-delete posts soft-deleted >30 days ago
-- =============================================
CREATE OR REPLACE FUNCTION public.purge_old_deleted_posts()
RETURNS void AS $$
BEGIN
  DELETE FROM public.posts WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 10. INDEXES: missing ones for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_user ON comment_likes(comment_id, user_id);
