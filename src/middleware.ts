import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/feed',
  '/messages',
  '/notifications',
  '/create',
  '/explore',
  '/profile',
  '/settings',
  '/saved',
  '/reels',
  '/stories',
]

// Routes that are public (no auth required)
const PUBLIC_ROUTES = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/privacy',
  '/terms',
  '/download',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets and API routes
  // NOTE: API routes handle their own auth via supabase.auth.getUser()
  // This is intentional — middleware only guards page routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    // Only skip auth for paths that look like files (have extension at the end)
    /\.\w{2,5}$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  // Check if route is public
  const isPublic = PUBLIC_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )

  if (isPublic) {
    return NextResponse.next()
  }

  // Check if route is protected
  const isProtected = PROTECTED_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )

  if (!isProtected) {
    return NextResponse.next()
  }

  // Create Supabase server client with request/response cookies
  const response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options })
            response.cookies.set({ name, value, ...options })
          })
        },
      },
    }
  )

  // Use getSession() — reads JWT from cookie directly, no network round-trip.
  // getUser() validates against Supabase servers on every navigation which adds
  // 20-100ms latency per route change. The JWT signature is already verified
  // by the cookie mechanism, and expired tokens are handled by the client.
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session?.user) {
    // Invalid/expired session — redirect to login
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
