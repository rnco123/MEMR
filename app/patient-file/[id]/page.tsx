'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { type EncounterStatus, getStatusInfo } from '@/lib/encounter-status'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EncounterDetailModal } from '@/components/EncounterDetailModal'
import { PatientDocumentGridPreview } from '@/components/PatientDocumentGridPreview'
import { useT } from '@/lib/i18n'

const DOCUMENTS_VIEW_STORAGE_KEY = 'memr.patientDocumentsView'

const PATIENT_DOC_MAX_BYTES = 50 * 1024 * 1024
const PATIENT_DOC_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']
const PATIENT_DOC_ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.pdf']

const DOCUMENTS_GRID_DENSITY_STORAGE_KEY = 'memr.patientDocumentsGridDensity'

/** 0 = smallest thumbnails (most columns) … 2 = largest (fewest columns) */
const DOCUMENT_GRID_DENSITY_CLASSNAMES = [
  'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2',
  'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3',
  'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4',
] as const

const DOCUMENT_GRID_CARD_MIN_HEIGHTS = ['min-h-[260px]', 'min-h-[320px]', 'min-h-[380px]'] as const

interface PatientDocument {
  id: string
  document_name: string
  document_label: string
  file_url: string
  file_name: string
  file_size: number
  file_type: string
  uploaded_by: string
  uploaded_by_name: string | null
  created_at: string
}

interface Patient {
  id: number // bigint
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  gender?: string
  created_at: string
}

