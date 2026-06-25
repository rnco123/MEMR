'use client'

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'
import { LoadingSpinner } from './LoadingSpinner'
import { toast } from 'sonner'
import type { FinalReviewSuggestions } from '@/lib/final-review/from-transcript'

interface Patient {
  id: number
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  gender: string | null
  date_of_birth: string | null
  zip_code: string | null
  state: string | null
  street_address: string | null
  patient_code: string | null
}

interface IntakeForm {
  id: number
  appointment_id: number
  chief_complaint: string | null
  location: string | null
  severity: number | null
  symptoms_description: string | null
  medical_conditions: any
  surgeries: any
  allergies: any
  current_medications: any
  fh_diabetes: boolean | null
  fh_hypertension: boolean | null
  fh_cancer: boolean | null
  fh_heart_disease: boolean | null
  tobacco_use: boolean | null
  alcohol_use: boolean | null
  drug_use: boolean | null
  onset: string | null
}

interface Vitals {
  id: number
  encounter_id: number
  bp_systolic: number | null
  bp_diastolic: number | null
  heart_rate: number | null
  respiratory_rate: number | null
  temperature: number | null
  temperature_unit: string | null
  spo2: number | null
  weight: number | null
  weight_unit: string | null
  height: number | null
  height_unit: string | null
  bmi: number | null
  notes: string | null
  created_at: string
}

interface SOAPNotes {
  id: number
  encounter_id: number | null
  subjective_text: string | null
  objective_text: string | null
  assessment_text: string | null
  plan_text: string | null
  created_at: string
  updated_at: string
}

interface Pharmacy {
  id: number
  name?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  phone?: string | null
  phone_number?: string | null
  email?: string | null
  spanish_language_service?: boolean | null
  disabled_access?: boolean | null
  license_status?: string | null
  opening_hours?: unknown
  delivers?: boolean | null
  is_active?: boolean | null
}

/** EMR `prescriptions` row (Final Review pharmacy step); maps to DB columns after migration 041. */
interface RxLine {
  id: string
  medication_name: string
  strength: string
  dosage_instruction: string
  route: string
  frequency: string
  duration: string
  notes: string
}

const emptyRxForm = (): Omit<RxLine, 'id'> => ({
  medication_name: '',
  strength: '',
  dosage_instruction: '',
  route: '',
  frequency: '',
  duration: '',
  notes: '',
})

interface CategoryMemr {
  category_id: number
  category_name: string
}

/** Product row from GET /api/mcm/catalog (primary DB `products` or `product_memr`). */
interface ProductRow {
  product_id: number
  product_name: string
  category_id?: number | null
}

interface PreSalesProduct {
  id: string
  product_id: number
  product_name: string
  quantity: number
}

interface FinalReviewModalProps {
  encounterId: number
  appointmentId: number
  patientId: number
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
}

const REVIEW_STEP_KEYS = [
  'patient_review',
  'pre_sales_product',
  'pharmacy_order',
  'followup',
  'final_summary',
] as const

type ReviewStep = (typeof REVIEW_STEP_KEYS)[number]

