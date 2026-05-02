'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n'

interface Appointment {
  id: number
  patient_id: number
  appointment_date: string | null
  appointment_time: string | null
  onsite_type: string
  status?: string | null
  notes?: string | null
  created_at: string
  encounter_status?: string
  encounter_id?: number | undefined
  assigned_doctor?: {
    id: number
    full_name: string
    email: string | null
  }
  patient?: {
    id: number
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
  }
}

interface AvailableDoctor {
  id: number
  user_id: string
  full_name: string
  email: string | null
  specialty: string | null
  is_available?: boolean
}

interface AssignProviderModalProps {
  appointment: Appointment
  availableDoctors: AvailableDoctor[]
  assigningDoctor: string | null
  onAssign: (doctorId: string, appointmentDate: string, appointmentTime: string) => void
  onClose: () => void
}

export function AssignProviderModal({
  appointment,
  availableDoctors,
  assigningDoctor,
  onAssign,
  onClose,
}: AssignProviderModalProps) {
  const { t } = useT()

  const getTodayDate = () => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }

  const getCurrentTime = () => {
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }

  const [selectedDoctorId, setSelectedDoctorId] = useState(
    appointment.assigned_doctor ? appointment.assigned_doctor.id.toString() : ''
  )
  const [appointmentDate, setAppointmentDate] = useState(appointment.appointment_date || getTodayDate())
  const [appointmentTime, setAppointmentTime] = useState(appointment.appointment_time || getCurrentTime())

  const isBusy = assigningDoctor === appointment.id.toString()

  const handleAssign = () => {
    if (!selectedDoctorId) {
      alert(t('flow.alert_select_provider'))
      return
    }
    if (!appointmentDate) {
      alert(t('flow.alert_select_appt_date'))
      return
    }
    if (!appointmentTime) {
      alert(t('flow.alert_select_appt_time'))
      return
    }
    onAssign(selectedDoctorId, appointmentDate, appointmentTime)
  }

  const fieldClass =
    'w-full px-4 py-3 bg-[#f9fbff] border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/35 focus:border-[#2E6EF3] disabled:opacity-50 disabled:bg-slate-50 [color-scheme:light]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-provider-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-300/40 max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h3 id="assign-provider-title" className="text-xl font-semibold text-slate-900 tracking-tight">
            {t('flow.assign_provider')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/50"
            aria-label={t('common.close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label
              htmlFor="assign-provider-select"
              className="block text-slate-500 text-xs font-medium uppercase tracking-wide mb-2"
            >
              {t('flow.assign_select_provider')}
            </label>
            <select
              id="assign-provider-select"
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              disabled={isBusy}
              className={`${fieldClass} cursor-pointer`}
            >
              <option value="">{t('flow.assign_provider_placeholder')}</option>
              {availableDoctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id.toString()}>
                  {doctor.full_name}
                  {doctor.specialty ? ` (${doctor.specialty})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="assign-appt-date"
                className="block text-slate-500 text-xs font-medium uppercase tracking-wide mb-2"
              >
                {t('flow.assign_appt_date')}
              </label>
              <input
                id="assign-appt-date"
                type="date"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                disabled={isBusy}
                className={fieldClass}
              />
            </div>
            <div>
              <label
                htmlFor="assign-appt-time"
                className="block text-slate-500 text-xs font-medium uppercase tracking-wide mb-2"
              >
                {t('flow.assign_appt_time')}
              </label>
              <input
                id="assign-appt-time"
                type="time"
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                disabled={isBusy}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={!selectedDoctorId || isBusy}
              className="flex-1 px-4 py-2.5 bg-[#2E6EF3] text-white text-sm font-semibold rounded-xl hover:bg-[#256ae8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/60 focus-visible:ring-offset-2"
            >
              {isBusy ? t('flow.assigning') : t('flow.assign_provider')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}