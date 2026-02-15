import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { signupSchema } from '@/lib/validation'
import { handleApiError, AuthenticationError, ValidationError } from '@/lib/api-error-handler'
import { rateLimitCheck, createRateLimiter } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'

// Create admin client with service role key
const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

// Rate limiter for signup (5 requests per 15 minutes per IP)
const signupRateLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 })

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
    if (!signupRateLimiter(ip)) {
      return handleApiError(new Error('Too many signup attempts. Please try again later.'))
    }

    const body = await request.json()

    // Validate input with Zod
    let validated
    try {
      validated = signupSchema.parse(body)
    } catch (error) {
      // Convert Zod error to details format
      const details = error && typeof error === 'object' && 'issues' in error
        ? { issues: (error as { issues: any[] }).issues }
        : undefined
      return handleApiError(new ValidationError('Invalid input', details))
    }

    const { name, email, password, role, pin } = validated

    // Validate PIN
    if (pin !== config.admin.signupPin) {
      await logAuditEvent('user_created', 'user', undefined, { failed: true, reason: 'invalid_pin' })
      return handleApiError(new AuthenticationError('Invalid admin PIN'))
    }

    // Validation is already done by Zod schema above

    // Create user with admin API (auto-confirms email)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name,
        role,
      },
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (authData.user) {
      // Split name into first and last
      const nameParts = name.trim().split(' ')
      const firstName = nameParts[0]
      const lastName = nameParts.slice(1).join(' ') || ''

      // Create profile in profiles table (required for chat feature)
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        uid: authData.user.id,
        role: role,
        full_name: name.trim(),
        email: email,
        active: true,
      })

      if (profileError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error inserting profile:', profileError)
        }
        // Continue anyway - profile might already exist
      }

      // Insert into appropriate table based on role
      if (role === 'doctor') {
        const { error: insertError } = await supabaseAdmin.from('doctors').insert({
          user_id: authData.user.id,
          first_name: firstName,
          last_name: lastName,
          email: email,
        })

        if (insertError) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error inserting doctor:', insertError)
          }
        }
      } else {
        const { error: insertError } = await supabaseAdmin.from('nurses').insert({
          user_id: authData.user.id,
          first_name: firstName,
          last_name: lastName,
          email: email,
        })

        if (insertError) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error inserting nurse:', insertError)
          }
        }
      }

      // Log successful user creation
      await logAuditEvent('user_created', 'user', authData.user.id, {
        role,
        email: email,
      })

      return NextResponse.json({ success: true, user: authData.user })
    }

    return handleApiError(new Error('Failed to create user'))
  } catch (error) {
    return handleApiError(error)
  }
}
