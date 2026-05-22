import { NextRequest, NextResponse } from 'next/server';

// Turnstile removed. Auth protected by OTP + Supabase.
export async function POST(_req: NextRequest) {
  return NextResponse.json({ valid: true, degraded: true });
}
