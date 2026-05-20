-- =============================================
-- Rate Limiting Table
-- Replaces in-memory Map for serverless-compatible rate limiting
-- =============================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No RLS — this table is only accessed via the check_rate_limit function
-- which uses SECURITY DEFINER to bypass RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Deny all direct access (function handles it)
CREATE POLICY "rate_limits_deny_all" ON public.rate_limits
  FOR ALL USING (false);

-- Atomic rate limit check function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_window_ms integer,
  p_max_attempts integer
) RETURNS jsonb AS $$
DECLARE
  v_now timestamptz := now();
  v_entry record;
  v_retry_after_ms integer;
BEGIN
  -- Try to get existing entry
  SELECT count, reset_at INTO v_entry
  FROM public.rate_limits
  WHERE key = p_key
  FOR UPDATE;

  IF v_entry IS NULL THEN
    -- No entry: create one
    INSERT INTO public.rate_limits (key, count, reset_at)
    VALUES (p_key, 1, v_now + (p_window_ms || ' milliseconds')::interval);
    RETURN jsonb_build_object('allowed', true);
  END IF;

  -- Check if window has expired
  IF v_now > v_entry.reset_at THEN
    -- Reset the window
    UPDATE public.rate_limits
    SET count = 1, reset_at = v_now + (p_window_ms || ' milliseconds')::interval
    WHERE key = p_key;
    RETURN jsonb_build_object('allowed', true);
  END IF;

  -- Within window: check count
  IF v_entry.count >= p_max_attempts THEN
    v_retry_after_ms := EXTRACT(EPOCH FROM (v_entry.reset_at - v_now)) * 1000;
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_ms', v_retry_after_ms::integer
    );
  END IF;

  -- Increment count
  UPDATE public.rate_limits
  SET count = count + 1
  WHERE key = p_key;

  RETURN jsonb_build_object('allowed', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function to remove expired entries (run via pg_cron or manually)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM public.rate_limits WHERE reset_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
