import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthorizationError } from '@/lib/api-error-handler'
import { isAllowedByLocationScope, type LocationScope } from '@/lib/locations/scope'
import { complianceDateRange, formatTrendDate } from './date-presets'
import {
  isPhysicianReviewComplete,
  requiredReviewCount,
  reviewPercentage,
  remainingReviewCount,
  type PhysicianReviewStatus,
} from './physician-review'
import type {
  ComplianceDashboardResponse,
  ComplianceCatalogOrder,
  ComplianceDiagnosis,
  CompliancePendingReview,
  ComplianceProviderSummary,
  ComplianceQueryParams,
  ComplianceReviewDetail,
  ComplianceTrendPoint,
  ComplianceVelocityPoint,
} from './types'

type ProfileRow = {
  id?: string
  uid?: string
  full_name: string | null
  role: string | null
}

type ReviewRow = {
  id: number
  encounter_id: number
  patient_id: number
  documenting_user_id: string
  review_status: string
  reviewed_at: string | null
  notes: string | null
  findings: string | null
  created_at: string
  encounters: {
    id: number
    encounter_code: string | null
    status: string
    updated_at: string
    intake_id: number | null
    appointments: {
      locations: { id?: number | null; title: string | null } | { id?: number | null; title: string | null }[] | null
    } | { locations: { id?: number | null; title: string | null } | { id?: number | null; title: string | null }[] | null }[] | null
  } | {
    id: number
    encounter_code: string | null
    status: string
    updated_at: string
    intake_id: number | null
    appointments: unknown
  }[] | null
  patients: {
    first_name: string | null
    last_name: string | null
    patient_code: string | null
    date_of_birth: string | null
    locations: { id?: number | null; title: string | null } | { id?: number | null; title: string | null }[] | null
  } | {
    first_name: string | null
    last_name: string | null
    patient_code: string | null
    date_of_birth: string | null
    locations: unknown
  }[] | null
}

