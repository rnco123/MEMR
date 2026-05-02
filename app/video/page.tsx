'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DailyCall, DailyParticipantsObject } from '@daily-co/daily-js'
import { useAuth } from '@/lib/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { UserRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/client'
import { getStatusInfo } from '@/lib/encounter-status'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'
import { config } from '@/lib/config'
import { TelemedicineConnectionModal } from '@/components/TelemedicineConnectionModal'
import { PreVisitSummary } from '@/components/PreVisitSummary'

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

interface Encounter {
  id: number
  appointment_id: number
  patient_id: number
  intake_id: number | null
  pharmacy_id: number | null
  status: string
  encounter_code: string | null
}

interface Appointment {
  id: number
  patient_id?: number | null
  appointment_date: string | null
  appointment_time: string | null
  onsite_type: string | null
}

interface IntakeForm {
  chief_complaint: string | null
  symptoms_description: string | null
  location: string | null
  severity: number | null
  onset: string | null
  medical_conditions: unknown
  allergies: unknown
  current_medications: unknown
  surgeries: unknown
  tobacco_use: boolean | null
  alcohol_use: boolean | null
  drug_use: boolean | null
}

interface Vitals {
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
}

interface SOAPNotes {
  subjective_text: string | null
  objective_text: string | null
  assessment_text: string | null
  plan_text: string | null
}

interface DoctorSOAPNotes {
  id?: number
  subjective_text: string | null
  objective_text: string | null
  assessment_text: string | null
  plan_text: string | null
}


function cleanSoapSection(
  text: string | null,
  section: 'subjective' | 'objective' | 'assessment' | 'plan'
): string | null {
  if (!text) return null
  const label = section
  const pattern = new RegExp(
    String.raw`^\s*(\*\*)?\s*${label}\s*:?\s*(\*\*)?\s*`,
    'i'
  )
  return text.replace(pattern, '').trim()
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'N/A'
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateString) ? `${dateString}T00:00:00` : dateString)
  if (Number.isNaN(d.getTime())) return 'N/A'
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function calculateAge(dob: string | null) {
  if (!dob) return 'N/A'
  const birthDate = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--
  return `${age} years`
}

function mergeParticipantsIntoNames(
  participants: DailyParticipantsObject,
  map: Record<string, string>
) {
  for (const p of Object.values(participants)) {
    if (!p || typeof p !== 'object') continue
    if (p.session_id && p.user_name) {
      map[p.session_id] = p.user_name
      if (p.user_id) map[p.user_id] = p.user_name
    }
  }
}

/** Deepgram / Daily may omit rawResponse; treat as final unless explicitly interim. */
function isFinalTranscriptionSegment(rawResponse: Record<string, unknown> | undefined): boolean {
  if (rawResponse == null) return true
  if (typeof rawResponse.is_final === 'boolean') return rawResponse.is_final
  if (typeof rawResponse.speech_final === 'boolean') return rawResponse.speech_final
  return true
}

