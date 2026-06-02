import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireStaffSession } from '@/lib/auth/require-staff-session'
import { verifyUserPassword } from '@/lib/auth/verify-password'
import { logAuditEvent } from '@/lib/audit-server'
import { passwordSchema, isCommonPassword } from '@/lib/security/password'

export const dynamic = 'force-dynamic'

const changeSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    password_confirm: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.new_password === d.password_confirm, {
    message: 'Passwords do not match',
    path: ['password_confirm'],
  })
  .refine((d) => d.new_password !== d.current_password, {
    message: 'New password must be different from your current password',
    path: ['new_password'],
  })

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, email } = await requireStaffSession()
    const body = await req.json()

    let validated: z.infer<typeof changeSchema>
    try {
      validated = changeSchema.parse(body)
    } catch (e: unknown) {
      const issues = e && typeof e === 'object' && 'issues' in e ? (e as { issues: unknown }).issues : undefined
      throw new ValidationError('Invalid input', { issues })
    }

    if (isCommonPassword(validated.new_password)) {
      throw new ValidationError('Password is too common. Please choose a stronger password.')
    }

    const currentValid = await verifyUserPassword(email, validated.current_password)
    if (!currentValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect', code: 'INVALID_CURRENT_PASSWORD' },
        { status: 401 }
      )
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: validated.new_password,
    })

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 })
    }

    await logAuditEvent('password_changed', 'profile', user.id, {
      self_service: true,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handleApiError(err)
  }
}
