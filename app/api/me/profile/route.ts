import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleApiError, AuthenticationError, ValidationError } from '@/lib/api-error-handler'
import { isStaffAvatarId } from '@/lib/avatars/catalog'
import { resolveStaffAvatarUrl } from '@/lib/avatars/resolve-url'
import { resolveDisplayName } from '@/lib/display-name'
import { loadProfileForUser, updateProfileForUser } from '@/lib/profile/load-profile'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  avatar_id: z.string().min(1).optional(),
  full_name: z.string().min(2).max(100).trim().optional(),
})

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) throw new AuthenticationError()

    const profile = await loadProfileForUser(supabase, user.id, { email: user.email })

    const email = profile?.email ?? user.email ?? null
    const full_name =
      profile?.full_name ??
      (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null)
    const role = profile?.role ?? null
    const avatarId = profile?.avatar_id ?? null

    return NextResponse.json({
      uid: user.id,
      email,
      full_name,
      display_name: resolveDisplayName({
        full_name,
        email,
        role,
        userMetadata: user.user_metadata,
      }),
      role,
      avatar_id: avatarId,
      avatar_url: avatarId ? resolveStaffAvatarUrl(avatarId) : null,
      active: profile?.active !== false,
      avatar_column_available: profile?.avatar_column_available ?? false,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) throw new AuthenticationError()

    const body = await req.json()
    let validated: z.infer<typeof patchSchema>
    try {
      validated = patchSchema.parse(body)
    } catch (e: unknown) {
      const issues = e && typeof e === 'object' && 'issues' in e ? (e as { issues: unknown }).issues : undefined
      throw new ValidationError('Invalid input', { issues })
    }

    if (validated.avatar_id !== undefined && !isStaffAvatarId(validated.avatar_id)) {
      throw new ValidationError('Invalid avatar selection')
    }

    const updates: { full_name?: string; avatar_id?: string } = {}
    if (validated.avatar_id !== undefined) updates.avatar_id = validated.avatar_id
    if (validated.full_name !== undefined) updates.full_name = validated.full_name

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('No fields to update')
    }

    const { error: updateErr, avatar_column_available } = await updateProfileForUser(
      supabase,
      user.id,
      updates
    )
    if (updateErr) {
      throw new ValidationError(updateErr.message)
    }

    const profile = await loadProfileForUser(supabase, user.id, { email: user.email })
    const fullName = profile?.full_name ?? validated.full_name ?? null
    const email = profile?.email ?? user.email
    const role = profile?.role ?? null
    const avatarId =
      profile?.avatar_id ?? (validated.avatar_id as string | undefined) ?? null

    return NextResponse.json({
      success: true,
      avatar_id: avatarId,
      avatar_url: avatarId ? resolveStaffAvatarUrl(avatarId) : undefined,
      full_name: fullName,
      display_name: resolveDisplayName({
        full_name: fullName,
        email,
        role,
        userMetadata: user.user_metadata,
      }),
      avatar_column_available,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