type LocationRef = { id?: number | null; title: string | null }

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function roleLabel(role: string | null | undefined): string {
  const r = (role ?? '').toLowerCase()
  if (r === 'fnp') return 'NP'
  if (r === 'pa') return 'PA'
  if (r === 'doctor') return 'MD'
  return r ? r.toUpperCase() : '—'
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

type ApptWithLoc = {
  locations: LocationRef | LocationRef[] | null
}

function resolveLocationRef(row: ReviewRow): LocationRef | null {
  const enc = first(row.encounters)
  const appt = first(enc?.appointments as ApptWithLoc | ApptWithLoc[] | null | undefined)
  const apptLoc = first(appt?.locations)
  const pat = first(row.patients)
  const patLoc = first(pat?.locations as LocationRef | LocationRef[] | null)
  return apptLoc ?? patLoc ?? null
}

function resolveLocationId(row: ReviewRow): number | null {
  const loc = resolveLocationRef(row)
  return typeof loc?.id === 'number' && Number.isFinite(loc.id) ? loc.id : null
}

function resolveClinic(row: ReviewRow): string {
  return resolveLocationRef(row)?.title?.trim() || '—'
}

function filterRowsByLocationScope(rows: ReviewRow[], scope: LocationScope): ReviewRow[] {
  if (scope.unrestricted) return rows
  return rows.filter((row) => isAllowedByLocationScope(scope, resolveLocationId(row)))
}

function profileForUser(profiles: Map<string, ProfileRow>, userId: string): ProfileRow | null {
  for (const p of profiles.values()) {
    if (p.id === userId || p.uid === userId) return p
  }
  return null
}

function providerName(
  profiles: Map<string, ProfileRow>,
  doctorNames: Map<string, string>,
  userId: string
): string {
  const fromDoctor = doctorNames.get(userId)
  if (fromDoctor) return fromDoctor
  const p = profileForUser(profiles, userId)
  return p?.full_name?.trim() || 'Unknown provider'
}

function providerDisplayName(
  profiles: Map<string, ProfileRow>,
  doctorNames: Map<string, string>,
  userId: string
): string {
  const name = providerName(profiles, doctorNames, userId)
  const p = profileForUser(profiles, userId)
  const role = roleLabel(p?.role)
  return role !== '—' ? `${name}, ${role}` : name
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

function pendingUiStatus(reviewStatus: string, createdAt: string): CompliancePendingReview['status'] {
  if (reviewStatus !== 'pending') return 'in_review'
  return daysSince(createdAt) > 7 ? 'overdue' : 'pending'
}

function riskFromDays(days: number): number {
  return Math.min(10, parseFloat((days * 1.15).toFixed(1)))
}

async function loadProfiles(admin: SupabaseClient, userIds: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>()
  if (userIds.length === 0) return map

  const [byId, byUid] = await Promise.all([
    admin.from('profiles').select('id, uid, full_name, role').in('id', userIds),
    admin.from('profiles').select('id, uid, full_name, role').in('uid', userIds),
  ])

  for (const row of [...(byId.data ?? []), ...(byUid.data ?? [])] as ProfileRow[]) {
    if (row.id) map.set(row.id, row)
    if (row.uid) map.set(row.uid, row)
  }
  return map
}

async function loadDoctorNames(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (userIds.length === 0) return map

  const { data } = await admin
    .from('doctors')
    .select('user_id, full_name')
    .in('user_id', userIds)

  for (const row of data ?? []) {
    const uid = (row as { user_id?: string | null }).user_id
    const name = (row as { full_name?: string | null }).full_name?.trim()
    if (uid && name) map.set(uid, name)
  }
  return map
}

async function loadChiefComplaints(
  admin: SupabaseClient,
  intakeIds: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (intakeIds.length === 0) return map

  const { data } = await admin
    .from('intake_form')
    .select('id, chief_complaint')
    .in('id', intakeIds)

  for (const row of data ?? []) {
    const cc = (row as { id: number; chief_complaint: string | null }).chief_complaint
    if (cc?.trim()) map.set(Number(row.id), cc.trim())
  }
  return map
}

type CatalogOrderJoinRow = {
  id: number
  qty: number
  product:
    | { product?: string | null }
    | { product?: string | null }[]
    | null
}

type CatalogOrderAuditRow = {
  user_id: string | null
  user_name: string | null
  metadata: Record<string, unknown> | null
}

type DiagnosisJoinRow = {
  id: number
  diagnosis:
    | { icd_code?: string | null; description?: string | null }
    | { icd_code?: string | null; description?: string | null }[]
    | null
}

type DiagnosisAuditRow = {
  user_id: string | null
  user_name: string | null
  user_email: string | null
  metadata: Record<string, unknown> | null
}

function joinedProductName(row: CatalogOrderJoinRow): string {
  const product = Array.isArray(row.product) ? row.product[0] : row.product
  return product?.product?.trim() || 'Unknown product'
}

export async function loadDiagnosesForCompliance(
  admin: SupabaseClient,
  encounterId: number
): Promise<ComplianceDiagnosis[]> {
  const [diagnosesResult, auditResult] = await Promise.all([
    admin
      .from('encounter_diagnoses')
      .select('id, diagnosis:diagnosis_id(icd_code, description)')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true }),
    admin
      .from('audit_logs')
      .select('user_id, user_name, user_email, metadata')
      .eq('resource_type', 'encounter')
      .eq('resource_id', String(encounterId))
      .eq('action', 'encounter_updated')
      .contains('metadata', { section: 'diagnoses', operation: 'create' })
      .order('created_at', { ascending: true }),
  ])

  if (diagnosesResult.error) throw diagnosesResult.error
  if (auditResult.error) throw auditResult.error

  const audits = (auditResult.data ?? []) as DiagnosisAuditRow[]
  const auditUserIds = [
    ...new Set(
      audits
        .map((audit) => audit.user_id)
        .filter((userId): userId is string => Boolean(userId))
    ),
  ]
  const [profiles, doctorNames] = await Promise.all([
    loadProfiles(admin, auditUserIds),
    loadDoctorNames(admin, auditUserIds),
  ])
  const creators = new Map<number, string>()

  for (const audit of audits) {
    const encounterDiagnosisId = Number(audit.metadata?.encounter_diagnosis_id)
    if (!Number.isInteger(encounterDiagnosisId) || encounterDiagnosisId <= 0) continue

    const profile = audit.user_id ? profileForUser(profiles, audit.user_id) : null
    const addedBy =
      audit.user_name?.trim() ||
      (audit.user_id ? doctorNames.get(audit.user_id) : null) ||
      profile?.full_name?.trim() ||
      audit.user_email?.trim() ||
      'Unknown user'

    // A diagnosis has one creator. Keep the earliest matching creation event if
    // historical retries produced duplicate audit rows.
    if (!creators.has(encounterDiagnosisId)) {
      creators.set(encounterDiagnosisId, addedBy)
    }
  }

  return ((diagnosesResult.data ?? []) as DiagnosisJoinRow[]).map((row) => {
    const diagnosis = first(row.diagnosis)
    return {
      id: Number(row.id),
      icdCode: diagnosis?.icd_code?.trim() || '—',
      description: diagnosis?.description?.trim() || 'Unknown diagnosis',
      addedBy: creators.get(Number(row.id)) ?? 'Unknown user',
    }
  })
}

