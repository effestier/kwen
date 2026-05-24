-- Migration 041: Voice Messages + Message Enhancements
-- Adds duration, forwarded_from, delivered_at, seen_at to messages

-- Add duration column (for voice notes, in seconds)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS duration integer;

-- Add forwarded_from column (who forwarded the message)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS forwarded_from uuid REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_forwarded_from ON public.messages(forwarded_from) WHERE forwarded_from IS NOT NULL;

-- Add delivered_at and seen_at for per-message read receipts
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS seen_at timestamptz;
