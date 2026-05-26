import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ valid: false, error: 'No token provided' }, { status: 401 });
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {},
        },
      }
    );

    // Validate the JWT by calling getUser — this verifies signature + expiry
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ valid: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    return NextResponse.json({ valid: true, userId: user.id });
  } catch {
    return NextResponse.json({ valid: false, error: 'Verification failed' }, { status: 500 });
  }
}
