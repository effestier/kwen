-- Migration 057: Fix explore RPC signatures & column refs
-- Run each section separately if needed

-- Add is_private column if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
