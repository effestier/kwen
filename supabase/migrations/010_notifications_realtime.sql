-- =============================================
-- Notifications & Story Reaction Types
-- =============================================

-- Add story reply and story reaction to notification types
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'follow', 'mention', 'story_reply', 'story_reaction'));

-- Add story_id column for story-related notifications
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'story_id') THEN
    ALTER TABLE public.notifications ADD COLUMN story_id uuid REFERENCES stories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add thumbnail_url for notification preview
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'thumbnail_url') THEN
    ALTER TABLE public.notifications ADD COLUMN thumbnail_url text;
  END IF;
END $$;

-- Add message/reaction text for notification
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'message') THEN
    ALTER TABLE public.notifications ADD COLUMN message text;
  END IF;
END $$;

-- Function to create notification for story reaction
CREATE OR REPLACE FUNCTION create_story_reaction_notification()
RETURNS TRIGGER AS $$
DECLARE
  story_owner_uuid uuid;
BEGIN
  -- Get story owner
  SELECT user_id INTO story_owner_uuid FROM stories WHERE id = NEW.story_id;

  -- Don't notify yourself
  IF story_owner_uuid = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Create notification
  INSERT INTO notifications (user_id, type, actor_id, story_id, message)
  VALUES (
    story_owner_uuid,
    'story_reaction',
    NEW.user_id,
    NEW.story_id,
    NEW.emoji
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for story reactions
DROP TRIGGER IF EXISTS on_story_reaction_notification ON story_reactions;
CREATE TRIGGER on_story_reaction_notification
  AFTER INSERT ON story_reactions
  FOR EACH ROW EXECUTE FUNCTION create_story_reaction_notification();

-- Function to create notification for story reply
CREATE OR REPLACE FUNCTION create_story_reply_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Don't notify yourself
  IF NEW.sender_id = NEW.recipient_id THEN
    RETURN NEW;
  END IF;

  -- Create notification
  INSERT INTO notifications (user_id, type, actor_id, story_id, message)
  VALUES (
    NEW.recipient_id,
    'story_reply',
    NEW.sender_id,
    NEW.story_id,
    NEW.message
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for story replies
DROP TRIGGER IF EXISTS on_story_reply_notification ON story_replies;
CREATE TRIGGER on_story_reply_notification
  AFTER INSERT ON story_replies
  FOR EACH ROW EXECUTE FUNCTION create_story_reply_notification();

-- Function to get unread notification count for a user
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  count_val integer;
BEGIN
  SELECT COUNT(*) INTO count_val
  FROM notifications
  WHERE user_id = p_user_id AND is_read = false;

  RETURN count_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;