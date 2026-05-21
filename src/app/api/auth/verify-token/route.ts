import { NextRequest, NextResponse } from 'next/server';
import { checkAuthRateLimit, VERIFY_TOKEN_LIMIT, getClientIP } from '@/lib/auth-rate-limit';

export const dynamic = 'force-dynamic';

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

    // NEVER accept bypass tokens — always verify with Cloudflare
    if (token === 'native-app-bypass') {
      return NextResponse.json({ valid: false, error: 'Invalid token' });
    }

    if (!TURNSTILE_SECRET) {
      // No secret configured — reject to prevent abuse
      return NextResponse.json({ valid: false, error: 'Server misconfigured' });
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
