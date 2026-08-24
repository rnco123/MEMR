'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
} from 'livekit-client'
import { useAuth } from '@/lib/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getRoleLabel, isPhysicianRole, CLINICAL_DASHBOARD_ROLES } from '@/lib/roles'
import { getStatusInfo, type EncounterStatus } from '@/lib/encounter-status'
import { TelemedicineConnectionModal } from '@/components/TelemedicineConnectionModal'
import { PreVisitSummary } from '@/components/PreVisitSummary'
import { ageFromCalendarDate, formatCalendarDate } from '@/lib/datetime/date-input'

const CHAT_TOPIC = 'chat'

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
  return formatCalendarDate(dateString, 'en-US', { month: 'short' }) || 'N/A'
}

function calculateAge(dob: string | null) {
  const age = ageFromCalendarDate(dob)
  return age != null ? `${age} years` : 'N/A'
}

interface ChatMessage {
  id?: string
  messageId?: string
  senderIdentity: string
  senderRole?: string
  body: string
  sentAt: string
}

/** REST responses use `id` in some paths and `messageId` in others; data-channel echoes may repeat either. */
function chatMessageKey(msg: ChatMessage): string | undefined {
  return msg.id ?? msg.messageId
}

interface VonLinkageRecording {
  recordingId: string
  status: 'STARTING' | 'RECORDING' | 'STOPPING' | 'COMPLETED' | 'FAILED'
  durationSeconds: number | null
  error: string | null
}

interface TranscriptSegment {
  speakerLabel: string
  text: string
  startedAtSeconds: number
}

async function destroyLivekitRoom(room: Room | null | undefined) {
  if (!room) return
  await room.disconnect().catch(() => {})
}

