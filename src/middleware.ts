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

  // getUser() validates the JWT signature + expiry against the Supabase Auth server.
  // Do NOT replace this with getSession() — getSession() only reads the cookie and
  // does NOT verify the signature, so a forged/expired token would pass.
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    // Invalid/expired/forged session — redirect to login
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated routes must not be cached by CDNs or the browser bfcache —
  // feed/messages/profile are user-specific and may include private content
  // (drafts, deleted posts, restricted accounts).
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  response.headers.set('Pragma', 'no-cache')

  // Security headers — apply to every response we let through.
  // CSP 'frame-ancestors 'none'' replaces the JS clickjacking band-aid in
  // src/lib/anti-tamper.ts (now removed).
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'")
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()')

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
