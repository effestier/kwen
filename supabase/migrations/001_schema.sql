-- OpenSocial Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES (extends auth.users)
-- =============================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL CHECK (
    username ~* '^[a-z0-9_]{3,30}$'
  ),
  display_name text NOT NULL,
  avatar_url text,
  bio text,
  website text,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for username lookup (since CHECK allows only lowercase, basic index works)
CREATE INDEX idx_profiles_username ON profiles(username);

-- =============================================
-- POSTS
-- =============================================
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text,
  location text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_posts_user_id_created ON posts(user_id, created_at DESC);
CREATE INDEX idx_posts_deleted_at ON posts(deleted_at) WHERE deleted_at IS NULL;

-- =============================================
-- POST MEDIA
-- =============================================
CREATE TABLE public.post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  media_type text CHECK (media_type IN ('image', 'video')),
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_post_media_post_id ON post_media(post_id);

-- =============================================
-- COMMENTS
-- =============================================
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_comments_post_id_created ON comments(post_id, created_at DESC);
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- =============================================
-- POST LIKES
-- =============================================
CREATE TABLE public.post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX idx_post_likes_user_id ON post_likes(user_id);

-- =============================================
-- COMMENT LIKES
-- =============================================
CREATE TABLE public.comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, comment_id)
);

CREATE INDEX idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX idx_comment_likes_user_id ON comment_likes(user_id);

-- =============================================
-- FOLLOWS
-- =============================================
CREATE TABLE public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_following_id ON follows(following_id);

-- =============================================
-- SAVED POSTS
-- =============================================
CREATE TABLE public.saved_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX idx_saved_posts_user_id ON saved_posts(user_id);
CREATE INDEX idx_saved_posts_post_id ON saved_posts(post_id);

-- =============================================
-- STORIES
-- =============================================
CREATE TABLE public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_stories_user_id_created ON stories(user_id, created_at DESC);
-- Note: Do NOT use partial index with now() - it becomes stale. Instead, index all expires_at
-- and filter in queries: WHERE expires_at > now()
CREATE INDEX idx_stories_expires_at ON stories(expires_at);

-- =============================================
-- STORY VIEWS
-- =============================================
CREATE TABLE public.story_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(story_id, user_id)
);

CREATE INDEX idx_story_views_story_id ON story_views(story_id);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'mention')),
  actor_id uuid NOT NULL REFERENCES profiles(id),
  post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  comment_id uuid REFERENCES comments(id) ON DELETE SET NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_user_id_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_id_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- =============================================
-- CONVERSATIONS
-- =============================================
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =============================================
-- CONVERSATION PARTICIPANTS
-- =============================================
CREATE TABLE public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  unread_count int DEFAULT 0,
  last_read_at timestamptz,
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_conversation_participants_user_id ON conversation_participants(user_id);

-- =============================================
-- MESSAGES
-- =============================================
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_messages_conversation_id_created ON messages(conversation_id, created_at DESC);

-- =============================================
-- TRIGGER: Auto-create profile on user signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username text;
  v_display_name text;
BEGIN
  v_username := NEW.raw_user_meta_data->>'username';
  v_display_name := NEW.raw_user_meta_data->>'display_name';

  -- If metadata missing, generate defaults (OTP users won't have metadata)
  IF v_username IS NULL THEN
    v_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;
  IF v_display_name IS NULL THEN
    v_display_name := 'User';
  END IF;

  -- Use INSERT ... ON CONFLICT to avoid errors if profile already exists
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, v_username, v_display_name)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- STORAGE BUCKETS
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars', 'avatars', true),
  ('posts', 'posts', true),
  ('stories', 'stories', true)
ON CONFLICT (id) DO NOTHING;

-- Avatar storage policy (public read, owner write)
CREATE POLICY "Avatar Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Avatar Owner Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatar Owner Update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Posts storage policy (public read, owner write)
CREATE POLICY "Posts Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'posts');

CREATE POLICY "Posts Owner Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'posts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Stories storage policy (public read, owner write)
CREATE POLICY "Stories Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'stories');

CREATE POLICY "Stories Owner Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'stories' AND auth.uid()::text = (storage.foldername(name))[1]);