async function loadCatalogOrdersForCompliance(
  admin: SupabaseClient,
  encounterId: number
): Promise<{ medications: ComplianceCatalogOrder[]; orders: ComplianceCatalogOrder[] }> {
  const [labsResult, medicationsResult, auditResult] = await Promise.all([
    admin
      .from('lab_orders')
      .select('id, qty, product:lab_product_id(product)')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true }),
    admin
      .from('medication_orders')
      .select('id, qty, product:medication_product_id(product)')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true }),
    admin
      .from('audit_logs')
      .select('user_id, user_name, metadata')
      .eq('resource_type', 'encounter')
      .eq('resource_id', String(encounterId))
      .eq('action', 'encounter_updated')
      .contains('metadata', { section: 'catalog_orders', operation: 'create' }),
  ])

  if (labsResult.error) throw labsResult.error
  if (medicationsResult.error) throw medicationsResult.error
  if (auditResult.error) throw auditResult.error

  const audits = (auditResult.data ?? []) as CatalogOrderAuditRow[]
  const auditUserIds = [
    ...new Set(
      audits
        .map((audit) => audit.user_id)
        .filter((userId): userId is string => Boolean(userId))
    ),
  ]
  const [profiles, doctorNames] = await Promise.all([
    loadProfiles(admin, auditUserIds),
    loadDoctorNames(admin, auditUserIds),
  ])
  const creators = new Map<string, string>()

  for (const audit of audits) {
    const metadata = audit.metadata
    const kind = metadata?.kind
    const ids = Array.isArray(metadata?.order_ids) ? metadata.order_ids : []
    if (kind !== 'lab' && kind !== 'medication') continue

    const addedBy =
      audit.user_name?.trim() ||
      (audit.user_id
        ? providerName(profiles, doctorNames, audit.user_id)
        : 'Unknown provider')

    for (const rawId of ids) {
      const orderId = Number(rawId)
      if (Number.isInteger(orderId) && orderId > 0) {
        creators.set(`${kind}:${orderId}`, addedBy)
      }
    }
  }

  const mapRows = (
    rows: CatalogOrderJoinRow[],
    kind: 'lab' | 'medication'
  ): ComplianceCatalogOrder[] =>
    rows.map((row) => ({
      product: joinedProductName(row),
      qty: Number(row.qty),
      addedBy: creators.get(`${kind}:${row.id}`) ?? 'Unknown provider',
    }))

  return {
    medications: mapRows(
      (medicationsResult.data ?? []) as CatalogOrderJoinRow[],
      'medication'
    ),
    orders: mapRows((labsResult.data ?? []) as CatalogOrderJoinRow[], 'lab'),
  }
}

function filterRowsInRange(rows: ReviewRow[], start: Date, end: Date): ReviewRow[] {
  return rows.filter(row => {
    const enc = first(row.encounters)
    const ts = enc?.updated_at ?? row.created_at
    const d = new Date(ts)
    return d >= start && d <= end
  })
}

