-- =============================================
-- Migration 032: Post Publishing System
-- Drafts, editing, hashtags, mentions, visibility
-- =============================================

-- =============================================
-- POST DRAFTS
-- =============================================
CREATE TABLE public.post_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text,
  media jsonb DEFAULT '[]',
  location text,
  alt_texts jsonb DEFAULT '[]',
  visibility text DEFAULT 'public',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_post_drafts_user_id ON post_drafts(user_id, updated_at DESC);

ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_drafts_select_own" ON public.post_drafts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "post_drafts_insert_own" ON public.post_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_drafts_update_own" ON public.post_drafts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "post_drafts_delete_own" ON public.post_drafts
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- ADD COLUMNS TO POSTS TABLE
-- =============================================
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
END $$;

-- =============================================
-- POST MENTIONS
-- =============================================
CREATE TABLE public.post_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_mentions_post_id ON post_mentions(post_id);
CREATE INDEX idx_post_mentions_user_id ON post_mentions(user_id);

ALTER TABLE public.post_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_mentions_select_public" ON public.post_mentions FOR SELECT USING (true);
CREATE POLICY "post_mentions_insert_own" ON public.post_mentions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));
CREATE POLICY "post_mentions_delete_own" ON public.post_mentions FOR DELETE
  USING (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));

-- =============================================
-- POST HASHTAGS
-- =============================================
CREATE TABLE public.post_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_post_hashtags_tag ON post_hashtags(hashtag);
CREATE INDEX idx_post_hashtags_post_id ON post_hashtags(post_id);

ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_hashtags_select_public" ON public.post_hashtags FOR SELECT USING (true);
CREATE POLICY "post_hashtags_insert_own" ON public.post_hashtags FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));
CREATE POLICY "post_hashtags_delete_own" ON public.post_hashtags FOR DELETE
  USING (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));

-- =============================================
-- TAGGED USERS IN MEDIA
-- =============================================
CREATE TABLE public.post_tagged_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_index int NOT NULL DEFAULT 0,
  x real,
  y real,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id, media_index)
);

CREATE INDEX idx_post_tagged_users_post_id ON post_tagged_users(post_id);

ALTER TABLE public.post_tagged_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_tagged_users_select_public" ON public.post_tagged_users FOR SELECT USING (true);
CREATE POLICY "post_tagged_users_insert_own" ON public.post_tagged_users FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));
CREATE POLICY "post_tagged_users_delete_own" ON public.post_tagged_users FOR DELETE
  USING (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));

-- =============================================
-- EDIT HISTORY
-- =============================================
CREATE TABLE public.post_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  content text,
  location text,
  edited_at timestamptz DEFAULT now()
);

CREATE INDEX idx_post_edit_history_post_id ON post_edit_history(post_id, edited_at DESC);

ALTER TABLE public.post_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_edit_history_select_public" ON public.post_edit_history FOR SELECT USING (true);
CREATE POLICY "post_edit_history_insert_own" ON public.post_edit_history FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid()));

-- =============================================
-- SHARE COUNT: add shares column if missing
-- =============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'shares') THEN
    ALTER TABLE public.posts ADD COLUMN shares int DEFAULT 0;
  END IF;
END $$;

-- =============================================
-- RPC: edit post (saves history, updates post)
-- =============================================
CREATE OR REPLACE FUNCTION public.edit_post(
  p_post_id uuid,
  p_content text,
  p_location text DEFAULT NULL,
  p_visibility text DEFAULT NULL,
  p_alt_texts jsonb DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_old_content text;
  v_old_location text;
BEGIN
  -- Get current values
  SELECT content, location INTO v_old_content, v_old_location
  FROM posts WHERE id = p_post_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found or not authorized';
  END IF;

  -- Save edit history
  INSERT INTO post_edit_history (post_id, content, location)
  VALUES (p_post_id, v_old_content, v_old_location);

  -- Update post
  UPDATE posts SET
    content = p_content,
    location = COALESCE(p_location, location),
    visibility = COALESCE(p_visibility, visibility),
    alt_texts = COALESCE(p_alt_texts, alt_texts),
    edited_at = now(),
    updated_at = now()
  WHERE id = p_post_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: soft delete post
-- =============================================
CREATE OR REPLACE FUNCTION public.soft_delete_post(p_post_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE posts SET deleted_at = now()
  WHERE id = p_post_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: restore soft-deleted post
-- =============================================
CREATE OR REPLACE FUNCTION public.restore_post(p_post_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE posts SET deleted_at = NULL
  WHERE id = p_post_id AND user_id = auth.uid() AND deleted_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: increment share count
-- =============================================
CREATE OR REPLACE FUNCTION public.increment_share_count(p_post_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE posts SET shares = COALESCE(shares, 0) + 1
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RLS: posts SELECT should exclude soft-deleted
-- Must drop old permissive policy first (migration 002 had USING (true))
-- =============================================
DROP POLICY IF EXISTS "posts_select" ON public.posts;
DROP POLICY IF EXISTS "posts_select_public" ON public.posts;
CREATE POLICY "posts_select_public" ON public.posts
  FOR SELECT USING (deleted_at IS NULL);
