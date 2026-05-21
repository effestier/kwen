import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';

function getClientIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);

  // Rate limit per IP using Supabase RPC (distributed, not in-memory)
  const limit = await checkRateLimit(`verify-token:${ip}`, {
    windowMs: 60 * 1000,
    maxAttempts: 10,
  });

  console.log('[verify-token] Rate limit check:', { ip, allowed: limit.allowed, retryAfterMs: limit.retryAfterMs });

  if (!limit.allowed) {
    return NextResponse.json(
      { valid: false, error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((limit.retryAfterMs || 60000) / 1000)) },
      }
    );
  }

  try {
    const body = await req.json();
    const { token } = body;

    console.log('[verify-token] Request:', {
      tokenPresent: !!token,
      tokenType: typeof token,
      tokenLength: typeof token === 'string' ? token.length : 0,
      tokenPrefix: typeof token === 'string' ? token.slice(0, 30) : null,
      ip,
      secretConfigured: !!TURNSTILE_SECRET,
      secretLength: TURNSTILE_SECRET.length,
    });

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ valid: false, error: 'Missing token' });
    }

    // Native app bypass — Capacitor can't run Turnstile
    if (token === 'native-app-bypass') {
      const ua = req.headers.get('user-agent') || '';
      const isNative = ua.includes('Capacitor') || ua.includes('okhttp');
      if (!isNative) {
        return NextResponse.json({ valid: false, error: 'Invalid request' }, { status: 403 });
      }
      // Stricter rate limit: 5/min per IP for bypass tokens
      const bypassLimit = await checkRateLimit(`verify-bypass:${ip}`, {
        windowMs: 60 * 1000,
        maxAttempts: 5,
      });
      if (!bypassLimit.allowed) {
        return NextResponse.json(
          { valid: false, error: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((bypassLimit.retryAfterMs || 60000) / 1000)) } }
        );
      }
      return NextResponse.json({ valid: true, degraded: false });
    }

    // Reject placeholder/invalid secrets
    if (!TURNSTILE_SECRET || TURNSTILE_SECRET === 'your-secret-key-here' || TURNSTILE_SECRET.length < 20) {
      console.error('[verify-token] TURNSTILE_SECRET_KEY not configured or is placeholder');
      return NextResponse.json({ valid: true, degraded: true });
    }

    const formData = new URLSearchParams();
    formData.append('secret', TURNSTILE_SECRET);
    formData.append('response', token);

    console.log('[verify-token] Sending to Cloudflare:', {
      secretPrefix: TURNSTILE_SECRET.slice(0, 6) + '...',
      responsePrefix: token.slice(0, 30) + '...',
      bodyString: formData.toString().slice(0, 100) + '...',
    });

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    console.log('[verify-token] Cloudflare response:', {
      success: data.success,
      'error-codes': data['error-codes'],
      hostname: data.hostname,
      action: data.action,
      challenge_ts: data.challenge_ts,
    });

    if (data.success) {
      return NextResponse.json({ valid: true, degraded: false });
    }

    return NextResponse.json({ valid: false, error: 'Verification failed' });
  } catch {
    // Network failure = reject, never pass
    return NextResponse.json({ valid: false, error: 'Verification unavailable' });
  }
}
