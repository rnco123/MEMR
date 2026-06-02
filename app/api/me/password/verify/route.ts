import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireStaffSession } from '@/lib/auth/require-staff-session'
import { verifyUserPassword } from '@/lib/auth/verify-password'

export const dynamic = 'force-dynamic'

const verifySchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
})

export async function POST(req: NextRequest) {
  try {
    const { email } = await requireStaffSession()
    const body = await req.json()

    let validated: z.infer<typeof verifySchema>
    try {
      validated = verifySchema.parse(body)
    } catch (e: unknown) {
      const issues = e && typeof e === 'object' && 'issues' in e ? (e as { issues: unknown }).issues : undefined
      throw new ValidationError('Invalid input', { issues })
    }

    const valid = await verifyUserPassword(email, validated.current_password)
    if (!valid) {
      return NextResponse.json(
        { valid: false, message: 'Current password is incorrect' },
        { status: 401 }
      )
    }

    return NextResponse.json({ valid: true })
  } catch (err) {
    return handleApiError(err)
  }
}
