import { NextResponse, type NextRequest } from 'next/server'

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

export function middleware(request: NextRequest) {
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

  // Check for Supabase auth cookies (sb-*)
  const hasAuthCookie = request.cookies.has('sb-access-token') ||
    request.cookies.has('sb-refresh-token') ||
    Array.from(request.cookies.getAll()).some(c => c.name.startsWith('sb-'))

  if (!hasAuthCookie) {
    // Redirect to login
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
