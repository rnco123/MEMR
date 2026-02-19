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
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
          })
          // Create new response with updated cookies
          response = NextResponse.next({
            request,
          })
          // Set cookies with extended expiration (24 hours) in the response
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = {
              ...options,
              maxAge: options?.maxAge || 86400, // 24 hours in seconds
              expires: options?.expires || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
              httpOnly: options?.httpOnly !== false,
              secure: process.env.NODE_ENV === 'production',
              sameSite: (options?.sameSite || 'lax') as 'lax' | 'strict' | 'none',
              path: options?.path || '/',
            }
            response.cookies.set(name, value, cookieOptions)
          })
        },
      },
    }
  )

  // Refresh session if needed - this will automatically refresh expired tokens
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // If there's an error getting user, try to refresh the session
  let isAuthenticated = user && !userError
  
  // If there's an error but we have session cookies, try to refresh the session
  if (userError && !user) {
    // Check if we have session cookies - if so, try to refresh
    const sessionCookies = request.cookies.getAll().filter(
      cookie => cookie.name.includes('sb-') && (cookie.name.includes('auth-token') || cookie.name.includes('refresh-token'))
    )
    const hasSessionCookies = sessionCookies.length > 0
    
    if (hasSessionCookies) {
      // Try to refresh the session
      try {
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()
        if (!refreshError && session?.user) {
          isAuthenticated = true
          // Update user from refreshed session
          const refreshedUser = session.user
          // Re-check authentication with refreshed session
          const { data: { user: refreshedUserData } } = await supabase.auth.getUser()
          if (refreshedUserData) {
            isAuthenticated = true
          }
        }
      } catch (refreshErr) {
        // If refresh fails, it's likely the session is truly expired
        if (process.env.NODE_ENV === 'development') {
          console.warn('Session refresh failed:', refreshErr)
        }
      }
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
     * Skip: _next/*, favicon, static assets.
     * Only run middleware for page/API routes.
     */
    '/((?!_next|favicon\\.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
