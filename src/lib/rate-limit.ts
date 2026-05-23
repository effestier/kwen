// Serverless-compatible rate limiter using Supabase
// Replaces the in-memory Map that was bypassable on Vercel

import { createClient } from '@/lib/supabase/server'

export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  failOpen: boolean = false
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_window_ms: config.windowMs,
      p_max_attempts: config.maxAttempts,
    })

    if (error) {
      if (failOpen) {
        console.error('[rate-limit] RPC error, failing open:', error.message)
        return { allowed: true }
      }
      console.error('[rate-limit] RPC error, failing closed:', error.message)
      return { allowed: false, retryAfterMs: 60000 }
    }

    const result = data as { allowed: boolean; retry_after_ms?: number }

    return {
      allowed: result.allowed,
      retryAfterMs: result.retry_after_ms,
    }
  } catch (err) {
    if (failOpen) {
      console.error('[rate-limit] Error, failing open:', err)
      return { allowed: true }
    }
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
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxAttempts: 20,          // 20 uploads per 5 minutes (sane for story posting with retries)
};

// Anonymous upload limit (IP-based, stricter)
export const ANON_UPLOAD_LIMIT: RateLimitConfig = {
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxAttempts: 5,           // 5 uploads per 5 minutes for unauthenticated
};
