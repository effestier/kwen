-- Migration 058: Database trigger for mention notifications
-- When a row is inserted into post_mentions, automatically create a notification

CREATE OR REPLACE FUNCTION create_mention_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id uuid;
  mentioned_user_id uuid;
BEGIN
  -- Get the post author
  SELECT user_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
  mentioned_user_id := NEW.user_id;

  -- Don't notify self-mentions
  IF post_author_id = mentioned_user_id THEN
    RETURN NEW;
  END IF;

  -- Check if mentioned user has mentions_notifications enabled (default true)
  -- Skip the check if user_settings doesn't have this column yet
  BEGIN
    IF EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = mentioned_user_id
      AND COALESCE((settings->>'mentions_notifications')::boolean, true) = false
    ) THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    -- Column doesn't exist yet, proceed with notification
    NULL;
  END;

  -- Insert notification (skip if one already exists for this post+user combo)
  INSERT INTO notifications (user_id, type, actor_id, post_id, is_read)
  SELECT mentioned_user_id, 'mention', post_author_id, NEW.post_id, false
  WHERE NOT EXISTS (
    SELECT 1 FROM notifications
    WHERE user_id = mentioned_user_id
    AND type = 'mention'
    AND actor_id = post_author_id
    AND post_id = NEW.post_id
    AND created_at > now() - interval '1 hour'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_post_mention_notification
  AFTER INSERT ON post_mentions
  FOR EACH ROW
  EXECUTE FUNCTION create_mention_notification();