export function FinalReviewModal({
  encounterId,
  appointmentId,
  patientId,
  isOpen,
  onClose,
  onComplete,
}: FinalReviewModalProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [intake, setIntake] = useState<IntakeForm | null>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [soapNotes, setSoapNotes] = useState<SOAPNotes | null>(null)
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null)
  const [encounterDoctorId, setEncounterDoctorId] = useState<number | null>(null)
  const [encounterPharmacyId, setEncounterPharmacyId] = useState<number | null>(null)
  const [rxLines, setRxLines] = useState<RxLine[]>([])
  const [rxForm, setRxForm] = useState<Omit<RxLine, 'id'>>(emptyRxForm())
  /** Follow-up step: date/time UI only (not persisted). */
  const [followupDate, setFollowupDate] = useState('')
  const [followupTime, setFollowupTime] = useState('')
  const [preSalesProducts, setPreSalesProducts] = useState<PreSalesProduct[]>([])
  const [activeStep, setActiveStep] = useState<ReviewStep>('patient_review')
  const [saving, setSaving] = useState(false)
  const [stepTransitionLoading, setStepTransitionLoading] = useState(false)
  const [mcmCatalogLoading, setMcmCatalogLoading] = useState(false)
  const [transcriptSuggestions, setTranscriptSuggestions] = useState<FinalReviewSuggestions | null>(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [suggestionsNoTranscript, setSuggestionsNoTranscript] = useState(false)
  const [followupReason, setFollowupReason] = useState('')

  // Categories/products for dropdowns: loaded via GET /api/mcm/catalog
  const [categories, setCategories] = useState<CategoryMemr[]>([])
  const [categoriesError, setCategoriesError] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [productsError, setProductsError] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('')
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('')
  const [productQuantity, setProductQuantity] = useState(1)

  useEffect(() => {
    if (isOpen) {
      setActiveStep('patient_review')
      setFollowupDate('')
      setFollowupTime('')
      setFollowupReason('')
      setTranscriptSuggestions(null)
      setSuggestionsError(null)
      setSuggestionsNoTranscript(false)
    }
  }, [isOpen])

  const fetchTranscriptSuggestions = useCallback(
    async (force = false) => {
      setSuggestionsLoading(true)
      setSuggestionsError(null)
      setSuggestionsNoTranscript(false)
      try {
        const url = `/api/encounters/${encounterId}/final-review-suggestions${force ? '?force=true' : ''}`
        const res = await fetch(url, { method: 'POST', credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (res.status === 404 && data.error?.includes('No transcript')) {
          setSuggestionsNoTranscript(true)
          setTranscriptSuggestions(null)
          return
        }
        if (!res.ok) {
          setSuggestionsError(
            typeof data.error === 'string' ? data.error : 'Could not generate transcript suggestions'
          )
          return
        }
        setTranscriptSuggestions(data.suggestions as FinalReviewSuggestions)
      } catch (e) {
        console.error(e)
        setSuggestionsError('Could not reach suggestion service')
      } finally {
        setSuggestionsLoading(false)
      }
    },
    [encounterId]
  )

  const followupDaysFromToday = useMemo(() => {
    if (!followupDate) return null
    const [y, m, d] = followupDate.split('-').map(Number)
    if (!y || !m || !d) return null
    const selected = new Date(y, m - 1, d)
    selected.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((selected.getTime() - today.getTime()) / 86_400_000)
  }, [followupDate])

  useEffect(() => {
    if (!isOpen) return

    const fetchMcmCatalogAsync = () => {
      void (async () => {
        setMcmCatalogLoading(true)
        setCategoriesError(null)
        try {
          const controller = new AbortController()
          const tid = globalThis.setTimeout(() => controller.abort(), 15_000)
          const mcmCatalogRes = await fetch('/api/mcm/catalog', {
            method: 'GET',
            credentials: 'include',
            signal: controller.signal,
          })
          globalThis.clearTimeout(tid)
          const mcmCatalogJson = await mcmCatalogRes.json().catch(() => ({}))
          if (!mcmCatalogRes.ok) {
            console.error('Error fetching MCM catalog:', mcmCatalogJson)
            setCategoriesError(
              typeof mcmCatalogJson.error === 'string' ? mcmCatalogJson.error : 'Failed to load MCM categories'
            )
            setCategories([])
            setProducts([])
          } else {
            setCategories((mcmCatalogJson.categories as CategoryMemr[]) || [])
            setProducts((mcmCatalogJson.products as ProductRow[]) || [])
          }
        } catch (e) {
          const aborted =
            (e instanceof DOMException && e.name === 'AbortError') ||
            (e instanceof Error && e.name === 'AbortError')
          console.error('MCM catalog fetch failed:', e)
          setCategoriesError(
            aborted
              ? 'MCM catalog timed out. You can still review the encounter; try opening Pre-Sales again in a moment.'
              : 'Could not load MCM catalog.'
          )
          setCategories([])
          setProducts([])
        } finally {
          setMcmCatalogLoading(false)
        }
      })()
    }

    const fetchData = async () => {
      setLoading(true)
      try {
        const [{ data: patientData }, { data: encounterData }] = await Promise.all([
          supabase.from('patients').select('*').eq('id', patientId).single(),
          supabase.from('encounters').select('*').eq('id', encounterId).single(),
        ])
        setPatient((patientData as Patient) ?? null)

        if (encounterData) {
          const cached = encounterData.final_review_suggestions_json as FinalReviewSuggestions | null
          if (cached && typeof cached === 'object' && Array.isArray(cached.pre_sales)) {
            setTranscriptSuggestions(cached)
          }

          setEncounterDoctorId(
            typeof encounterData.doctor_id === 'number' ? encounterData.doctor_id : null
          )
          setEncounterPharmacyId(
            typeof encounterData.pharmacy_id === 'number' ? encounterData.pharmacy_id : null
          )
        } else {
          setEncounterDoctorId(null)
          setEncounterPharmacyId(null)
        }

        let intakeData: unknown = null
        if (encounterData?.intake_id) {
          const res = await supabase
            .from('intake_form')
            .select('*')
            .eq('id', encounterData.intake_id)
            .maybeSingle()
          intakeData = res.data
        }
        if (!intakeData && appointmentId) {
          const res = await supabase
            .from('intake_form')
            .select('*')
            .eq('appointment_id', appointmentId)
            .maybeSingle()
          intakeData = res.data
        }
        if (intakeData) setIntake(intakeData as IntakeForm)
        else setIntake(null)

        const [vitalsApiRes, soapRes, preSalesRes] = await Promise.all([
          fetch(`/api/encounters/${encounterId}/vitals`, { credentials: 'include' }),
          supabase
            .from('ai_soapnotes')
            .select('*')
            .eq('encounter_id', encounterId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('pre_sales').select('id, product_id, product_quantity').eq('encounter_id', encounterId),
        ])

        const vitalsJson = vitalsApiRes.ok ? await vitalsApiRes.json() : { data: null }
        setVitals((vitalsJson.data as Vitals | null) ?? null)
        setSoapNotes(soapRes.data as SOAPNotes)

        if (encounterData?.pharmacy_id) {
          const { data: pharmacyData } = await supabase
            .from('pharmacy')
            .select('*')
            .eq('id', encounterData.pharmacy_id)
            .maybeSingle()
          setPharmacy(pharmacyData as Pharmacy)
        } else {
          setPharmacy(null)
        }

        const preSalesData = preSalesRes.data
        if (preSalesData?.length) {
          const productIds = [
            ...new Set(
              preSalesData
                .map((r: { product_id: number | null }) => r.product_id)
                .filter((id): id is number => id != null && Number(id) > 0)
            ),
          ]
          const nameMap = new Map<number, string>()
          const { data: localProductRows } = await supabase
            .from('products')
            .select('product_id, product_name')
            .in('product_id', productIds)
          for (const p of localProductRows || []) {
            nameMap.set(p.product_id, p.product_name)
          }
          const missingIds = productIds.filter((id) => !nameMap.has(id))
          if (missingIds.length > 0) {
            try {
              const res = await fetch(
                `/api/mcm/catalog?product_ids=${missingIds.map(String).join(',')}`,
                { method: 'GET', credentials: 'include' }
              )
              const json = await res.json().catch(() => ({}))
              if (res.ok && Array.isArray(json.products)) {
                for (const row of json.products as { product_id: number; product_name: string }[]) {
                  if (row.product_name) nameMap.set(row.product_id, row.product_name)
                }
              }
            } catch {
              /* keep Unknown for unresolved ids */
            }
          }
          setPreSalesProducts(
            preSalesData.map((r: { id: number; product_id: number | null; product_quantity: number }) => ({
              id: `db-${r.id}`,
              product_id: r.product_id ?? 0,
              product_name: nameMap.get(r.product_id ?? 0) ?? 'Unknown',
              quantity: r.product_quantity,
            }))
          )
        } else {
          setPreSalesProducts([])
        }

        const { data: rxRows } = await supabase
          .from('prescriptions')
          .select('*')
          .eq('encounter_id', encounterId)
          .order('created_at', { ascending: true })
        setRxLines(
          (rxRows || []).map((r: Record<string, unknown>) => {
            const dose =
              (r.dosage_instruction as string) ||
              (r.instructions as string) ||
              (r.dosage as string) ||
              ''
            return {
              id: `db-${r.id as number}`,
              medication_name: String(r.medication_name ?? ''),
              strength: String(r.strength ?? ''),
              dosage_instruction: dose,
              route: String(r.route ?? ''),
              frequency: String(r.frequency ?? ''),
              duration: String(r.duration ?? ''),
              notes: String(r.notes ?? ''),
            }
          })
        )

        fetchMcmCatalogAsync()
      } catch (error) {
        console.error('Error fetching final review data:', error)
        toast.error('Could not load review data. Check permissions or try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isOpen, encounterId, appointmentId, patientId, supabase])

  useEffect(() => {
    if (!isOpen || loading) return
    if (transcriptSuggestions) return
    void fetchTranscriptSuggestions(false)
  }, [isOpen, loading, transcriptSuggestions, fetchTranscriptSuggestions])

  // When category changes, fetch products from MCM catalog.
  useEffect(() => {
    if (!selectedCategoryId) {
      setProducts([])
      setProductsError(null)
      setSelectedProductId('')
      return
    }
    const load = async () => {
      setProductsError(null)
      const res = await fetch(`/api/mcm/catalog?category_id=${selectedCategoryId}`, {
        method: 'GET',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Error fetching MCM products:', json)
        setProductsError(json.error || 'Failed to load products')
        setProducts([])
      } else {
        setProducts((json.products as ProductRow[]) || [])
      }
      setSelectedProductId('')
    }
    load()
  }, [selectedCategoryId])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const calculateAge = (dob: string | null) => {
    if (!dob) return 'N/A'
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  const handleAddProduct = () => {
    if (!selectedProductId || productQuantity < 1) return
    const product = products.find((p) => p.product_id === selectedProductId)
    if (!product) return
    const item: PreSalesProduct = {
      id: Date.now().toString(),
      product_id: product.product_id,
      product_name: product.product_name,
      quantity: productQuantity,
    }
    setPreSalesProducts([...preSalesProducts, item])
    setSelectedProductId('')
    setProductQuantity(1)
  }

  const handleRemoveProduct = (id: string) => {
    setPreSalesProducts(preSalesProducts.filter(p => p.id !== id))
  }

  const applyPreSalesSuggestions = () => {
    if (!transcriptSuggestions?.pre_sales.length) return
    const added: PreSalesProduct[] = transcriptSuggestions.pre_sales.map((s) => ({
      id: `sug-${Date.now()}-${s.product_id}`,
      product_id: s.product_id,
      product_name: s.product_name,
      quantity: s.quantity,
    }))
    setPreSalesProducts((prev) => [...prev, ...added])
    toast.success(`Added ${added.length} suggested product(s)`)
  }

  const applyPharmacySuggestions = () => {
    if (!transcriptSuggestions?.prescriptions.length) return
    const added: RxLine[] = transcriptSuggestions.prescriptions.map((s) => ({
      id: `sug-${Date.now()}-${s.medication_name}`,
      medication_name: s.medication_name,
      strength: s.strength,
      dosage_instruction: s.dosage_instruction,
      route: s.route,
      frequency: s.frequency,
      duration: s.duration,
      notes: s.notes ?? '',
    }))
    setRxLines((prev) => [...prev, ...added])
    toast.success(`Added ${added.length} suggested prescription(s)`)
  }

  const applyFollowupSuggestion = () => {
    const fu = transcriptSuggestions?.follow_up
    if (!fu?.needed) {
      toast.error('No follow-up suggested in transcript')
      return
    }
    if (fu.suggested_date) setFollowupDate(fu.suggested_date)
    if (fu.suggested_time) setFollowupTime(fu.suggested_time)
    if (fu.reason) setFollowupReason(fu.reason)
    toast.success('Applied follow-up suggestion')
  }

  const renderTranscriptSuggestionsShell = (
    children: ReactNode,
    opts?: { applyLabel?: string; onApply?: () => void; applyDisabled?: boolean }
  ) => (
    <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-4 mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h4 className="text-white font-semibold text-sm">Transcript suggestions</h4>
            <p className="text-blue-200/80 text-xs mt-0.5">
              From telemedicine transcript — review and Apply to append (duplicates allowed).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchTranscriptSuggestions(true)}
            disabled={suggestionsLoading}
            className="text-xs px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
          >
            Refresh from transcript
          </button>
        </div>
        {suggestionsLoading ? (
          <div className="py-4">
            <LoadingSpinner
              message="Generating suggestions from transcript…"
              variant="dark"
            />
          </div>
        ) : suggestionsNoTranscript ? (
          <p className="text-amber-300 text-sm">
            No transcript for this encounter — complete a video visit first.
          </p>
        ) : suggestionsError ? (
          <p className="text-red-300 text-sm">{suggestionsError}</p>
        ) : (
          children
        )}
        {opts?.onApply && !suggestionsLoading && !suggestionsNoTranscript && !suggestionsError && (
          <button
            type="button"
            onClick={opts.onApply}
            disabled={opts.applyDisabled}
            className="mt-3 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {opts.applyLabel ?? 'Apply'}
          </button>
        )}
    </div>
  )

  const reviewStepIndex = REVIEW_STEP_KEYS.indexOf(activeStep)
  const isLastReviewStep = activeStep === 'final_summary'

  /** Save pending lines to EMR `pre_sales` for this encounter. */
  const persistPendingPreSales = useCallback(async (): Promise<boolean> => {
    const pending = preSalesProducts.filter((p) => !String(p.id).startsWith('db-'))
    if (pending.length === 0) return true

    const rows = pending.map((p) => ({
      encounter_id: encounterId,
      product_id: p.product_id,
      product_quantity: p.quantity,
      product_quantity_taken: 0,
      status: 'initiated' as const,
    }))

    const { data: inserted, error } = await supabase
      .from('pre_sales')
      .insert(rows)
      .select('id, product_id, product_quantity')

    if (error) {
      console.error(error)
      toast.error(error.message ?? 'Could not save pre-sales rows')
      return false
    }

    toast.success('Pre-sales saved for this encounter')

    const mergedNew = (inserted ?? []).map((row, i) => ({
      id: `db-${row.id}`,
      product_id: row.product_id ?? pending[i]?.product_id ?? 0,
      product_name: pending[i]?.product_name ?? 'Unknown',
      quantity: row.product_quantity ?? pending[i]?.quantity ?? 0,
    }))

    setPreSalesProducts((prev) => [...prev.filter((p) => String(p.id).startsWith('db-')), ...mergedNew])

    return true
  }, [preSalesProducts, encounterId, supabase])

  /** Persist session-only Rx lines to EMR `prescriptions` using encounter pharmacy_id + assigned doctor. */
  const persistPendingPrescriptions = useCallback(async (): Promise<boolean> => {
    const pending = rxLines.filter((r) => !String(r.id).startsWith('db-'))
    if (pending.length === 0) return true

    if (!encounterDoctorId) {
      toast.error('This encounter has no assigned doctor — prescriptions cannot be saved.')
      return false
    }
    if (!encounterPharmacyId) {
      toast.error('This encounter has no pharmacy — assign a pharmacy on the encounter before adding prescriptions.')
      return false
    }

    for (const line of pending) {
      if (!line.medication_name.trim()) {
        toast.error('Each prescription needs a medication name.')
        return false
      }
    }

    const doseOf = (line: RxLine) => line.dosage_instruction.trim() || null

    const inserts = pending.map((line) => ({
      prescriber_doctor_id: encounterDoctorId,
      patient_id: patientId,
      encounter_id: encounterId,
      pharmacy_id: encounterPharmacyId,
      medication_name: line.medication_name.trim(),
      strength: line.strength.trim() || null,
      dosage_instruction: doseOf(line),
      dosage: doseOf(line),
      instructions: doseOf(line),
      route: line.route.trim() || null,
      frequency: line.frequency.trim() || null,
      duration: line.duration.trim() || null,
      refills: 0,
      status: 'recorded' as const,
      notes: line.notes.trim() || null,
    }))

    const { data: inserted, error } = await supabase
      .from('prescriptions')
      .insert(inserts)
      .select('id, medication_name, strength, dosage_instruction, dosage, instructions, route, frequency, duration, notes')

    if (error) {
      console.error(error)
      toast.error(error.message ?? 'Could not save prescriptions')
      return false
    }

    const mergedNew = (inserted ?? []).map((row: Record<string, unknown>, i: number) => {
      const pend = pending[i]
      const fromRow = String(row.dosage_instruction ?? row.instructions ?? row.dosage ?? '').trim()
      const fromPending = pend != null ? doseOf(pend) ?? '' : ''
      const dose = fromRow || fromPending
      return {
        id: `db-${row.id as number}`,
        medication_name: String(row.medication_name ?? pend?.medication_name ?? ''),
        strength: String(row.strength ?? pend?.strength ?? ''),
        dosage_instruction: dose,
        route: String(row.route ?? pend?.route ?? ''),
        frequency: String(row.frequency ?? pend?.frequency ?? ''),
        duration: String(row.duration ?? pend?.duration ?? ''),
        notes: String(row.notes ?? pend?.notes ?? ''),
      }
    })

    setRxLines((prev) => [...prev.filter((r) => String(r.id).startsWith('db-')), ...mergedNew])
    toast.success(pending.length === 1 ? 'Prescription saved' : `${pending.length} prescriptions saved`)
    return true
  }, [rxLines, encounterDoctorId, encounterPharmacyId, patientId, encounterId, supabase])

  const handleAddRxLine = () => {
    if (!rxForm.medication_name.trim()) {
      toast.error('Medication name is required')
      return
    }
    const line: RxLine = {
      id: `tmp-${Date.now()}`,
      ...rxForm,
      medication_name: rxForm.medication_name.trim(),
    }
    setRxLines((prev) => [...prev, line])
    setRxForm(emptyRxForm())
  }

  const handleRemoveRxLine = (id: string) => {
    if (String(id).startsWith('db-')) return
    setRxLines((prev) => prev.filter((r) => r.id !== id))
  }

  const goNextStep = async () => {
    const idx = REVIEW_STEP_KEYS.indexOf(activeStep)
    if (activeStep === 'pre_sales_product') {
      setStepTransitionLoading(true)
      try {
        const ok = await persistPendingPreSales()
        if (!ok) return
      } finally {
        setStepTransitionLoading(false)
      }
    }
    if (activeStep === 'pharmacy_order') {
      setStepTransitionLoading(true)
      try {
        const ok = await persistPendingPrescriptions()
        if (!ok) return
      } finally {
        setStepTransitionLoading(false)
      }
    }
    if (idx < REVIEW_STEP_KEYS.length - 1) {
      const nextStep = REVIEW_STEP_KEYS[idx + 1]
      if (nextStep !== undefined) setActiveStep(nextStep)
    }
  }

  const goPrevStep = () => {
    if (reviewStepIndex > 0) {
      const prevStep = REVIEW_STEP_KEYS[reviewStepIndex - 1]
      if (prevStep !== undefined) setActiveStep(prevStep)
    }
  }

  const handleCompleteReview = async () => {
    setSaving(true)
    try {
      const okRx = await persistPendingPrescriptions()
      if (!okRx) {
        setSaving(false)
        return
      }

      const newProducts = preSalesProducts.filter((p) => !String(p.id).startsWith('db-'))
      if (newProducts.length > 0) {
        const okPreSales = await persistPendingPreSales()
        if (!okPreSales) {
          setSaving(false)
          return
        }
      }

      // Update encounter status to final_review
      const { error: updateError } = await supabase
        .from('encounters')
        .update({ status: 'final_review' })
        .eq('id', encounterId)

      if (updateError) {
        console.error('Error updating encounter status:', updateError)
        alert('Error updating encounter status. Please try again.')
        setSaving(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      const profileId = user ? await getProfileId(supabase, user.id) : null
      await insertStatusTimeline(supabase, {
        encounterId,
        status: 'final_review',
        profileId,
      })

      void fetch(`/api/encounters/${encounterId}/physician-review/ensure`, {
        method: 'POST',
      }).catch(err => console.error('Physician review ensure failed:', err))

      if (onComplete) {
        onComplete()
      }
      onClose()
    } catch (error) {
      console.error('Error completing final review:', error)
      alert('Error completing review. Please try again.')
    } finally {
      setSaving(false)
    }
  }


  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 border border-white/20 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-800 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-white">Final Review</h2>
            {patient && (
              <span className="text-sm text-blue-300">
                {patient.first_name} {patient.last_name}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stepper */}
        <div className="border-b border-white/10 bg-slate-800 flex-shrink-0 px-4 py-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {[
              { key: 'patient_review', label: '1. Patient Review' },
              { key: 'pre_sales_product', label: '2. Pre-Sales Product' },
              { key: 'pharmacy_order', label: '3. Pharmacy Order' },
              { key: 'followup', label: '4. Followup' },
              { key: 'final_summary', label: '5. Final Summary' },
            ].map((step) => (
              <button
                key={step.key}
                type="button"
                onClick={() => setActiveStep(step.key as ReviewStep)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeStep === step.key
                    ? 'text-white bg-cyan-600/20 border border-cyan-500/40'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                {step.label}
                {step.key === 'pre_sales_product' && preSalesProducts.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-full text-xs">
                    {preSalesProducts.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center min-h-[240px]">
              <LoadingSpinner message="Loading review data..." variant="dark" />
            </div>
          ) : (
            <>
              {activeStep === 'patient_review' && (
                <div className="space-y-6">
                  {/* Patient Information */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Patient Information
                    </h3>
                    {patient ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Name</p>
                          <p className="text-white font-semibold">{patient.first_name} {patient.last_name}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Patient Code</p>
                          <p className="text-white font-mono">{patient.patient_code || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Age</p>
                          <p className="text-white">{calculateAge(patient.date_of_birth)} years</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Gender</p>
                          <p className="text-white">{patient.gender || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Date of Birth</p>
                          <p className="text-white">{formatDate(patient.date_of_birth)}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Email</p>
                          <p className="text-white">{patient.email || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Phone</p>
                          <p className="text-white">{patient.phone || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Address</p>
                          <p className="text-white">
                            {patient.street_address || 'N/A'}
                            {patient.state && `, ${patient.state}`}
                            {patient.zip_code && ` ${patient.zip_code}`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-blue-200">Patient information not available</p>
                    )}
                  </div>

                  {/* Intake Form */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Intake Form
                    </h3>
                    {intake ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Chief Complaint</p>
                          <p className="text-white">{intake.chief_complaint || 'N/A'}</p>
                        </div>
                        {intake.symptoms_description && (
                          <div>
                            <p className="text-blue-200 text-sm mb-1">Symptoms Description</p>
                            <p className="text-white">{intake.symptoms_description}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {intake.medical_conditions && (
                            <div>
                              <p className="text-blue-200 text-sm mb-1">Medical Conditions</p>
                              <p className="text-white text-sm">
                                {Array.isArray(intake.medical_conditions)
                                  ? intake.medical_conditions.join(', ')
                                  : 'N/A'}
                              </p>
                            </div>
                          )}
                          {intake.allergies && (
                            <div>
                              <p className="text-blue-200 text-sm mb-1">Allergies</p>
                              <p className="text-white text-sm">
                                {Array.isArray(intake.allergies)
                                  ? intake.allergies.join(', ')
                                  : 'N/A'}
                              </p>
                            </div>
                          )}
                          {intake.current_medications && (
                            <div>
                              <p className="text-blue-200 text-sm mb-1">Current Medications</p>
                              <p className="text-white text-sm">
                                {Array.isArray(intake.current_medications)
                                  ? intake.current_medications.join(', ')
                                  : 'N/A'}
                              </p>
                            </div>
                          )}
                          {intake.surgeries && (
                            <div>
                              <p className="text-blue-200 text-sm mb-1">Surgeries</p>
                              <p className="text-white text-sm">
                                {Array.isArray(intake.surgeries)
                                  ? intake.surgeries.join(', ')
                                  : 'N/A'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-blue-200">Intake form not available</p>
                    )}
                  </div>

                  {/* Vitals */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Vitals
                    </h3>
                    {vitals ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Blood Pressure</p>
                          <p className="text-white font-semibold">
                            {vitals.bp_systolic && vitals.bp_diastolic
                              ? `${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg`
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Heart Rate</p>
                          <p className="text-white font-semibold">
                            {vitals.heart_rate ? `${vitals.heart_rate} bpm` : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Temperature</p>
                          <p className="text-white font-semibold">
                            {vitals.temperature
                              ? `${vitals.temperature}°${vitals.temperature_unit || 'F'}`
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">SpO2</p>
                          <p className="text-white font-semibold">
                            {vitals.spo2 ? `${vitals.spo2}%` : 'N/A'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-blue-200">Vitals not recorded</p>
                    )}
                  </div>

                  {/* SOAP Notes */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      SOAP Notes
                    </h3>
                    {soapNotes ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-blue-200 text-sm mb-2 font-semibold">Subjective</p>
                          <p className="text-white bg-white/5 p-3 rounded-lg">
                            {soapNotes.subjective_text || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-2 font-semibold">Objective</p>
                          <p className="text-white bg-white/5 p-3 rounded-lg">
                            {soapNotes.objective_text || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-2 font-semibold">Assessment</p>
                          <p className="text-white bg-white/5 p-3 rounded-lg">
                            {soapNotes.assessment_text || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-2 font-semibold">Plan</p>
                          <p className="text-white bg-white/5 p-3 rounded-lg">
                            {soapNotes.plan_text || 'N/A'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-blue-200">SOAP notes not available</p>
                    )}
                  </div>

                  {/* Pharmacy */}
                  {pharmacy && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Pharmacy
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pharmacy.name && (
                          <div>
                            <p className="text-blue-200 text-sm mb-1">Name</p>
                            <p className="text-white font-semibold">{pharmacy.name}</p>
                          </div>
                        )}
                        {pharmacy.address && (
                          <div>
                            <p className="text-blue-200 text-sm mb-1">Address</p>
                            <p className="text-white">{pharmacy.address}</p>
                          </div>
                        )}
                        {pharmacy.phone && (
                          <div>
                            <p className="text-blue-200 text-sm mb-1">Phone</p>
                            <p className="text-white">{pharmacy.phone}</p>
                          </div>
                        )}
                        {pharmacy.email && (
                          <div>
                            <p className="text-blue-200 text-sm mb-1">Email</p>
                            <p className="text-white">{pharmacy.email}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeStep === 'pre_sales_product' && (
                <div className="space-y-6">
                  {renderTranscriptSuggestionsShell(
                    transcriptSuggestions ? (
                      <div className="space-y-2 text-sm">
                        {transcriptSuggestions.pre_sales.length === 0 ? (
                          <p className="text-gray-400">No catalog-matched products in transcript.</p>
                        ) : (
                          <ul className="space-y-2">
                            {transcriptSuggestions.pre_sales.map((s) => (
                              <li
                                key={`${s.product_id}-${s.source_quote ?? ''}`}
                                className="bg-white/5 border border-white/10 rounded-lg p-3"
                              >
                                <p className="text-white font-medium">
                                  {s.product_name} × {s.quantity}
                                </p>
                                {s.source_quote && (
                                  <p className="text-gray-400 text-xs mt-1 italic">&ldquo;{s.source_quote}&rdquo;</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {transcriptSuggestions.unmatched_tests.length > 0 && (
                          <div className="mt-3">
                            <p className="text-amber-300 text-xs mb-1">Unmatched tests (not in catalog):</p>
                            <div className="flex flex-wrap gap-2">
                              {transcriptSuggestions.unmatched_tests.map((t) => (
                                <span
                                  key={t}
                                  className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null,
                    {
                      applyLabel: 'Apply to pre-sales',
                      onApply: applyPreSalesSuggestions,
                      applyDisabled: !transcriptSuggestions?.pre_sales.length,
                    }
                  )}

                  {/* Add Product Form */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4">Add Product to Pre-Sales</h3>
                    <p className="text-blue-200/80 text-sm mb-4">
                      One encounter can have multiple products. Categories and products come from the clinic
                      catalog. New rows save to this encounter&apos;s pre-sales list.
                    </p>
                    {mcmCatalogLoading && (
                      <p className="text-cyan-300/90 text-xs mb-3">Loading MCM categories and products…</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="text-blue-200 text-sm mb-1 block">Category</label>
                        <select
                          value={selectedCategoryId}
                          onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : '')}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="">Select category</option>
                          {categories.map((c) => (
                            <option key={c.category_id} value={c.category_id}>
                              {c.category_name}
                            </option>
                          ))}
                        </select>
                        {categoriesError && (
                          <p className="text-red-400 text-xs mt-1">{categoriesError}</p>
                        )}
                        {!categoriesError && categories.length === 0 && !loading && (
                          <p className="text-amber-400 text-xs mt-1">No MCM categories found.</p>
                        )}
                      </div>
                      <div>
                        <label className="text-blue-200 text-sm mb-1 block">Product</label>
                        <select
                          value={selectedProductId}
                          onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : '')}
                          disabled={!selectedCategoryId}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                        >
                          <option value="">Select product</option>
                          {products.map((p) => (
                            <option key={p.product_id} value={p.product_id}>
                              {p.product_name}
                            </option>
                          ))}
                        </select>
                        {productsError && (
                          <p className="text-red-400 text-xs mt-1">{productsError}</p>
                        )}
                        {selectedCategoryId && !productsError && products.length === 0 && (
                          <p className="text-amber-400 text-xs mt-1">No products in this MCM category.</p>
                        )}
                      </div>
                      <div>
                        <label className="text-blue-200 text-sm mb-1 block">QTY</label>
                        <input
                          type="number"
                          min="1"
                          value={productQuantity}
                          onChange={(e) => setProductQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <button
                          onClick={handleAddProduct}
                          disabled={!selectedProductId || productQuantity < 1}
                          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                        >
                          + Add Product
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Products List */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4">Pre-Sales Products</h3>
                    {preSalesProducts.length === 0 ? (
                      <p className="text-blue-200">No products added yet. Select category, then product, then QTY and click Add Product.</p>
                    ) : (
                      <div className="space-y-3">
                        {preSalesProducts.map((product) => (
                          <div
                            key={product.id}
                            className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <p className="text-white font-semibold">{product.product_name}</p>
                              <p className="text-sm text-gray-300 mt-1">Qty: {product.quantity}</p>
                            </div>
                            {!String(product.id).startsWith('db-') && (
                              <button
                                onClick={() => handleRemoveProduct(product.id)}
                                className="ml-4 p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {activeStep === 'pharmacy_order' && (
                <div className="space-y-6">
                  {renderTranscriptSuggestionsShell(
                    transcriptSuggestions ? (
                      <div className="space-y-2 text-sm">
                        {transcriptSuggestions.prescriptions.length === 0 ? (
                          <p className="text-gray-400">No medications suggested from transcript.</p>
                        ) : (
                          <ul className="space-y-2">
                            {transcriptSuggestions.prescriptions.map((s) => (
                              <li
                                key={`${s.medication_name}-${s.source_quote ?? ''}`}
                                className="bg-white/5 border border-white/10 rounded-lg p-3"
                              >
                                <p className="text-white font-medium">{s.medication_name}</p>
                                <p className="text-gray-400 text-xs mt-1">
                                  {[s.strength, s.dosage_instruction, s.route, s.frequency, s.duration]
                                    .filter(Boolean)
                                    .join(' · ') || '—'}
                                </p>
                                {s.source_quote && (
                                  <p className="text-gray-500 text-xs mt-1 italic">&ldquo;{s.source_quote}&rdquo;</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {transcriptSuggestions.unmatched_medications.length > 0 && (
                          <div className="mt-3">
                            <p className="text-amber-300 text-xs mb-1">Unmatched medications:</p>
                            <div className="flex flex-wrap gap-2">
                              {transcriptSuggestions.unmatched_medications.map((t) => (
                                <span
                                  key={t}
                                  className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null,
                    {
                      applyLabel: 'Apply to prescriptions',
                      onApply: applyPharmacySuggestions,
                      applyDisabled: !transcriptSuggestions?.prescriptions.length,
                    }
                  )}

                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-2">Linked pharmacy</h3>
                    <p className="text-blue-200/90 text-sm mb-4">
                      Prescriptions use this encounter&apos;s{' '}
                      <span className="text-cyan-300">pharmacy_id</span> (same row as the patient&apos;s encounter).
                      Stored in EMR <span className="text-gray-400">public.prescriptions</span> with{' '}
                      <span className="text-cyan-300">pharmacy_id</span>.
                    </p>
                    {pharmacy ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-blue-200 text-xs mb-0.5">Pharmacy ID</p>
                          <p className="text-white font-mono">{pharmacy.id}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-xs mb-0.5">Name</p>
                          <p className="text-white font-semibold">{pharmacy.name || '—'}</p>
                        </div>
                        <div className="md:col-span-2">
                          <p className="text-blue-200 text-xs mb-0.5">Address</p>
                          <p className="text-white">
                            {[pharmacy.address, pharmacy.city, pharmacy.state, pharmacy.zip_code]
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-xs mb-0.5">Phone</p>
                          <p className="text-white">{pharmacy.phone_number || pharmacy.phone || '—'}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-xs mb-0.5">Email</p>
                          <p className="text-white">{pharmacy.email || '—'}</p>
                        </div>
                        {pharmacy.license_status != null && (
                          <div>
                            <p className="text-blue-200 text-xs mb-0.5">License</p>
                            <p className="text-white">{pharmacy.license_status}</p>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                          {pharmacy.delivers != null && <span>Delivers: {pharmacy.delivers ? 'Yes' : 'No'}</span>}
                          {pharmacy.spanish_language_service != null && (
                            <span>Spanish: {pharmacy.spanish_language_service ? 'Yes' : 'No'}</span>
                          )}
                          {pharmacy.disabled_access != null && (
                            <span>ADA access: {pharmacy.disabled_access ? 'Yes' : 'No'}</span>
                          )}
                          {pharmacy.is_active != null && (
                            <span>Active: {pharmacy.is_active ? 'Yes' : 'No'}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-amber-300 text-sm">
                        No pharmacy on this encounter — set pharmacy on the encounter record before saving prescriptions.
                      </p>
                    )}
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4">Add prescription</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="text-blue-200 text-xs block mb-1">Medication name *</label>
                        <input
                          value={rxForm.medication_name}
                          onChange={(e) => setRxForm((f) => ({ ...f, medication_name: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                          placeholder="Required"
                        />
                      </div>
                      <div>
                        <label className="text-blue-200 text-xs block mb-1">Strength</label>
                        <input
                          value={rxForm.strength}
                          onChange={(e) => setRxForm((f) => ({ ...f, strength: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-blue-200 text-xs block mb-1">Dosage instruction</label>
                        <input
                          value={rxForm.dosage_instruction}
                          onChange={(e) => setRxForm((f) => ({ ...f, dosage_instruction: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-blue-200 text-xs block mb-1">Route</label>
                        <input
                          value={rxForm.route}
                          onChange={(e) => setRxForm((f) => ({ ...f, route: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                          placeholder="e.g. PO"
                        />
                      </div>
                      <div>
                        <label className="text-blue-200 text-xs block mb-1">Frequency</label>
                        <input
                          value={rxForm.frequency}
                          onChange={(e) => setRxForm((f) => ({ ...f, frequency: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                          placeholder="e.g. BID"
                        />
                      </div>
                      <div>
                        <label className="text-blue-200 text-xs block mb-1">Duration</label>
                        <input
                          value={rxForm.duration}
                          onChange={(e) => setRxForm((f) => ({ ...f, duration: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-blue-200 text-xs block mb-1">Notes</label>
                        <textarea
                          value={rxForm.notes}
                          onChange={(e) => setRxForm((f) => ({ ...f, notes: e.target.value }))}
                          rows={2}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddRxLine}
                      disabled={!rxForm.medication_name.trim()}
                      className="mt-4 px-5 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                    >
                      + Add to list
                    </button>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4">Prescriptions for this encounter</h3>
                    {rxLines.length === 0 ? (
                      <p className="text-blue-200 text-sm">None yet. Add above or click Next to skip.</p>
                    ) : (
                      <ul className="space-y-3">
                        {rxLines.map((rx) => (
                          <li
                            key={rx.id}
                            className="bg-white/5 border border-white/10 rounded-lg p-4 flex justify-between gap-4"
                          >
                            <div className="min-w-0 space-y-1 text-sm">
                              <p className="text-white font-semibold">{rx.medication_name}</p>
                              <p className="text-gray-400">
                                {[rx.strength, rx.dosage_instruction, rx.route, rx.frequency, rx.duration]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </p>
                              {rx.notes ? <p className="text-gray-500 text-xs">{rx.notes}</p> : null}
                              {String(rx.id).startsWith('db-') ? (
                                <span className="text-xs text-green-400/90">Saved</span>
                              ) : (
                                <span className="text-xs text-amber-300/90">Pending save (Next)</span>
                              )}
                            </div>
                            {!String(rx.id).startsWith('db-') && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRxLine(rx.id)}
                                className="shrink-0 p-2 hover:bg-red-500/20 text-red-400 rounded-lg"
                                aria-label="Remove"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
              {activeStep === 'followup' && (
                <div className="space-y-6">
                  {renderTranscriptSuggestionsShell(
                    transcriptSuggestions?.follow_up?.needed ? (
                      <div className="text-sm space-y-2">
                        {transcriptSuggestions.follow_up.suggested_date && (
                          <p className="text-white">
                            Suggested date:{' '}
                            <span className="text-cyan-300">{transcriptSuggestions.follow_up.suggested_date}</span>
                            {transcriptSuggestions.follow_up.suggested_time && (
                              <span className="text-cyan-300">
                                {' '}
                                at {transcriptSuggestions.follow_up.suggested_time}
                              </span>
                            )}
                          </p>
                        )}
                        {transcriptSuggestions.follow_up.timeframe_text && (
                          <p className="text-gray-400 text-xs">
                            Timeframe: {transcriptSuggestions.follow_up.timeframe_text}
                          </p>
                        )}
                        {transcriptSuggestions.follow_up.reason && (
                          <p className="text-gray-300">{transcriptSuggestions.follow_up.reason}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm">No follow-up visit suggested in transcript.</p>
                    ),
                    {
                      applyLabel: 'Apply follow-up',
                      onApply: applyFollowupSuggestion,
                      applyDisabled: !transcriptSuggestions?.follow_up?.needed,
                    }
                  )}

                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
                    <p className="text-amber-200 text-sm">
                      Follow-up date, time, and reason are not saved to the database in this version.
                    </p>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-2">Followup</h3>
                    <p className="text-blue-200/90 text-sm mb-6">
                      Pick a follow-up date and time for discussion only — nothing here is saved to the database.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                      <div>
                        <label htmlFor="followup-date" className="text-blue-200 text-xs font-medium block mb-1">
                          Date
                        </label>
                        <input
                          id="followup-date"
                          type="date"
                          value={followupDate}
                          onChange={(e) => setFollowupDate(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 [color-scheme:dark]"
                        />
                      </div>
                      <div>
                        <label htmlFor="followup-time" className="text-blue-200 text-xs font-medium block mb-1">
                          Time
                        </label>
                        <input
                          id="followup-time"
                          type="time"
                          value={followupTime}
                          onChange={(e) => setFollowupTime(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 [color-scheme:dark]"
                        />
                      </div>
                    </div>
                    <div className="mt-4 max-w-xl">
                      <label htmlFor="followup-reason" className="text-blue-200 text-xs font-medium block mb-1">
                        Reason
                      </label>
                      <textarea
                        id="followup-reason"
                        value={followupReason}
                        onChange={(e) => setFollowupReason(e.target.value)}
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                        placeholder="Optional — from transcript or manual entry"
                      />
                    </div>
                    <div className="mt-6 pt-5 border-t border-white/10">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Days from today</p>
                      {followupDaysFromToday === null ? (
                        <p className="text-gray-500 text-sm">Choose a date above to see the day offset.</p>
                      ) : (
                        <p className="text-cyan-300 text-lg font-semibold tabular-nums">
                          {followupDaysFromToday === 0
                            ? '0 days (today)'
                            : followupDaysFromToday > 0
                              ? `${followupDaysFromToday} day${followupDaysFromToday === 1 ? '' : 's'} from today`
                              : `${Math.abs(followupDaysFromToday)} day${Math.abs(followupDaysFromToday) === 1 ? '' : 's'} ago`}
                        </p>
                      )}
                      <p className="text-gray-500 text-xs mt-2">
                        Calendar days compared to today in your local timezone (time above does not change this count).
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {activeStep === 'final_summary' && (
                <div className="space-y-6">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-3">Final Summary</h3>
                    <p className="text-blue-200">
                      UI scaffold ready. Final summary checklist/confirmation will be connected in the next step.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-4 p-6 border-t border-white/10 bg-slate-800 flex-shrink-0 flex-wrap">
          <div className="text-sm text-gray-400 min-w-0">
            {!loading && (
              <span className="text-gray-500">
                Step {reviewStepIndex + 1} of {REVIEW_STEP_KEYS.length}
              </span>
            )}
            {preSalesProducts.length > 0 && (
              <span className={loading ? '' : 'ml-2'}>
                {preSalesProducts.length} product(s) in pre-sales
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={stepTransitionLoading}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            {!loading && reviewStepIndex > 0 && (
              <button
                type="button"
                onClick={goPrevStep}
                disabled={saving || stepTransitionLoading}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                Back
              </button>
            )}
            {!loading && !isLastReviewStep && (
              <button
                type="button"
                onClick={() => void goNextStep()}
                disabled={saving || stepTransitionLoading}
                className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {stepTransitionLoading ? 'Saving…' : 'Next'}
              </button>
            )}
            {!loading && isLastReviewStep && (
              <button
                type="button"
                onClick={handleCompleteReview}
                disabled={saving || stepTransitionLoading}
                className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {saving ? 'Completing...' : 'Complete Final Review'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
