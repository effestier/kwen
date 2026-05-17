-- OTP Authentication Support
-- Add support for email OTP without password confirmation

-- Update the handle_new_user trigger to be more robust
-- This ensures profiles are created even with OTP auth where metadata might be empty

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username text;
  v_display_name text;
BEGIN
  -- Try to get username and display_name from metadata
  -- For OTP auth, these might be empty, so we use a fallback
  v_username := NEW.raw_user_meta_data->>'username';
  v_display_name := NEW.raw_user_meta_data->>'display_name';

  -- If not in metadata, try to extract from email (for OTP flow)
  IF v_username IS NULL OR v_display_name IS NULL THEN
    v_display_name := split_part(NEW.email, '@', 1);
    v_username := 'user_' || LEFT(NEW.id::text, 8);
  END IF;

  -- Insert profile if not exists
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, v_username, v_display_name)
  ON CONFLICT (id) DO NOTHING;

  -- Insert user settings if not exists
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure trigger exists and is correct
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Note: No changes needed to RLS - existing policies already work for OTP users
-- The policies check auth.uid() = id which works for any auth method