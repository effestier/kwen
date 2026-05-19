-- Engagement score column on posts (denormalized, updated by trigger)
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS engagement_score float DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_posts_engagement ON posts(engagement_score DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC) WHERE deleted_at IS NULL;

-- Blocks table
CREATE TABLE IF NOT EXISTS public.blocks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_select" ON public.blocks FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "blocks_insert" ON public.blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks_delete" ON public.blocks FOR DELETE USING (auth.uid() = blocker_id);

-- Mutes table
CREATE TABLE IF NOT EXISTS public.mutes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  muter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(muter_id, muted_id)
);
ALTER TABLE public.mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mutes_select" ON public.mutes FOR SELECT USING (auth.uid() = muter_id);
CREATE POLICY "mutes_insert" ON public.mutes FOR INSERT WITH CHECK (auth.uid() = muter_id);
CREATE POLICY "mutes_delete" ON public.mutes FOR DELETE USING (auth.uid() = muter_id);

-- Function to recalculate engagement score for a post
CREATE OR REPLACE FUNCTION public.update_post_engagement_score()
RETURNS trigger AS $$
BEGIN
  UPDATE public.posts SET engagement_score = (
    COALESCE((SELECT count(*) FROM public.post_likes WHERE post_id = COALESCE(NEW.post_id, OLD.post_id)), 0) * 1.0
    + COALESCE((SELECT count(*) FROM public.comments WHERE post_id = COALESCE(NEW.post_id, OLD.post_id) AND deleted_at IS NULL), 0) * 2.0
  ) * exp(-0.05 * extract(epoch from (now() - (SELECT created_at FROM public.posts WHERE id = COALESCE(NEW.post_id, OLD.post_id)))) / 3600)
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers to update engagement score on like/comment change
DROP TRIGGER IF EXISTS trg_engagement_on_like ON public.post_likes;
CREATE TRIGGER trg_engagement_on_like
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_post_engagement_score();

DROP TRIGGER IF EXISTS trg_engagement_on_comment ON public.comments;
CREATE TRIGGER trg_engagement_on_comment
  AFTER INSERT OR DELETE OR UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.update_post_engagement_score();

-- Backfill existing posts engagement scores
UPDATE public.posts SET engagement_score = (
  COALESCE((SELECT count(*) FROM public.post_likes WHERE post_id = posts.id), 0) * 1.0
  + COALESCE((SELECT count(*) FROM public.comments WHERE post_id = posts.id AND deleted_at IS NULL), 0) * 2.0
) * exp(-0.05 * extract(epoch from (now() - created_at)) / 3600)
WHERE deleted_at IS NULL;

-- Drop old RPCs
DROP FUNCTION IF EXISTS public.get_timeline(uuid, int, timestamptz);
DROP FUNCTION IF EXISTS public.get_explore_posts(uuid, int, timestamptz);

-- New discovery feed RPC with weighted blend
CREATE OR REPLACE FUNCTION public.get_discovery_feed(
  p_user_id uuid,
  p_limit int DEFAULT 20,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid, user_id uuid, content text, location text, created_at timestamptz,
  like_count bigint, comment_count bigint, is_liked boolean, is_saved boolean,
  display_name text, username text, avatar_url text,
  media jsonb, tier text
) AS $$
DECLARE
  v_following_count int;
  v_blocked_ids uuid[];
  v_muted_ids uuid[];
  v_limit_t1 int;
  v_limit_t2 int;
  v_limit_t3 int;
  v_limit_t4 int;
