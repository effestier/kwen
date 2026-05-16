-- User Settings Table
-- Stores per-user preferences for notifications, privacy, content, etc.

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Theme preference
  theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),

  -- Privacy settings
  activity_status BOOLEAN DEFAULT true,
  story_replies BOOLEAN DEFAULT true,

  -- Notification settings
  push_enabled BOOLEAN DEFAULT true,
  likes_notifications BOOLEAN DEFAULT true,
  comments_notifications BOOLEAN DEFAULT true,
  follows_notifications BOOLEAN DEFAULT true,
  mentions_notifications BOOLEAN DEFAULT true,
  messages_notifications BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT false,
  weekly_digest BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,

  -- Content preferences
  suggested_posts BOOLEAN DEFAULT true,
  autoplay_videos BOOLEAN DEFAULT true,
  reduce_motion BOOLEAN DEFAULT false,
  high_contrast BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read/update their own settings
CREATE POLICY "Users can manage own settings" ON user_settings
  FOR ALL
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);

-- Function to auto-create settings for new users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create settings for new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Add avatar storage bucket if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow users to upload their own avatars
CREATE POLICY "Users can upload avatars" ON storage.objects
  FOR ALL
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);