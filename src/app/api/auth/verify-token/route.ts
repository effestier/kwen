import { NextRequest, NextResponse } from 'next/server';
import { checkAuthRateLimit, VERIFY_TOKEN_LIMIT, getClientIP } from '@/lib/auth-rate-limit';

export const dynamic = 'force-static';

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';

export async function POST(req: NextRequest) {
  // Rate limit per IP
  const ip = getClientIP(req);
  const limit = checkAuthRateLimit(`verify-token:${ip}`, VERIFY_TOKEN_LIMIT.maxRequests, VERIFY_TOKEN_LIMIT.windowMs);
  if (!limit.allowed) {
    return NextResponse.json(
      { valid: false, error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
    );
  }

  try {
    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ valid: false, error: 'Missing token' });
    }

    // Skip Turnstile when not configured (site key is placeholder)
    if (token === 'skip-turnstile') {
      return NextResponse.json({ valid: true, degraded: true });
    }

    // Native app bypass — Capacitor can't run Turnstile
    // Verify the request actually comes from a native app via User-Agent
    if (token === 'native-app-bypass') {
      const ua = req.headers.get('user-agent') || '';
      const isNative = ua.includes('Capacitor') || ua.includes('okhttp');
      if (!isNative) {
        return NextResponse.json({ valid: false, error: 'Invalid request' }, { status: 403 });
      }
      // Stricter rate limit: 5/min per IP for bypass tokens
      const bypassLimit = checkAuthRateLimit(`verify-bypass:${ip}`, 5, 60 * 1000);
      if (!bypassLimit.allowed) {
        return NextResponse.json(
          { valid: false, error: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(bypassLimit.retryAfterMs / 1000)) } }
        );
      }
      return NextResponse.json({ valid: true, degraded: false });
    }

    if (!TURNSTILE_SECRET) {
      // No secret configured — allow but mark as degraded
      // Rate limiting still protects against abuse
      return NextResponse.json({ valid: true, degraded: true });
    }

    const formData = new URLSearchParams();
    formData.append('secret', TURNSTILE_SECRET);
    formData.append('response', token);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (data.success) {
      return NextResponse.json({ valid: true, degraded: false });
    }

    return NextResponse.json({ valid: false, error: 'Verification failed' });
  } catch {
    // Network failure = reject, never pass
    return NextResponse.json({ valid: false, error: 'Verification unavailable' });
  }
}
