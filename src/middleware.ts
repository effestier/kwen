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

// Full Content-Security-Policy — applied to ALL page routes via middleware.
// This replaces the partial CSP that was previously split between next.config.ts
// (full CSP) and middleware.ts (frame-ancestors only). Having it all in one place
// avoids middleware silently overwriting the next.config.ts CSP with a weaker one.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.supabase.co https://*.supabase.in https://*.supabase.com https://challenges.cloudflare.com",
  "media-src 'self' blob: https://*.supabase.co https://*.supabase.in https://*.supabase.com",
  "font-src 'self' data:",
  "connect-src 'self' https://unpkg.com https://*.supabase.co https://*.supabase.in https://*.supabase.com wss://*.supabase.co wss://*.supabase.in wss://*.supabase.com https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ')

function setSecurityHeaders(headers: Headers) {
  headers.set('Content-Security-Policy', CSP_DIRECTIVES)
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  headers.set('X-DNS-Prefetch-Control', 'off')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
  headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), interest-cohort=(), browsing-topics=(), join-ad-interest-group=(), run-ad-auction()')
}

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
    const response = NextResponse.next()
    setSecurityHeaders(response.headers)
    return response
  }

  // Check if route is public
  const isPublic = PUBLIC_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )

  if (isPublic) {
    const response = NextResponse.next()
    setSecurityHeaders(response.headers)
    return response
  }

  // Check if route is protected
  const isProtected = PROTECTED_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )

  if (!isProtected) {
    const response = NextResponse.next()
    setSecurityHeaders(response.headers)
    return response
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

  // Apply full security headers
  setSecurityHeaders(response.headers)

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
