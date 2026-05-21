-- =============================================
-- KWEN Production Rebuild — Migrations 036-038
-- Run this in Supabase Dashboard SQL Editor
-- Safe to run multiple times (idempotent)
-- =============================================

-- =============================================
-- MIGRATION 036: Messaging Production Rebuild
-- =============================================

-- 1. Add last_message_at to conversations for proper sorting
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz DEFAULT now();

-- Backfill existing conversations
UPDATE public.conversations c
SET last_message_at = (
  SELECT MAX(m.created_at)
  FROM public.messages m
  WHERE m.conversation_id = c.id
  AND m.deleted_at IS NULL
);

-- Index for sorting
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations(last_message_at DESC);

-- 2. Add read receipt columns to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS seen_at timestamptz;

-- 3. Add presence columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false;

-- Index for presence queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles(last_seen_at DESC);

-- 4. Trigger: auto-update unread_count and last_message_at on new message
CREATE OR REPLACE FUNCTION public.on_new_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  UPDATE public.conversation_participants
  SET unread_count = unread_count + 1
  WHERE conversation_id = NEW.conversation_id
    AND user_id != NEW.sender_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_new_message ON public.messages;
CREATE TRIGGER on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_new_message();

-- 5. Trigger: auto-mark delivered when message is inserted
CREATE OR REPLACE FUNCTION public.on_message_delivered()
RETURNS TRIGGER AS $$
BEGIN
  NEW.delivered_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_message_delivered ON public.messages;
CREATE TRIGGER on_message_delivered
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_message_delivered();

