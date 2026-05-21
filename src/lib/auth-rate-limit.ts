// In-memory rate limiter for auth API routes
// Only works in serverless/Vercel — each instance has its own store
// For distributed rate limiting, use the Supabase rate_limits table

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkAuthRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

// Preset configs
export const VERIFY_TOKEN_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 }; // 10/min per IP
export const OTP_SEND_LIMIT = { maxRequests: 3, windowMs: 5 * 60 * 1000 }; // 3 per 5min per email
export const OTP_SEND_IP_LIMIT = { maxRequests: 10, windowMs: 5 * 60 * 1000 }; // 10 per 5min per IP
export const OTP_VERIFY_LIMIT = { maxRequests: 5, windowMs: 15 * 60 * 1000 }; // 5 per 15min per email
export const PASSWORD_LOGIN_LIMIT = { maxRequests: 5, windowMs: 15 * 60 * 1000 }; // 5 per 15min per email

export function getClientIP(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
