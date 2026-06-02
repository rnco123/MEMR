'use client'

import { useParams } from 'next/navigation'
import { PatientFileView } from '@/components/PatientFileView'

export default function AdminPatientFilePage() {
  const params = useParams()
  const patientId = Number(params.id)

  if (!patientId || Number.isNaN(patientId)) {
    return null
  }

  return (
    <PatientFileView
      patientId={patientId}
      backHref="/admin/patients-history"
      embedded
    />
  )
}