function buildProviderSummaries(
  rows: ReviewRow[],
  profiles: Map<string, ProfileRow>,
  doctorNames: Map<string, string>
): ComplianceProviderSummary[] {
  const byUser = new Map<string, ReviewRow[]>()
  for (const row of rows) {
    const list = byUser.get(row.documenting_user_id) ?? []
    list.push(row)
    byUser.set(row.documenting_user_id, list)
  }

  const summaries: ComplianceProviderSummary[] = []

  for (const [userId, userRows] of byUser) {
    const profile = profileForUser(profiles, userId)
    const name = providerName(profiles, doctorNames, userId)
    const role = roleLabel(profile?.role)
    const total = userRows.length
    const required = requiredReviewCount(total)
    const reviewed = userRows.filter(r => isPhysicianReviewComplete(r.review_status as PhysicianReviewStatus)).length
    const pending = userRows.filter(r => r.review_status === 'pending').length
    const overdue = userRows.filter(r => r.review_status === 'pending' && daysSince(r.created_at) > 7).length
    const clinicCounts = new Map<string, number>()
    for (const r of userRows) {
      const c = resolveClinic(r)
      clinicCounts.set(c, (clinicCounts.get(c) ?? 0) + 1)
    }
    const clinic = [...clinicCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

    summaries.push({
      id: userId,
      name,
      role,
      clinic,
      total,
      required,
      reviewed,
      pending,
      overdue,
      compliance: reviewPercentage(reviewed, required),
      avatar: initials(name),
    })
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name))
}

function aggregateKpi(providers: ComplianceProviderSummary[]) {
  const total = providers.reduce((s, p) => s + p.total, 0)
  const required = providers.reduce((s, p) => s + p.required, 0)
  const reviewed = providers.reduce((s, p) => s + p.reviewed, 0)
  const pending = providers.reduce((s, p) => s + p.pending, 0)
  const overdue = providers.reduce((s, p) => s + p.overdue, 0)
  const remaining = remainingReviewCount(required, reviewed)
  return {
    total,
    required,
    reviewed,
    remaining,
    compliance: reviewPercentage(reviewed, required),
    pending,
    overdue,
  }
}

function applyProviderFilters(
  providers: ComplianceProviderSummary[],
  params: ComplianceQueryParams
): ComplianceProviderSummary[] {
  let list = providers

  if (params.provider && params.provider !== '__all__') {
    list = list.filter(p => p.name === params.provider)
  }
  if (params.clinic && params.clinic !== '__all__') {
    list = list.filter(p => p.clinic === params.clinic)
  }
  if (params.status && params.status !== 'all') {
    list = list.filter(p => {
      if (params.status === 'compliant') return p.compliance >= 90
      if (params.status === 'warning') return p.compliance >= 70 && p.compliance < 90
      if (params.status === 'critical') return p.compliance < 70
      return true
    })
  }

  return list
}

function buildTrend(rows: ReviewRow[], start: Date, end: Date): ComplianceTrendPoint[] {
  const days: ComplianceTrendPoint[] = []
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)

  while (cursor <= end) {
    const dayStart = new Date(cursor)
    const dayEnd = new Date(cursor)
    dayEnd.setHours(23, 59, 59, 999)

    const dayRows = rows.filter(row => {
      const enc = first(row.encounters)
      const ts = new Date(enc?.updated_at ?? row.created_at)
      return ts >= dayStart && ts <= dayEnd
    })

    const reviewed = dayRows.filter(r =>
      r.reviewed_at &&
      new Date(r.reviewed_at) >= dayStart &&
      new Date(r.reviewed_at) <= dayEnd &&
      isPhysicianReviewComplete(r.review_status as PhysicianReviewStatus)
    ).length

    const required = requiredReviewCount(dayRows.length)

    days.push({
      date: formatTrendDate(dayStart.toISOString()),
      reviewed,
      required,
      compliance: reviewPercentage(reviewed, required),
    })

    cursor.setDate(cursor.getDate() + 1)
  }

  return days
}

function buildVelocity(rows: ReviewRow[]): ComplianceVelocityPoint[] {
  const buckets = new Map<string, number>()
  for (const row of rows) {
    if (!row.reviewed_at || !isPhysicianReviewComplete(row.review_status as PhysicianReviewStatus)) continue
    const d = new Date(row.reviewed_at)
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay())
    const key = weekStart.toISOString().slice(0, 10)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([, reviews], i) => ({ week: `Wk ${i + 1}`, reviews }))
}

function sparkFromTrend(values: number[]): number[] {
  if (values.length <= 7) return values.length ? values : [0]
  return values.slice(-7)
}