function VideoPage() {
  const { user, loading: authLoading, role } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const encounterId = searchParams.get('encounter')
  const [error, setError] = useState<string | null>(null)
  const [roomToken, setRoomToken] = useState<string | null>(null)
  const [roomName, setRoomName] = useState<string | null>(null)
  const [roomUrl, setRoomUrl] = useState<string | null>(null)
  const [patientJoinUrl, setPatientJoinUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showConnectionModal, setShowConnectionModal] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [livekitJoinUrl, setLivekitJoinUrl] = useState<string | null>(null)
  // Start muted/off (matches the old Daily behavior: start_video_off/start_audio_off) —
  // no track is actually published until the user clicks to enable it, so the default
  // must be false or the toggle buttons' first click would be backwards.
  const [micOn, setMicOn] = useState(false)
  const [camOn, setCamOn] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [recordings, setRecordings] = useState<VonLinkageRecording[]>([])
  const [recordingStarting, setRecordingStarting] = useState(false)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptSegment[] | string>>({})
  const [soapAutoFillLoading, setSoapAutoFillLoading] = useState(false)
  const [soapAutoFillNotice, setSoapAutoFillNotice] = useState<string | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [intake, setIntake] = useState<IntakeForm | null>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [soapNotes, setSoapNotes] = useState<SOAPNotes | null>(null)
  const [doctorSoap, setDoctorSoap] = useState<DoctorSOAPNotes | null>(null)
  const [doctorId, setDoctorId] = useState<number | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [detailsTab, setDetailsTab] = useState<'patient' | 'intake' | 'vitals' | 'soap' | 'recording'>('patient')
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
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
  // AI summary after consultation
  const [aiSummary, setAiSummary] = useState<Record<string, unknown> | null>(null)
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null)
  const [showSummaryPanel, setShowSummaryPanel] = useState(false)
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null)
  const [callElapsed, setCallElapsed] = useState('00:00')

  useEffect(() => {
    if (isConnected && callStartedAt == null) setCallStartedAt(Date.now())
    if (!isConnected) {
      setCallStartedAt(null)
      setCallElapsed('00:00')
    }
  }, [isConnected, callStartedAt])

  useEffect(() => {
    if (!callStartedAt) return
    const id = window.setInterval(() => {
      const sec = Math.floor((Date.now() - callStartedAt) / 1000)
      const m = Math.floor(sec / 60)
      const s = sec % 60
      setCallElapsed(`${m}:${String(s).padStart(2, '0')}`)
    }, 1000)
    return () => window.clearInterval(id)
  }, [callStartedAt])

  const goToWaitingRoom = useCallback(async () => {
    const dest =
      role === 'nurse'
        ? (encounterId ? `/dashboard/nurse-flowboard?encounter=${encounterId}` : '/dashboard')
        : (encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard')
    skipLeaveCleanupRef.current = true
    const room = livekitRoomRef.current
    if (room && room.state === 'connected') {
      await room.disconnect().catch(() => {})
    }
    livekitRoomRef.current = null
    setLivekitJoinUrl(null)
    setIsConnected(false)
    window.setTimeout(() => router.push(dest), 0)
  }, [role, encounterId, router])

  const patientDisplayName = patient
    ? `${patient.first_name} ${patient.last_name}`.trim()
    : 'Telemedicine Session'

  const appointmentPillLabel = appointment?.appointment_date
    ? `${formatDate(appointment.appointment_date)}${appointment.appointment_time ? ` · ${String(appointment.appointment_time).slice(0, 5)}` : ''}`
    : encounter?.encounter_code
      ? `#${encounter.encounter_code}`
      : 'Video visit'

  const floatingCircleBtn =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg shadow-slate-900/10 border border-slate-200 hover:bg-slate-50 active:scale-95 transition-transform'

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

  const livekitRoomRef = useRef<Room | null>(null)
  const livekitTeardownRef = useRef<Promise<void>>(Promise.resolve())
  const livekitSetupGenerationRef = useRef(0)
  const leaveInProgressRef = useRef(false)
  const skipLeaveCleanupRef = useRef(false)
  const runEndCallCleanupRef = useRef<() => Promise<void>>(async () => {})
  const remoteVideoContainerRef = useRef<HTMLDivElement | null>(null)
  const localVideoContainerRef = useRef<HTMLDivElement | null>(null)
  const roleRef = useRef(role)
  const userNameRef = useRef(userName)
  const identityRef = useRef(user?.id ?? '')

  useEffect(() => {
    roleRef.current = role
  }, [role])
  useEffect(() => {
    userNameRef.current = userName
  }, [userName])
  useEffect(() => {
    identityRef.current = user?.id ?? ''
  }, [user?.id])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      if (mq.matches) setMobileDetailsOpen(false)
    }
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  /** Prevents re-fetching the VonLinkage room on Supabase session refresh (new `user` object) — a common cause of mid-call timeouts and full-screen errors. */
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
        const response = await fetch('/api/vonlinkage/room', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
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

        if (!room?.roomName) {
          throw new Error('Invalid room data')
        }

        if (!room?.token) {
          throw new Error('Could not get join token. Please try again.')
        }

        roomFetchCompletedForEncounterRef.current = encounterId
        setRoomName(room.roomName)
        setRoomToken(room.token)
        setRoomUrl(room.joinUrl ?? null)
        setPatientJoinUrl(room.patientJoinUrl ?? null)
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
  }, [encounterId, user?.id, authLoading])

  useEffect(() => {
    if (!encounterId) return

    const fetchDetails = async () => {
      setDetailsLoading(true)
      try {
        const encId = Number(encounterId)
        const [detailRes, soapRes, profileRes] = await Promise.all([
          fetch(`/api/encounters/${encId}/detail`, { credentials: 'include' }),
          fetch(`/api/encounters/${encId}/doctor-soap`, { credentials: 'include' }),
          fetch('/api/me/profile', { credentials: 'include' }),
        ])

        const detailJson = detailRes.ok ? await detailRes.json() : null
        const soapJson = soapRes.ok ? await soapRes.json() : null
        const profileJson = profileRes.ok ? await profileRes.json() : null

        if (detailJson?.encounter) {
          const enc = detailJson.encounter as Encounter & { doctor_id?: number | null }
          setEncounter(enc)
          if (enc.doctor_id != null) {
            setDoctorId(Number(enc.doctor_id))
          }
        }
        setAppointment((detailJson?.appointment as Appointment) ?? null)
        setPatient((detailJson?.patient as Patient) ?? null)
        setIntake((detailJson?.intake as IntakeForm) ?? null)
        setVitals((detailJson?.vitals as Vitals) ?? null)
        setSoapNotes((detailJson?.ai_soap as SOAPNotes) ?? null)

        const docSoap = soapJson?.doctor_soap as DoctorSOAPNotes | null | undefined
        if (docSoap) {
          setDoctorSoap(docSoap)
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

        const name =
          profileJson?.full_name ||
          user?.user_metadata?.full_name ||
          user?.email?.split('@')[0] ||
          'User'
        setUserName(name)
      } catch (e) {
        console.error('Error fetching patient details:', e)
      } finally {
        setDetailsLoading(false)
      }
    }

    fetchDetails()
  }, [encounterId, user?.email, user?.user_metadata?.full_name])

  // For nurses/staff: watch encounter status; if doctor concludes, show message then send them back to virtual waiting room
  useEffect(() => {
    if (!encounterId) return
    if (isPhysicianRole(role)) return
    if (sessionEnded) return

    const encounterIdNum = Number(encounterId)
    if (Number.isNaN(encounterIdNum)) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/encounters/${encounterIdNum}/status`, {
          credentials: 'include',
        })
        const json = res.ok ? await res.json() : null
        const status = json?.data?.status as string | undefined

        if (
          status === 'final_review' ||
          status === 'completed' ||
          status === 'consultation_concluded'
        ) {
          setSessionEnded(true)
          setEndMessage(
            `Doctor has concluded the consultation. Returning to virtual waiting room...`
          )
          setTimeout(() => {
            const dest = role === 'nurse'
              ? `/dashboard/nurse-flowboard?encounter=${encounterIdNum}`
              : `/dashboard/flowboard?encounter=${encounterIdNum}`
            router.push(dest)
          }, 5000)
        }
      } catch (e) {
        console.error('Error polling encounter status:', e)
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [encounterId, role, sessionEnded, router])

  const addTranscriptEntry = useCallback((speakerRole: string, speakerName: string, message: string) => {
    transcriptBufferRef.current.push({
      speaker_role: speakerRole,
      speaker_name: speakerName,
      message,
      created_at: new Date().toISOString(),
    })
    setTranscriptCount(transcriptBufferRef.current.length)
  }, [])

  // VonLinkage (LiveKit) has no built-in transcription or UI chrome — chat rides the
  // room's data channel + the /messages history endpoint; there is no live transcript.
  useEffect(() => {
    if (!livekitJoinUrl || !isConnected || !roomToken) {
      const existing = livekitRoomRef.current
      livekitRoomRef.current = null
      if (existing) {
        skipLeaveCleanupRef.current = true
        livekitTeardownRef.current = livekitTeardownRef.current.then(() =>
          destroyLivekitRoom(existing)
        )
      }
      return
    }

    const remoteContainer = remoteVideoContainerRef.current
    if (!remoteContainer) return

    const setupGeneration = ++livekitSetupGenerationRef.current
    let cancelled = false
    skipLeaveCleanupRef.current = false
    leaveInProgressRef.current = false

    const setup = async () => {
      await livekitTeardownRef.current
      if (cancelled || setupGeneration !== livekitSetupGenerationRef.current) return

      await destroyLivekitRoom(livekitRoomRef.current)
      livekitRoomRef.current = null
      if (cancelled || setupGeneration !== livekitSetupGenerationRef.current) return

      remoteContainer.replaceChildren()

      const room = new Room()

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _pub: unknown, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
            const el = track.attach()
            el.dataset.participant = participant.identity
            if (el instanceof HTMLVideoElement) el.playsInline = true
            remoteContainer.appendChild(el)
            el.play().catch(() => {})
          }
        }
      )

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el: HTMLMediaElement) => el.remove())
      })

      room.on(RoomEvent.Disconnected, () => {
        if (cancelled || skipLeaveCleanupRef.current) return
        void runEndCallCleanupRef.current()
      })

      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as ChatMessage
          const key = chatMessageKey(msg)
          setChatMessages((prev) => (key && prev.some((m) => chatMessageKey(m) === key) ? prev : [...prev, msg]))
          if (msg.senderIdentity === identityRef.current) return
          addTranscriptEntry('patient', msg.senderIdentity || 'Participant', `[chat] ${msg.body}`)
        } catch {
          // ignore malformed data payloads
        }
      })

      if (cancelled || setupGeneration !== livekitSetupGenerationRef.current) {
        await destroyLivekitRoom(room)
        return
      }

      livekitRoomRef.current = room

      try {
        await room.connect(livekitJoinUrl, roomToken)
      } catch (e) {
        console.error('VonLinkage join failed:', e)
        if (!cancelled && setupGeneration === livekitSetupGenerationRef.current) {
          livekitRoomRef.current = null
          livekitTeardownRef.current = livekitTeardownRef.current.then(() =>
            destroyLivekitRoom(room)
          )
          setLivekitJoinUrl(null)
          setIsConnected(false)
          setError(e instanceof Error ? e.message : 'Failed to join video call')
        }
      }
    }

    void setup()

    return () => {
      cancelled = true
      skipLeaveCleanupRef.current = true
      const r = livekitRoomRef.current
      livekitRoomRef.current = null
      livekitTeardownRef.current = livekitTeardownRef.current.then(() => destroyLivekitRoom(r))
    }
  }, [livekitJoinUrl, isConnected, roomToken, addTranscriptEntry])

  const toggleCam = useCallback(async () => {
    const room = livekitRoomRef.current
    if (!room) return
    const next = !camOn
    try {
      await room.localParticipant.setCameraEnabled(next)
    } catch (err) {
      console.warn('VonLinkage setCameraEnabled:', err)
      return
    }
    const container = localVideoContainerRef.current
    if (container) {
      container.replaceChildren()
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (next && pub?.track) {
        const el = pub.track.attach()
        el.muted = true
        if (el instanceof HTMLVideoElement) el.playsInline = true
        container.appendChild(el)
        el.play().catch(() => {})
      }
    }
    setCamOn(next)
  }, [camOn])

  const toggleMic = useCallback(async () => {
    const room = livekitRoomRef.current
    if (!room) return
    const next = !micOn
    try {
      await room.localParticipant.setMicrophoneEnabled(next)
    } catch (err) {
      console.warn('VonLinkage setMicrophoneEnabled:', err)
      return
    }
    setMicOn(next)
  }, [micOn])

  const sendChat = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || !roomName) return
    setChatInput('')
    try {
      const res = await fetch(`/api/vonlinkage/rooms/${encodeURIComponent(roomName)}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderIdentity: identityRef.current, body: text }),
      })
      const json = await res.json()
      if (json.ok && json.data) {
        const msg = json.data as ChatMessage
        const key = chatMessageKey(msg)
        setChatMessages((prev) => (key && prev.some((m) => chatMessageKey(m) === key) ? prev : [...prev, msg]))
        addTranscriptEntry(roleRef.current ?? 'staff', userNameRef.current || 'You', `[chat] ${text}`)
      }
    } catch (err) {
      console.warn('Failed to send chat message:', err)
    }
  }, [chatInput, roomName, addTranscriptEntry])

  const refreshRecordings = useCallback(async () => {
    if (!roomName) return
    try {
      const res = await fetch(`/api/vonlinkage/rooms/${encodeURIComponent(roomName)}/recordings`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (json.ok) setRecordings(json.data ?? [])
    } catch (err) {
      console.warn('Failed to load recordings:', err)
    }
  }, [roomName])

  useEffect(() => {
    if (!isConnected || !roomName) return
    void refreshRecordings()
    const interval = setInterval(refreshRecordings, 4000)
    return () => clearInterval(interval)
  }, [isConnected, roomName, refreshRecordings])

  const startRecording = useCallback(async () => {
    if (!roomName) return
    setRecordingError(null)
    setRecordingStarting(true)
    try {
      const res = await fetch(`/api/vonlinkage/rooms/${encodeURIComponent(roomName)}/recordings`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: 'grid' }),
      })
      const json = await res.json()
      if (!json.ok) {
        setRecordingError(json.error?.message ?? 'Could not start recording')
      } else {
        await refreshRecordings()
      }
    } finally {
      setRecordingStarting(false)
    }
  }, [roomName, refreshRecordings])

  const stopRecording = useCallback(async (recordingId: string) => {
    const res = await fetch(`/api/vonlinkage/recordings/${recordingId}/stop`, {
      method: 'POST',
      credentials: 'include',
    })
    const json = await res.json()
    if (!json.ok) setRecordingError(json.error?.message ?? 'Could not stop recording')
    await refreshRecordings()
  }, [refreshRecordings])

  const viewTranscript = useCallback(async (recordingId: string) => {
    const res = await fetch(`/api/vonlinkage/recordings/${recordingId}/transcript`, {
      credentials: 'include',
    })
    const json = await res.json()
    if (json.ok) {
      const segments = json.data.segments as TranscriptSegment[]
      setTranscripts((prev) => ({ ...prev, [recordingId]: segments }))

      // Regenerate the AI SOAP draft using the transcript, alongside intake + physical exam
      // (existing lib/soap/generate-soap.ts pipeline) — per lead's request to auto-fill.
      if (encounterId && segments.length > 0) {
        setSoapAutoFillLoading(true)
        setSoapAutoFillNotice(null)
        try {
          const transcriptText = segments.map((seg) => `${seg.speakerLabel}: ${seg.text}`).join('\n')
          const soapRes = await fetch('/api/soap/complete-soap', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ encounter_id: Number(encounterId), transcript_text: transcriptText }),
          })
          const soapJson = await soapRes.json()
          if (soapRes.ok && soapJson.note) {
            setSoapNotes(soapJson.note as SOAPNotes)
            setSoapAutoFillNotice('SOAP notes updated using the call transcript — check the SOAP tab.')
          } else {
            setSoapAutoFillNotice(soapJson.message ?? soapJson.error ?? 'Could not auto-fill SOAP notes from transcript.')
          }
        } catch (err) {
          console.warn('Failed to auto-fill SOAP notes from transcript:', err)
          setSoapAutoFillNotice('Could not auto-fill SOAP notes from transcript.')
        } finally {
          setSoapAutoFillLoading(false)
        }
      }
    } else {
      setTranscripts((prev) => ({
        ...prev,
        [recordingId]: json.error?.message ?? 'Transcript not available yet',
      }))
    }
  }, [encounterId])

  const downloadRecording = useCallback(async (recordingId: string) => {
    const res = await fetch(`/api/vonlinkage/recordings/${recordingId}/download`, {
      credentials: 'include',
    })
    const json = await res.json()
    if (json.ok) {
      window.open(json.data.url, '_blank')
    } else {
      setRecordingError(json.error?.message ?? 'Download not available yet')
    }
  }, [])

  /** Saves buffered transcript lines; returns inserted row ids in order, or null on failure. */
  const flushTranscript = async (encounterIdNum: number): Promise<number[] | null> => {
    const items = transcriptBufferRef.current
    if (!items.length) return []
    try {
      const res = await fetch('/api/transcripts/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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
      void persistTranscriptSummary(encounterIdNum, items)
      return ids.map((id) => Number(id))
    } catch (e) {
      console.error('Failed to save transcript:', e)
      return null
    }
  }

  /** Fire-and-forget: store lightweight clinical summary on encounter for Final Review. */
  const persistTranscriptSummary = async (
    encounterIdNum: number,
    inlineItems: Array<{ speaker_role: string; speaker_name: string; message: string }>
  ) => {
    try {
      await fetch(`/api/encounters/${encounterIdNum}/ai-summary?persist=true`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inlineTranscript: inlineItems }),
      })
    } catch (e) {
      console.error('Failed to persist transcript summary on encounter:', e)
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
      const res = await fetch('/api/clean-transcript', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/encounters/${encounterIdNum}/ai-summary`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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
    if (!roomToken || !roomUrl) return
    setLivekitJoinUrl(roomUrl)
    setShowConnectionModal(false)
    setError(null)
    skipLeaveCleanupRef.current = false
    leaveInProgressRef.current = false
    setIsConnected(true)
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
    if (!encounterId || !isPhysicianRole(role)) return
    if (!validateDoctorSoap()) return

    setSavingSoap(true)
    try {
      const res = await fetch(`/api/encounters/${Number(encounterId)}/doctor-soap`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjective_text: soapForm.subjective_text!.trim(),
          objective_text: soapForm.objective_text!.trim(),
          assessment_text: soapForm.assessment_text!.trim(),
          plan_text: soapForm.plan_text!.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to save SOAP note')
      setDoctorSoap({ ...soapForm })
    } catch (e) {
      console.error('Error saving doctor SOAP:', e)
      alert('Failed to save SOAP note. Please try again.')
    } finally {
      setSavingSoap(false)
    }
  }

  const handleEndConsultation = async () => {
    if (!encounterId || !isPhysicianRole(role)) return
    if (!validateDoctorSoap()) return

    setSavingSoap(true)
    try {
      const encounterIdNum = Number(encounterId)

      const soapRes = await fetch(`/api/encounters/${encounterIdNum}/doctor-soap`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjective_text: soapForm.subjective_text!.trim(),
          objective_text: soapForm.objective_text!.trim(),
          assessment_text: soapForm.assessment_text!.trim(),
          plan_text: soapForm.plan_text!.trim(),
        }),
      })
      const soapJson = await soapRes.json().catch(() => ({}))
      if (!soapRes.ok) throw new Error(soapJson.error || 'Failed to save SOAP note')

      setDoctorSoap({ ...soapForm })

      const statusRes = await fetch(`/api/encounters/${encounterIdNum}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'final_review' }),
      })
      const statusJson = await statusRes.json().catch(() => ({}))
      if (!statusRes.ok) throw new Error(statusJson.error || 'Failed to update encounter status')

      void fetch(`/api/encounters/${encounterIdNum}/physician-review/ensure`, {
        method: 'POST',
      }).catch(err => console.error('Physician review ensure failed:', err))

      const inlineItems = [...transcriptBufferRef.current]
      const transcriptIds = await flushTranscript(encounterIdNum)

      const endRoomAndGo = async () => {
        try {
          await fetch('/api/vonlinkage/end-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ encounterId: encounterIdNum }),
          })
        } catch (endRoomError) {
          console.error('Failed to end VonLinkage room:', endRoomError)
        }
        window.setTimeout(
          () => router.push(encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard'),
          0
        )
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

  const runEndCallCleanup = useCallback(async () => {
    if (leaveInProgressRef.current) return
    leaveInProgressRef.current = true
    setLivekitJoinUrl(null)
    setIsConnected(false)
    if (isPhysicianRole(role) && encounterId && doctorId) {
      await handleEndConsultation()
      return
    }
    const encounterIdNum = encounterId ? Number(encounterId) : NaN
    if (!encounterId || Number.isNaN(encounterIdNum)) {
      window.setTimeout(() => router.push('/dashboard'), 0)
      return
    }
    const items = [...transcriptBufferRef.current]
    const ids = await flushTranscript(encounterIdNum)
    const dest =
      role === 'nurse'
        ? `/dashboard/nurse-flowboard?encounter=${encounterId}`
        : `/dashboard/flowboard?encounter=${encounterId}`
    const go = () => window.setTimeout(() => router.push(dest), 0)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAndOpenTranscriptReview/flushTranscript/handleEndConsultation intentionally omitted; runEndCallCleanupRef is reassigned to this closure on every render (below), so callers reading the ref always get the latest versions regardless of this array.
  }, [role, encounterId, doctorId, router])

  runEndCallCleanupRef.current = runEndCallCleanup

  const handleEndCall = useCallback(async () => {
    const room = livekitRoomRef.current
    if (room && room.state === 'connected') {
      await room.disconnect().catch(() => {})
      return
    }
    await runEndCallCleanup()
  }, [runEndCallCleanup])

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
      <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6 sm:p-12">
        <div className="text-red-500 mb-4 text-center max-w-md px-4">
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
      <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6 sm:p-12">
        <LoadingSpinner message="Loading..." />
      </div>
    )
  }

  if (!user) return null

  // Do not replace the whole page while the call is active (avoids kicking users out mid-call if a late error fires).
  if (error && !showConnectionModal && !livekitJoinUrl) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6 sm:p-12">
        <div className="text-red-500 mb-4 text-center max-w-md px-4">Error: {error}</div>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const roleLabel = role ? getRoleLabel(role) : 'Staff'

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#EEF4FF]">
      {/* Connection Modal */}
      <TelemedicineConnectionModal
        isOpen={showConnectionModal && !isLoading && !!roomToken}
        userName={userName || 'User'}
        userRole={roleLabel}
        onConnect={handleConnect}
        onCancel={() => {
          const dest =
            role === 'nurse'
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
                <div className="flex flex-col items-center justify-center py-10">
                  <LoadingSpinner message="Cleaning transcript…" variant="dark" size="sm" />
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
      {showSummaryPanel && isPhysicianRole(role) && (
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
                <div className="flex flex-col items-center justify-center py-12">
                  <LoadingSpinner message="Analyzing session transcript..." variant="dark" size="sm" />
                </div>
              )}

              {aiSummaryError && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4 text-red-300 text-sm">
                  {aiSummaryError === 'No transcript available for this encounter'
                    ? 'No transcript was captured for this session. Spoken-word transcription is not yet available on VonLinkage during a live call — only in-call chat messages are captured for now.'
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="px-4 sm:px-6 py-4 border-t border-gray-800 flex-shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-gray-600 text-xs text-center sm:text-left">AI-generated — verify before acting on clinical decisions</p>
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
      {endMessage && !isPhysicianRole(role) && (
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

      <div className="relative flex flex-1 min-h-0 overflow-hidden lg:flex-row">
        <button
          type="button"
          aria-label="Close patient details"
          aria-hidden={!mobileDetailsOpen}
          tabIndex={mobileDetailsOpen ? 0 : -1}
          className={`lg:hidden fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300 ease-in-out ${
            mobileDetailsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setMobileDetailsOpen(false)}
        />

        {/* Video — VonLinkage (LiveKit) full bleed with floating controls */}
        <div className="relative flex-1 min-h-0 w-full min-w-0 bg-[#0b1220]">
          {isLoading && (
            <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-[#EEF4FF] px-4">
              <LoadingSpinner message="Loading video call..." />
            </div>
          )}
          {!isLoading && !isConnected && !showConnectionModal && (
            <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-[#EEF4FF] px-4 text-center">
              <p className="text-base sm:text-lg text-slate-700">Preparing video call...</p>
            </div>
          )}
          {isConnected && livekitJoinUrl && (
            <>
              <div
                ref={remoteVideoContainerRef}
                className="absolute inset-x-0 bottom-0 top-[calc(5rem+env(safe-area-inset-top))] z-0 lg:inset-0 lg:top-0 h-auto lg:h-full w-full grid grid-cols-1 place-items-center gap-1 pb-[env(safe-area-inset-bottom)] [&>video]:h-full [&>video]:w-full [&>video]:object-cover [&>audio]:hidden"
              />

              {/* Local self-view */}
              <div
                ref={localVideoContainerRef}
                className="absolute bottom-24 right-3 z-10 h-28 w-20 overflow-hidden rounded-xl border border-white/20 bg-slate-800 shadow-lg sm:h-36 sm:w-24 lg:bottom-6 [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
              />

              {/* Floating call controls */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-slate-900/80 px-4 py-2.5 shadow-xl backdrop-blur">
                  <button
                    type="button"
                    onClick={() => void toggleMic()}
                    aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${micOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white hover:bg-red-600'}`}
                  >
                    {micOn ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M9 9v3.75a3 3 0 004.6 2.54M15 9V4.5a3 3 0 00-5.94-.6M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5" /></svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleCam()}
                    aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${camOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white hover:bg-red-600'}`}
                  >
                    {camOn ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 10.5l4.72-2.36A.75.75 0 0121.5 8.8v6.4a.75.75 0 01-1.03.65L15.75 13.5m-9-9h6.75a1.5 1.5 0 011.5 1.5v8.25a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 011.5-1.5z" /></svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M15.75 10.5l4.72-2.36A.75.75 0 0121.5 8.8v6.4a.75.75 0 01-.53.71M6.75 4.5H12a1.5 1.5 0 011.5 1.5v.75M5.25 6c-.414 0-.75.336-.75.75v8.25a1.5 1.5 0 001.5 1.5h6.75" /></svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatOpen((v) => !v)}
                    aria-label="Toggle chat"
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${chatOpen ? 'bg-[#2E6EF3] text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
                  </button>
                </div>
              </div>

              {/* Chat panel */}
              {chatOpen && (
                <div className="absolute bottom-24 left-3 right-3 z-20 flex max-h-[50%] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl sm:left-auto sm:right-3 sm:w-80 lg:bottom-6">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                    <p className="text-sm font-semibold text-white">Chat</p>
                    <button type="button" onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close chat">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
                    {chatMessages.length === 0 && (
                      <p className="text-xs text-slate-500">No messages yet.</p>
                    )}
                    {chatMessages.map((m, i) => (
                      <div key={chatMessageKey(m) ?? i} className="text-sm">
                        <span className="font-medium text-[#8ab4ff]">{m.senderIdentity === identityRef.current ? 'You' : m.senderIdentity}: </span>
                        <span className="text-slate-200">{m.body}</span>
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void sendChat()
                    }}
                    className="flex items-center gap-2 border-t border-white/10 p-2"
                  >
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Message..."
                      className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#2E6EF3]"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="rounded-lg bg-[#2E6EF3] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Send
                    </button>
                  </form>
                </div>
              )}
            </>
          )}

          {/* MEMR header — sits above the video on mobile (video starts below this row) */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:z-10">
            <div className="mx-auto grid w-full max-w-3xl grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 lg:grid-cols-[2.75rem_minmax(0,1fr)_auto]">
              <button
                type="button"
                onClick={() => void goToWaitingRoom()}
                className={`${floatingCircleBtn} pointer-events-auto`}
                aria-label="Back to virtual waiting room"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="min-w-0 justify-self-center px-1">
                <div className="mx-auto w-full max-w-xs rounded-full border border-slate-200 bg-white px-4 py-2 text-center shadow-lg shadow-slate-900/10">
                  <p className="truncate text-sm font-semibold text-slate-900">{patientDisplayName}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {isConnected ? (
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden />
                        {callElapsed}
                        <span aria-hidden>·</span>
                        {appointmentPillLabel}
                      </span>
                    ) : (
                      appointmentPillLabel
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMobileDetailsOpen(true)}
                  className={`${floatingCircleBtn} pointer-events-auto lg:hidden ${mobileDetailsOpen ? 'ring-2 ring-[#2E6EF3] text-[#2E6EF3]' : ''}`}
                  aria-label="Open patient details"
                  aria-expanded={mobileDetailsOpen}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>

                {isConnected && (
                  <button
                    type="button"
                    onClick={() => void handleEndCall()}
                    className="pointer-events-auto hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-900/25 hover:bg-red-600 active:scale-95 transition-transform lg:flex"
                    aria-label="End call"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.077a1 1 0 00-1.11.717l-1.08 3.247a11.042 11.042 0 01-5.516-5.517l3.247-1.08a1 1 0 00.717-1.11l-1.077-4.493A1 1 0 0017 8.72V5a2 2 0 00-2-2H5z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Patient details — full-screen mobile drawer / desktop sidebar */}
        <aside
          className={`flex min-h-0 w-full flex-col overflow-hidden bg-[#f5f7fb] text-slate-900
            fixed inset-0 z-40
            transition-transform duration-300 ease-in-out will-change-transform
            ${mobileDetailsOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}
            lg:pointer-events-auto lg:static lg:inset-auto lg:w-[22rem] lg:min-w-[22rem] lg:max-w-[22rem] lg:flex-shrink-0 lg:translate-x-0 lg:border-l lg:border-slate-200 lg:shadow-none xl:w-[24rem] xl:min-w-[24rem] xl:max-w-[24rem]`}
        >
          <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900">Patient details</h2>
                {encounter && (
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {getStatusInfo(encounter.status as EncounterStatus)?.label || encounter.status}
                    {encounter.encounter_code && ` · ${encounter.encounter_code}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isConnected && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    Live
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setMobileDetailsOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
                  aria-label="Close patient details"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {!detailsLoading && (
            <div className="grid shrink-0 grid-cols-5 border-b border-slate-200 bg-white">
              {(['patient', 'intake', 'vitals', 'soap', 'recording'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDetailsTab(tab)}
                  className={`min-h-[44px] px-1 py-2.5 text-center text-xs font-semibold capitalize transition-colors ${
                    detailsTab === tab
                      ? 'border-b-2 border-[#2E6EF3] bg-[#EEF4FF] text-[#2E6EF3]'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab === 'soap' ? 'SOAP' : tab}
                </button>
              ))}
            </div>
          )}
          <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 text-sm pb-[max(1rem,env(safe-area-inset-bottom))]">
            {detailsLoading ? (
              <LoadingSpinner message="Loading details..." size="sm" />
            ) : (
              <>
                {detailsTab === 'patient' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="mb-3 font-semibold text-[#2E6EF3]">Patient information</p>
                      {patient ? (
                        <div className="space-y-2.5 text-sm text-slate-600">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Name</p>
                            <p className="font-medium text-slate-900">
                              {patient.first_name} {patient.last_name}
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-2.5">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-400">Patient code</p>
                              <p className="font-mono text-slate-800">{patient.patient_code || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-400">Age</p>
                              <p>{calculateAge(patient.date_of_birth)}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-400">Date of birth</p>
                              <p>{formatDate(patient.date_of_birth)}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-400">Gender</p>
                              <p>{patient.gender || '—'}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-xs uppercase tracking-wide text-slate-400">Email</p>
                              <p className="break-all">{patient.email || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-400">Phone</p>
                              <p>{patient.phone || '—'}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-xs uppercase tracking-wide text-slate-400">Address</p>
                              <p>
                                {[patient.street_address, patient.state, patient.zip_code].filter(Boolean).length > 0
                                  ? [patient.street_address, patient.state, patient.zip_code].filter(Boolean).join(', ')
                                  : '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">
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
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="mb-3 font-semibold text-[#2E6EF3]">Appointment</p>
                        <div className="space-y-2 text-sm text-slate-600">
                          <p>
                            <span className="text-slate-400">Date: </span>
                            {formatDate(appointment.appointment_date)}
                          </p>
                          <p>
                            <span className="text-slate-400">Time: </span>
                            {appointment.appointment_time || '—'}
                          </p>
                          <p>
                            <span className="text-slate-400">Type: </span>
                            {appointment.onsite_type || '—'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {detailsTab === 'intake' && (
                  <div className="space-y-1 text-slate-600">
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
                      <p className="text-slate-500">Intake not available</p>
                    )}
                  </div>
                )}
                {detailsTab === 'vitals' && (
                  <div className="grid grid-cols-1 gap-2 text-slate-600">
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
                      <p className="col-span-2 text-slate-500">Not recorded</p>
                    )}
                  </div>
                )}
                {detailsTab === 'soap' && (
                  <div className="space-y-3">
                    {isPhysicianRole(role) && doctorId ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <p className="mb-2 flex-1 min-w-[12rem] text-xs text-slate-500">
                            Add your SOAP note. Placeholders show AI suggestions.
                          </p>
                          <button
                            type="button"
                            onClick={handleCopyAllFromAi}
                            disabled={!soapNotes}
                            title={soapNotes ? 'Copy AI suggestions into all fields so you can edit and save' : 'AI SOAP not loaded yet'}
                            className="shrink-0 rounded-lg border border-[#2E6EF3]/20 bg-[#EEF4FF] px-2.5 py-1 text-xs font-medium text-[#2E6EF3] hover:bg-[#DCE8FD] disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                          >
                            Copy from AI
                          </button>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[#2E6EF3]">Subjective</label>
                          <textarea
                            value={soapForm.subjective_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, subjective_text: e.target.value }))}
                            placeholder={aiPlaceholder('subjective')}
                            rows={3}
                            className="min-h-[5rem] w-full rounded-xl border border-slate-200 bg-white p-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#2E6EF3] focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/20 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[#2E6EF3]">Objective</label>
                          <textarea
                            value={soapForm.objective_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, objective_text: e.target.value }))}
                            placeholder={aiPlaceholder('objective')}
                            rows={3}
                            className="min-h-[5rem] w-full rounded-xl border border-slate-200 bg-white p-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#2E6EF3] focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/20 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[#2E6EF3]">Assessment</label>
                          <textarea
                            value={soapForm.assessment_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, assessment_text: e.target.value }))}
                            placeholder={aiPlaceholder('assessment')}
                            rows={3}
                            className="min-h-[5rem] w-full rounded-xl border border-slate-200 bg-white p-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#2E6EF3] focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/20 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[#2E6EF3]">Plan</label>
                          <textarea
                            value={soapForm.plan_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, plan_text: e.target.value }))}
                            placeholder={aiPlaceholder('plan')}
                            rows={3}
                            className="min-h-[5rem] w-full rounded-xl border border-slate-200 bg-white p-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#2E6EF3] focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/20 sm:text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={handleSaveDoctorSoap}
                            disabled={savingSoap}
                            className="flex-1 rounded-xl bg-[#2E6EF3] py-2 px-4 text-sm font-semibold text-white transition-colors hover:bg-[#256ae8] disabled:opacity-50"
                          >
                            {savingSoap ? 'Saving...' : 'Save SOAP Note'}
                          </button>
                          <button
                            type="button"
                            onClick={handleEndConsultation}
                            disabled={savingSoap}
                            className="flex-1 rounded-xl bg-emerald-600 py-2 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {savingSoap ? 'Ending...' : 'End Consultation'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3 text-slate-600">
                        {(doctorSoap || soapNotes) ? (
                          <>
                            <div>
                              <p className="mb-1 text-xs font-medium text-[#2E6EF3]">Subjective</p>
                              <p className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700">
                                {(doctorSoap?.subjective_text && doctorSoap.subjective_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.subjective_text, 'subjective') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-medium text-[#2E6EF3]">Objective</p>
                              <p className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700">
                                {(doctorSoap?.objective_text && doctorSoap.objective_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.objective_text, 'objective') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-medium text-[#2E6EF3]">Assessment</p>
                              <p className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700">
                                {(doctorSoap?.assessment_text && doctorSoap.assessment_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.assessment_text, 'assessment') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-medium text-[#2E6EF3]">Plan</p>
                              <p className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700">
                                {(doctorSoap?.plan_text && doctorSoap.plan_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.plan_text, 'plan') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                          </>
                        ) : (
                          <p className="text-slate-500">SOAP notes not available yet</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {detailsTab === 'recording' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500">
                      Recording captures video and audio for this call. A transcript becomes available
                      a minute or more after you stop recording — it labels speakers generically
                      (Speaker 1 / Speaker 2), not by name or role. Viewing a transcript automatically
                      updates the AI-drafted SOAP notes (SOAP tab) using it, plus intake and physical exam.
                    </p>

                    {soapAutoFillLoading && (
                      <p className="rounded-lg bg-[#EEF4FF] px-3 py-2 text-xs text-[#2E6EF3]">
                        Updating AI SOAP draft from transcript…
                      </p>
                    )}
                    {soapAutoFillNotice && !soapAutoFillLoading && (
                      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                        {soapAutoFillNotice}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void startRecording()}
                      disabled={recordingStarting || recordings.some((r) => r.status === 'STARTING' || r.status === 'RECORDING')}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span
                        className={`h-2 w-2 rounded-full bg-white ${recordings.some((r) => r.status === 'RECORDING') ? 'animate-pulse' : ''}`}
                      />
                      {recordings.some((r) => r.status === 'STARTING' || r.status === 'RECORDING')
                        ? 'Recording…'
                        : recordingStarting
                          ? 'Starting…'
                          : 'Start recording'}
                    </button>

                    {recordingError && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{recordingError}</p>
                    )}

                    {recordings.length === 0 && (
                      <p className="text-xs text-slate-400">No recordings yet for this call.</p>
                    )}

                    <ul className="space-y-2">
                      {recordings.map((r) => (
                        <li key={r.recordingId} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium ${
                                r.status === 'COMPLETED'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : r.status === 'FAILED'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {r.status}
                            </span>
                            {(r.status === 'STARTING' || r.status === 'RECORDING') && (
                              <button
                                type="button"
                                onClick={() => void stopRecording(r.recordingId)}
                                className="text-slate-500 hover:text-slate-800"
                              >
                                Stop
                              </button>
                            )}
                            {r.status === 'COMPLETED' && (
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => void downloadRecording(r.recordingId)}
                                  className="text-[#2E6EF3] hover:text-[#256ae8]"
                                >
                                  Download
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void viewTranscript(r.recordingId)}
                                  className="text-[#2E6EF3] hover:text-[#256ae8]"
                                >
                                  Transcript
                                </button>
                              </div>
                            )}
                          </div>
                          {r.durationSeconds != null && (
                            <p className="mt-1.5 text-slate-500">{r.durationSeconds}s</p>
                          )}
                          {r.error && <p className="mt-1.5 text-red-600">{r.error}</p>}
                          {transcripts[r.recordingId] && (
                            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto border-t border-slate-200 pt-2">
                              {typeof transcripts[r.recordingId] === 'string' ? (
                                <p className="text-slate-500">{transcripts[r.recordingId] as string}</p>
                              ) : (
                                (transcripts[r.recordingId] as TranscriptSegment[]).map((seg, i) => (
                                  <p key={i} className="text-slate-600">
                                    <span className="font-medium text-slate-800">{seg.speakerLabel}:</span> {seg.text}
                                  </p>
                                ))
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3">
            <button
              type="button"
              onClick={goToWaitingRoom}
              className="min-w-0 truncate text-sm font-medium text-[#2E6EF3] hover:text-[#256ae8]"
            >
              ← Back to waiting room
            </button>
            {patientJoinUrl && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(patientJoinUrl).catch(() => {})
                }}
                title="Copy patient join link"
                className="shrink-0 text-xs font-medium text-teal-600 hover:text-teal-700"
              >
                Copy patient link
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default withRoleProtection(VideoPage, {
  allowedRoles: [...CLINICAL_DASHBOARD_ROLES],
  redirectTo: '/dashboard',
})
