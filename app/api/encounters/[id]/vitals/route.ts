import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchProfileFields, fetchUserRole } from '@/lib/fetch-user-role'
import { guardEncounterAccess } from '@/lib/encounters/guard'
import {
  loadLatestVitalsForEncounter,
  saveEncounterVitals,
  vitalsLastAuditFromRow,
} from '@/lib/vitals/save-encounter-vitals'
import { getProfileId } from '@/lib/status-timeline'
import { CLINICAL_STAFF_WITH_ADMIN_ROLE_SET, canEditClinicalEncounterContent, mapRoleToEnum } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const vitalsRecordBodySchema = z.object({
  bp_systolic: z.number().int().min(70).max(250).nullable().optional(),
  bp_diastolic: z.number().int().min(40).max(150).nullable().optional(),
  heart_rate: z.number().int().min(30).max(220).nullable().optional(),
  respiratory_rate: z.number().int().min(8).max(40).nullable().optional(),
  temperature: z.number().nullable().optional(),
  temperature_unit: z.enum(['F', 'C']).optional().nullable(),
  spo2: z.number().int().min(0).max(100).nullable().optional(),
  weight: z.number().nullable().optional(),
  weight_unit: z.enum(['lbs', 'kg']).optional().nullable(),
  height: z.number().nullable().optional(),
  height_unit: z.enum(['in', 'cm']).optional().nullable(),
  bmi: z.number().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

async function resolveEditor(supabase: Awaited<ReturnType<typeof createClient>>, user: { id: string; email?: string | null }, role: string) {
  const profile = await fetchProfileFields(supabase, user.id, 'full_name, email', {
    email: user.email,
  })
  const editorName =
    (typeof profile?.full_name === 'string' && profile.full_name.trim()) ||
    (typeof profile?.email === 'string' && profile.email) ||
    user.email ||
    'Unknown'
  return { userId: user.id, role, editorName }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!roleInfo?.role || !CLINICAL_STAFF_WITH_ADMIN_ROLE_SET.has(roleInfo.role)) {
      throw new AuthorizationError()
    }

    const admin = await guardEncounterAccess(user.id, encounterId, {
      requireDoctorAssignment: false,
    })

    const data = await loadLatestVitalsForEncounter(admin, encounterId)
    return NextResponse.json({
      data,
      last_audit: vitalsLastAuditFromRow(data as Record<string, unknown> | null),
    })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    const mappedRole = mapRoleToEnum(roleInfo?.role ?? '')
    if (!mappedRole || !canEditClinicalEncounterContent(mappedRole)) {
      throw new AuthorizationError()
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = vitalsRecordBodySchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = await guardEncounterAccess(user.id, encounterId, {
      requireDoctorAssignment: false,
    })

    const profileId = await getProfileId(supabase, user.id)
    const editor = await resolveEditor(supabase, user, mappedRole)
    const data = await saveEncounterVitals(admin, {
      encounterId,
      vitals: parsed.data,
      profileId,
      editor,
      mode: 'insert',
    })

    return NextResponse.json({
      success: true,
      data,
      last_audit: vitalsLastAuditFromRow(data as unknown as Record<string, unknown>),
    })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    const mappedRole = mapRoleToEnum(roleInfo?.role ?? '')
    if (!mappedRole || !canEditClinicalEncounterContent(mappedRole)) {
      throw new AuthorizationError()
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = vitalsRecordBodySchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = await guardEncounterAccess(user.id, encounterId, {
      requireDoctorAssignment: false,
    })

    const profileId = await getProfileId(supabase, user.id)
    const editor = await resolveEditor(supabase, user, mappedRole)
    const data = await saveEncounterVitals(admin, {
      encounterId,
      vitals: parsed.data,
      profileId,
      editor,
      mode: 'upsert',
    })

    return NextResponse.json({
      data,
      last_audit: vitalsLastAuditFromRow(data as unknown as Record<string, unknown>),
    })
  } catch (e) {
    return handleApiError(e)
  }
}