function buildPendingList(
  rows: ReviewRow[],
  profiles: Map<string, ProfileRow>,
  doctorNames: Map<string, string>,
  complaints: Map<number, string>
): CompliancePendingReview[] {
  return rows
    .filter(r => r.review_status === 'pending')
    .map(row => {
      const enc = first(row.encounters)
      const pat = first(row.patients)
      const patientName = [pat?.first_name, pat?.last_name].filter(Boolean).join(' ') || 'Unknown patient'
      const daysPending = daysSince(row.created_at)
      const intakeId = enc?.intake_id

      return {
        id: String(row.id),
        reviewId: row.id,
        encounterId: enc?.encounter_code?.trim() || `ENC-${row.encounter_id}`,
        encounterIdNum: row.encounter_id,
        patientIdNum: row.patient_id,
        patient: patientName,
        patientId: pat?.patient_code?.trim() || `P-${row.patient_id}`,
        provider: providerDisplayName(profiles, doctorNames, row.documenting_user_id),
        clinic: resolveClinic(row),
        encounterDate: (enc?.updated_at ?? row.created_at).slice(0, 10),
        daysPending,
        status: pendingUiStatus(row.review_status, row.created_at),
        riskScore: riskFromDays(daysPending),
        dob: pat?.date_of_birth?.slice(0, 10) ?? '—',
        chiefComplaint: intakeId != null ? complaints.get(intakeId) ?? '—' : '—',
        soap: { subjective: '', objective: '', assessment: '', plan: '' },
        diagnoses: [],
        medications: [],
        orders: [],
      }
    })
    .sort((a, b) => b.daysPending - a.daysPending)
}

export async function loadComplianceDashboard(
  admin: SupabaseClient,
  params: ComplianceQueryParams,
  locationScope: LocationScope = { unrestricted: true, locationIds: [] }
): Promise<ComplianceDashboardResponse> {
  const { start, end } = complianceDateRange(params.preset)

  const { data, error } = await admin
    .from('encounter_physician_reviews')
    .select(`
      id,
      encounter_id,
      patient_id,
      documenting_user_id,
      review_status,
      reviewed_at,
      notes,
      findings,
      created_at,
      encounters!inner (
        id,
        encounter_code,
        status,
        updated_at,
        intake_id,
        appointments:appointment_id (
          locations:location_id ( id, title )
        )
      ),
      patients!inner (
        id,
        first_name,
        last_name,
        patient_code,
        date_of_birth,
        locations:location_id ( id, title )
      )
    `)
    .neq('review_status', 'not_required')

  if (error) throw error

  const allRows = filterRowsByLocationScope((data ?? []) as ReviewRow[], locationScope)
  const rows = filterRowsInRange(allRows, start, end)

  const userIds = [...new Set(rows.map(r => r.documenting_user_id))]
  const [profiles, doctorNames] = await Promise.all([
    loadProfiles(admin, userIds),
    loadDoctorNames(admin, userIds),
  ])

  const intakeIds = rows
    .map(r => first(r.encounters)?.intake_id)
    .filter((id): id is number => id != null && Number.isFinite(id))
  const complaints = await loadChiefComplaints(admin, intakeIds)

  const allProviders = buildProviderSummaries(rows, profiles, doctorNames)
  const filterOptions = {
    providers: allProviders.map(p => p.name).sort(),
    clinics: [...new Set(allProviders.map(p => p.clinic).filter(c => c !== '—'))].sort(),
  }

  const providers = applyProviderFilters(allProviders, params)
  const kpi = aggregateKpi(providers)

  let pendingRows = rows.filter(r => r.review_status === 'pending')
  if (params.provider && params.provider !== '__all__') {
    pendingRows = pendingRows.filter(r => {
      return providerName(profiles, doctorNames, r.documenting_user_id) === params.provider
    })
  }
  if (params.clinic && params.clinic !== '__all__') {
    pendingRows = pendingRows.filter(r => resolveClinic(r) === params.clinic)
  }

  const trend = buildTrend(rows, start, end)
  const velocity = buildVelocity(rows)

  return {
    kpi,
    providers,
    pending: buildPendingList(pendingRows, profiles, doctorNames, complaints),
    trend,
    velocity,
    filterOptions,
    sparklines: {
      total: sparkFromTrend(trend.map(t => t.reviewed + t.required)),
      required: sparkFromTrend(trend.map(t => t.required)),
      reviewed: sparkFromTrend(trend.map(t => t.reviewed)),
      remaining: sparkFromTrend(trend.map(t => Math.max(0, t.required - t.reviewed))),
      compliance: sparkFromTrend(trend.map(t => t.compliance)),
      overdue: sparkFromTrend([kpi.overdue]),
    },
  }
}

