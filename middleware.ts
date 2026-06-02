import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { UserRole, mapRoleToEnum } from './lib/roles'
import { fetchUserRole } from './lib/fetch-user-role'
import { getSupabasePublishableKey, getSupabaseUrl } from './lib/supabase/keys'
import { validateRequest } from './lib/security/request-validator'
import { rateLimitCheck } from './lib/rate-limit'

const isProduction = process.env.NODE_ENV === 'production'

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '') || '/'
  }
  return pathname
}

/**
 * Role rules aligned with `withRoleProtection` on each page.
 * Returns null when this path has no extra role requirement in middleware.
 */
function getRequiredRolesForPath(pathname: string): UserRole[] | null {
  const p = normalizePathname(pathname)

  // Removed from all flows (doctor/nurse/admin)
  if (p.startsWith('/dashboard/orders') || p.startsWith('/dashboard/follow-ups')) {
    return null
  }

  if (p.startsWith('/dashboard/flowboard')) {
    return [UserRole.ADMIN, UserRole.DOCTOR]
  }
  if (p.startsWith('/dashboard/nurse-flowboard')) {
    return [UserRole.ADMIN, UserRole.NURSE]
  }
  if (p.startsWith('/dashboard/patients-history')) {
    return [UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE]
  }
  if (p.startsWith('/dashboard/prescriptions')) {
    return [UserRole.ADMIN, UserRole.DOCTOR]
  }
  if (p === '/dashboard') {
    return [UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE]
  }
  if (p.startsWith('/dashboard/')) {
    return [UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE]
  }
  if (p.startsWith('/video')) {
    return [UserRole.DOCTOR, UserRole.NURSE]
  }
  if (p.startsWith('/patient-file')) {
    return [UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE]
  }
  return null
}

/** Do not use `pathname.startsWith('/')` — that matches every path and breaks auth redirects. */
function isPublicPath(pathname: string, production: boolean): boolean {
  if (pathname === '/') return true
  if (pathname === '/login' || pathname === '/signup') return true
  if (pathname.startsWith('/api')) return true
  if (!production && pathname === '/test-daily') return true
  /** Dev-only: OpenAI key connectivity page (no secrets shown). */
  if (!production && pathname === '/openai') return true
  return false
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const normalizedPathname = normalizePathname(pathname)

  if (normalizedPathname.startsWith('/dashboard/orders') || normalizedPathname.startsWith('/dashboard/follow-ups')) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  let supabaseUrl: string
  let supabaseAnonKey: string
  try {
    supabaseUrl = getSupabaseUrl()
    supabaseAnonKey = getSupabasePublishableKey()
  } catch (e) {
    console.error('[middleware] Supabase env not configured:', e)
    return new NextResponse(
      'Server misconfiguration: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    )
  }

  // Security: Validate request
  const requestValidation = validateRequest(request)
  if (!requestValidation.valid) {
    return NextResponse.json(
      { error: requestValidation.error || 'Invalid request', code: 'SECURITY_ERROR' },
      { status: 400 }
    )
  }

  // Production: disable dev/diagnostic surfaces
  if (isProduction) {
    if (
      pathname === '/test-daily' ||
      pathname === '/sentry-test' ||
      pathname === '/test-consent-forms' ||
      pathname === '/test-soap-complete'
    ) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    if (
      pathname === '/api/auth/test-login' ||
      pathname === '/api/daily/test' ||
      pathname === '/api/test-db-connection'
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
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
    supabaseUrl,
    supabaseAnonKey,
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
    data: { user: initialUser },
    error: userError,
  } = await supabase.auth.getUser()

  let effectiveUser = initialUser

  // If there's an error getting user, try to refresh the session
  let isAuthenticated = !!(initialUser && !userError)

  // If there's an error but we have session cookies, try to refresh the session
  if (userError && !initialUser) {
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
          effectiveUser = session.user
          const { data: { user: refreshedUserData } } = await supabase.auth.getUser()
          if (refreshedUserData) {
            effectiveUser = refreshedUserData
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

  if (isAuthenticated && !effectiveUser) {
    const { data: { user: resolved } } = await supabase.auth.getUser()
    effectiveUser = resolved ?? null
  }

  // Fetch role from profiles table (matches existing schema)
  let userRole: UserRole | null = null
  if (isAuthenticated && effectiveUser) {
    // Try to get role from user metadata first (for test mode)
    const metadataRole = mapRoleToEnum(effectiveUser.user_metadata?.role)
    if (metadataRole) {
      userRole = metadataRole
    } else {
      // Must match client auth-context (fetchUserRole): id → uid → user_profiles
      const profile = await fetchUserRole(supabase, effectiveUser.id)
      if (profile?.role) {
        const mappedRole = mapRoleToEnum(profile.role)
        if (mappedRole) {
          userRole = mappedRole
        }
      }
    }
  }

  // Admin I-693 lives under /admin; preserve deep links from legacy /dashboard/i-693 URLs.
  if (
    isAuthenticated &&
    userRole === UserRole.ADMIN &&
    (normalizedPathname === '/dashboard/i-693' ||
      normalizedPathname.startsWith('/dashboard/i-693/'))
  ) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/admin/i-693'
    return NextResponse.redirect(redirectUrl)
  }

  // Keep admin in dedicated admin UX (don't switch into doctor/nurse dashboard shell).
  if (isAuthenticated && userRole === UserRole.ADMIN && normalizedPathname.startsWith('/dashboard')) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/admin'
    return NextResponse.redirect(redirectUrl)
  }

  if (isAuthenticated && userRole === UserRole.ADMIN && normalizedPathname.startsWith('/patient-file/')) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = normalizedPathname.replace('/patient-file/', '/admin/patient-file/')
    return NextResponse.redirect(redirectUrl)
  }

  // Protect routes that require authentication
  if (!isAuthenticated && !pathname.startsWith('/login')) {
    if (!isPublicPath(pathname, isProduction)) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/'
      redirectUrl.searchParams.set('redirectedFrom', pathname)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Role-based route protection (matches page-level withRoleProtection)
  const requiredRoles = getRequiredRolesForPath(pathname)
  if (isAuthenticated && requiredRoles !== null) {
    if (!userRole || !requiredRoles.includes(userRole)) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/'
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Redirect authenticated users with roles away from login page
  // But allow access if session is invalid (after sign-out)
  if (isAuthenticated && userRole && pathname === '/login') {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = userRole === UserRole.ADMIN ? '/admin' : '/dashboard'
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
