-- Add missing settings columns
-- Run this in Supabase SQL Editor

-- Privacy: audience preference
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'public'
  CHECK (audience IN ('public', 'followers', 'private'));

-- Content: language preference
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
