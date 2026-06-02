'use client'

import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { PatientFileView } from '@/components/PatientFileView'

export default function PatientFilePage() {
  const params = useParams()
  const patientId = Number(params.id)
  const { role } = useAuth()
  const backHref =
    role === 'admin' ? '/admin/patients-history' : '/dashboard/patients-history'

  if (!patientId || Number.isNaN(patientId)) {
    return null
  }

  return <PatientFileView patientId={patientId} backHref={backHref} embedded={false} />
}
