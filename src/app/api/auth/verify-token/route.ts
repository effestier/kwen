import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ valid: false, error: 'Missing token' });
    }

    // Native bypass
    if (token === 'native-app-bypass') {
      return NextResponse.json({ valid: true, degraded: false });
    }

    if (!TURNSTILE_SECRET) {
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

    return NextResponse.json({ valid: false, error: 'Invalid token' });
  } catch {
    return NextResponse.json({ valid: true, degraded: true });
  }
}
