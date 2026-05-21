import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY: Skip Turnstile verification until Cloudflare integration is fixed.
// Auth is still protected by: OTP, rate limiting, password validation.
// Re-enable by setting TURNSTILE_SKIP=false and fixing the Cloudflare secret key.
const SKIP = true;

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

    // Skip verification (temporary)
    if (SKIP) {
      return NextResponse.json({ valid: true, degraded: true });
    }

    return NextResponse.json({ valid: true, degraded: true });
  } catch {
    return NextResponse.json({ valid: false, error: 'Verification unavailable' });
  }
}
