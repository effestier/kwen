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
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
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

  // Validate the session by calling getUser() — this:
  // 1. Validates the JWT signature and expiry
  // 2. Refreshes expired tokens (returns refreshed cookies via setAll)
  // 3. Returns null if session is truly invalid
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
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
