import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { logAuditEvent } from '@/lib/audit-server'
import { fetchTenantLocationIds, requireClinicManager } from '@/lib/manage/auth'
import { ADMIN_STAFF_ROLE_VALUES } from '@/lib/roles'
import { signupPasswordSchema } from '@/lib/signup-requests/types'
import { syncStaffRecord, syncUserLocations } from '@/lib/users/staff-sync'

export const dynamic = 'force-dynamic'

const staffRoleSchema = z.enum(ADMIN_STAFF_ROLE_VALUES)

const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: signupPasswordSchema,
  role: staffRoleSchema,
  location_ids: z.array(z.number().int().positive()).min(1, 'Assign at least one location'),
})

const patchStaffSchema = z
  .object({
    uid: z.string().uuid(),
    full_name: z.string().trim().min(2).max(100).optional(),
    role: staffRoleSchema.optional(),
    active: z.boolean().optional(),
    password: signupPasswordSchema.optional(),
    location_ids: z.array(z.number().int().positive()).min(1, 'Assign at least one location').optional(),
  })
  .refine((d) => Object.keys(d).length > 1, { message: 'At least one field to update is required' })

function invalid(e: z.ZodError): never {
  throw new ValidationError(e.issues[0]?.message || 'Invalid input', { issues: e.issues })
}

async function assertOwnLocations(
  admin: Parameters<typeof fetchTenantLocationIds>[0],
  tenantId: number,
  locationIds: number[]
) {
  const own = await fetchTenantLocationIds(admin, tenantId)
  if (locationIds.some((id) => !own.has(id))) {
    throw new ValidationError('Locations must belong to your clinic')
  }
}

/** Staff in the manager's tenant (clinical roles only), with their assigned locations. */
export async function GET() {
  try {
    const { tenantId, admin } = await requireClinicManager()

    const [{ data: profiles, error }, { data: locations, error: locErr }] = await Promise.all([
      admin
        .from('profiles')
        .select('uid, role, full_name, email, active, created_at')
        .eq('tenant_id', tenantId)
        .in('role', [...ADMIN_STAFF_ROLE_VALUES])
        .order('created_at', { ascending: false }),
      // Locations are added by MEMR admins; managers assign staff to the active ones.
      admin.from('locations').select('id, title').eq('tenant_id', tenantId).eq('is_active', true).order('title'),
    ])
    if (error) throw error
    if (locErr) throw locErr

    const uids = (profiles ?? []).map((p) => p.uid as string)
    const { data: links } = uids.length
      ? await admin.from('user_locations').select('user_uid, location_id').in('user_uid', uids)
      : { data: [] as { user_uid: string; location_id: number }[] }

    const titleById = new Map((locations ?? []).map((l) => [l.id as number, l.title as string]))
    const byUser = new Map<string, { id: number; title: string }[]>()
    for (const link of links ?? []) {
      const title = titleById.get(link.location_id as number)
      if (!title) continue
      const list = byUser.get(link.user_uid as string) ?? []
      list.push({ id: link.location_id as number, title })
      byUser.set(link.user_uid as string, list)
    }

    return NextResponse.json({
      staff: (profiles ?? []).map((p) => ({
        ...p,
        active: p.active !== false,
        locations: byUser.get(p.uid as string) ?? [],
      })),
      locations: locations ?? [],
    })
  } catch (e) {
    return handleApiError(e)
  }
}

/** Add a staff member to the manager's clinic. Same writes as POST /api/admin/users. */
export async function POST(req: NextRequest) {
  try {
    const { user, tenantId, admin } = await requireClinicManager()
    const parsed = createStaffSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) invalid(parsed.error)
    const { name, email, password, role, location_ids } = parsed.data

    await assertOwnLocations(admin, tenantId, location_ids)

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, full_name: name, role },
    })
    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message || 'User creation failed' }, { status: 400 })
    }
    const uid = authData.user.id

    try {
      const profile = { role, full_name: name, email, active: true, compliance_access: false, tenant_id: tenantId }
      const { data: existing } = await admin.from('profiles').select('id').eq('uid', uid).maybeSingle()
      const { error: profileErr } = existing
        ? await admin.from('profiles').update(profile).eq('uid', uid)
        : await admin.from('profiles').insert({ id: uid, uid, ...profile })
      if (profileErr) throw new Error(`Profile save failed: ${profileErr.message}`)

      await syncStaffRecord(admin, uid, role, name, email, { primaryLocationId: location_ids[0] })
      await syncUserLocations(admin, uid, location_ids)
    } catch (e) {
      await admin.auth.admin.deleteUser(uid).catch(() => {})
      throw e
    }

    await logAuditEvent('user_created', 'user', uid, {
      created_by: user.id,
      source: 'clinic_manager',
      tenant_id: tenantId,
      role,
      email,
    })

    return NextResponse.json({ success: true, uid })
  } catch (e) {
    return handleApiError(e)
  }
}

/** Edit or deactivate a staff member of the manager's own clinic. */
export async function PATCH(req: NextRequest) {
  try {
    const { user, tenantId, admin } = await requireClinicManager()
    const parsed = patchStaffSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) invalid(parsed.error)
    const { uid, full_name, role, active, password, location_ids } = parsed.data

    const { data: target, error: targetErr } = await admin
      .from('profiles')
      .select('uid, role, full_name, email, tenant_id')
      .eq('uid', uid)
      .maybeSingle()
    if (targetErr) throw targetErr
    // Only clinical staff of this tenant — never other tenants, managers or admins.
    if (
      !target ||
      target.tenant_id !== tenantId ||
      !(ADMIN_STAFF_ROLE_VALUES as readonly string[]).includes(target.role as string)
    ) {
      throw new ValidationError('Staff member not found')
    }

    if (location_ids) await assertOwnLocations(admin, tenantId, location_ids)

    if (password) {
      const { error } = await admin.auth.admin.updateUserById(uid, { password })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const nextRole = (role ?? target.role) as z.infer<typeof staffRoleSchema>
    const nextName = full_name ?? (target.full_name as string) ?? ''
    const patch: Record<string, unknown> = {}
    if (full_name !== undefined) patch.full_name = nextName
    if (role !== undefined) patch.role = nextRole
    if (active !== undefined) patch.active = active
    // Compliance access is doctor-only and admin-granted; drop it if the role changes away.
    if (role !== undefined && nextRole !== 'doctor') patch.compliance_access = false
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from('profiles').update(patch).eq('uid', uid)
      if (error) throw error
    }

    if (full_name !== undefined || role !== undefined || location_ids !== undefined) {
      await syncStaffRecord(admin, uid, nextRole, nextName, (target.email as string) ?? null, {
        ...(location_ids ? { primaryLocationId: location_ids[0] } : {}),
      })
    }
    if (location_ids) await syncUserLocations(admin, uid, location_ids)

    if (active !== undefined) {
      await admin.auth.admin
        .updateUserById(uid, { ban_duration: active ? 'none' : '876000h' })
        .catch(() => {})
    }

    await logAuditEvent('user_updated', 'user', uid, {
      updated_by: user.id,
      source: 'clinic_manager',
      tenant_id: tenantId,
      fields: Object.keys(parsed.data).filter((k) => k !== 'uid' && k !== 'password'),
      password_reset: password !== undefined,
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
