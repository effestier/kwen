-- OpenSocial RLS Policies
-- Run this after 001_schema.sql

-- =============================================
-- ENABLE RLS
-- =============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PROFILES POLICIES
-- =============================================
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- =============================================
-- POSTS POLICIES
-- =============================================
DROP POLICY IF EXISTS "posts_select" ON public.posts;
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "posts_insert" ON public.posts;
CREATE POLICY "posts_insert" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_update" ON public.posts;
CREATE POLICY "posts_update" ON public.posts FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_delete" ON public.posts;
CREATE POLICY "posts_delete" ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- POST MEDIA POLICIES
-- =============================================
-- Allow public read access to post_media
DROP POLICY IF EXISTS "post_media_select_public" ON public.post_media;
CREATE POLICY "post_media_select_public" ON public.post_media FOR SELECT USING (true);

-- Allow owners full access
DROP POLICY IF EXISTS "post_media_all" ON public.post_media;
CREATE POLICY "post_media_all" ON public.post_media FOR ALL USING (
  EXISTS (SELECT 1 FROM posts WHERE id = post_media.post_id AND user_id = auth.uid())
);

-- =============================================
-- COMMENTS POLICIES
-- =============================================
DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_update" ON public.comments;
CREATE POLICY "comments_update" ON public.comments FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_delete" ON public.comments;
CREATE POLICY "comments_delete" ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- POST LIKES POLICIES
-- =============================================
DROP POLICY IF EXISTS "post_likes_select" ON public.post_likes;
CREATE POLICY "post_likes_select" ON public.post_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "post_likes_insert" ON public.post_likes;
CREATE POLICY "post_likes_insert" ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_likes_delete" ON public.post_likes;
CREATE POLICY "post_likes_delete" ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- COMMENT LIKES POLICIES
-- =============================================
DROP POLICY IF EXISTS "comment_likes_select" ON public.comment_likes;
CREATE POLICY "comment_likes_select" ON public.comment_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "comment_likes_insert" ON public.comment_likes;
CREATE POLICY "comment_likes_insert" ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comment_likes_delete" ON public.comment_likes;
CREATE POLICY "comment_likes_delete" ON public.comment_likes FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- FOLLOWS POLICIES
-- =============================================
DROP POLICY IF EXISTS "follows_select" ON public.follows;
CREATE POLICY "follows_select" ON public.follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "follows_insert" ON public.follows;
CREATE POLICY "follows_insert" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows_delete" ON public.follows;
CREATE POLICY "follows_delete" ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- =============================================
-- SAVED POSTS POLICIES
-- =============================================
DROP POLICY IF EXISTS "saved_posts_select" ON public.saved_posts;
CREATE POLICY "saved_posts_select" ON public.saved_posts FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_posts_insert" ON public.saved_posts;
CREATE POLICY "saved_posts_insert" ON public.saved_posts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_posts_delete" ON public.saved_posts;
CREATE POLICY "saved_posts_delete" ON public.saved_posts FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- STORIES POLICIES
-- =============================================
DROP POLICY IF EXISTS "stories_select" ON public.stories;
CREATE POLICY "stories_select" ON public.stories FOR SELECT USING (true);

DROP POLICY IF EXISTS "stories_insert" ON public.stories;
CREATE POLICY "stories_insert" ON public.stories FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "stories_delete" ON public.stories;
CREATE POLICY "stories_delete" ON public.stories FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- STORY VIEWS POLICIES
-- =============================================
DROP POLICY IF EXISTS "story_views_insert" ON public.story_views;
CREATE POLICY "story_views_insert" ON public.story_views FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "story_views_select_owner" ON public.story_views;
CREATE POLICY "story_views_select_owner" ON public.story_views FOR SELECT USING (
  EXISTS (SELECT 1 FROM stories WHERE id = story_id AND user_id = auth.uid())
);

-- =============================================
-- NOTIFICATIONS POLICIES
-- =============================================
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = actor_id);

-- =============================================
-- CONVERSATIONS POLICIES
-- =============================================
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
CREATE POLICY "conversations_select" ON public.conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT WITH CHECK (true);

-- =============================================
-- CONVERSATION PARTICIPANTS POLICIES
-- =============================================
DROP POLICY IF EXISTS "conversation_participants_all" ON public.conversation_participants;
CREATE POLICY "conversation_participants_all" ON public.conversation_participants FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "conversation_participants_insert" ON public.conversation_participants;
CREATE POLICY "conversation_participants_insert" ON public.conversation_participants FOR INSERT WITH CHECK (true);

-- =============================================
-- MESSAGES POLICIES
-- =============================================
DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);