interface Pharmacy {
  id: number
  name?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

interface PatientEncounter {
  id: number
  appointment_id: number
  encounter_code: string | null
  status: string | null
  created_at: string
  appointments?: {
    appointment_date?: string | null
    appointment_time?: string | null
    onsite_type?: string | null
    services?: { title_en?: string | null } | null
  } | null
  doctors?: {
    full_name?: string | null
    specialty?: string | null
  } | null
  vitals?: {
    bp_systolic?: number | null
    bp_diastolic?: number | null
    heart_rate?: number | null
    temperature?: number | null
    temperature_unit?: string | null
    spo2?: number | null
    weight?: number | null
    weight_unit?: string | null
    height?: number | null
    height_unit?: string | null
    bmi?: number | null
    respiratory_rate?: number | null
    notes?: string | null
  } | null
}

interface ConsentFormRow {
  id: number
  name: string
  html: string
  updated_at: string | null
}

interface EncounterFormsPayload {
  patientName?: string
  dateDisplay?: string
  signaturePaths?: { patient: string | null; physician: string | null }
  forms: ConsentFormRow[]
}

export default function PatientFilePage() {
  const { user } = useAuth()
  const params = useParams()
  const patientId = Number(params.id) // bigint
  const supabase = createClient()
  const { t, language } = useT()
  const locale = language === 'es' ? 'es-ES' : 'en-US'

  const [activeTab, setActiveTab] = useState<'encounters' | 'history' | 'medications' | 'forms' | 'documents'>('encounters')
  const [patient, setPatient] = useState<Patient | null>(null)
  const [loadingPatient, setLoadingPatient] = useState(true)
  
  // Document management state
  const [documents, setDocuments] = useState<PatientDocument[]>([])
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadDropActive, setUploadDropActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    document_name: '',
    document_label: 'other' as 'image' | 'report' | 'bill' | 'prescription' | 'lab_result' | 'xray' | 'other',
  })
  const [viewingDocument, setViewingDocument] = useState<PatientDocument | null>(null)
  const [imageLoading, setImageLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [documentsViewMode, setDocumentsViewMode] = useState<'list' | 'grid'>('list')
  const [documentsGridDensity, setDocumentsGridDensity] = useState<0 | 1 | 2>(1)

  // Encounters state
  const [encounters, setEncounters] = useState<PatientEncounter[]>([])
  const [loadingEncounters, setLoadingEncounters] = useState(false)
  const [selectedEncounter, setSelectedEncounter] = useState<PatientEncounter | null>(null)

  // Medical history state
  const [medicalHistory, setMedicalHistory] = useState<any>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Medications state
  const [medications, setMedications] = useState<any[]>([])
  const [loadingMedications, setLoadingMedications] = useState(false)

  // Pharmacy state (latest pharmacy based on most recent encounter with pharmacy_id)
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null)

  const [formsByEncounter, setFormsByEncounter] = useState<Record<number, EncounterFormsPayload>>({})
  const [formsErrorsByEncounter, setFormsErrorsByEncounter] = useState<Record<number, string>>({})
  const [loadingForms, setLoadingForms] = useState(false)
  const [expandedFormsEncounterId, setExpandedFormsEncounterId] = useState<number | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DOCUMENTS_VIEW_STORAGE_KEY)
      if (stored === 'grid' || stored === 'list') setDocumentsViewMode(stored)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(DOCUMENTS_VIEW_STORAGE_KEY, documentsViewMode)
    } catch {
      /* ignore */
    }
  }, [documentsViewMode])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOCUMENTS_GRID_DENSITY_STORAGE_KEY)
      if (raw === '0' || raw === '1' || raw === '2') setDocumentsGridDensity(Number(raw) as 0 | 1 | 2)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(DOCUMENTS_GRID_DENSITY_STORAGE_KEY, String(documentsGridDensity))
    } catch {
      /* ignore */
    }
  }, [documentsGridDensity])

  useEffect(() => {
    if (!showUploadModal) setUploadDropActive(false)
  }, [showUploadModal])

  const applyPatientUploadFile = useCallback((file: File | null | undefined, fileInputEl: HTMLInputElement | null) => {
    if (!file) return
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!PATIENT_DOC_ALLOWED_TYPES.includes(file.type) && !PATIENT_DOC_ALLOWED_EXT.includes(fileExtension)) {
      alert(t('patient_file.alert_invalid_type'))
      if (fileInputEl) fileInputEl.value = ''
      return
    }
    if (file.size > PATIENT_DOC_MAX_BYTES) {
      alert(t('patient_file.alert_file_size'))
      if (fileInputEl) fileInputEl.value = ''
      return
    }
    setUploadForm((prev) => ({ ...prev, file }))
  }, [t])

  // Fetch patient data
  useEffect(() => {
    const fetchPatient = async () => {
      if (!patientId || isNaN(patientId)) return
      
      setLoadingPatient(true)
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .single()

        if (error) {
          console.error('Error fetching patient:', error)
        } else {
          setPatient(data as Patient)
        }
      } catch (error) {
        console.error('Error in fetchPatient:', error)
      } finally {
        setLoadingPatient(false)
      }
    }

    fetchPatient()
  }, [patientId, supabase])

  // Fetch encounters for patient
  useEffect(() => {
    const fetchEncounters = async () => {
      if (!patientId || isNaN(patientId)) return
      
      setLoadingEncounters(true)
      try {
        // First get all appointments for this patient
        const { data: appointments, error: appointmentsError } = await supabase
          .from('appointments')
          .select('id')
          .eq('patient_id', patientId)

        if (appointmentsError) {
          console.error('Error fetching appointments for encounters:', appointmentsError)
          setEncounters([])
          setLoadingEncounters(false)
          return
        }

        if (!appointments || appointments.length === 0) {
          setEncounters([])
          setLoadingEncounters(false)
          return
        }

        const appointmentIds = appointments.map(a => a.id)

        // Fetch encounters for those appointments with related data
        const { data: encountersData, error: encountersError } = await supabase
          .from('encounters')
          .select(`
            *,
            appointments (*),
            doctors (*)
          `)
          .in('appointment_id', appointmentIds)
          .order('created_at', { ascending: false })

        if (encountersError) {
          console.error('Error fetching encounters:', encountersError)
          setEncounters([])
        } else {
          setEncounters((encountersData as PatientEncounter[]) || [])
        }
      } catch (error) {
        console.error('Error in fetchEncounters:', error)
        setEncounters([])
      } finally {
        setLoadingEncounters(false)
      }
    }

    fetchEncounters()
  }, [patientId, supabase])

  // Fetch medical history from intake forms and vitals
  useEffect(() => {
    const fetchMedicalHistory = async () => {
      if (!patientId || isNaN(patientId)) return
      
      setLoadingHistory(true)
      try {
        // Get all appointments for this patient
        const { data: appointments, error: appointmentsError } = await supabase
          .from('appointments')
          .select('id')
          .eq('patient_id', patientId)

        if (appointmentsError) {
          console.error('Error fetching appointments for medical history:', appointmentsError)
          setLoadingHistory(false)
          return
        }

        if (!appointments || appointments.length === 0) {
          setMedicalHistory(null)
          setLoadingHistory(false)
          return
        }

        const appointmentIds = appointments.map(a => a.id)

        // Get all encounters for these appointments
        const { data: encounters, error: encountersError } = await supabase
          .from('encounters')
          .select('id, appointment_id')
          .in('appointment_id', appointmentIds)

        if (encountersError) {
          console.error('Error fetching encounters for medical history:', encountersError)
          setLoadingHistory(false)
          return
        }

        if (!encounters || encounters.length === 0) {
          setMedicalHistory(null)
          setLoadingHistory(false)
          return
        }

        const encounterIds = encounters.map(e => e.id)

        // Get intake forms for these appointments
        let intakeForms: any[] = []
        if (appointmentIds.length > 0) {
          const { data: intakeData, error: intakeError } = await supabase
            .from('intake_form')
            .select('*')
            .in('appointment_id', appointmentIds)
            .order('created_at', { ascending: false })

          if (intakeError) {
            console.error('Error fetching intake forms:', intakeError)
          } else if (intakeData) {
            intakeForms = intakeData
          }
        }

        // Get all vitals for these encounters
        const { data: vitalsData, error: vitalsError } = await supabase
          .from('vitals')
          .select('*')
          .in('encounter_id', encounterIds)
          .order('created_at', { ascending: false })

        if (vitalsError) {
          console.error('Error fetching vitals:', vitalsError)
        }

        // Aggregate medical history from all intake forms
        const aggregatedHistory = {
          medical_conditions: [] as any[],
          surgeries: [] as any[],
          allergies: [] as any[],
          current_medications: [] as any[],
          family_history: {
            diabetes: false,
            hypertension: false,
            cancer: false,
            heart_disease: false,
          },
          lifestyle: {
            tobacco_use: false,
            alcohol_use: false,
            drug_use: false,
          },
          vitals: vitalsData || [], // All vitals records
          latest_intake: intakeForms[0] || null, // Most recent intake form
          latest_vitals: vitalsData && vitalsData.length > 0 ? vitalsData[0] : null, // Most recent vitals
        }

        intakeForms.forEach(form => {
          // Aggregate medical conditions
          if (form.medical_conditions && Array.isArray(form.medical_conditions)) {
            aggregatedHistory.medical_conditions.push(...form.medical_conditions)
          }
          // Aggregate surgeries
          if (form.surgeries && Array.isArray(form.surgeries)) {
            aggregatedHistory.surgeries.push(...form.surgeries)
          }
          // Aggregate allergies
          if (form.allergies && Array.isArray(form.allergies)) {
            aggregatedHistory.allergies.push(...form.allergies)
          }
          // Aggregate medications
          if (form.current_medications && Array.isArray(form.current_medications)) {
            aggregatedHistory.current_medications.push(...form.current_medications)
          }
          // Family history (use most recent values)
          if (form.fh_diabetes) aggregatedHistory.family_history.diabetes = true
          if (form.fh_hypertension) aggregatedHistory.family_history.hypertension = true
          if (form.fh_cancer) aggregatedHistory.family_history.cancer = true
          if (form.fh_heart_disease) aggregatedHistory.family_history.heart_disease = true
          // Lifestyle
          if (form.tobacco_use) aggregatedHistory.lifestyle.tobacco_use = true
          if (form.alcohol_use) aggregatedHistory.lifestyle.alcohol_use = true
          if (form.drug_use) aggregatedHistory.lifestyle.drug_use = true
        })

        // Remove duplicates
        aggregatedHistory.medical_conditions = [...new Set(aggregatedHistory.medical_conditions)]
        aggregatedHistory.surgeries = [...new Set(aggregatedHistory.surgeries)]
        aggregatedHistory.allergies = [...new Set(aggregatedHistory.allergies)]
        aggregatedHistory.current_medications = [...new Set(aggregatedHistory.current_medications)]

        setMedicalHistory(aggregatedHistory)
      } catch (error) {
        console.error('Error in fetchMedicalHistory:', error)
      } finally {
        setLoadingHistory(false)
      }
    }

    fetchMedicalHistory()
  }, [patientId, supabase])

  // Fetch latest pharmacy based on most recent encounter with a pharmacy_id for this patient
  useEffect(() => {
    const fetchPharmacy = async () => {
      if (!patientId || isNaN(patientId)) return

      try {
        // Get all appointments for this patient
        const { data: appointments, error: appointmentsError } = await supabase
          .from('appointments')
          .select('id')
          .eq('patient_id', patientId)

        if (appointmentsError) {
          console.error('Error fetching appointments for pharmacy:', appointmentsError)
          setPharmacy(null)
          return
        }

        if (!appointments || appointments.length === 0) {
          setPharmacy(null)
          return
        }

        const appointmentIds = appointments.map(a => a.id)

        const { data: encounterWithPharmacy, error: encounterError } = await supabase
          .from('encounters')
          .select('pharmacy_id, appointment_id, created_at')
          .in('appointment_id', appointmentIds)
          .not('pharmacy_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (encounterError) {
          console.error('Error fetching encounter pharmacy for patient:', encounterError)
          setPharmacy(null)
          return
        }

        if (!encounterWithPharmacy?.pharmacy_id) {
          setPharmacy(null)
          return
        }

        const { data: pharmacyData, error: pharmacyError } = await supabase
          .from('pharmacy')
          .select('*')
          .eq('id', encounterWithPharmacy.pharmacy_id)
          .maybeSingle()

        if (pharmacyError) {
          console.error('Error fetching pharmacy for patient:', pharmacyError)
          setPharmacy(null)
          return
        }

        setPharmacy(pharmacyData as Pharmacy)
      } catch (error) {
        console.error('Error in fetchPharmacy:', error)
        setPharmacy(null)
      }
    }

    fetchPharmacy()
  }, [patientId, supabase])

  // Fetch medications from intake forms
  useEffect(() => {
    const fetchMedications = async () => {
      if (!patientId || isNaN(patientId)) return
      
      setLoadingMedications(true)
      try {
        // Get all appointments for this patient
        const { data: appointments, error: appointmentsError } = await supabase
          .from('appointments')
          .select('id')
          .eq('patient_id', patientId)

        if (appointmentsError) {
          console.error('Error fetching appointments:', appointmentsError)
          setLoadingMedications(false)
          return
        }

        if (!appointments || appointments.length === 0) {
          setMedications([])
          setLoadingMedications(false)
          return
        }

        const appointmentIds = appointments.map(a => a.id)

        // Get current medications from intake forms
        const { data: intakeForms, error: intakeError } = await supabase
          .from('intake_form')
          .select('current_medications, created_at, appointment_id')
          .in('appointment_id', appointmentIds)
          .not('current_medications', 'is', null)
          .order('created_at', { ascending: false })

        if (intakeError) {
          console.error('Error fetching medications:', intakeError)
        } else if (intakeForms) {
          // Flatten medications from all intake forms
          const allMedications: any[] = []
          intakeForms.forEach(form => {
            if (form.current_medications && Array.isArray(form.current_medications)) {
              form.current_medications.forEach((med: any) => {
                const normalized =
                  typeof med === 'string'
                    ? { name: med }
                    : med && typeof med === 'object'
                    ? med
                    : { name: String(med) }

                allMedications.push({
                  ...normalized,
                  added_date: form.created_at,
                  appointment_id: form.appointment_id,
                })
              })
            }
          })
          setMedications(allMedications)
        } else {
          setMedications([])
        }
      } catch (error) {
        console.error('Error in fetchMedications:', error)
      } finally {
        setLoadingMedications(false)
      }
    }

    fetchMedications()
  }, [patientId, supabase])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.na')
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return t('common.na')
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTime = (timeString: string | null) => {
    if (!timeString) return t('common.na')
    const time = timeString.split(':')
    if (time.length < 2 || !time[0] || !time[1]) return t('common.na')
    const hours = parseInt(time[0], 10)
    const minutes = time[1]
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes} ${ampm}`
  }

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return t('common.na')
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return t('common.na')
    return d.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return `0 ${t('common.bytes')}`
    const k = 1024
    const sizes = [t('common.bytes'), t('common.kb'), t('common.mb'), t('common.gb')]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const getDocumentLabelColor = (label: string) => {
    const colors: Record<string, string> = {
      image: 'bg-blue-500/20 text-blue-300',
      report: 'bg-green-500/20 text-green-300',
      bill: 'bg-yellow-500/20 text-yellow-300',
      prescription: 'bg-purple-500/20 text-purple-300',
      lab_result: 'bg-cyan-500/20 text-cyan-300',
      xray: 'bg-orange-500/20 text-orange-300',
      other: 'bg-gray-500/20 text-gray-300',
    }
    return colors[label] || colors.other
  }

  const getDocumentLabelName = useCallback(
    (label: string) => {
      const names: Record<string, string> = {
        image: t('patient_file.doc_label_image'),
        report: t('patient_file.doc_label_report'),
        bill: t('patient_file.doc_label_bill'),
        prescription: t('patient_file.doc_label_prescription'),
        lab_result: t('patient_file.doc_label_lab_result'),
        xray: t('patient_file.doc_label_xray'),
        other: t('patient_file.doc_label_other'),
      }
      return names[label] || t('patient_file.doc_label_other')
    },
    [t]
  )

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
    } else if (fileType === 'application/pdf') {
      return 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z'
    } else {
      return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
    }
  }

  const getFileIconColor = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return 'text-blue-400'
    } else if (fileType === 'application/pdf') {
      return 'text-red-400'
    } else {
      return 'text-gray-400'
    }
  }

  const calculateAge = (dob: string | null): string | number => {
    if (!dob) return t('common.na')
    const birthDate = new Date(dob)
    if (isNaN(birthDate.getTime())) return t('common.na')
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  const patientTabs = useMemo(
    () =>
      [
        {
          id: 'encounters' as const,
          label: t('patient_file.tab_encounters'),
          icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
        },
        {
          id: 'history' as const,
          label: t('patient_file.tab_history'),
          icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        },
        {
          id: 'medications' as const,
          label: t('patient_file.tab_medications'),
          icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
        },
        {
          id: 'forms' as const,
          label: t('patient_file.tab_forms'),
          icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        },
        {
          id: 'documents' as const,
          label: t('patient_file.tab_documents'),
          icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
        },
      ] as const,
    [t]
  )

  const documentGridDensityLabels = useMemo(
    () =>
      [t('patient_file.grid_density_s'), t('patient_file.grid_density_m'), t('patient_file.grid_density_l')] as const,
    [t]
  )

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    if (!patientId || isNaN(patientId)) return

    setLoadingDocuments(true)
    try {
      const response = await fetch(`/api/patients/${patientId.toString()}/documents`)
      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents || [])
      } else {
        console.error('Failed to fetch documents')
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setLoadingDocuments(false)
    }
  }, [patientId])

  // Load documents when documents tab is active
  useEffect(() => {
    if (activeTab === 'documents' && patientId) {
      fetchDocuments()
    }
  }, [activeTab, fetchDocuments, patientId])

  // Fetch consent forms per encounter when Forms tab is active
  useEffect(() => {
    if (activeTab !== 'forms' || encounters.length === 0) return

    const fetchFormsByEncounter = async () => {
      setLoadingForms(true)
      const nextData: Record<number, EncounterFormsPayload> = {}
      const nextErrors: Record<number, string> = {}

      try {
        for (const encounter of encounters) {
          const response = await fetch(`/api/encounters/${encounter.id}/consent-forms`, {
            credentials: 'include',
          })
          const json = await response.json().catch(() => ({}))
          if (!response.ok) {
            nextErrors[encounter.id] = json.error || json.detail || `Error ${response.status}`
            continue
          }
          nextData[encounter.id] = {
            patientName: json.patientName,
            dateDisplay: json.dateDisplay,
            signaturePaths: json.signaturePaths,
            forms: Array.isArray(json.forms) ? json.forms : [],
          }
        }
      } catch (error) {
        console.error('Error fetching forms by encounter:', error)
      } finally {
        setFormsByEncounter(nextData)
        setFormsErrorsByEncounter(nextErrors)
        setExpandedFormsEncounterId((current) => {
          if (current && encounters.some((e) => e.id === current)) return current
          return encounters[0]?.id ?? null
        })
        setLoadingForms(false)
      }
    }

    fetchFormsByEncounter()
  }, [activeTab, encounters])

  // Handle file upload
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadForm.file || !uploadForm.document_name || !patientId || isNaN(patientId)) {
      alert(t('patient_file.alert_fill'))
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadForm.file)
      formData.append('document_name', uploadForm.document_name)
      formData.append('document_label', uploadForm.document_label)

      const response = await fetch(`/api/patients/${patientId.toString()}/documents`, {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setDocuments([data.document, ...documents])
        setShowUploadModal(false)
        setUploadForm({
          file: null,
          document_name: '',
          document_label: 'other',
        })
        // Reset file input
        const fileInput = document.getElementById('file-input') as HTMLInputElement
        if (fileInput) fileInput.value = ''
      } else {
        const error = await response.json()
        alert(error.error || t('patient_file.alert_upload_failed'))
      }
    } catch (error) {
      console.error('Error uploading document:', error)
      alert(t('patient_file.alert_upload_failed'))
    } finally {
      setUploading(false)
    }
  }

  // Handle document deletion confirmation
  const handleDeleteClick = (docId: string) => {
    setDocumentToDelete(docId)
    setShowDeleteConfirm(true)
  }

  // Handle document deletion
  const handleDeleteDocument = async () => {
    if (!documentToDelete) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/patients/${patientId.toString()}/documents/${documentToDelete}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setDocuments(documents.filter((doc) => doc.id !== documentToDelete))
        setShowDeleteConfirm(false)
        setDocumentToDelete(null)
      } else {
        const error = await response.json()
        alert(error.error || t('patient_file.alert_delete_failed'))
      }
    } catch (error) {
      console.error('Error deleting document:', error)
      alert(t('patient_file.alert_delete_failed'))
    } finally {
      setDeleting(false)
    }
  }

  if (loadingPatient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex items-center justify-center">
        <LoadingSpinner message={t('patient_file.loading_file')} />
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">{t('patient_file.not_found')}</h2>
          <Link href="/dashboard/patients-history" className="text-blue-300 hover:text-white">
            {t('patient_file.return_patients')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-xl border-b border-white/20 sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/patients-history" className="text-blue-200 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white">{t('patient_file.title')}</h1>
                <p className="text-xs text-blue-200 font-mono">ID: {patient.id}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Patient Summary */}
          <div className="lg:col-span-1 space-y-6">
            {/* Patient Card */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-3xl font-bold mb-4">
                  {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
                </div>
                <h2 className="text-2xl font-bold text-white">
                  {patient.first_name} {patient.last_name}
                </h2>
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-200">{t('common.age')}</span>
                  <span className="text-white">{calculateAge(patient.date_of_birth)}</span>
                </div>
                {patient.gender && (
                  <div className="flex justify-between">
                    <span className="text-blue-200">{t('common.gender')}</span>
                    <span className="text-white">{patient.gender}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-blue-200">{t('common.dob')}</span>
                  <span className="text-white">{formatDate(patient.date_of_birth)}</span>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {t('patient_file.contact_info')}
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-blue-300 text-xs">{t('common.phone')}</span>
                  <p className="text-white">{patient.phone || t('common.na')}</p>
                </div>
                <div>
                  <span className="text-blue-300 text-xs">{t('common.email')}</span>
                  <p className="text-white">{patient.email || t('common.na')}</p>
                </div>
              </div>
            </div>

            {/* Pharmacy (from latest encounter with selected pharmacy) */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
                {t('patient_file.pharmacy_section')}
              </h3>
              {pharmacy ? (
                <div className="space-y-3 text-sm">
                  {pharmacy.name && (
                    <div>
                      <span className="text-blue-300 text-xs">{t('common.name')}</span>
                      <p className="text-white font-semibold">{pharmacy.name}</p>
                    </div>
                  )}
                  {pharmacy.address && (
                    <div>
                      <span className="text-blue-300 text-xs">{t('common.address')}</span>
                      <p className="text-white">{pharmacy.address}</p>
                    </div>
                  )}
                  {pharmacy.phone && (
                    <div>
                      <span className="text-blue-300 text-xs">{t('common.phone')}</span>
                      <p className="text-white">{pharmacy.phone}</p>
                    </div>
                  )}
                  {pharmacy.email && (
                    <div>
                      <span className="text-blue-300 text-xs">{t('common.email')}</span>
                      <p className="text-white">{pharmacy.email}</p>
                    </div>
                  )}
                  {!pharmacy.name && !pharmacy.address && !pharmacy.phone && !pharmacy.email && (
                    <p className="text-blue-200">{t('patient_file.pharmacy_no_details', { id: pharmacy.id })}</p>
                  )}
                </div>
              ) : (
                <p className="text-blue-200 text-sm">{t('patient_file.pharmacy_none')}</p>
              )}
            </div>
          </div>

          {/* Right Column - Main Content */}
          <div className="lg:col-span-3">
            {/* Tabs */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden min-h-[800px]">
              <div className="flex border-b border-white/10">
                {patientTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex-1 px-4 py-4 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      activeTab === tab.id
                        ? 'text-white bg-white/10 border-b-2 border-blue-500'
                        : 'text-blue-200 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                    </svg>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-6 min-h-[700px]">
                {/* Encounters Tab */}
                {activeTab === 'encounters' && (
                  <div>
                    {loadingEncounters ? (
                      <div className="text-center py-12">
                        <LoadingSpinner message={t('patient_file.loading_encounters')} />
                      </div>
                    ) : encounters.length === 0 ? (
                      <div className="text-center py-12 bg-white/5 border border-white/10 rounded-xl">
                        <svg className="w-16 h-16 text-blue-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p className="text-blue-200 text-lg">{t('patient_file.no_encounters_title')}</p>
                        <p className="text-blue-300/70 text-sm mt-2">{t('patient_file.no_encounters_sub')}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {encounters.map((encounter) => (
                          <div
                            key={encounter.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedEncounter(encounter)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setSelectedEncounter(encounter)
                              }
                            }}
                            className="bg-white/5 border border-white/10 rounded-xl p-6 cursor-pointer hover:bg-white/10 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-lg font-semibold text-white">
                                    {encounter.encounter_code || t('patient_file.encounter_num', { id: encounter.id })}
                                  </h3>
                                  {encounter.status && (
                                    <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                                      encounter.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                                      encounter.status === 'in_consultation' ? 'bg-blue-500/20 text-blue-300' :
                                      'bg-yellow-500/20 text-yellow-300'
                                    }`}>
                                      {(getStatusInfo(encounter.status as EncounterStatus)?.label || encounter.status.replace('_', ' ')).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                {encounter.appointments && (
                                  <div className="text-sm text-blue-200">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        {encounter.appointments.appointment_date 
                                          ? formatDate(encounter.appointments.appointment_date)
                                          : t('common.na')
                                        }
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {encounter.appointments.appointment_time 
                                          ? formatTime(encounter.appointments.appointment_time)
                                          : t('common.na')
                                        }
                                      </span>
                                      {encounter.appointments.onsite_type && (
                                        <span className="px-2 py-0.5 bg-white/10 rounded text-xs">
                                          {encounter.appointments.onsite_type}
                                        </span>
                                      )}
                                    </div>
                                    {encounter.appointments.services && (
                                      <p className="text-blue-300/70 mt-1">
                                        {encounter.appointments.services.title_en}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                              {encounter.doctors && (
                                <div className="text-right">
                                  <p className="text-sm text-blue-200">{t('patient_file.doctor')}</p>
                                  <p className="text-white font-medium">{encounter.doctors.full_name}</p>
                                  {encounter.doctors.specialty && (
                                    <p className="text-xs text-blue-300/70">{encounter.doctors.specialty}</p>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="mb-4">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedEncounter(encounter)
                                }}
                                className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/50 text-blue-200 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition-all"
                              >
                                {t('patient_file.view_details')}
                              </button>
                            </div>
                            {encounter.vitals && (
                              <div className="mt-4 pt-4 border-t border-white/10">
                                <h4 className="text-sm font-semibold text-white mb-3">{t('patient_file.vitals')}</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  {encounter.vitals.bp_systolic && encounter.vitals.bp_diastolic && (
                                    <div>
                                      <p className="text-xs text-blue-300">{t('patient_file.bp')}</p>
                                      <p className="text-white font-medium">
                                        {encounter.vitals.bp_systolic}/{encounter.vitals.bp_diastolic} mmHg
                                      </p>
                                    </div>
                                  )}
                                  {encounter.vitals.heart_rate && (
                                    <div>
                                      <p className="text-xs text-blue-300">{t('patient_file.hr')}</p>
                                      <p className="text-white font-medium">{encounter.vitals.heart_rate} bpm</p>
                                    </div>
                                  )}
                                  {encounter.vitals.temperature && (
                                    <div>
                                      <p className="text-xs text-blue-300">{t('patient_file.temp')}</p>
                                      <p className="text-white font-medium">
                                        {encounter.vitals.temperature}°{encounter.vitals.temperature_unit || 'F'}
                                      </p>
                                    </div>
                                  )}
                                  {encounter.vitals.spo2 && (
                                    <div>
                                      <p className="text-xs text-blue-300">{t('patient_file.spo2')}</p>
                                      <p className="text-white font-medium">{encounter.vitals.spo2}%</p>
                                    </div>
                                  )}
                                  {encounter.vitals.weight && (
                                    <div>
                                      <p className="text-xs text-blue-300">{t('patient_file.weight')}</p>
                                      <p className="text-white font-medium">
                                        {encounter.vitals.weight} {encounter.vitals.weight_unit || 'lbs'}
                                      </p>
                                    </div>
                                  )}
                                  {encounter.vitals.height && (
                                    <div>
                                      <p className="text-xs text-blue-300">{t('patient_file.height')}</p>
                                      <p className="text-white font-medium">
                                        {encounter.vitals.height} {encounter.vitals.height_unit || 'in'}
                                      </p>
                                    </div>
                                  )}
                                  {encounter.vitals.bmi && (
                                    <div>
                                      <p className="text-xs text-blue-300">{t('patient_file.bmi')}</p>
                                      <p className="text-white font-medium">{encounter.vitals.bmi}</p>
                                    </div>
                                  )}
                                  {encounter.vitals.respiratory_rate && (
                                    <div>
                                      <p className="text-xs text-blue-300">{t('patient_file.rr')}</p>
                                      <p className="text-white font-medium">{encounter.vitals.respiratory_rate} /min</p>
                                    </div>
                                  )}
                                </div>
                                {encounter.vitals.notes && (
                                  <div className="mt-3">
                                    <p className="text-xs text-blue-300">{t('common.notes')}</p>
                                    <p className="text-white text-sm">{encounter.vitals.notes}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="mt-4 text-xs text-blue-300/70">
                              {t('patient_file.created_prefix')} {formatDateTime(encounter.created_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                  <div>
                    {loadingHistory ? (
                      <div className="text-center py-12">
                        <LoadingSpinner message={t('patient_file.loading_history')} />
                      </div>
                    ) : !medicalHistory ? (
                      <div className="text-center py-12 bg-white/5 border border-white/10 rounded-xl">
                        <svg className="w-16 h-16 text-blue-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-blue-200 text-lg">{t('patient_file.no_history_title')}</p>
                        <p className="text-blue-300/70 text-sm mt-2">{t('patient_file.no_history_sub')}</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Latest Vitals */}
                        {medicalHistory.latest_vitals && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h2a2 2 0 002-2z" />
                              </svg>
                              {t('patient_file.latest_vitals')}
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {medicalHistory.latest_vitals.bp_systolic && medicalHistory.latest_vitals.bp_diastolic && (
                                <div>
                                  <p className="text-xs text-blue-300">{t('patient_file.bp')}</p>
                                  <p className="text-white font-medium">
                                    {medicalHistory.latest_vitals.bp_systolic}/{medicalHistory.latest_vitals.bp_diastolic} mmHg
                                  </p>
                                </div>
                              )}
                              {medicalHistory.latest_vitals.heart_rate && (
                                <div>
                                  <p className="text-xs text-blue-300">{t('patient_file.hr')}</p>
                                  <p className="text-white font-medium">{medicalHistory.latest_vitals.heart_rate} bpm</p>
                                </div>
                              )}
                              {medicalHistory.latest_vitals.temperature && (
                                <div>
                                  <p className="text-xs text-blue-300">{t('patient_file.temp')}</p>
                                  <p className="text-white font-medium">
                                    {medicalHistory.latest_vitals.temperature}°{medicalHistory.latest_vitals.temperature_unit || 'F'}
                                  </p>
                                </div>
                              )}
                              {medicalHistory.latest_vitals.spo2 && (
                                <div>
                                  <p className="text-xs text-blue-300">{t('patient_file.spo2')}</p>
                                  <p className="text-white font-medium">{medicalHistory.latest_vitals.spo2}%</p>
                                </div>
                              )}
                              {medicalHistory.latest_vitals.weight && (
                                <div>
                                  <p className="text-xs text-blue-300">{t('patient_file.weight')}</p>
                                  <p className="text-white font-medium">
                                    {medicalHistory.latest_vitals.weight} {medicalHistory.latest_vitals.weight_unit || 'lbs'}
                                  </p>
                                </div>
                              )}
                              {medicalHistory.latest_vitals.height && (
                                <div>
                                  <p className="text-xs text-blue-300">{t('patient_file.height')}</p>
                                  <p className="text-white font-medium">
                                    {medicalHistory.latest_vitals.height} {medicalHistory.latest_vitals.height_unit || 'in'}
                                  </p>
                                </div>
                              )}
                              {medicalHistory.latest_vitals.bmi && (
                                <div>
                                  <p className="text-xs text-blue-300">{t('patient_file.bmi')}</p>
                                  <p className="text-white font-medium">{medicalHistory.latest_vitals.bmi}</p>
                                </div>
                              )}
                              {medicalHistory.latest_vitals.respiratory_rate && (
                                <div>
                                  <p className="text-xs text-blue-300">{t('patient_file.rr')}</p>
                                  <p className="text-white font-medium">{medicalHistory.latest_vitals.respiratory_rate} /min</p>
                                </div>
                              )}
                            </div>
                            {medicalHistory.latest_vitals.notes && (
                              <div className="mt-4">
                                <p className="text-xs text-blue-300 mb-1">{t('common.notes')}</p>
                                <p className="text-white text-sm">{medicalHistory.latest_vitals.notes}</p>
                              </div>
                            )}
                            <p className="text-xs text-blue-300/70 mt-4">
                              {t('patient_file.recorded_prefix')} {formatDateTime(medicalHistory.latest_vitals.created_at)}
                            </p>
                          </div>
                        )}

                        {/* All Vitals History */}
                        {medicalHistory.vitals && medicalHistory.vitals.length > 1 && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">{t('patient_file.vitals_history')}</h3>
                            <div className="space-y-3">
                              {medicalHistory.vitals.slice(1).map((vital: any, index: number) => (
                                <div key={index} className="bg-white/5 rounded-lg p-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                    {vital.bp_systolic && vital.bp_diastolic && (
                                      <div>
                                        <span className="text-blue-300">{t('patient_file.abbr_bp')} </span>
                                        <span className="text-white">{vital.bp_systolic}/{vital.bp_diastolic} mmHg</span>
                                      </div>
                                    )}
                                    {vital.heart_rate && (
                                      <div>
                                        <span className="text-blue-300">{t('patient_file.abbr_hr')} </span>
                                        <span className="text-white">{vital.heart_rate} bpm</span>
                                      </div>
                                    )}
                                    {vital.temperature && (
                                      <div>
                                        <span className="text-blue-300">{t('patient_file.abbr_temp')} </span>
                                        <span className="text-white">{vital.temperature}°{vital.temperature_unit || 'F'}</span>
                                      </div>
                                    )}
                                    {vital.spo2 && (
                                      <div>
                                        <span className="text-blue-300">{t('patient_file.abbr_spo2')} </span>
                                        <span className="text-white">{vital.spo2}%</span>
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-xs text-blue-300/70 mt-2">
                                    {formatDateTime(vital.created_at)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Medical Conditions */}
                        {medicalHistory.medical_conditions && medicalHistory.medical_conditions.length > 0 && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">{t('patient_file.medical_conditions')}</h3>
                            <div className="flex flex-wrap gap-2">
                              {medicalHistory.medical_conditions.map((condition: string, index: number) => (
                                <span key={index} className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/50 text-blue-200 rounded-lg text-sm">
                                  {condition}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Surgeries */}
                        {medicalHistory.surgeries && medicalHistory.surgeries.length > 0 && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">{t('patient_file.surgeries')}</h3>
                            <div className="flex flex-wrap gap-2">
                              {medicalHistory.surgeries.map((surgery: string, index: number) => (
                                <span key={index} className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/50 text-purple-200 rounded-lg text-sm">
                                  {surgery}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Allergies */}
                        {medicalHistory.allergies && medicalHistory.allergies.length > 0 && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">{t('patient_file.allergies')}</h3>
                            <div className="flex flex-wrap gap-2">
                              {medicalHistory.allergies.map((allergy: string, index: number) => (
                                <span key={index} className="px-3 py-1.5 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg text-sm">
                                  {allergy}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Family History */}
                        {(medicalHistory.family_history.diabetes || 
                          medicalHistory.family_history.hypertension || 
                          medicalHistory.family_history.cancer || 
                          medicalHistory.family_history.heart_disease) && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">{t('patient_file.family_history')}</h3>
                            <div className="space-y-2">
                              {medicalHistory.family_history.diabetes && (
                                <div className="flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-white">{t('patient_file.diabetes')}</span>
                                </div>
                              )}
                              {medicalHistory.family_history.hypertension && (
                                <div className="flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-white">{t('patient_file.hypertension')}</span>
                                </div>
                              )}
                              {medicalHistory.family_history.cancer && (
                                <div className="flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-white">{t('patient_file.cancer')}</span>
                                </div>
                              )}
                              {medicalHistory.family_history.heart_disease && (
                                <div className="flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-white">{t('patient_file.heart_disease')}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Lifestyle */}
                        {(medicalHistory.lifestyle.tobacco_use || 
                          medicalHistory.lifestyle.alcohol_use || 
                          medicalHistory.lifestyle.drug_use) && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">{t('patient_file.lifestyle')}</h3>
                            <div className="space-y-2">
                              {medicalHistory.lifestyle.tobacco_use && (
                                <div className="flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-white">{t('patient_file.tobacco')}</span>
                                </div>
                              )}
                              {medicalHistory.lifestyle.alcohol_use && (
                                <div className="flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-white">{t('patient_file.alcohol')}</span>
                                </div>
                              )}
                              {medicalHistory.lifestyle.drug_use && (
                                <div className="flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-white">{t('patient_file.drug_use')}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Medications Tab */}
                {activeTab === 'medications' && (
                  <div>
                    {loadingMedications ? (
                      <div className="text-center py-12">
                        <LoadingSpinner message={t('patient_file.loading_meds')} />
                      </div>
                    ) : medications.length === 0 ? (
                      <div className="text-center py-12 bg-white/5 border border-white/10 rounded-xl">
                        <svg className="w-16 h-16 text-blue-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        <p className="text-blue-200 text-lg">{t('patient_file.no_meds_title')}</p>
                        <p className="text-blue-300/70 text-sm mt-2">{t('patient_file.no_meds_sub')}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {medications.map((medication, index) => (
                          <div key={index} className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="text-white font-semibold mb-2">{medication.name || t('patient_file.unknown_medication')}</h4>
                                <div className="space-y-1 text-sm">
                                  {medication.dosage && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-blue-300">{t('patient_file.dosage')}</span>
                                      <span className="text-white">{medication.dosage}</span>
                                    </div>
                                  )}
                                  {medication.frequency && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-blue-300">{t('patient_file.frequency')}</span>
                                      <span className="text-white">{medication.frequency}</span>
                                    </div>
                                  )}
                                  {medication.added_date && (
                                    <div className="flex items-center gap-2 text-xs text-blue-300/70 mt-2">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                      {t('patient_file.added_prefix')} {formatDate(medication.added_date)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Forms Tab */}
                {activeTab === 'forms' && (
                  <div>
                    {loadingForms ? (
                      <div className="text-center py-12">
                        <LoadingSpinner message={t('patient_file.loading_forms')} />
                      </div>
                    ) : encounters.length === 0 ? (
                      <div className="text-center py-12 bg-white/5 border border-white/10 rounded-xl">
                        <p className="text-blue-200 text-lg">{t('patient_file.no_encounters_title')}</p>
                        <p className="text-blue-300/70 text-sm mt-2">{t('patient_file.forms_need_encounters_sub')}</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {encounters.map((encounter) => {
                          const formData = formsByEncounter[encounter.id]
                          const formError = formsErrorsByEncounter[encounter.id]
                          const forms = formData?.forms ?? []
                          const encounterDate = encounter.appointments?.appointment_date
                            ? formatDate(encounter.appointments.appointment_date)
                            : t('common.na')

                          return (
                            <div key={encounter.id} className="bg-white/5 border border-white/10 rounded-xl p-6">
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedFormsEncounterId((current) =>
                                      current === encounter.id ? null : encounter.id
                                    )
                                  }
                                  className="flex-1 text-left"
                                >
                                  <h3 className="text-lg font-semibold text-white">
                                    {encounter.encounter_code || t('patient_file.encounter_num', { id: encounter.id })}
                                  </h3>
                                  <span className="text-sm text-blue-300">{encounterDate}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedFormsEncounterId((current) =>
                                      current === encounter.id ? null : encounter.id
                                    )
                                  }
                                  className="px-3 py-1.5 text-xs rounded-lg border border-white/20 text-blue-200 hover:text-white hover:bg-white/10 transition-all"
                                >
                                  {expandedFormsEncounterId === encounter.id ? t('patient_file.hide_forms') : t('patient_file.show_forms')}
                                </button>
                              </div>

                              {expandedFormsEncounterId !== encounter.id ? null : formError ? (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-amber-200 text-sm">
                                  {formError}
                                </div>
                              ) : forms.length === 0 ? (
                                <p className="text-blue-200 text-sm">{t('patient_file.no_forms_encounter')}</p>
                              ) : (
                                <div className="space-y-6">
                                  {forms.map((f) => (
                                    <div
                                      key={`${encounter.id}-${f.id}`}
                                      className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden"
                                    >
                                      <div className="border-b border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-slate-900/50">
                                        <h4 className="text-lg font-semibold text-white">{f.name}</h4>
                                        {f.updated_at && (
                                          <span className="text-xs text-slate-500">
                                            {t('patient_file.template_updated_at', {
                                              date: new Date(f.updated_at).toLocaleString(locale),
                                            })}
                                          </span>
                                        )}
                                      </div>
                                      <div
                                        className="consent-form-html bg-white text-slate-900 p-6 md:p-8 prose prose-slate prose-sm max-w-none
                                          [&_h3]:text-slate-900 [&_p]:my-2 [&_strong]:text-slate-900
                                          [&_.consent-signature-img]:bg-white [&_.consent-signature-img]:align-middle"
                                        dangerouslySetInnerHTML={{ __html: f.html }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Documents Tab - for doctors and nurses to upload and manage patient documents */}
                {activeTab === 'documents' && (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{t('patient_file.documents_title')}</h3>
                        <p className="text-blue-300/80 text-sm mt-0.5">{t('patient_file.documents_subtitle')}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <div
                          className="inline-flex rounded-lg border border-white/15 bg-white/[0.06] p-1"
                          role="group"
                          aria-label={t('patient_file.documents_title')}
                        >
                          <button
                            type="button"
                            onClick={() => setDocumentsViewMode('list')}
                            aria-pressed={documentsViewMode === 'list'}
                            title={t('patient_file.view_list')}
                            className={`p-2 rounded-md transition-colors ${
                              documentsViewMode === 'list'
                                ? 'bg-blue-500/35 text-white shadow-sm'
                                : 'text-blue-200/80 hover:bg-white/10'
                            }`}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (documentsViewMode === 'grid') {
                                setDocumentsGridDensity((d) => ((d + 1) % 3) as 0 | 1 | 2)
                              } else {
                                setDocumentsViewMode('grid')
                              }
                            }}
                            aria-pressed={documentsViewMode === 'grid'}
                            title={
                              documentsViewMode === 'grid'
                                ? `${documentGridDensityLabels[documentsGridDensity]} — ${t('patient_file.grid_resize_hint')}`
                                : t('patient_file.view_grid')
                            }
                            className={`relative p-2 rounded-md transition-colors ${
                              documentsViewMode === 'grid'
                                ? 'bg-blue-500/35 text-white shadow-sm'
                                : 'text-blue-200/80 hover:bg-white/10'
                            }`}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                            {documentsViewMode === 'grid' ? (
                              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-cyan-500 px-0.5 text-[10px] font-bold leading-none text-white shadow">
                                {documentsGridDensity + 1}
                              </span>
                            ) : null}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowUploadModal(true)}
                          className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:from-blue-600 hover:to-cyan-600 transition-all"
                        >
                          {t('patient_file.upload_document_btn')}
                        </button>
                      </div>
                    </div>

                    {loadingDocuments ? (
                      <div className="text-center py-8">
                        <LoadingSpinner message={t('patient_file.loading_docs')} />
                      </div>
                    ) : documents.length === 0 ? (
                      <div className="text-center py-8 bg-white/5 border border-white/10 rounded-xl">
                        <svg className="w-12 h-12 text-blue-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <p className="text-blue-200">{t('patient_file.no_docs_title')}</p>
                        <p className="text-blue-300/70 text-sm mt-1">{t('patient_file.no_docs_sub')}</p>
                      </div>
                    ) : (
                      <div
                        className={
                          documentsViewMode === 'grid'
                            ? DOCUMENT_GRID_DENSITY_CLASSNAMES[documentsGridDensity]
                            : 'space-y-3'
                        }
                      >
                        {documents.map((doc: any) => {
                          const isDefault = doc.is_default || doc.id?.toString().startsWith('default-')
                          const hasFile = doc.file_url
                          const isGrid = documentsViewMode === 'grid'
                          const iconWrapClass = `rounded-lg flex items-center justify-center shrink-0 ${
                            doc.file_type?.startsWith('image/')
                              ? 'bg-blue-500/20'
                              : doc.file_type === 'application/pdf'
                                ? 'bg-red-500/20'
                                : 'bg-gray-500/20'
                          }`

                          const badges = (
                            <>
                              {isDefault && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/50">
                                  {t('patient_file.public_badge')}
                                </span>
                              )}
                              {!isDefault && (
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${getDocumentLabelColor(doc.document_label)}`}
                                >
                                  {getDocumentLabelName(doc.document_label)}
                                </span>
                              )}
                            </>
                          )

                          const actions = (
                            <>
                              {hasFile && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setViewingDocument(doc)
                                    setImageLoading(true)
                                  }}
                                  className={`px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:from-blue-600 hover:to-cyan-600 transition-all flex items-center justify-center gap-2 ${isGrid ? 'flex-1 min-w-[100px]' : ''}`}
                                >
                                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  {t('common.view')}
                                </button>
                              )}
                              {!isDefault && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteClick(doc.id)
                                  }}
                                  className={`px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-300 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-all flex items-center justify-center gap-2 ${isGrid ? 'flex-1 min-w-[100px]' : ''}`}
                                >
                                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  {t('patient_file.delete')}
                                </button>
                              )}
                            </>
                          )

                          if (isGrid) {
                            return (
                              <div
                                key={doc.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setViewingDocument(doc)
                                  setImageLoading(true)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setViewingDocument(doc)
                                    setImageLoading(true)
                                  }
                                }}
                                className={`flex h-full ${DOCUMENT_GRID_CARD_MIN_HEIGHTS[documentsGridDensity]} cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-colors hover:bg-white/10`}
                              >
                                <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-slate-950/80">
                                  <PatientDocumentGridPreview
                                    fileUrl={doc.file_url}
                                    fileType={doc.file_type}
                                    documentName={doc.document_name}
                                  />
                                  <div
                                    className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent"
                                    aria-hidden
                                  />
                                </div>
                                <div className="flex flex-1 flex-col p-4 pt-3 text-center min-h-0">
                                  <div className="mb-1 flex min-h-[2.5rem] items-start justify-center gap-2">
                                    <svg
                                      className={`mt-0.5 h-4 w-4 shrink-0 ${getFileIconColor(doc.file_type || 'application/pdf')}`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d={getFileIcon(doc.file_type || 'application/pdf')}
                                      />
                                    </svg>
                                    <p className="line-clamp-2 flex-1 text-left text-sm font-medium leading-snug text-white">
                                      {doc.document_name}
                                    </p>
                                  </div>
                                  <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">{badges}</div>
                                  <p className="text-xs text-blue-200">
                                    {hasFile ? (
                                      <>
                                        {formatFileSize(doc.file_size || 0)} • {doc.file_type || 'application/pdf'}
                                      </>
                                    ) : (
                                      <span className="text-yellow-300/70">{t('patient_file.unset_50mb')}</span>
                                    )}
                                  </p>
                                  {!isDefault && (
                                    <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-left text-xs">
                                      <div className="flex items-start gap-2 text-blue-300">
                                        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        <span>
                                          <span className="font-medium">{t('patient_file.uploaded_by')}</span>{' '}
                                          <span className="text-white">{doc.uploaded_by_name || t('common.unknown')}</span>
                                        </span>
                                      </div>
                                      <div className="flex items-start gap-2 text-blue-300">
                                        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span>
                                          <span className="font-medium">{t('patient_file.date_label')}</span>{' '}
                                          <span className="text-white">{formatDateTime(doc.created_at)}</span>
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                  {isDefault && (
                                    <p className="mt-2 text-xs text-blue-300/70">{t('patient_file.category_any')}</p>
                                  )}
                                  <div className="mt-auto flex flex-wrap gap-2 justify-stretch border-t border-white/10 pt-4">{actions}</div>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={doc.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setViewingDocument(doc)
                                setImageLoading(true)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  setViewingDocument(doc)
                                  setImageLoading(true)
                                }
                              }}
                              className="bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-colors"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4 flex-1">
                                  <div className={`w-12 h-12 ${iconWrapClass}`}>
                                    <svg
                                      className={`w-6 h-6 ${getFileIconColor(doc.file_type || 'application/pdf')}`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d={getFileIcon(doc.file_type || 'application/pdf')}
                                      />
                                    </svg>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <p className="text-white font-medium">{doc.document_name}</p>
                                      {badges}
                                    </div>
                                    <p className="text-blue-200 text-xs mb-2">
                                      {hasFile ? (
                                        <>
                                          {formatFileSize(doc.file_size || 0)} • {doc.file_type || 'application/pdf'}
                                        </>
                                      ) : (
                                        <span className="text-yellow-300/70">{t('patient_file.unset_50mb')}</span>
                                      )}
                                    </p>
                                    {!isDefault && (
                                      <div className="flex flex-wrap items-center gap-3 text-xs">
                                        <div className="flex items-center gap-1.5 text-blue-300">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                          </svg>
                                          <span className="font-medium">{t('patient_file.uploaded_by')}</span>
                                          <span className="text-white">{doc.uploaded_by_name || t('common.unknown')}</span>
                                        </div>
                                        <span className="text-blue-300/50 hidden sm:inline">•</span>
                                        <div className="flex items-center gap-1.5 text-blue-300">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                          <span className="font-medium">{t('patient_file.date_label')}</span>
                                          <span className="text-white">{formatDateTime(doc.created_at)}</span>
                                        </div>
                                      </div>
                                    )}
                                    {isDefault && (
                                      <p className="text-blue-300/70 text-xs">{t('patient_file.category_any')}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4 shrink-0">{actions}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Upload Modal */}
                    {showUploadModal && (
                      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-slate-800 border border-white/20 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-white">{t('patient_file.upload_modal_title')}</h3>
                            <button
                              onClick={() => setShowUploadModal(false)}
                              className="text-blue-200 hover:text-white transition-colors"
                            >
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>

                          <form onSubmit={handleFileUpload} className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-blue-200 mb-2">
                                {t('patient_file.document_name')}
                              </label>
                              <input
                                type="text"
                                value={uploadForm.document_name}
                                onChange={(e) => setUploadForm({ ...uploadForm, document_name: e.target.value })}
                                placeholder={t('patient_file.placeholder_doc_name')}
                                className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-500"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-blue-200 mb-2">
                                {t('patient_file.document_label')}
                              </label>
                              <select
                                value={uploadForm.document_label}
                                onChange={(e) => setUploadForm({ ...uploadForm, document_label: e.target.value as any })}
                                className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500"
                                required
                              >
                                <option value="image">{t('patient_file.doc_label_image')}</option>
                                <option value="report">{t('patient_file.doc_label_report')}</option>
                                <option value="bill">{t('patient_file.doc_label_bill')}</option>
                                <option value="prescription">{t('patient_file.doc_label_prescription')}</option>
                                <option value="lab_result">{t('patient_file.doc_label_lab_result')}</option>
                                <option value="xray">{t('patient_file.doc_label_xray')}</option>
                                <option value="other">{t('patient_file.doc_label_other')}</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-blue-200 mb-2">
                                {t('patient_file.file_max_label')}
                              </label>
                              <div
                                onDragOver={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setUploadDropActive(true)
                                }}
                                onDragEnter={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setUploadDropActive(true)
                                }}
                                onDragLeave={(e) => {
                                  e.preventDefault()
                                  const next = e.relatedTarget as Node | null
                                  if (!next || !e.currentTarget.contains(next)) {
                                    setUploadDropActive(false)
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setUploadDropActive(false)
                                  const file = e.dataTransfer.files?.[0]
                                  const input = document.getElementById('file-input') as HTMLInputElement | null
                                  applyPatientUploadFile(file, input)
                                }}
                                className={`rounded-xl border-2 border-dashed px-4 py-5 transition-colors ${
                                  uploadDropActive
                                    ? 'border-cyan-400 bg-cyan-500/15'
                                    : 'border-white/25 bg-white/[0.04]'
                                }`}
                              >
                                <p className="mb-3 text-center text-xs text-blue-200/90">{t('patient_file.drop_zone_hint')}</p>
                                <input
                                  id="file-input"
                                  type="file"
                                  accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    applyPatientUploadFile(file, e.target)
                                  }}
                                  className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-500/20 file:text-blue-300 hover:file:bg-blue-500/30"
                                />
                              </div>
                              <p className="text-xs text-blue-300/70 mt-1">
                                {t('patient_file.accepted_formats')}
                              </p>
                              {uploadForm.file && (
                                <p className="text-xs text-blue-300 mt-1">
                                  {t('patient_file.selected_prefix')} {uploadForm.file.name} ({formatFileSize(uploadForm.file.size)})
                                </p>
                              )}
                            </div>

                            <div className="flex gap-3 pt-4">
                              <button
                                type="button"
                                onClick={() => setShowUploadModal(false)}
                                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-all"
                              >
                                {t('common.cancel')}
                              </button>
                              <button
                                type="submit"
                                disabled={uploading}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {uploading ? t('patient_file.uploading') : t('patient_file.upload')}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* Document Viewer Modal */}
                    {viewingDocument && (
                      <div 
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2"
                        onClick={(e) => {
                          if (e.target === e.currentTarget) {
                            setViewingDocument(null)
                            setImageLoading(true)
                          }
                        }}
                      >
                        <div className="bg-slate-800 border border-white/20 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl relative">
                          {/* Close Button - Absolutely Positioned Top Right */}
                          <button
                            onClick={() => {
                              setViewingDocument(null)
                              setImageLoading(true)
                            }}
                            className="absolute top-2 right-2 z-50 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-all hover:scale-110"
                            aria-label={t('common.close')}
                          >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>

                          {/* Fixed Header - Always Visible */}
                          <div className="flex items-center justify-between p-3 border-b border-white/10 flex-shrink-0 bg-slate-800">
                            <div className="flex-1 min-w-0 pr-12">
                              <h3 className="text-base font-semibold text-white truncate">{viewingDocument.document_name}</h3>
                              <p className="text-xs text-blue-300 mt-0.5 truncate">
                                {viewingDocument.file_url
                                  ? formatFileSize(viewingDocument.file_size ?? 0)
                                  : t('patient_file.no_file_short')}
                              </p>
                            </div>
                          </div>

                          {/* Scrollable Viewer Content */}
                          <div className="flex-1 overflow-y-auto overflow-x-auto p-3 min-h-0">
                            {!viewingDocument.file_url ? (
                              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                                <svg className="w-16 h-16 text-blue-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <p className="text-blue-200 mb-2">{t('patient_file.no_file_uploaded')}</p>
                                <p className="text-blue-300/80 text-sm">{t('patient_file.no_file_slot')}</p>
                              </div>
                            ) : viewingDocument.file_type === 'application/pdf' ? (
                              <iframe
                                src={viewingDocument.file_url}
                                className="w-full h-full min-h-[600px] rounded-lg border border-white/10"
                                title={viewingDocument.document_name}
                              />
                            ) : viewingDocument.file_type?.startsWith('image/') ? (
                              <div className="flex items-center justify-center relative min-h-[400px]">
                                {imageLoading && (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-3">
                                      <div className="relative w-12 h-12">
                                        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 animate-spin" />
                                      </div>
                                      <p className="text-blue-300 text-sm">{t('patient_file.loading_image')}</p>
                                    </div>
                                  </div>
                                )}
                                <img
                                  src={viewingDocument.file_url}
                                  alt={viewingDocument.document_name}
                                  className={`max-w-full max-h-full rounded-lg shadow-2xl ${imageLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
                                  onLoad={() => setImageLoading(false)}
                                  onError={() => setImageLoading(false)}
                                />
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                                <svg className="w-16 h-16 text-blue-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <p className="text-blue-200 mb-4">{t('patient_file.preview_not_available')}</p>
                                <a
                                  href={viewingDocument.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all"
                                >
                                  {t('patient_file.open_new_tab')}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Delete Confirmation Modal */}
                    {showDeleteConfirm && (
                      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-slate-800 border border-white/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-white">{t('patient_file.delete_modal_title')}</h3>
                              <p className="text-sm text-blue-300 mt-1">{t('patient_file.delete_modal_sub')}</p>
                            </div>
                          </div>
                          
                          <p className="text-blue-200 mb-6">{t('patient_file.delete_modal_body')}</p>

                          <div className="flex gap-3">
                            <button
                              onClick={() => {
                                setShowDeleteConfirm(false)
                                setDocumentToDelete(null)
                              }}
                              disabled={deleting}
                              className="flex-1 px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-all disabled:opacity-50"
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              onClick={handleDeleteDocument}
                              disabled={deleting}
                              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {deleting ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  {t('patient_file.deleting')}
                                </>
                              ) : (
                                t('patient_file.delete')
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>
      {selectedEncounter && (
        <EncounterDetailModal
          encounterId={selectedEncounter.id}
          appointmentId={selectedEncounter.appointment_id}
          patientId={patientId}
          isOpen={true}
          onClose={() => setSelectedEncounter(null)}
          canJoinTelemedicine={false}
        />
      )}
    </div>
  )
}