export async function loadComplianceReviewDetail(
  admin: SupabaseClient,
  encounterId: number,
  locationScope: LocationScope = { unrestricted: true, locationIds: [] }
): Promise<ComplianceReviewDetail | null> {
  const { data: review, error } = await admin
    .from('encounter_physician_reviews')
    .select(`
      id,
      encounter_id,
      review_status,
      notes,
      findings,
      documenting_user_id,
      created_at,
      encounters!inner (
        id,
        encounter_code,
        updated_at,
        intake_id,
        appointments:appointment_id (
          locations:location_id ( id, title )
        )
      ),
      patients!inner (
        first_name,
        last_name,
        patient_code,
        date_of_birth,
        locations:location_id ( id, title )
      )
    `)
    .eq('encounter_id', encounterId)
    .maybeSingle()

  if (error) throw error
  if (!review) return null

  const row = review as ReviewRow
  if (!isAllowedByLocationScope(locationScope, resolveLocationId(row))) {
    return null
  }
  const enc = first(row.encounters)
  const pat = first(row.patients)
  const profiles = await loadProfiles(admin, [row.documenting_user_id])
  const doctorNames = await loadDoctorNames(admin, [row.documenting_user_id])

  let chiefComplaint: string | null = null
  if (enc?.intake_id) {
    const complaints = await loadChiefComplaints(admin, [enc.intake_id])
    chiefComplaint = complaints.get(enc.intake_id) ?? null
  }

  const { data: soapRow } = await admin
    .from('doctor_soapnotes')
    .select('subjective_text, objective_text, assessment_text, plan_text')
    .eq('encounter_id', encounterId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const soap = soapRow as {
    subjective_text?: string | null
    objective_text?: string | null
    assessment_text?: string | null
    plan_text?: string | null
  } | null
  const [diagnoses, catalogOrders] = await Promise.all([
    loadDiagnosesForCompliance(admin, encounterId),
    loadCatalogOrdersForCompliance(admin, encounterId),
  ])

  return {
    reviewId: row.id,
    encounterId,
    encounterCode: enc?.encounter_code ?? null,
    reviewStatus: row.review_status as PhysicianReviewStatus,
    notes: row.notes,
    findings: row.findings,
    patient: {
      name: [pat?.first_name, pat?.last_name].filter(Boolean).join(' ') || 'Unknown patient',
      patientCode: pat?.patient_code ?? null,
      dob: pat?.date_of_birth?.slice(0, 10) ?? null,
      chiefComplaint,
    },
    provider: providerDisplayName(profiles, doctorNames, row.documenting_user_id),
    clinic: resolveClinic(row),
    encounterDate: (enc?.updated_at ?? row.created_at).slice(0, 10),
    soap: {
      subjective: soap?.subjective_text?.trim() ?? '',
      objective: soap?.objective_text?.trim() ?? '',
      assessment: soap?.assessment_text?.trim() ?? '',
      plan: soap?.plan_text?.trim() ?? '',
    },
    diagnoses,
    medications: catalogOrders.medications,
    orders: catalogOrders.orders,
  }
}

export async function saveComplianceReview(
  admin: SupabaseClient,
  args: {
    encounterId: number
    reviewerUserId: string
    reviewStatus: PhysicianReviewStatus
    notes?: string | null
    findings?: string | null
    locationScope?: LocationScope
  }
) {
  const scope = args.locationScope ?? { unrestricted: true, locationIds: [] }
  if (!scope.unrestricted) {
    const detail = await loadComplianceReviewDetail(admin, args.encounterId, scope)
    if (!detail) throw new AuthorizationError('Encounter is outside your assigned locations')
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('encounter_physician_reviews')
    .update({
      review_status: args.reviewStatus,
      reviewed_by_user_id: args.reviewerUserId,
      reviewed_at: isPhysicianReviewComplete(args.reviewStatus) ? now : null,
      notes: args.notes?.trim() || null,
      findings: args.findings?.trim() || null,
      updated_at: now,
    })
    .eq('encounter_id', args.encounterId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Review record not found for this encounter')
  return data
}
