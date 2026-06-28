import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { logAuditEvent } from '@/lib/audit-server'
import { resolveStaffAvatarUrl } from '@/lib/avatars/resolve-url'
import { parseDoctorNpi } from '@/lib/doctors/npi'
import { fetchAllLocations } from '@/lib/locations/fetch-all'
import { ADMIN_STAFF_ROLE_VALUES, isPhysicianRole, UserRole } from '@/lib/roles'
import { z } from 'zod'

const adminStaffRoleSchema = z.enum(ADMIN_STAFF_ROLE_VALUES)

function isDoctorRole(role: string): boolean {
  return role === UserRole.DOCTOR
}

export const dynamic = 'force-dynamic'

const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Z]/, 'Must have uppercase')
  .regex(/[a-z]/, 'Must have lowercase')
  .regex(/[0-9]/, 'Must have number')
  .regex(/[^A-Za-z0-9]/, 'Must have special char')

const createUserSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema,
  role: adminStaffRoleSchema,
  location_ids: z.array(z.number().int().positive()).optional(),
  compliance_access: z.boolean().optional(),
})

const patchUserSchema = z
  .object({
    uid: z.string().uuid(),
    full_name: z.string().min(2).max(100).trim().optional(),
    email: z.string().email().toLowerCase().trim().optional(),
    role: adminStaffRoleSchema.optional(),
    active: z.boolean().optional(),
    password: passwordSchema.optional(),
    location_ids: z.array(z.number().int().positive()).optional(),
    npi: z.union([z.string().max(20), z.null()]).optional(),
    compliance_access: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.full_name !== undefined ||
      d.email !== undefined ||
      d.role !== undefined ||
      d.active !== undefined ||
      d.password !== undefined ||
      d.location_ids !== undefined ||
      d.npi !== undefined ||
      d.compliance_access !== undefined,
    { message: 'At least one field to update is required' }
  )

async function syncStaffRecord(
  admin: ReturnType<typeof createAdminClient>,
  uid: string,
  role: z.infer<typeof adminStaffRoleSchema>,
  fullName: string,
  email: string | null,
  options?: { primaryLocationId?: number | null; npi?: string | null }
) {
  const locationPatch =
    options && 'primaryLocationId' in options
      ? { location_id: options.primaryLocationId ?? null }
      : {}
  const npiPatch = options && 'npi' in options ? { npi: options.npi ?? null } : {}

  if (isPhysicianRole(role)) {
    const { data: existing } = await admin.from('doctors').select('id').eq('user_id', uid).maybeSingle()
    const payload = {
      full_name: fullName,
      email,
      ...locationPatch,
      ...npiPatch,
    }
    if (existing) {
      const { error } = await admin.from('doctors').update(payload).eq('user_id', uid)
      if (error) throw error
    } else {
      const { error } = await admin.from('doctors').insert({ user_id: uid, ...payload })
      if (error) throw error
    }
  } else {
    const { data: existing } = await admin.from('nurses').select('id').eq('user_id', uid).maybeSingle()
    const payload = {
      full_name: fullName,
      is_active: true,
      ...locationPatch,
    }
    if (existing) {
      const { error } = await admin.from('nurses').update(payload).eq('user_id', uid)
      if (error) throw error
    } else {
      const { error } = await admin.from('nurses').insert({ user_id: uid, ...payload })
      if (error) throw error
    }
  }
}

async function syncUserLocations(
  admin: ReturnType<typeof createAdminClient>,
  uid: string,
  locationIds: number[]
) {
  await admin.from('user_locations').delete().eq('user_uid', uid)
  if (locationIds.length === 0) return
  const { error } = await admin.from('user_locations').insert(
    locationIds.map((lid) => ({
      user_uid: uid,
      profile_id: uid,
      location_id: lid,
    }))
  )
  if (error) throw error
}

export async function GET(_req: NextRequest) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()

    const [{ data: profiles, error }, locations, { data: userLocations }, { data: doctors }] =
      await Promise.all([
        admin
          .from('profiles')
          .select('uid, role, full_name, email, active, created_at, avatar_id, compliance_access')
          .neq('role', 'admin')
          .order('created_at', { ascending: false }),
        fetchAllLocations(admin),
        admin.from('user_locations').select('user_uid, location_id'),
        admin.from('doctors').select('user_id, npi'),
      ])

    if (error) throw error

    const locationTitleById = new Map((locations ?? []).map((l) => [l.id, l.title]))
    const locationsByUser = new Map<string, { id: number; title: string }[]>()

    for (const row of userLocations ?? []) {
      if (!row.user_uid || row.location_id == null) continue
      const title = locationTitleById.get(row.location_id) ?? `Location #${row.location_id}`
      const list = locationsByUser.get(row.user_uid) ?? []
      list.push({ id: row.location_id, title })
      locationsByUser.set(row.user_uid, list)
    }

    const npiByUserId = new Map<string, string | null>()
    for (const d of doctors ?? []) {
      if (!d.user_id) continue
      npiByUserId.set(d.user_id, (d.npi as string | null)?.trim() || null)
    }

    const users = (profiles ?? []).map((p) => ({
      ...p,
      email: p.email ?? null,
      active: p.active !== false,
      compliance_access: p.compliance_access === true,
      avatar_id: p.avatar_id ?? null,
      avatar_url: resolveStaffAvatarUrl(p.avatar_id ?? null),
      assigned_locations: locationsByUser.get(p.uid) ?? [],
      npi: isPhysicianRole(p.role) ? (npiByUserId.get(p.uid) ?? null) : null,
    }))

    return NextResponse.json({ users, locations: locations ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser()
    const body = await req.json()

    let validated: z.infer<typeof createUserSchema>
    try {
      validated = createUserSchema.parse(body)
    } catch (e: unknown) {
      const issues = e && typeof e === 'object' && 'issues' in e ? (e as { issues: unknown }).issues : undefined
      throw new ValidationError('Invalid input', { issues })
    }

    const { name, email, password, role, location_ids, compliance_access } = validated
    const grantCompliance = isDoctorRole(role) && compliance_access === true
    const admin = createAdminClient()

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, full_name: name, role },
    })
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 })
    }
    if (!authData.user) throw new Error('User creation failed')

    const uid = authData.user.id
    const fullName = name.trim()
    const primaryLocationId = location_ids?.[0] ?? null

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('uid', uid)
      .maybeSingle()

    if (existingProfile) {
      const { error: profileErr } = await admin
        .from('profiles')
        .update({ role, full_name: fullName, email, active: true, compliance_access: grantCompliance })
        .eq('uid', uid)
      if (profileErr) {
        console.error('[admin/users] profile update:', profileErr.message)
        await admin.auth.admin.deleteUser(uid).catch(() => {})
        return NextResponse.json(
          { error: `Profile save failed: ${profileErr.message}` },
          { status: 500 }
        )
      }
    } else {
      const { error: profileErr } = await admin.from('profiles').insert({
        id: uid,
        uid,
        role,
        full_name: fullName,
        email,
        active: true,
        compliance_access: grantCompliance,
      })
      if (profileErr) {
        console.error('[admin/users] profile insert:', profileErr.message)
        await admin.auth.admin.deleteUser(uid).catch(() => {})
        return NextResponse.json(
          { error: `Profile save failed: ${profileErr.message}` },
          { status: 500 }
        )
      }
    }

    try {
      await syncStaffRecord(
        admin,
        uid,
        role,
        fullName,
        email,
        location_ids?.length ? { primaryLocationId } : undefined
      )
    } catch (staffErr) {
      const msg = staffErr instanceof Error ? staffErr.message : 'Staff record failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    if (location_ids?.length) {
      try {
        await syncUserLocations(admin, uid, location_ids)
      } catch (locErr) {
        const msg = locErr instanceof Error ? locErr.message : 'Location assignment failed'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }

    await logAuditEvent('user_created', 'user', uid, {
      created_by: adminUser.id,
      role,
      email,
    })

    return NextResponse.json({ success: true, uid })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser()
    const body = await req.json()

    let validated: z.infer<typeof patchUserSchema>
    try {
      validated = patchUserSchema.parse(body)
    } catch (e: unknown) {
      const issues = e && typeof e === 'object' && 'issues' in e ? (e as { issues: unknown }).issues : undefined
      throw new ValidationError('Invalid input', { issues })
    }

    const { uid, full_name, email, role, active, password, location_ids, npi, compliance_access } = validated
    if (uid === adminUser.id && (active === false || role)) {
      throw new ValidationError('You cannot deactivate or change your own role')
    }

    const admin = createAdminClient()
    const { data: targetProfile, error: targetErr } = await admin
      .from('profiles')
      .select('uid, role, full_name, email, active, compliance_access')
      .eq('uid', uid)
      .maybeSingle()

    if (targetErr) throw targetErr
    if (!targetProfile) throw new ValidationError('User not found')
    if (targetProfile.role === 'admin') throw new ValidationError('Admin accounts cannot be edited here')

    const nextRole = (role ?? targetProfile.role) as z.infer<typeof adminStaffRoleSchema>
    if (!adminStaffRoleSchema.safeParse(nextRole).success) {
      throw new ValidationError('Role must be doctor, fnp, pa, or nurse')
    }

    const nextName = full_name ?? targetProfile.full_name ?? ''
    const nextEmail = email ?? targetProfile.email ?? null
    const nextActive = active ?? targetProfile.active !== false
    if (email && email !== targetProfile.email) {
      const { error: authEmailErr } = await admin.auth.admin.updateUserById(uid, { email })
      if (authEmailErr) {
        return NextResponse.json({ error: authEmailErr.message }, { status: 400 })
      }
    }

    if (password) {
      const { error: authPwErr } = await admin.auth.admin.updateUserById(uid, { password })
      if (authPwErr) {
        return NextResponse.json({ error: authPwErr.message }, { status: 400 })
      }
    }

    if (compliance_access === true && !isDoctorRole(nextRole)) {
      throw new ValidationError('Compliance access is only available for doctors')
    }

    const currentCompliance = targetProfile.compliance_access === true
    const roleChanging = role !== undefined && role !== targetProfile.role
    const grantingCompliance = compliance_access === true && isDoctorRole(nextRole)
    const demotingWithCompliance =
      currentCompliance && roleChanging && !isDoctorRole(nextRole)
    const promotingWithCompliance =
      grantingCompliance && roleChanging && !isDoctorRole(targetProfile.role)

    const buildBaseProfileUpdate = (): Record<string, unknown> => {
      const update: Record<string, unknown> = {}
      if (full_name !== undefined) update.full_name = nextName
      if (email !== undefined) update.email = nextEmail
      if (role !== undefined) update.role = nextRole
      if (active !== undefined) update.active = nextActive
      return update
    }

    if (demotingWithCompliance) {
      const { error: clearErr } = await admin
        .from('profiles')
        .update({ compliance_access: false })
        .eq('uid', uid)
      if (clearErr) throw clearErr

      const step2 = buildBaseProfileUpdate()
      step2.compliance_access = false
      if (Object.keys(step2).length > 0) {
        const { error: profileErr } = await admin.from('profiles').update(step2).eq('uid', uid)
        if (profileErr) throw profileErr
      }
    } else if (promotingWithCompliance) {
      const step1 = buildBaseProfileUpdate()
      if (Object.keys(step1).length > 0) {
        const { error: profileErr } = await admin.from('profiles').update(step1).eq('uid', uid)
        if (profileErr) throw profileErr
      }

      const { error: grantErr } = await admin
        .from('profiles')
        .update({ compliance_access: true })
        .eq('uid', uid)
      if (grantErr) throw grantErr
    } else {
      const profileUpdate = buildBaseProfileUpdate()
      if (compliance_access !== undefined) {
        profileUpdate.compliance_access = isDoctorRole(nextRole) ? compliance_access : false
      } else if (role !== undefined && !isDoctorRole(nextRole)) {
        profileUpdate.compliance_access = false
      }

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileErr } = await admin.from('profiles').update(profileUpdate).eq('uid', uid)
        if (profileErr) throw profileErr
      }
    }

    let parsedNpi: string | null | undefined
    if (npi !== undefined) {
      if (!isPhysicianRole(nextRole)) {
        throw new ValidationError('NPI can only be set for physician accounts')
      }
      try {
        parsedNpi = parseDoctorNpi(npi)
      } catch (e) {
        throw new ValidationError(e instanceof Error ? e.message : 'Invalid NPI')
      }
    }

    if (
      full_name !== undefined ||
      email !== undefined ||
      role !== undefined ||
      location_ids !== undefined ||
      parsedNpi !== undefined
    ) {
      await syncStaffRecord(admin, uid, nextRole, nextName, nextEmail, {
        ...(location_ids !== undefined
          ? { primaryLocationId: location_ids[0] ?? null }
          : {}),
        ...(parsedNpi !== undefined ? { npi: parsedNpi } : {}),
      })
    }

    if (location_ids !== undefined) {
      await syncUserLocations(admin, uid, location_ids)
    }

    if (active !== undefined) {
      if (nextActive) {
        await admin.auth.admin.updateUserById(uid, { ban_duration: 'none' }).catch(() => {})
      } else {
        await admin.auth.admin.updateUserById(uid, { ban_duration: '876000h' }).catch(() => {})
      }
    }

    await logAuditEvent('user_updated', 'user', uid, {
      updated_by: adminUser.id,
      fields: Object.keys(validated).filter((k) => k !== 'uid' && k !== 'password'),
      password_reset: password !== undefined,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser()
    const body = await req.json().catch(() => ({}))
    const uid = typeof body?.uid === 'string' ? body.uid.trim() : ''
    if (!uid) throw new ValidationError('uid is required')
    if (uid === adminUser.id) throw new ValidationError('You cannot delete your own account')

    const admin = createAdminClient()
    const { data: targetProfile, error: targetErr } = await admin
      .from('profiles')
      .select('uid, role, full_name, email, active')
      .eq('uid', uid)
      .maybeSingle()

    if (targetErr) throw targetErr
    if (!targetProfile) throw new ValidationError('User not found')
    if (targetProfile.role === 'admin') throw new ValidationError('Admin accounts cannot be deleted here')
    if (targetProfile.active === false) {
      return NextResponse.json({ success: true, alreadyDeleted: true })
    }

    const { error: updateErr } = await admin.from('profiles').update({ active: false }).eq('uid', uid)
    if (updateErr) throw updateErr

    await admin.auth.admin.updateUserById(uid, { ban_duration: '876000h' }).catch(() => {})

    await logAuditEvent('user_deleted', 'user', uid, {
      deleted_by: adminUser.id,
      role: targetProfile.role,
      email: targetProfile.email,
      full_name: targetProfile.full_name,
      soft_delete: true,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handleApiError(err)
  }
}
