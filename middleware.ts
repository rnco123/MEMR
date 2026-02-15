import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { UserRole, isValidRole, mapRoleToEnum } from './lib/roles'
import { validateRequest } from './lib/security/request-validator'
import { rateLimitCheck } from './lib/rate-limit'

// Define role-based route requirements
const ROLE_ROUTES: Record<string, UserRole[]> = {
  '/dashboard': [UserRole.DOCTOR, UserRole.NURSE],
  // Add more routes as needed
}

export async function middleware(request: NextRequest) {
  // Security: Validate request
  const requestValidation = validateRequest(request)
  if (!requestValidation.valid) {
    return NextResponse.json(
      { error: requestValidation.error || 'Invalid request', code: 'SECURITY_ERROR' },
      { status: 400 }
    )
  }

  // Security: Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimitCheck(ip, { limit: 100, windowMs: 60000 })) {
      return NextResponse.json(
        { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429 }
      )
    }
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if needed
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // If there's an error getting user, check if it's a token refresh issue
  // Only treat as not authenticated if it's a real auth error, not a temporary refresh issue
  const isAuthenticated = user && !userError
  
  // If there's an error but we have a session cookie, try to refresh
  if (userError && !user) {
    // Check if we have session cookies - if so, it might be a refresh issue
    const hasSessionCookies = request.cookies.getAll().some(
      cookie => cookie.name.includes('sb-') && cookie.name.includes('auth-token')
    )
    
    // If we have session cookies but getUser failed, it might be a temporary issue
    // Don't immediately redirect - let the client handle it
    if (hasSessionCookies && process.env.NODE_ENV === 'development') {
      console.warn('Session cookies present but getUser failed - may be temporary refresh issue')
    }
  }

  // Fetch role from profiles table (matches existing schema)
  let userRole: UserRole | null = null
  if (isAuthenticated && user) {
    // Try to get role from user metadata first (for test mode)
    const metadataRole = mapRoleToEnum(user.user_metadata?.role)
    if (metadataRole) {
      userRole = metadataRole
    } else {
      // Fetch from profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('uid', user.id)
        .single()
      
      if (profile?.role) {
        const mappedRole = mapRoleToEnum(profile.role)
        if (mappedRole) {
          userRole = mappedRole
        }
      }
    }
  }

  // Protect routes that require authentication
  if (!isAuthenticated && !pathname.startsWith('/login')) {
    // Allow access to public routes
    const publicRoutes = ['/', '/test-daily', '/api', '/login']
    const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route))
    
    if (!isPublicRoute) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/'
      redirectUrl.searchParams.set('redirectedFrom', pathname)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Role-based route protection
  if (isAuthenticated && pathname in ROLE_ROUTES) {
    const requiredRoles = ROLE_ROUTES[pathname]
    
    // If user has no role or role is not in required roles, redirect
    if (!userRole || !requiredRoles || !requiredRoles.includes(userRole)) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/'
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Redirect authenticated users with roles away from login page
  // But allow access if session is invalid (after sign-out)
  if (isAuthenticated && userRole && pathname === '/login') {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  // Don't redirect authenticated users without roles from dashboard immediately
  // Let the client-side handle it to avoid redirect loops
  // The client will show "account being setup" message if needed

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
