import { NextRequest, NextResponse } from 'next/server';

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ valid: false, error: 'Missing token' });
    }

    // Native app bypass
    if (token === 'native-app-bypass') {
      const ua = req.headers.get('user-agent') || '';
      if (!ua.includes('Capacitor') && !ua.includes('okhttp')) {
        return NextResponse.json({ valid: false, error: 'Invalid request' }, { status: 403 });
      }
      return NextResponse.json({ valid: true, degraded: false });
    }

    // No secret configured
    if (!TURNSTILE_SECRET || TURNSTILE_SECRET.length < 20) {
      return NextResponse.json({ valid: true, degraded: true });
    }

    // Verify with Cloudflare
    const body = new URLSearchParams();
    body.append('secret', TURNSTILE_SECRET);
    body.append('response', token);

    const cf = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });

    const data = await cf.json();

    return NextResponse.json({
      valid: !!data.success,
      error: data.success ? undefined : 'Verification failed',
    });
  } catch {
    return NextResponse.json({ valid: false, error: 'Verification unavailable' });
  }
}
