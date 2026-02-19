'use client'

import { useState, useEffect } from 'react'

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
  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }

  // Get current time in HH:MM format
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

  const handleAssign = () => {
    if (!selectedDoctorId) {
      alert('Please select a provider')
      return
    }
    if (!appointmentDate) {
      alert('Please select an appointment date')
      return
    }
    if (!appointmentTime) {
      alert('Please select an appointment time')
      return
    }
    onAssign(selectedDoctorId, appointmentDate, appointmentTime)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 border border-white/20 rounded-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">Assign Provider</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-blue-200 text-sm mb-2">Select Provider</label>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              disabled={assigningDoctor === appointment.id.toString()}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="">Select a provider...</option>
              {availableDoctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id.toString()}>
                  {doctor.full_name} {doctor.specialty ? `(${doctor.specialty})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-blue-200 text-sm mb-2">Appointment Date</label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-blue-200 text-sm mb-2">Appointment Time</label>
            <input
              type="time"
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={!selectedDoctorId || assigningDoctor === appointment.id.toString()}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {assigningDoctor === appointment.id.toString() ? 'Assigning...' : 'Assign Provider'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
