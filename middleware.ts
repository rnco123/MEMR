import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { UserRole, mapRoleToEnum } from './lib/roles'
import { fetchProfileFields } from './lib/fetch-user-role'
import { getSupabasePublishableKey, getSupabaseUrl } from './lib/supabase/keys'
import { maxRequestBodySizeForPath, validateRequest } from './lib/security/request-validator'

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '') || '/'
  }
  return pathname
}

const PHYSICIAN_ROUTE_ROLES = [UserRole.DOCTOR, UserRole.FNP, UserRole.PA] as const

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

  // Admin-only pages — enforce at middleware layer (M-02a).
  if (p.startsWith('/admin')) {
    return [UserRole.ADMIN]
  }

  if (p.startsWith('/dashboard/flowboard')) {
    return [UserRole.ADMIN, ...PHYSICIAN_ROUTE_ROLES, UserRole.NURSE]
  }
  if (p.startsWith('/dashboard/nurse-flowboard')) {
    return [UserRole.ADMIN, ...PHYSICIAN_ROUTE_ROLES, UserRole.NURSE]
  }
  if (p.startsWith('/dashboard/patients-history')) {
    return [UserRole.ADMIN, ...PHYSICIAN_ROUTE_ROLES, UserRole.NURSE]
  }
  if (p.startsWith('/dashboard/prescriptions')) {
    return [UserRole.ADMIN, ...PHYSICIAN_ROUTE_ROLES]
  }
  if (p === '/dashboard') {
    return [UserRole.ADMIN, ...PHYSICIAN_ROUTE_ROLES, UserRole.NURSE]
  }
  if (p.startsWith('/dashboard/')) {
    return [UserRole.ADMIN, ...PHYSICIAN_ROUTE_ROLES, UserRole.NURSE]
  }
  if (p.startsWith('/video')) {
    return [...PHYSICIAN_ROUTE_ROLES, UserRole.NURSE]
  }
  if (p.startsWith('/patient-file')) {
    return [UserRole.ADMIN, ...PHYSICIAN_ROUTE_ROLES, UserRole.NURSE]
  }
  return null
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

  const requestValidation = validateRequest(request, {
    maxBodySize: maxRequestBodySizeForPath(normalizedPathname),
  })
  if (!requestValidation.valid) {
    return NextResponse.json(
      { error: requestValidation.error || 'Invalid request', code: 'SECURITY_ERROR' },
      { status: 400 }
    )
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
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = {
              ...options,
              maxAge: options?.maxAge || 86400,
              expires: options?.expires || new Date(Date.now() + 24 * 60 * 60 * 1000),
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

  // Single getUser() — validates JWT and auto-refreshes the session via cookie adapter.
  const {
    data: { user: effectiveUser },
    error: userError,
  } = await supabase.auth.getUser()

  const isAuthenticated = !!effectiveUser && !userError

  // Fetch role from profiles table — authoritative source (H-03).
  // Never trust user_metadata.role for authorization decisions.
  let userRole: UserRole | null = null
  if (isAuthenticated && effectiveUser) {
    const profile = await fetchProfileFields(supabase, effectiveUser.id, 'role', {
      email: effectiveUser.email,
    })
    if (profile?.role && typeof profile.role === 'string') {
      const mappedRole = mapRoleToEnum(profile.role)
      if (mappedRole) {
        userRole = mappedRole
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

  if (!isAuthenticated) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.searchParams.set('redirectedFrom', pathname)
    return NextResponse.redirect(redirectUrl)
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

  return response
}

export const config = {
  matcher: [
    /*
     * Protected app pages only. Excluded entirely:
     * - /api/* (each route uses lib/security/api-auth.ts)
     * - /_next/*, /static/*, favicon.ico, static assets
     * - Public pages: /, /login, /offline
     */
    '/dashboard',
    '/dashboard/:path*',
    '/admin',
    '/admin/:path*',
    '/video',
    '/video/:path*',
    '/patient-file',
    '/patient-file/:path*',
  ],
}