function VideoPage() {
  const { user, loading: authLoading, role } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const encounterId = searchParams.get('encounter')
  const supabase = useMemo(() => createClient(), [])
  const [error, setError] = useState<string | null>(null)
  const [roomToken, setRoomToken] = useState<string | null>(null)
  const [roomName, setRoomName] = useState<string | null>(null)
  const [roomUrl, setRoomUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showConnectionModal, setShowConnectionModal] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [dailyJoinUrl, setDailyJoinUrl] = useState<string | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [intake, setIntake] = useState<IntakeForm | null>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [soapNotes, setSoapNotes] = useState<SOAPNotes | null>(null)
  const [doctorSoap, setDoctorSoap] = useState<DoctorSOAPNotes | null>(null)
  const [doctorId, setDoctorId] = useState<number | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [detailsTab, setDetailsTab] = useState<'patient' | 'intake' | 'vitals' | 'soap'>('patient')
  const [soapForm, setSoapForm] = useState<DoctorSOAPNotes>({
    subjective_text: '',
    objective_text: '',
    assessment_text: '',
    plan_text: '',
  })
  const [savingSoap, setSavingSoap] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [endMessage, setEndMessage] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('')
  const transcriptBufferRef = useRef<Array<{ speaker_role: string; speaker_name: string; message: string; created_at: string }>>([])
  const [transcriptCount, setTranscriptCount] = useState(0)
  const participantNamesRef = useRef<Record<string, string>>({})
  // AI summary after consultation
  const [aiSummary, setAiSummary] = useState<Record<string, unknown> | null>(null)
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null)
  const [showSummaryPanel, setShowSummaryPanel] = useState(false)

  type TranscriptReviewLine = {
    id: number
    speaker_role: string
    speaker_name: string
    message: string
    cleaned_transcript: string
  }
  const [transcriptReviewOpen, setTranscriptReviewOpen] = useState(false)
  const [transcriptReviewLoading, setTranscriptReviewLoading] = useState(false)
  const [transcriptReviewLines, setTranscriptReviewLines] = useState<TranscriptReviewLine[]>([])
  const [transcriptReviewNotice, setTranscriptReviewNotice] = useState<string | null>(null)
  const [transcriptReviewShowAi, setTranscriptReviewShowAi] = useState(false)
  const transcriptReviewOnCloseRef = useRef<(() => void) | null>(null)

  const dailyCallRef = useRef<DailyCall | null>(null)
  const dailyFrameContainerRef = useRef<HTMLDivElement | null>(null)
  const roleRef = useRef(role)
  const userNameRef = useRef(userName)

  useEffect(() => {
    roleRef.current = role
  }, [role])
  useEffect(() => {
    userNameRef.current = userName
  }, [userName])

  /** Prevents re-fetching Daily room on Supabase session refresh (new `user` object) — a common cause of mid-call timeouts and full-screen errors. */
  const roomFetchCompletedForEncounterRef = useRef<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirectedFrom=/video')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!encounterId || !user?.id || authLoading) {
      setIsLoading(false)
      return
    }

    // Same encounter already resolved — do not race again (token still valid in state).
    if (roomFetchCompletedForEncounterRef.current === encounterId) {
      setIsLoading(false)
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutMs = 30000

    const fetchRoom = async () => {
      setIsLoading(true)
      setError(null)

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Connection timed out. Please try again.')),
          timeoutMs
        )
      })

      const work = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

        const response = await fetch('/api/daily/room', {
          method: 'POST',
          headers,
          body: JSON.stringify({ encounterId: Number(encounterId) }),
        })
        const room = await response.json()
        return { response, room }
      }

      try {
        const { response, room } = await Promise.race([work(), timeoutPromise])
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = undefined
        }

        if (cancelled) return

        if (!response.ok) {
          throw new Error(room?.error || 'Failed to join video room')
        }

        if (!room?.name) {
          throw new Error('Invalid room data')
        }

        if (!room?.token) {
          throw new Error('Could not get join token. Please try again.')
        }

        roomFetchCompletedForEncounterRef.current = encounterId
        setRoomName(room.name)
        setRoomToken(room.token)
        setRoomUrl(room.room_url ?? null)
        setIsLoading(false)
      } catch (err) {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = undefined
        }
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to join video room')
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchRoom()
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [encounterId, user?.id, authLoading, supabase])

  useEffect(() => {
    if (!encounterId || !supabase) return

    const fetchDetails = async () => {
      setDetailsLoading(true)
      try {
        const { data: enc } = await supabase
          .from('encounters')
          .select('*')
          .eq('id', Number(encounterId))
          .single()

        if (!enc) {
          setDetailsLoading(false)
          return
        }

        setEncounter(enc as Encounter)

        let apptRow: Appointment | null = null
        if (enc.appointment_id != null && enc.appointment_id !== undefined) {
          const { data: appt } = await supabase
            .from('appointments')
            .select('id, patient_id, appointment_date, appointment_time, onsite_type')
            .eq('id', enc.appointment_id)
            .maybeSingle()
          apptRow = appt as Appointment
          setAppointment(apptRow)
        } else {
          setAppointment(null)
        }

        const resolvedPatientId =
          enc.patient_id != null && enc.patient_id !== undefined
            ? enc.patient_id
            : apptRow?.patient_id != null
              ? apptRow.patient_id
              : null

        if (resolvedPatientId != null) {
          const { data: pat, error: patErr } = await supabase
            .from('patients')
            .select('*')
            .eq('id', resolvedPatientId)
            .maybeSingle()
          if (patErr) console.error('Error loading patient for video sidebar:', patErr)
          setPatient((pat as Patient) ?? null)
        } else {
          setPatient(null)
        }

        // Intake: try encounter.intake_id first, then by appointment_id
        let intakeResult: IntakeForm | null = null
        if (enc.intake_id) {
          const { data: int } = await supabase
            .from('intake_form')
            .select('chief_complaint, symptoms_description, location, severity, onset, medical_conditions, allergies, current_medications, surgeries, tobacco_use, alcohol_use, drug_use')
            .eq('id', enc.intake_id)
            .maybeSingle()
          intakeResult = int as IntakeForm
        }
        if (!intakeResult && enc.appointment_id) {
          const { data: int } = await supabase
            .from('intake_form')
            .select('chief_complaint, symptoms_description, location, severity, onset, medical_conditions, allergies, current_medications, surgeries, tobacco_use, alcohol_use, drug_use')
            .eq('appointment_id', enc.appointment_id)
            .maybeSingle()
          intakeResult = int as IntakeForm
        }
        if (intakeResult) setIntake(intakeResult)

        const { data: vit } = await supabase
          .from('vitals')
          .select('*')
          .eq('encounter_id', Number(encounterId))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setVitals(vit as Vitals)

        let soapData: SOAPNotes | null = null
        const { data: soapEnc, error: soapEncErr } = await supabase
          .from('ai_soapnotes')
          .select('subjective_text, objective_text, assessment_text, plan_text')
          .eq('encounter_id', Number(encounterId))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (soapEncErr?.code === '42703') {
          const { data: soapAppt } = await supabase
            .from('ai_soapnotes')
            .select('subjective_text, objective_text, assessment_text, plan_text')
            .eq('appointment_id', enc.appointment_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          soapData = soapAppt as SOAPNotes
        } else if (soapEnc) {
          soapData = soapEnc as SOAPNotes
        } else {
          const { data: soapAppt } = await supabase
            .from('ai_soapnotes')
            .select('subjective_text, objective_text, assessment_text, plan_text')
            .eq('appointment_id', enc.appointment_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          soapData = soapAppt as SOAPNotes
        }
        setSoapNotes(soapData)

        const { data: { user: authUser } } = await supabase.auth.getUser()
        const { data: docRow } = await supabase
          .from('doctors')
          .select('id')
          .eq('user_id', authUser?.id)
          .maybeSingle()
        if (docRow) setDoctorId(docRow.id)

        const { data: docSoap } = await supabase
          .from('doctor_soapnotes')
          .select('id, subjective_text, objective_text, assessment_text, plan_text')
          .eq('encounter_id', Number(encounterId))
          .maybeSingle()
        if (docSoap) {
          setDoctorSoap(docSoap as DoctorSOAPNotes)
          setSoapForm({
            subjective_text: docSoap.subjective_text ?? '',
            objective_text: docSoap.objective_text ?? '',
            assessment_text: docSoap.assessment_text ?? '',
            plan_text: docSoap.plan_text ?? '',
          })
        } else {
          setSoapForm({
            subjective_text: '',
            objective_text: '',
            assessment_text: '',
            plan_text: '',
          })
        }

        if (authUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('uid', authUser.id)
            .maybeSingle()
          const name = profile?.full_name || authUser.email?.split('@')[0] || 'User'
          setUserName(name)
        }
      } catch (e) {
        console.error('Error fetching patient details:', e)
      } finally {
        setDetailsLoading(false)
      }
    }

    fetchDetails()
  }, [encounterId, supabase])

  // For nurses/staff: watch encounter status; if doctor concludes, show message then send them back to virtual waiting room
  useEffect(() => {
    if (!encounterId || !supabase) return
    if (role === 'doctor') return
    if (sessionEnded) return

    const encounterIdNum = Number(encounterId)
    if (Number.isNaN(encounterIdNum)) return

    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('encounters')
          .select('status')
          .eq('id', encounterIdNum)
          .maybeSingle()

        if (!error && data?.status === 'consultation_concluded') {
          setSessionEnded(true)
          setEndMessage(
            `Doctor has concluded the consultation. Returning to virtual waiting room...`
          )
          setTimeout(() => {
            const dest = role === 'nurse' || role === 'staff'
              ? `/dashboard/nurse-flowboard?encounter=${encounterIdNum}`
              : `/dashboard/flowboard?encounter=${encounterIdNum}`
            router.push(dest)
          }, 5000)
        }
      } catch (e) {
        // Ignore polling errors; try again on next tick
        console.error('Error polling encounter status:', e)
      }
    }, 10000) // poll every 10 seconds

    return () => clearInterval(interval)
  }, [encounterId, supabase, role, sessionEnded, router])

  const addTranscriptEntry = useCallback((speakerRole: string, speakerName: string, message: string) => {
    transcriptBufferRef.current.push({
      speaker_role: speakerRole,
      speaker_name: speakerName,
      message,
      created_at: new Date().toISOString(),
    })
    setTranscriptCount(transcriptBufferRef.current.length)
  }, [])

  // Daily call object receives transcription + app-message; raw iframe embed does not post these to window.
  useEffect(() => {
    if (!dailyJoinUrl || !isConnected) {
      const existing = dailyCallRef.current
      if (existing) {
        dailyCallRef.current = null
        void existing.destroy()
      }
      return
    }

    const container = dailyFrameContainerRef.current
    if (!container) return

    let cancelled = false

    const setup = async () => {
      const { default: Daily } = await import('@daily-co/daily-js')
      if (cancelled) return

      const prev = dailyCallRef.current
      if (prev) {
        dailyCallRef.current = null
        await prev.destroy().catch(() => {})
      }

      const call = Daily.createFrame(container, {
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: '0',
          position: 'absolute',
          top: '0',
          left: '0',
        },
        showLeaveButton: false,
        userName: userNameRef.current || undefined,
      })

      if (cancelled) {
        void call.destroy()
        return
      }

      dailyCallRef.current = call

      const onJoinedMeeting = (ev: { participants: DailyParticipantsObject }) => {
        mergeParticipantsIntoNames(ev.participants, participantNamesRef.current)
        try {
          call.startTranscription({ includeRawResponse: true })
        } catch (err) {
          console.warn('Daily startTranscription:', err)
        }
      }

      const onParticipant = (ev: {
        participant: { session_id: string; user_id: string; user_name: string }
      }) => {
        const p = ev.participant
        if (p.session_id && p.user_name) {
          participantNamesRef.current[p.session_id] = p.user_name
          if (p.user_id) participantNamesRef.current[p.user_id] = p.user_name
        }
      }

      const onTranscriptionMessage = (ev: {
        participantId: string
        text: string
        rawResponse?: Record<string, unknown>
      }) => {
        const text = ev.text?.trim()
        if (!text) return
        if (!isFinalTranscriptionSegment(ev.rawResponse)) return
        const pid = ev.participantId ?? ''
        const uname = userNameRef.current
        const r = roleRef.current
        const resolvedName = participantNamesRef.current[pid] || uname || 'Participant'
        const speakerRole =
          r === 'doctor' && resolvedName === uname
            ? 'doctor'
            : r === 'nurse' && resolvedName === uname
              ? 'nurse'
              : 'patient'
        addTranscriptEntry(speakerRole, resolvedName, text)
      }

      const onAppMessage = (ev: {
        fromId: string
        data: { message?: string; name?: string }
      }) => {
        const text = ev.data?.message?.trim()
        if (!text) return
        const uname = userNameRef.current
        const r = roleRef.current
        const resolvedName = participantNamesRef.current[ev.fromId] || ev.data?.name || 'Participant'
        const speakerRole = resolvedName === uname ? (r ?? 'staff') : 'patient'
        addTranscriptEntry(speakerRole, resolvedName, `[chat] ${text}`)
      }

      call.on('joined-meeting', onJoinedMeeting)
      call.on('participant-joined', onParticipant)
      call.on('participant-updated', onParticipant)
      call.on('transcription-message', onTranscriptionMessage)
      call.on('app-message', onAppMessage)
      call.on('transcription-error', (ev) => console.warn('Daily transcription-error:', ev))

      try {
        await call.join({ url: dailyJoinUrl })
      } catch (e) {
        console.error('Daily join failed:', e)
        if (!cancelled) {
          dailyCallRef.current = null
          void call.destroy()
          setDailyJoinUrl(null)
          setIsConnected(false)
          setError(e instanceof Error ? e.message : 'Failed to join video call')
        }
      }
    }

    void setup()

    return () => {
      cancelled = true
      const c = dailyCallRef.current
      dailyCallRef.current = null
      if (c) void c.destroy()
    }
  }, [dailyJoinUrl, isConnected, addTranscriptEntry])

  /** Saves buffered transcript lines; returns inserted row ids in order, or null on failure. */
  const flushTranscript = async (encounterIdNum: number): Promise<number[] | null> => {
    const items = transcriptBufferRef.current
    if (!items.length) return []
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch('/api/transcripts/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ encounterId: encounterIdNum, items }),
      })
      const data = (await res.json().catch(() => ({}))) as { ids?: number[]; error?: string }
      if (!res.ok) {
        console.error('Failed to save transcript:', data.error ?? res.status)
        return null
      }
      const ids = data.ids
      if (!Array.isArray(ids) || ids.length !== items.length) {
        console.error('Save transcript: missing or mismatched ids')
        return null
      }
      transcriptBufferRef.current = []
      setTranscriptCount(0)
      return ids.map((id) => Number(id))
    } catch (e) {
      console.error('Failed to save transcript:', e)
      return null
    }
  }

  const closeTranscriptReview = () => {
    setTranscriptReviewOpen(false)
    setTranscriptReviewLines([])
    setTranscriptReviewNotice(null)
    setTranscriptReviewShowAi(false)
    setAiSummary(null)
    setAiSummaryError(null)
    setAiSummaryLoading(false)
    const fn = transcriptReviewOnCloseRef.current
    transcriptReviewOnCloseRef.current = null
    fn?.()
  }

  const fetchAndOpenTranscriptReview = async (
    encounterIdNum: number,
    items: Array<{ speaker_role: string; speaker_name: string; message: string; created_at: string }>,
    ids: number[],
    options: { showAiSummary: boolean; onClose: () => void }
  ) => {
    transcriptReviewOnCloseRef.current = options.onClose
    setTranscriptReviewShowAi(options.showAiSummary)
    setTranscriptReviewOpen(true)
    setTranscriptReviewLoading(true)
    setTranscriptReviewNotice(null)
    setTranscriptReviewLines([])

    if (options.showAiSummary) {
      void triggerAiSummary(encounterIdNum, items, { showPanel: false })
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch('/api/clean-transcript', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          encounterId: encounterIdNum,
          items: items.map((t, i) => ({
            id: ids[i]!,
            speaker_role: t.speaker_role,
            speaker_name: t.speaker_name,
            message: t.message,
          })),
        }),
      })
      const data = (await res.json()) as {
        lines?: TranscriptReviewLine[]
        skipped_clean?: boolean
        skip_reason?: string
        error?: string
      }
      if (!res.ok) {
        throw new Error(data.error ?? 'Clean transcript failed')
      }
      setTranscriptReviewLines(data.lines ?? [])
      if (data.skipped_clean && data.skip_reason === 'line_limit_500') {
        setTranscriptReviewNotice(
          'Transcript was not AI-cleaned (over 500 lines). Showing original text.'
        )
      }
    } catch (e) {
      console.error(e)
      setTranscriptReviewNotice(
        e instanceof Error ? e.message : 'Could not clean transcript. Showing original text.'
      )
      setTranscriptReviewLines(
        items.map((t, i) => ({
          id: ids[i]!,
          speaker_role: t.speaker_role,
          speaker_name: t.speaker_name,
          message: t.message,
          cleaned_transcript: t.message,
        }))
      )
    } finally {
      setTranscriptReviewLoading(false)
    }
  }

  const triggerAiSummary = async (
    encounterIdNum: number,
    inlineItems: Array<{ speaker_role: string; speaker_name: string; message: string; created_at: string }>,
    opts?: { showPanel?: boolean }
  ) => {
    const showPanel = opts?.showPanel !== false
    setAiSummaryLoading(true)
    setAiSummaryError(null)
    if (showPanel) setShowSummaryPanel(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch(`/api/encounters/${encounterIdNum}/ai-summary`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ inlineTranscript: inlineItems }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAiSummaryError(data.error ?? 'AI summary failed')
      } else {
        setAiSummary(data.summary as Record<string, unknown>)
      }
    } catch (e) {
      setAiSummaryError(e instanceof Error ? e.message : 'AI summary failed')
    } finally {
      setAiSummaryLoading(false)
    }
  }

  const handleConnect = () => {
    if (!roomToken) return
    const baseUrl = roomUrl || (() => {
      const rawDomain = (config.daily.domain || '').trim() || 'demo.daily.co'
      const d = rawDomain.includes('.daily.co') ? rawDomain : `${rawDomain}.daily.co`
      return `https://${d}/${roomName}`
    })()
    const sep = baseUrl.includes('?') ? '&' : '?'
    setDailyJoinUrl(`${baseUrl}${sep}t=${encodeURIComponent(roomToken)}`)
    setShowConnectionModal(false)
    setError(null)
    setIsConnected(true)
  }

  const handleEndCall = async () => {
    setDailyJoinUrl(null)
    setIsConnected(false)
    if (role === 'doctor' && encounterId && doctorId) {
      await handleEndConsultation()
      return
    }
    const encounterIdNum = encounterId ? Number(encounterId) : NaN
    if (!encounterId || Number.isNaN(encounterIdNum)) {
      router.push('/dashboard')
      return
    }
    const items = [...transcriptBufferRef.current]
    const ids = await flushTranscript(encounterIdNum)
    const dest =
      role === 'nurse' || role === 'staff'
        ? `/dashboard/nurse-flowboard?encounter=${encounterId}`
        : `/dashboard/flowboard?encounter=${encounterId}`
    const go = () => router.push(dest)
    if (items.length > 0 && ids && ids.length === items.length) {
      await fetchAndOpenTranscriptReview(encounterIdNum, items, ids, {
        showAiSummary: false,
        onClose: go,
      })
    } else {
      if (items.length > 0) {
        alert('Transcript could not be saved.')
      }
      go()
    }
  }

  const validateDoctorSoap = (): boolean => {
    const fields: Array<keyof typeof soapForm> = [
      'subjective_text',
      'objective_text',
      'assessment_text',
      'plan_text',
    ]
    for (const field of fields) {
      const value = soapForm[field]
      if (typeof value !== 'string' || !value.trim()) {
        alert('All SOAP sections (Subjective, Objective, Assessment, Plan) must be filled in before continuing.')
        return false
      }
    }
    return true
  }

  const handleSaveDoctorSoap = async () => {
    if (!encounterId || !doctorId || role !== 'doctor') return
    if (!validateDoctorSoap()) return

    setSavingSoap(true)
    try {
      const payload = {
        encounter_id: Number(encounterId),
        doctor_id: doctorId,
        subjective_text: soapForm.subjective_text!.trim(),
        objective_text: soapForm.objective_text!.trim(),
        assessment_text: soapForm.assessment_text!.trim(),
        plan_text: soapForm.plan_text!.trim(),
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('doctor_soapnotes')
        .upsert(payload, {
          onConflict: 'encounter_id',
          ignoreDuplicates: false,
        })
      if (error) throw error
      setDoctorSoap({ ...soapForm })
    } catch (e) {
      console.error('Error saving doctor SOAP:', e)
      alert('Failed to save SOAP note. Please try again.')
    } finally {
      setSavingSoap(false)
    }
  }

  const handleEndConsultation = async () => {
    if (!encounterId || !doctorId || role !== 'doctor') return
    if (!validateDoctorSoap()) return

    setSavingSoap(true)
    try {
      const encounterIdNum = Number(encounterId)
      const payload = {
        encounter_id: encounterIdNum,
        doctor_id: doctorId,
        subjective_text: soapForm.subjective_text!.trim(),
        objective_text: soapForm.objective_text!.trim(),
        assessment_text: soapForm.assessment_text!.trim(),
        plan_text: soapForm.plan_text!.trim(),
        updated_at: new Date().toISOString(),
      }

      // Save/overwrite doctor SOAP note (ensures nothing is null)
      const { error: soapError } = await supabase
        .from('doctor_soapnotes')
        .upsert(payload, {
          onConflict: 'encounter_id',
          ignoreDuplicates: false,
        })
      if (soapError) throw soapError

      setDoctorSoap({ ...soapForm })

      // Move encounter to consultation_concluded
      const { error: encounterError } = await supabase
        .from('encounters')
        .update({
          status: 'consultation_concluded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', encounterIdNum)

      if (encounterError) throw encounterError

      if (user?.id) {
        const profileId = await getProfileId(supabase, user.id)
        await insertStatusTimeline(supabase, {
          encounterId: encounterIdNum,
          status: 'consultation_concluded',
          profileId,
        })
      }

      const inlineItems = [...transcriptBufferRef.current]
      const transcriptIds = await flushTranscript(encounterIdNum)

      const endRoomAndGo = async () => {
        try {
          await fetch('/api/daily/end-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ encounterId: encounterIdNum }),
          })
        } catch (endRoomError) {
          console.error('Failed to end Daily.co room:', endRoomError)
        }
        router.push(encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard')
      }

      if (inlineItems.length > 0 && transcriptIds && transcriptIds.length === inlineItems.length) {
        await fetchAndOpenTranscriptReview(encounterIdNum, inlineItems, transcriptIds, {
          showAiSummary: true,
          onClose: endRoomAndGo,
        })
      } else {
        if (inlineItems.length > 0) {
          alert('Transcript could not be saved. You can continue; lines were not persisted.')
        }
        await endRoomAndGo()
      }
    } catch (e) {
      console.error('Error ending consultation:', e)
      alert('Failed to end consultation. Please try again.')
    } finally {
      setSavingSoap(false)
    }
  }

  const getAiSectionText = (section: 'subjective' | 'objective' | 'assessment' | 'plan'): string => {
    if (!soapNotes) return ''
    const text = cleanSoapSection(
      soapNotes[`${section}_text` as keyof SOAPNotes] as string | null,
      section
    )
    return (text ?? '').trim()
  }

  const aiPlaceholder = (section: 'subjective' | 'objective' | 'assessment' | 'plan') => {
    if (!soapNotes) return 'AI note will appear here when available'
    const t = getAiSectionText(section)
    return t || 'Will be updated.'
  }

  const handleCopyAllFromAi = () => {
    if (!soapNotes) return
    setSoapForm({
      subjective_text: getAiSectionText('subjective'),
      objective_text: getAiSectionText('objective'),
      assessment_text: getAiSectionText('assessment'),
      plan_text: getAiSectionText('plan'),
    })
  }


  if (!encounterId && !authLoading && user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="text-red-500 mb-4 text-center max-w-md">
          Encounter ID is required. Please join from the virtual waiting room.
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <LoadingSpinner message="Loading..." showPercentage={false} />
      </div>
    )
  }

  if (!user) return null

  // Do not replace the whole page while the Daily iframe is active (avoids kicking users out mid-call if a late error fires).
  if (error && !showConnectionModal && !dailyJoinUrl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="text-red-500 mb-4 text-center max-w-md">Error: {error}</div>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const roleLabel = role === 'doctor' ? 'Doctor' : role === 'nurse' ? 'Nurse' : 'Staff'

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-black">
      {/* Connection Modal */}
      <TelemedicineConnectionModal
        isOpen={showConnectionModal && !isLoading && !!roomToken}
        userName={userName || 'User'}
        userRole={roleLabel}
        onConnect={handleConnect}
        onCancel={() => {
          const dest =
            role === 'nurse' || role === 'staff'
              ? (encounterId ? `/dashboard/nurse-flowboard?encounter=${encounterId}` : '/dashboard')
              : (encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard')
          router.push(dest)
        }}
      />

      {/* Cleaned transcript review — after call ends; must dismiss to continue */}
      {transcriptReviewOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
              <div>
                <h2 className="text-white font-semibold text-base">Session transcript</h2>
                <p className="text-gray-500 text-xs mt-0.5">AI-cleaned for grammar and clarity</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]">
              {transcriptReviewLoading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-400 text-sm">Cleaning transcript…</p>
                </div>
              )}
              {transcriptReviewNotice && !transcriptReviewLoading && (
                <div className="bg-amber-900/25 border border-amber-700/40 rounded-lg px-3 py-2 text-amber-200/90 text-xs">
                  {transcriptReviewNotice}
                </div>
              )}
              {!transcriptReviewLoading &&
                transcriptReviewLines.map((line) => {
                  const isPatient = line.speaker_role === 'patient'
                  const label = `${line.speaker_role.charAt(0).toUpperCase()}${line.speaker_role.slice(1)} · ${line.speaker_name}`
                  return (
                    <div
                      key={line.id}
                      className={`flex flex-col gap-0.5 ${isPatient ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[10px] uppercase tracking-wide text-gray-500 px-1">{label}</span>
                      <div
                        className={`max-w-[95%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          isPatient
                            ? 'bg-teal-900/40 text-gray-100 rounded-br-md border border-teal-800/50'
                            : 'bg-gray-800 text-gray-100 rounded-bl-md border border-gray-700'
                        }`}
                      >
                        {line.cleaned_transcript}
                      </div>
                    </div>
                  )
                })}

              {transcriptReviewShowAi && !transcriptReviewLoading && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
                  <h3 className="text-cyan-400 text-xs font-semibold uppercase tracking-wide">AI consultation summary</h3>
                  {aiSummaryLoading && (
                    <p className="text-gray-500 text-sm">Generating summary…</p>
                  )}
                  {aiSummaryError && (
                    <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-xs">
                      {aiSummaryError === 'No transcript available for this encounter'
                        ? 'No transcript was captured for this session.'
                        : aiSummaryError}
                    </div>
                  )}
                  {aiSummary && !aiSummaryLoading && (
                    <div className="space-y-3 text-sm text-gray-200">
                      {aiSummary.summary ? (
                        <div>
                          <p className="text-gray-500 text-[10px] uppercase mb-1">Summary</p>
                          <p className="bg-white/5 rounded-lg p-2">{String(aiSummary.summary)}</p>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        {aiSummary.chief_complaint ? (
                          <div>
                            <p className="text-gray-500 text-[10px] uppercase mb-1">Chief complaint</p>
                            <p className="bg-white/5 rounded-lg p-2 text-xs">{String(aiSummary.chief_complaint)}</p>
                          </div>
                        ) : null}
                        {aiSummary.diagnosis ? (
                          <div>
                            <p className="text-gray-500 text-[10px] uppercase mb-1">Diagnosis</p>
                            <p className="bg-white/5 rounded-lg p-2 text-xs">{String(aiSummary.diagnosis)}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-800 flex-shrink-0">
              <button
                type="button"
                onClick={closeTranscriptReview}
                disabled={transcriptReviewLoading}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Summary Panel — shown to doctor after consultation ends */}
      {showSummaryPanel && role === 'doctor' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <div>
                <h2 className="text-white font-semibold text-base">AI Consultation Summary</h2>
                <p className="text-gray-500 text-xs mt-0.5">
                  {transcriptCount > 0
                    ? `Generated from ${transcriptCount} transcript lines`
                    : 'Generated from session transcript'}
                </p>
              </div>
              <button
                onClick={() => setShowSummaryPanel(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-auto px-6 py-5 space-y-5 text-sm">
              {aiSummaryLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-400 text-sm">Analyzing session transcript...</p>
                </div>
              )}

              {aiSummaryError && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4 text-red-300 text-sm">
                  {aiSummaryError === 'No transcript available for this encounter'
                    ? 'No transcript was captured for this session. Transcript capture requires Daily.co captioning to be active during the call.'
                    : aiSummaryError}
                </div>
              )}

              {aiSummary && !aiSummaryLoading && (
                <>
                  {/* Summary */}
                  {aiSummary.summary ? (
                    <div>
                      <label className="text-cyan-400 text-xs font-semibold uppercase tracking-wide block mb-1.5">Summary</label>
                      <p className="bg-white/5 rounded-lg p-3 text-gray-200 leading-relaxed">{String(aiSummary.summary)}</p>
                    </div>
                  ) : null}

                  {/* Chief Complaint + Diagnosis row */}
                  <div className="grid grid-cols-2 gap-4">
                    {aiSummary.chief_complaint ? (
                      <div>
                        <label className="text-cyan-400 text-xs font-semibold uppercase tracking-wide block mb-1.5">Chief Complaint</label>
                        <p className="bg-white/5 rounded-lg p-3 text-gray-200">{String(aiSummary.chief_complaint)}</p>
                      </div>
                    ) : null}
                    {aiSummary.diagnosis ? (
                      <div>
                        <label className="text-cyan-400 text-xs font-semibold uppercase tracking-wide block mb-1.5">Diagnosis</label>
                        <p className="bg-white/5 rounded-lg p-3 text-gray-200">{String(aiSummary.diagnosis)}</p>
                      </div>
                    ) : null}
                  </div>

                  {/* Follow-up */}
                  {aiSummary.follow_up != null && typeof aiSummary.follow_up === 'object' ? (
                    <div className={`rounded-lg p-4 border ${(aiSummary.follow_up as Record<string, unknown>).needed ? 'bg-amber-900/20 border-amber-600/40' : 'bg-white/5 border-gray-700'}`}>
                      <label className="text-amber-300 text-xs font-semibold uppercase tracking-wide block mb-2">Follow-Up</label>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-gray-500 text-xs mb-0.5">Needed</p>
                          <p className={`font-medium ${(aiSummary.follow_up as Record<string, unknown>).needed ? 'text-amber-300' : 'text-gray-400'}`}>
                            {(aiSummary.follow_up as Record<string, unknown>).needed ? 'Yes' : 'No'}
                          </p>
                        </div>
                        {(aiSummary.follow_up as Record<string, unknown>).timeframe ? (
                          <div>
                            <p className="text-gray-500 text-xs mb-0.5">Timeframe</p>
                            <p className="text-white font-medium">{String((aiSummary.follow_up as Record<string, unknown>).timeframe)}</p>
                          </div>
                        ) : null}
                        {(aiSummary.follow_up as Record<string, unknown>).reason ? (
                          <div>
                            <p className="text-gray-500 text-xs mb-0.5">Reason</p>
                            <p className="text-gray-200">{String((aiSummary.follow_up as Record<string, unknown>).reason)}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Plan */}
                  {aiSummary.plan ? (
                    <div>
                      <label className="text-cyan-400 text-xs font-semibold uppercase tracking-wide block mb-1.5">Plan</label>
                      <p className="bg-white/5 rounded-lg p-3 text-gray-200 leading-relaxed">{String(aiSummary.plan)}</p>
                    </div>
                  ) : null}

                  {/* Tests + Medications row */}
                  <div className="grid grid-cols-2 gap-4">
                    {Array.isArray(aiSummary.tests_ordered) && aiSummary.tests_ordered.length > 0 && (
                      <div>
                        <label className="text-cyan-400 text-xs font-semibold uppercase tracking-wide block mb-1.5">Tests Ordered</label>
                        <ul className="bg-white/5 rounded-lg p-3 space-y-0.5">
                          {(aiSummary.tests_ordered as string[]).map((t, i) => (
                            <li key={i} className="text-gray-200 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(aiSummary.medications_mentioned) && aiSummary.medications_mentioned.length > 0 && (
                      <div>
                        <label className="text-cyan-400 text-xs font-semibold uppercase tracking-wide block mb-1.5">Medications</label>
                        <ul className="bg-white/5 rounded-lg p-3 space-y-0.5">
                          {(aiSummary.medications_mentioned as string[]).map((m, i) => (
                            <li key={i} className="text-gray-200 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                              {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Patient Instructions */}
                  {aiSummary.patient_instructions ? (
                    <div>
                      <label className="text-cyan-400 text-xs font-semibold uppercase tracking-wide block mb-1.5">Patient Instructions</label>
                      <p className="bg-white/5 rounded-lg p-3 text-gray-200 leading-relaxed">{String(aiSummary.patient_instructions)}</p>
                    </div>
                  ) : null}

                  {/* Red Flags */}
                  {Array.isArray(aiSummary.red_flags) && aiSummary.red_flags.length > 0 && (
                    <div>
                      <label className="text-red-400 text-xs font-semibold uppercase tracking-wide block mb-1.5">Red Flags / Warning Signs</label>
                      <ul className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 space-y-0.5">
                        {(aiSummary.red_flags as string[]).map((f, i) => (
                          <li key={i} className="text-red-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {!aiSummaryLoading && (
              <div className="px-6 py-4 border-t border-gray-800 flex-shrink-0 flex items-center justify-between">
                <p className="text-gray-600 text-xs">AI-generated — verify before acting on clinical decisions</p>
                <button
                  onClick={() => setShowSummaryPanel(false)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global session-ended overlay for nurses/staff */}
      {endMessage && role !== 'doctor' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="bg-gray-900 border border-amber-500/50 text-white px-8 py-6 rounded-2xl shadow-2xl max-w-sm text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-amber-300 font-semibold text-base mb-1">Session Ended</p>
            <p className="text-gray-400 text-sm">{endMessage}</p>
          </div>
        </div>
      )}

      {/* Top fixed header */}
      <header className="sticky top-0 z-50 flex-shrink-0 h-14 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 flex items-center px-4 gap-4">
        <button
          onClick={() => {
            const dest =
              role === 'nurse' || role === 'staff'
                ? (encounterId ? `/dashboard/nurse-flowboard?encounter=${encounterId}` : '/dashboard')
                : (encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard')
            router.push(dest)
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to virtual waiting room
        </button>
        <span className="text-gray-400 text-sm font-medium">
          {patient ? `${patient.first_name} ${patient.last_name}` : 'Telemedicine Session'}
        </span>

        {/* Patient link: copy room URL for sharing with patient */}
        {roomUrl && (
          <button
            title="Copy patient join link"
            onClick={() => {
              navigator.clipboard.writeText(roomUrl).then(() => alert('Patient link copied!')).catch(() => {})
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Patient Link
          </button>
        )}

        {transcriptCount > 0 && (
          <span className="text-xs text-gray-500 hidden sm:block">
            {transcriptCount} transcript {transcriptCount === 1 ? 'entry' : 'entries'}
          </span>
        )}

        {isConnected && (
          <button
            onClick={handleEndCall}
            className="ml-auto px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            End Call
          </button>
        )}
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Video: plain iframe with Daily room URL + token */}
        <div className="flex-1 bg-black flex items-center justify-center relative min-h-0">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full">
              <LoadingSpinner message="Loading video call..." showPercentage={false} />
            </div>
          )}
          {!isLoading && !isConnected && !showConnectionModal && (
            <div className="flex flex-col items-center justify-center h-full text-white">
              <p className="text-lg mb-4">Preparing video call...</p>
            </div>
          )}
          {isConnected && dailyJoinUrl && (
            <div
              ref={dailyFrameContainerRef}
              className="absolute inset-x-0 top-2 bottom-0 w-full h-full"
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="w-full max-w-md bg-gray-900 border-l border-gray-800 text-white flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Patient Details</h2>
              {isConnected && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            {encounter && (
              <span className="text-xs text-gray-500 block mt-0.5">
                {getStatusInfo(encounter.status as any)?.label || encounter.status}
                {encounter.encounter_code && ` · ${encounter.encounter_code}`}
              </span>
            )}
          </div>
          {!detailsLoading && (
            <div className="flex border-b border-gray-800 flex-shrink-0 overflow-x-auto">
              {(['patient', 'intake', 'vitals', 'soap'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDetailsTab(tab)}
                  className={`flex-shrink-0 px-2 py-2 text-xs font-medium capitalize transition-colors ${
                    detailsTab === tab ? 'text-white border-b-2 border-blue-500 bg-white/5' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab === 'soap' ? 'SOAP' : tab}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-auto p-4 text-sm">
            {detailsLoading ? (
              <LoadingSpinner message="Loading details..." showPercentage={false} size="sm" />
            ) : (
              <>
                {detailsTab === 'patient' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
                      <p className="text-blue-300 font-semibold mb-3">Patient information</p>
                      {patient ? (
                        <div className="space-y-2.5 text-gray-300 text-sm">
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wide">Name</p>
                            <p className="text-white font-medium">
                              {patient.first_name} {patient.last_name}
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wide">Patient code</p>
                              <p className="font-mono text-gray-200">{patient.patient_code || '—'}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wide">Age</p>
                              <p>{calculateAge(patient.date_of_birth)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wide">Date of birth</p>
                              <p>{formatDate(patient.date_of_birth)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wide">Gender</p>
                              <p>{patient.gender || '—'}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-gray-500 text-xs uppercase tracking-wide">Email</p>
                              <p className="break-all">{patient.email || '—'}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wide">Phone</p>
                              <p>{patient.phone || '—'}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-gray-500 text-xs uppercase tracking-wide">Address</p>
                              <p>
                                {[patient.street_address, patient.state, patient.zip_code].filter(Boolean).length > 0
                                  ? [patient.street_address, patient.state, patient.zip_code].filter(Boolean).join(', ')
                                  : '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm">
                          Could not load patient demographics (check patient link on encounter/appointment or access
                          permissions).
                        </p>
                      )}
                    </div>

                    {intake && patient && (
                      <PreVisitSummary
                        intake={intake}
                        patientName={`${patient.first_name} ${patient.last_name}`}
                      />
                    )}

                    {appointment && (
                      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
                        <p className="text-blue-300 font-semibold mb-3">Appointment</p>
                        <div className="space-y-2 text-gray-300 text-sm">
                          <p>
                            <span className="text-gray-500">Date: </span>
                            {formatDate(appointment.appointment_date)}
                          </p>
                          <p>
                            <span className="text-gray-500">Time: </span>
                            {appointment.appointment_time || '—'}
                          </p>
                          <p>
                            <span className="text-gray-500">Type: </span>
                            {appointment.onsite_type || '—'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {detailsTab === 'intake' && (
                  <div className="space-y-1 text-gray-300">
                    {intake ? (
                      <>
                        <p>Chief Complaint: {intake.chief_complaint || 'N/A'}</p>
                        {intake.symptoms_description && <p>Symptoms: {intake.symptoms_description}</p>}
                        {intake.location && <p>Location: {intake.location}</p>}
                        {intake.severity != null && <p>Severity: {intake.severity}/10</p>}
                        {intake.onset && <p>Onset: {formatDate(intake.onset)}</p>}
                        {intake.medical_conditions && (
                          <p>Conditions: {Array.isArray(intake.medical_conditions) ? intake.medical_conditions.join(', ') : 'N/A'}</p>
                        )}
                        {intake.allergies && (
                          <p>Allergies: {Array.isArray(intake.allergies) ? intake.allergies.join(', ') : 'N/A'}</p>
                        )}
                        {intake.current_medications && (
                          <p>Meds: {Array.isArray(intake.current_medications) ? intake.current_medications.join(', ') : 'N/A'}</p>
                        )}
                        <p>Tobacco: {intake.tobacco_use ? 'Yes' : 'No'} | Alcohol: {intake.alcohol_use ? 'Yes' : 'No'} | Drugs: {intake.drug_use ? 'Yes' : 'No'}</p>
                      </>
                    ) : (
                      <p className="text-gray-400">Intake not available</p>
                    )}
                  </div>
                )}
                {detailsTab === 'vitals' && (
                  <div className="grid grid-cols-2 gap-2 text-gray-300">
                    {vitals ? (
                      <>
                        <p>BP: {vitals.bp_systolic && vitals.bp_diastolic ? `${vitals.bp_systolic}/${vitals.bp_diastolic}` : 'N/A'}</p>
                        <p>HR: {vitals.heart_rate ? `${vitals.heart_rate} bpm` : 'N/A'}</p>
                        <p>Temp: {vitals.temperature ? `${vitals.temperature}°${vitals.temperature_unit || 'F'}` : 'N/A'}</p>
                        <p>SpO2: {vitals.spo2 ? `${vitals.spo2}%` : 'N/A'}</p>
                        <p>RR: {vitals.respiratory_rate ? `${vitals.respiratory_rate}/min` : 'N/A'}</p>
                        <p>Weight: {vitals.weight ? `${vitals.weight} ${vitals.weight_unit || 'lbs'}` : 'N/A'}</p>
                        <p>Height: {vitals.height ? `${vitals.height} ${vitals.height_unit || 'in'}` : 'N/A'}</p>
                        <p>BMI: {vitals.bmi ? vitals.bmi.toFixed(1) : 'N/A'}</p>
                        {vitals.notes && <p className="col-span-2">Notes: {vitals.notes}</p>}
                      </>
                    ) : (
                      <p className="text-gray-400 col-span-2">Not recorded</p>
                    )}
                  </div>
                )}
                {detailsTab === 'soap' && (
                  <div className="space-y-3">
                    {role === 'doctor' && doctorId ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <p className="text-cyan-200 text-xs flex-1 min-w-[12rem]">
                            Add your SOAP note. Placeholders show AI suggestions.
                          </p>
                          <button
                            type="button"
                            onClick={handleCopyAllFromAi}
                            disabled={!soapNotes}
                            title={soapNotes ? 'Copy AI suggestions into all fields so you can edit and save' : 'AI SOAP not loaded yet'}
                            className="shrink-0 py-1 px-2.5 rounded-md text-xs font-medium bg-cyan-900/50 text-cyan-200 border border-cyan-700/50 hover:bg-cyan-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Copy from AI
                          </button>
                        </div>
                        <div>
                          <label className="text-cyan-200 text-xs font-medium block mb-1">Subjective</label>
                          <textarea
                            value={soapForm.subjective_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, subjective_text: e.target.value }))}
                            placeholder={aiPlaceholder('subjective')}
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-cyan-200 text-xs font-medium block mb-1">Objective</label>
                          <textarea
                            value={soapForm.objective_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, objective_text: e.target.value }))}
                            placeholder={aiPlaceholder('objective')}
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-cyan-200 text-xs font-medium block mb-1">Assessment</label>
                          <textarea
                            value={soapForm.assessment_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, assessment_text: e.target.value }))}
                            placeholder={aiPlaceholder('assessment')}
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-cyan-200 text-xs font-medium block mb-1">Plan</label>
                          <textarea
                            value={soapForm.plan_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, plan_text: e.target.value }))}
                            placeholder={aiPlaceholder('plan')}
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleSaveDoctorSoap}
                            disabled={savingSoap}
                            className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            {savingSoap ? 'Saving...' : 'Save SOAP Note'}
                          </button>
                          <button
                            type="button"
                            onClick={handleEndConsultation}
                            disabled={savingSoap}
                            className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            {savingSoap ? 'Ending...' : 'End Consultation'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3 text-gray-300">
                        {(doctorSoap || soapNotes) ? (
                          <>
                            <div>
                              <p className="text-cyan-200 text-xs font-medium mb-1">Subjective</p>
                              <p className="bg-white/5 p-2 rounded text-xs">
                                {(doctorSoap?.subjective_text && doctorSoap.subjective_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.subjective_text, 'subjective') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                            <div>
                              <p className="text-cyan-200 text-xs font-medium mb-1">Objective</p>
                              <p className="bg-white/5 p-2 rounded text-xs">
                                {(doctorSoap?.objective_text && doctorSoap.objective_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.objective_text, 'objective') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                            <div>
                              <p className="text-cyan-200 text-xs font-medium mb-1">Assessment</p>
                              <p className="bg-white/5 p-2 rounded text-xs">
                                {(doctorSoap?.assessment_text && doctorSoap.assessment_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.assessment_text, 'assessment') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                            <div>
                              <p className="text-cyan-200 text-xs font-medium mb-1">Plan</p>
                              <p className="bg-white/5 p-2 rounded text-xs">
                                {(doctorSoap?.plan_text && doctorSoap.plan_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.plan_text, 'plan') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                          </>
                        ) : (
                          <p className="text-gray-400">SOAP notes not available yet</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="px-4 py-2 border-t border-gray-800 flex-shrink-0 flex items-center justify-between">
            <button
              onClick={() => {
                const dest = (role === 'nurse' || role === 'staff')
                  ? (encounterId ? `/dashboard/nurse-flowboard?encounter=${encounterId}` : '/dashboard')
                  : (encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard')
                router.push(dest)
              }}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              ← Back to virtual waiting room
            </button>
            {roomUrl && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomUrl).catch(() => {})
                }}
                title="Copy patient join link"
                className="text-xs text-teal-400 hover:text-teal-300"
              >
                Copy patient link
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default withRoleProtection(VideoPage, {
  allowedRoles: [UserRole.DOCTOR, UserRole.NURSE, UserRole.STAFF],
  redirectTo: '/dashboard',
})