-- 6. RPC: mark conversation as read
CREATE OR REPLACE FUNCTION public.mark_conversation_read(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS void AS $$
BEGIN
  UPDATE public.conversation_participants
  SET unread_count = 0,
      last_read_at = now()
  WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id;

  UPDATE public.messages
  SET seen_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id != p_user_id
    AND seen_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. RPC: get conversations with last message preview
CREATE OR REPLACE FUNCTION public.get_conversations(p_user_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_is_online boolean,
  other_last_seen_at timestamptz,
  last_message_content text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count int,
  updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.conversation_id,
    p.id as other_user_id,
    p.username as other_username,
    p.display_name as other_display_name,
    p.avatar_url as other_avatar_url,
    p.is_online as other_is_online,
    p.last_seen_at as other_last_seen_at,
    lm.content as last_message_content,
    lm.sender_id as last_message_sender_id,
    lm.created_at as last_message_created_at,
    cp.unread_count,
    c.updated_at
  FROM public.conversation_participants cp
  JOIN public.conversations c ON c.id = cp.conversation_id
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = cp.conversation_id AND cp2.user_id != p_user_id
  JOIN public.profiles p ON p.id = cp2.user_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.sender_id, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = cp.conversation_id
    AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  WHERE cp.user_id = p_user_id
  ORDER BY c.last_message_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. RPC: get messages with read receipts
CREATE OR REPLACE FUNCTION public.get_messages_with_receipts(
  p_conversation_id uuid,
  p_user_id uuid,
  p_limit int DEFAULT 50,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  delivered_at timestamptz,
  seen_at timestamptz,
  reply_to_message_id uuid,
  sender_username text,
  sender_display_name text,
  sender_avatar_url text
) AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.created_at,
    m.delivered_at,
    m.seen_at,
    m.reply_to_message_id,
    p.username as sender_username,
    p.display_name as sender_display_name,
    p.avatar_url as sender_avatar_url
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND m.deleted_at IS NULL
    AND (p_cursor IS NULL OR m.created_at < p_cursor)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. RPC: update user presence
CREATE OR REPLACE FUNCTION public.update_user_presence(
  p_user_id uuid,
  p_is_online boolean
)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET is_online = p_is_online,
      last_seen_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. Enable realtime for messages and reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;

-- =============================================
-- MIGRATION 037: Feed Private Account Fix
-- =============================================

DROP FUNCTION IF EXISTS public.get_discovery_feed(uuid, int, timestamptz);
DROP FUNCTION IF EXISTS public.get_explore_feed(uuid, int, int);

CREATE OR REPLACE FUNCTION public.get_discovery_feed(
  p_user_id uuid,
  p_limit int DEFAULT 20,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  location text,
  created_at timestamptz,
  like_count int,
  comment_count int,
  is_liked boolean,
  is_saved boolean,
  display_name text,
  username text,
  avatar_url text,
  media jsonb,
  tier text
) AS $$
DECLARE
  v_following uuid[];
  v_blocked uuid[];
  v_muted uuid[];
  v_t1_count int;
  v_t2_count int;
  v_t3_count int;
  v_t4_count int;
BEGIN
  SELECT array_agg(f.following_id) INTO v_following
  FROM follows f WHERE f.follower_id = p_user_id;

  SELECT array_agg(b.blocked_id) INTO v_blocked FROM blocks b WHERE b.blocker_id = p_user_id;
  SELECT array_agg(m.muted_id) INTO v_muted FROM mutes m WHERE m.muter_id = p_user_id;

  v_t1_count := GREATEST(1, p_limit * 40 / 100);
  v_t2_count := GREATEST(1, p_limit * 30 / 100);
  v_t3_count := GREATEST(1, p_limit * 20 / 100);
  v_t4_count := GREATEST(1, p_limit - v_t1_count - v_t2_count - v_t3_count);

  -- Tier 1: Following (40%)
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int as like_count,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int as comment_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id) as media,
    'following'::text as tier
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND p.user_id = ANY(COALESCE(v_following, ARRAY[]::uuid[]))
    AND (p.visibility IS NULL OR p.visibility = 'public'
      OR (p.visibility = 'followers' AND EXISTS (SELECT 1 FROM follows WHERE following_id = p.user_id AND follower_id = p_user_id)))
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.created_at DESC
  LIMIT v_t1_count;

  -- Tier 2: Trending (30%) - exclude private accounts
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int as like_count,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int as comment_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id) as media,
    'trending'::text as tier
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND (pr.is_private IS NULL OR pr.is_private = false)
    AND NOT (p.user_id = p_user_id)
    AND (v_following IS NULL OR NOT (p.user_id = ANY(v_following)))
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.engagement_score DESC NULLS LAST
  LIMIT v_t2_count;

  -- Tier 3: Discovery (20%) - exclude private accounts
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int as like_count,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int as comment_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id) as media,
    'discovery'::text as tier
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND (pr.is_private IS NULL OR pr.is_private = false)
    AND NOT (p.user_id = p_user_id)
    AND (v_following IS NULL OR NOT (p.user_id = ANY(v_following)))
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND p.created_at > now() - interval '30 days'
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY random()
  LIMIT v_t3_count;

  -- Tier 4: Fresh (10%) - exclude private accounts
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int as like_count,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int as comment_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id) as media,
    'fresh'::text as tier
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND (pr.is_private IS NULL OR pr.is_private = false)
    AND NOT (p.user_id = p_user_id)
    AND (v_following IS NULL OR NOT (p.user_id = ANY(v_following)))
    AND (v_blocked IS NULL OR NOT (p.user_id = ANY(v_blocked)))
    AND (v_muted IS NULL OR NOT (p.user_id = ANY(v_muted)))
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
  ORDER BY p.created_at DESC
  LIMIT v_t4_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_explore_feed(
  p_user_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  location text,
  created_at timestamptz,
  like_count int,
  comment_count int,
  is_liked boolean,
  is_saved boolean,
  display_name text,
  username text,
  avatar_url text,
  media jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.location, p.created_at,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int as like_count,
    (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.deleted_at IS NULL)::int as comment_count,
    EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    pr.display_name, pr.username, pr.avatar_url,
    (SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'storage_path', pm.storage_path, 'media_type', pm.media_type, 'sort_order', pm.sort_order) ORDER BY pm.sort_order)
     FROM post_media pm WHERE pm.post_id = p.id) as media
  FROM posts p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.deleted_at IS NULL
    AND (p.visibility IS NULL OR p.visibility = 'public')
    AND (pr.is_private IS NULL OR pr.is_private = false)
    AND NOT (p.user_id = p_user_id)
    AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p_user_id AND b.blocked_id = p.user_id)
    AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = p_user_id AND m.muted_id = p.user_id)
  ORDER BY p.engagement_score DESC NULLS LAST
  OFFSET p_offset
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================
-- MIGRATION 038: Story Cleanup Cron
-- =============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule expired stories cleanup every hour
SELECT cron.schedule(
  'cleanup-expired-stories',
  '0 * * * *',
  $$SELECT cleanup_expired_stories()$$
);

-- Schedule rate_limits cleanup daily at 3 AM
SELECT cron.schedule(
  'cleanup-rate-limits',
  '0 3 * * *',
  $$SELECT cleanup_rate_limits()$$
);

-- Verify: SELECT * FROM cron.job;
