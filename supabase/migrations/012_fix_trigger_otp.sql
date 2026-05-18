-- Fix handle_new_user trigger to:
-- 1. Create BOTH profiles AND user_settings (migration 009 overwrote 001's trigger)
-- 2. Tolerate OTP signups (no metadata in raw_user_meta_data)
-- 3. Use ON CONFLICT to prevent race conditions

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

  -- Create profile (ON CONFLICT handles race with verifyOTP manual creation)
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, v_username, v_display_name)
  ON CONFLICT (id) DO NOTHING;

  -- Create user settings
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger (in case it was overwritten by migration 009)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
