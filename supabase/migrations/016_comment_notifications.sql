-- =============================================
-- Notifications for comments and replies
-- =============================================

-- Notify post author when someone comments on their post
-- Notify parent comment author when someone replies to their comment
CREATE OR REPLACE FUNCTION create_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id uuid;
  parent_comment_author_id uuid;
  notification_type text;
  target_user_id uuid;
BEGIN
  -- Get the post author
  SELECT user_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  IF NEW.parent_id IS NOT NULL THEN
    -- This is a reply: notify the parent comment author
    SELECT user_id INTO parent_comment_author_id
    FROM comments
    WHERE id = NEW.parent_id;

    -- Don't notify if replying to yourself
    IF parent_comment_author_id IS NOT NULL AND parent_comment_author_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, type, actor_id, post_id)
      VALUES (parent_comment_author_id, 'comment', NEW.user_id, NEW.post_id);
    END IF;

    -- Also notify post author if different from reply author and parent comment author
    IF post_author_id IS NOT NULL
       AND post_author_id != NEW.user_id
       AND post_author_id != parent_comment_author_id THEN
      INSERT INTO notifications (user_id, type, actor_id, post_id)
      VALUES (post_author_id, 'comment', NEW.user_id, NEW.post_id);
    END IF;
  ELSE
    -- This is a top-level comment: notify the post author
    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, type, actor_id, post_id)
      VALUES (post_author_id, 'comment', NEW.user_id, NEW.post_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_notification ON comments;
CREATE TRIGGER on_comment_notification
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION create_comment_notification();
