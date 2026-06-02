-- ============================================================
-- 056: RPC to get user conversations with other user profiles
--
-- Bypasses RLS entirely to return conversation list data in one call.
-- Replaces the multi-query approach that was failing due to RLS cascades.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_conversations(p_user_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  unread_count integer,
  last_read_at timestamptz,
  conversation_updated_at timestamptz,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_is_online boolean,
  other_last_seen_at timestamptz,
  last_message_content text,
  last_message_created_at timestamptz,
  last_message_type text,
  last_message_sender_id uuid
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH my_convs AS (
    SELECT cp.conversation_id, cp.unread_count, cp.last_read_at
    FROM conversation_participants cp
    WHERE cp.user_id = p_user_id
  ),
  other_parts AS (
    SELECT cp.conversation_id, cp.user_id
    FROM conversation_participants cp
    WHERE cp.conversation_id IN (SELECT my_convs.conversation_id FROM my_convs)
      AND cp.user_id != p_user_id
  ),
  last_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id, m.content, m.created_at, m.message_type, m.sender_id
    FROM messages m
    WHERE m.conversation_id IN (SELECT my_convs.conversation_id FROM my_convs)
      AND m.deleted_at IS NULL
    ORDER BY m.conversation_id, m.created_at DESC
  )
  SELECT DISTINCT ON (mc.conversation_id)
    mc.conversation_id,
    mc.unread_count,
    mc.last_read_at,
    c.updated_at AS conversation_updated_at,
    op.user_id AS other_user_id,
    p.username AS other_username,
    p.display_name AS other_display_name,
    p.avatar_url AS other_avatar_url,
    p.is_online AS other_is_online,
    p.last_seen_at AS other_last_seen_at,
    lm.content AS last_message_content,
    lm.created_at AS last_message_created_at,
    lm.message_type AS last_message_type,
    lm.sender_id AS last_message_sender_id
  FROM my_convs mc
  JOIN conversations c ON c.id = mc.conversation_id
  LEFT JOIN other_parts op ON op.conversation_id = mc.conversation_id
  LEFT JOIN profiles p ON p.id = op.user_id
  LEFT JOIN last_msgs lm ON lm.conversation_id = mc.conversation_id
  ORDER BY mc.conversation_id, COALESCE(lm.created_at, c.updated_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_conversations(uuid) TO authenticated;
