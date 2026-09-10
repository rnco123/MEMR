'use client'

import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/lib/i18n'
import { flowboardServiceTitle } from '@/lib/flowboard/service-title'
import {
  compareReadySinceAsc,
  isReadyForTelemedicine,
  readyWaitMinutes,
} from '@/lib/flowboard/telemedicine-ready'

export type TelemedicineReadyAppointment = {
  id: number
  patient_id: number
  appointment_time: string | null
  service_title_en?: string | null
  service_title_es?: string | null
  location_tenant_id?: number | null
  location_title?: string | null
  encounter_status?: string | null
  encounter_id?: number | null
  ready_for_doctor_at?: string | null
  patient?: {
    first_name: string
    last_name: string
    date_of_birth?: string | null
  } | null
}

type Props = {
  appointments: TelemedicineReadyAppointment[]
  formatTime: (time: string | null) => string
  formatDob: (date: string | null | undefined) => string | null
  onJoin: (appointment: TelemedicineReadyAppointment) => void
  onOpenChart: (appointment: TelemedicineReadyAppointment) => void
}

/** Wait-time labels tick without a refetch. */
const TICK_MS = 30_000

/** Minutes waiting before a tile escalates from green to amber to red. */
const WAIT_WARN_MINUTES = 10
const WAIT_LATE_MINUTES = 20

/**
 * "Ready for telemedicine" tiles for the physician (doctor / FNP / PA) flowboard:
 * patients whose vitals the nurse recorded and whose rooming is marked ready for
 * the provider. Hidden entirely when nobody is waiting.
 */
export function TelemedicineReadyTiles({
  appointments,
  formatTime,
  formatDob,
  onJoin,
  onOpenChart,
}: Props) {
  const { t, language } = useT()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const ready = useMemo(
    () => appointments.filter(isReadyForTelemedicine).sort(compareReadySinceAsc),
    [appointments]
  )

  if (ready.length === 0) return null

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <h2 className="text-base font-bold text-slate-900">{t('flow.ready_tiles_title')}</h2>
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          {t('flow.ready_tiles_count', { count: ready.length })}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {ready.map((appointment) => {
          const waited = readyWaitMinutes(appointment.ready_for_doctor_at, now) ?? 0
          const inConsultation = appointment.encounter_status === 'in_consultation'
          const waitTone = inConsultation
            ? 'bg-yellow-50 text-yellow-900 border-yellow-200'
            : waited >= WAIT_LATE_MINUTES
              ? 'bg-red-50 text-red-800 border-red-200'
              : waited >= WAIT_WARN_MINUTES
                ? 'bg-amber-50 text-amber-900 border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          const serviceTitle = flowboardServiceTitle(
            appointment,
            language,
            appointment.location_tenant_id
          )

          return (
            <div
              key={appointment.id}
              className="group flex flex-col rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 to-white p-4 shadow-sm hover:shadow-[0_10px_28px_rgba(16,185,129,0.14)] hover:border-emerald-300 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 truncate">
                    {appointment.patient
                      ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                      : t('flow.unknown_patient')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('common.dob')}: {formatDob(appointment.patient?.date_of_birth) ?? '—'}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${waitTone}`}
                  title={
                    appointment.ready_for_doctor_at
                      ? new Date(appointment.ready_for_doctor_at).toLocaleString()
                      : undefined
                  }
                >
                  {inConsultation
                    ? t('flow.ready_tiles_in_consultation')
                    : t('flow.ready_tiles_waiting', { minutes: waited })}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 mb-4">
                {serviceTitle && (
                  <p className="font-medium text-slate-700 truncate">{serviceTitle}</p>
                )}
                <p className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatTime(appointment.appointment_time)}
                </p>
                {appointment.location_title && (
                  <p className="flex items-center gap-1.5 min-w-0">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.315 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">{appointment.location_title}</span>
                  </p>
                )}
              </div>

              <div className="mt-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onJoin(appointment)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {t('flow.ready_tiles_join')}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChart(appointment)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  {t('flow.ready_tiles_open_chart')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
