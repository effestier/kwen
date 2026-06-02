-- Recreates get_conversations_with_profiles without is_online/last_seen_at (those columns don't exist)
-- BUG 7 fix: add p_user_id param and DISTINCT ON to prevent duplicates from group chats
CREATE OR REPLACE FUNCTION public.get_conversations_with_profiles(p_user_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  unread_count int,
  updated_at timestamptz,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_is_online boolean,
  other_last_seen_at timestamptz,
  last_message_content text,
  last_message_type text,
  last_message_created_at timestamptz,
  last_message_sender_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (cp.conversation_id)
    cp.conversation_id,
    cp.unread_count,
    c.updated_at,
    p.id AS other_user_id,
    p.username AS other_username,
    p.display_name AS other_display_name,
    p.avatar_url AS other_avatar_url,
    false::boolean AS other_is_online,
    NULL::timestamptz AS other_last_seen_at,
    lm.content AS last_message_content,
    lm.message_type AS last_message_type,
    lm.created_at AS last_message_created_at,
    lm.sender_id AS last_message_sender_id
  FROM conversation_participants cp
  JOIN conversations c ON c.id = cp.conversation_id
  JOIN conversation_participants other_cp
    ON other_cp.conversation_id = cp.conversation_id AND other_cp.user_id != cp.user_id
  JOIN profiles p ON p.id = other_cp.user_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.message_type, m.created_at, m.sender_id
    FROM messages m
    WHERE m.conversation_id = cp.conversation_id AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE cp.user_id = p_user_id
  ORDER BY cp.conversation_id, COALESCE(lm.created_at, c.updated_at) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversations_with_profiles(p_user_id uuid) TO authenticated;
