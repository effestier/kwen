// Serverless-compatible rate limiter using Supabase
// Replaces the in-memory Map that was bypassable on Vercel

import { createClient } from '@/lib/supabase/server'

export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_window_ms: config.windowMs,
      p_max_attempts: config.maxAttempts,
    })

    if (error) {
      // If the RPC fails, fail CLOSED for auth-related checks
      // to prevent bypassing rate limits during outages
      console.error('[rate-limit] RPC error, failing closed:', error.message)
      return { allowed: false, retryAfterMs: 60000 }
    }

    const result = data as { allowed: boolean; retry_after_ms?: number }

    return {
      allowed: result.allowed,
      retryAfterMs: result.retry_after_ms,
    }
  } catch (err) {
    // Network/other error — fail closed to prevent bypass
    console.error('[rate-limit] Error, failing closed:', err)
    return { allowed: false, retryAfterMs: 60000 }
  }
}


// Preset configs
export const OTP_SEND_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 3,       // 3 OTP requests per minute
};

export const OTP_VERIFY_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 10,           // 10 verification attempts
};

export const AUTH_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 5,       // 5 auth actions per minute
};

export const UPLOAD_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 10,      // 10 uploads per minute
};