BEGIN
  SELECT array_agg(blocked_id) INTO v_blocked_ids FROM public.blocks WHERE blocker_id = p_user_id;
  SELECT array_agg(muted_id) INTO v_muted_ids FROM public.mutes WHERE muter_id = p_user_id;
  SELECT count(*) INTO v_following_count FROM public.follows WHERE follower_id = p_user_id;

  IF v_following_count = 0 THEN
    v_limit_t1 := 0;
    v_limit_t2 := greatest(1, floor(p_limit * 0.45)::int);
    v_limit_t3 := greatest(1, floor(p_limit * 0.40)::int);
    v_limit_t4 := greatest(1, p_limit - v_limit_t2 - v_limit_t3);
  ELSE
    v_limit_t1 := greatest(1, floor(p_limit * 0.40)::int);
    v_limit_t2 := greatest(1, floor(p_limit * 0.30)::int);
    v_limit_t3 := greatest(1, floor(p_limit * 0.20)::int);
    v_limit_t4 := greatest(1, p_limit - v_limit_t1 - v_limit_t2 - v_limit_t3);
  END IF;

  RETURN QUERY
  WITH blocked AS (
    SELECT COALESCE(v_blocked_ids, '{}'::uuid[]) AS ids
  ), muted AS (
    SELECT COALESCE(v_muted_ids, '{}'::uuid[]) AS ids
  ),
  t1 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.created_at, 'following'::text AS tier
    FROM public.posts p
    JOIN public.follows f ON f.following_id = p.user_id
    WHERE f.follower_id = p_user_id
      AND p.deleted_at IS NULL
      AND NOT (p.user_id = ANY((SELECT ids FROM blocked)))
      AND NOT (p.user_id = ANY((SELECT ids FROM muted)))
      AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY p.created_at DESC
    LIMIT v_limit_t1
  ),
  t2 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.created_at, 'trending'::text AS tier
    FROM public.posts p
    WHERE p.deleted_at IS NULL
      AND p.user_id != p_user_id
      AND NOT (p.user_id = ANY((SELECT ids FROM blocked)))
      AND NOT (p.user_id = ANY((SELECT ids FROM muted)))
      AND NOT EXISTS (SELECT 1 FROM t1 WHERE t1.id = p.id)
      AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY p.engagement_score DESC, p.created_at DESC
    LIMIT v_limit_t2
  ),
  t3 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.created_at, 'discovery'::text AS tier
    FROM public.posts p
    WHERE p.deleted_at IS NULL
      AND p.user_id != p_user_id
      AND NOT (p.user_id = ANY((SELECT ids FROM blocked)))
      AND NOT (p.user_id = ANY((SELECT ids FROM muted)))
      AND NOT EXISTS (SELECT 1 FROM t1 WHERE t1.id = p.id)
      AND NOT EXISTS (SELECT 1 FROM t2 WHERE t2.id = p.id)
      AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY random()
    LIMIT v_limit_t3
  ),
  t4 AS (
    SELECT p.id, p.user_id, p.content, p.location, p.created_at, 'fresh'::text AS tier
    FROM public.posts p
    WHERE p.deleted_at IS NULL
      AND p.user_id != p_user_id
      AND NOT (p.user_id = ANY((SELECT ids FROM blocked)))
      AND NOT (p.user_id = ANY((SELECT ids FROM muted)))
      AND NOT EXISTS (SELECT 1 FROM t1 WHERE t1.id = p.id)
      AND NOT EXISTS (SELECT 1 FROM t2 WHERE t2.id = p.id)
      AND NOT EXISTS (SELECT 1 FROM t3 WHERE t3.id = p.id)
      AND (p_cursor IS NULL OR p.created_at < p_cursor)
    ORDER BY p.created_at DESC
    LIMIT v_limit_t4
  ),
  all_posts AS (
    SELECT * FROM t1
    UNION ALL SELECT * FROM t2
    UNION ALL SELECT * FROM t3
    UNION ALL SELECT * FROM t4
  )
  SELECT
    ap.id, ap.user_id, ap.content, ap.location, ap.created_at,
    COALESCE((SELECT count(*) FROM public.post_likes pl WHERE pl.post_id = ap.id), 0) AS like_count,
    COALESCE((SELECT count(*) FROM public.comments c WHERE c.post_id = ap.id AND c.deleted_at IS NULL), 0) AS comment_count,
    EXISTS(SELECT 1 FROM public.post_likes pl WHERE pl.post_id = ap.id AND pl.user_id = p_user_id) AS is_liked,
    EXISTS(SELECT 1 FROM public.saved_posts sp WHERE sp.post_id = ap.id AND sp.user_id = p_user_id) AS is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
       FROM public.post_media pm WHERE pm.post_id = ap.id),
      '[]'::jsonb
    ) AS media,
    ap.tier
  FROM all_posts ap
  JOIN public.profiles pr ON pr.id = ap.user_id
  ORDER BY
    CASE ap.tier
      WHEN 'following' THEN 1
      WHEN 'trending' THEN 2
      WHEN 'discovery' THEN 3
      WHEN 'fresh' THEN 4
    END,
    ap.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Explore feed RPC with engagement ranking
CREATE OR REPLACE FUNCTION public.get_explore_feed(
  p_user_id uuid,
  p_limit int DEFAULT 30,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid, user_id uuid, content text, created_at timestamptz,
  like_count bigint, comment_count bigint,
  display_name text, username text, avatar_url text,
  media jsonb
) AS $$
DECLARE
  v_blocked_ids uuid[];
BEGIN
  SELECT array_agg(blocked_id) INTO v_blocked_ids FROM public.blocks WHERE blocker_id = p_user_id;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.created_at,
    COALESCE((SELECT count(*) FROM public.post_likes pl WHERE pl.post_id = p.id), 0),
    COALESCE((SELECT count(*) FROM public.comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL), 0),
    pr.display_name, pr.username, pr.avatar_url,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
       FROM public.post_media pm WHERE pm.post_id = p.id),
      '[]'::jsonb
    )
  FROM public.posts p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND p.user_id != p_user_id
    AND NOT (p.user_id = ANY(COALESCE(v_blocked_ids, '{}'::uuid[])))
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.engagement_score DESC, p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
