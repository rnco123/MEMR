'use client'

import { useMemo, type ReactNode } from 'react'
import { ENCOUNTER_STATUSES, getStatusVisualStyle } from '@/lib/encounter-status'
import { translateEncounterStatus } from '@/lib/encounter-status-i18n'
import { useT } from '@/lib/i18n'
import { flowboardServiceTitle } from '@/lib/flowboard/service-title'
import { PatientSourceBadge } from '@/components/PatientSourceBadge'

export type FlowboardKanbanAppointment = {
  id: number
  patient_id: number
  appointment_date: string | null
  appointment_time: string | null
  onsite_type?: string | null
  service_title_en?: string | null
  service_title_es?: string | null
  location_tenant_id?: number | null
  encounter_status?: string | null
  encounter_id?: number | null
  assigned_doctor?: { full_name: string } | null
  patient?: {
    first_name: string
    last_name: string
    email?: string | null
    phone?: string | null
    date_of_birth?: string | null
    created_by_source?: string | null
  } | null
}

type FlowboardKanbanProps = {
  appointments: FlowboardKanbanAppointment[]
  filterStatus: string
  formatDate: (date: string | null) => string
  formatTime: (time: string | null) => string
  formatDob?: (date: string | null | undefined) => string | null
  onCardClick: (appointment: FlowboardKanbanAppointment) => void
  onViewClick?: (appointment: FlowboardKanbanAppointment, e: React.MouseEvent) => void
  renderCardFooter?: (appointment: FlowboardKanbanAppointment) => ReactNode
  unknownPatientLabel?: string
  viewLabel?: string
  readonlyHint?: string
  notStartedLabel?: string
  pendingEncounterLabel?: string
  accentTheme?: 'blue' | 'purple'
}

const NO_STATUS_KEY = '__not_started__'

/** Appointments without an encounter row belong in the first workflow column. */
function resolveKanbanStatus(apt: FlowboardKanbanAppointment): string {
  if (apt.encounter_status) return apt.encounter_status
  return 'appointment_initiated'
}

function isAwaitingEncounter(apt: FlowboardKanbanAppointment): boolean {
  return !apt.encounter_id || !apt.encounter_status
}

export function FlowboardKanban({
  appointments,
  filterStatus,
  formatDate,
  formatTime,
  formatDob,
  onCardClick,
  onViewClick,
  renderCardFooter,
  unknownPatientLabel = 'Unknown patient',
  viewLabel = 'View',
  readonlyHint = 'Status updates when clinical actions complete — cards are not draggable.',
  notStartedLabel = 'Not started',
  pendingEncounterLabel = 'Awaiting encounter setup',
  accentTheme = 'blue',
}: FlowboardKanbanProps) {
  const { t } = useT()
  const primaryBtn =
    accentTheme === 'purple'
      ? 'bg-purple-600 hover:bg-purple-700'
      : 'bg-[#2E6EF3] hover:bg-[#1f5ad2]'
  const avatarBg = accentTheme === 'purple' ? 'bg-purple-600' : 'bg-[#2E6EF3]'

  const { columns, notStartedItems } = useMemo(() => {
    const visibleStatuses =
      filterStatus === 'all'
        ? ENCOUNTER_STATUSES
        : ENCOUNTER_STATUSES.filter((s) => s.value === filterStatus)

    const groups = new Map<string, FlowboardKanbanAppointment[]>()
    for (const s of visibleStatuses) {
      groups.set(s.value, [])
    }

    const notStarted: FlowboardKanbanAppointment[] = []

    for (const apt of appointments) {
      const status = resolveKanbanStatus(apt)
      if (groups.has(status)) {
        groups.get(status)!.push(apt)
      } else if (filterStatus === 'all') {
        notStarted.push(apt)
      }
    }

    const cols = visibleStatuses.map((status) => ({
      status: {
        ...status,
        label: translateEncounterStatus(t, status.value),
      },
      items: groups.get(status.value) ?? [],
    }))

    return { columns: cols, notStartedItems: notStarted }
  }, [appointments, filterStatus, t])

  const showNotStartedColumn =
    notStartedItems.length > 0 && (filterStatus === 'all' || filterStatus === NO_STATUS_KEY)

  const totalCards =
    columns.reduce((n, c) => n + c.items.length, 0) + (showNotStartedColumn ? notStartedItems.length : 0)

  if (totalCards === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 flex items-center gap-2 px-1">
        <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {readonlyHint}
      </p>

      <div className="overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
        <div className="flex gap-3 min-w-max items-stretch">
          {showNotStartedColumn && (
            <KanbanColumn
              title={notStartedLabel}
              icon="📋"
              count={notStartedItems.length}
              visual={getStatusVisualStyle(null)}
            >
              {notStartedItems.map((apt) => (
                <KanbanCard
                  key={apt.id}
                  appointment={apt}
                  formatDate={formatDate}
                  formatTime={formatTime}
                  formatDob={formatDob}
                  unknownPatientLabel={unknownPatientLabel}
                  viewLabel={viewLabel}
                  primaryBtn={primaryBtn}
                  avatarBg={avatarBg}
                  pendingEncounterLabel={pendingEncounterLabel}
                  onCardClick={onCardClick}
                  onViewClick={onViewClick}
                  renderCardFooter={renderCardFooter}
                />
              ))}
            </KanbanColumn>
          )}

          {columns.map(({ status, items }) => {
            const visual = getStatusVisualStyle(status.value)
            return (
              <KanbanColumn
                key={status.value}
                title={status.label}
                icon={status.icon}
                count={items.length}
                visual={visual}
              >
                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-8 text-center">
                    <p className="text-xs text-slate-400">{t('flow.kanban_no_patients')}</p>
                  </div>
                ) : (
                  items.map((apt) => (
                    <KanbanCard
                      key={apt.id}
                      appointment={apt}
                      formatDate={formatDate}
                      formatTime={formatTime}
                      formatDob={formatDob}
                      unknownPatientLabel={unknownPatientLabel}
                      viewLabel={viewLabel}
                      primaryBtn={primaryBtn}
                      avatarBg={avatarBg}
                      pendingEncounterLabel={pendingEncounterLabel}
                      onCardClick={onCardClick}
                      onViewClick={onViewClick}
                      renderCardFooter={renderCardFooter}
                    />
                  ))
                )}
              </KanbanColumn>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function KanbanColumn({
  title,
  icon,
  count,
  visual,
  children,
}: {
  title: string
  icon: string
  count: number
  visual: ReturnType<typeof getStatusVisualStyle>
  children: ReactNode
}) {
  return (
    <div
      className={`w-[272px] shrink-0 flex flex-col rounded-2xl border bg-gradient-to-b ${visual.columnHeader} shadow-sm`}
    >
      <div className="px-3.5 py-3 border-b border-inherit/50 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none" aria-hidden>
              {icon}
            </span>
            <h3 className="text-sm font-semibold text-slate-900 leading-tight truncate">{title}</h3>
          </div>
        </div>
        <span
          className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-bold text-white shadow-sm ${visual.columnDot}`}
        >
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 max-h-[min(68vh,720px)]">{children}</div>
    </div>
  )
}

function KanbanCard({
  appointment,
  formatDate,
  formatTime,
  formatDob,
  unknownPatientLabel,
  viewLabel,
  primaryBtn,
  avatarBg,
  onCardClick,
  onViewClick,
  renderCardFooter,
  pendingEncounterLabel = 'Awaiting encounter setup',
}: {
  appointment: FlowboardKanbanAppointment
  formatDate: (date: string | null) => string
  formatTime: (time: string | null) => string
  formatDob?: (date: string | null | undefined) => string | null
  unknownPatientLabel: string
  viewLabel: string
  primaryBtn: string
  avatarBg: string
  pendingEncounterLabel?: string
  onCardClick: (appointment: FlowboardKanbanAppointment) => void
  onViewClick?: (appointment: FlowboardKanbanAppointment, e: React.MouseEvent) => void
  renderCardFooter?: (appointment: FlowboardKanbanAppointment) => ReactNode
}) {
  const { language } = useT()
  const visual = getStatusVisualStyle(resolveKanbanStatus(appointment))
  const awaitingEncounter = isAwaitingEncounter(appointment)
  const initials = appointment.patient
    ? `${appointment.patient.first_name?.charAt(0) ?? ''}${appointment.patient.last_name?.charAt(0) ?? ''}`
    : '?'

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(appointment)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onCardClick(appointment)
        }
      }}
      className={`group text-left w-full rounded-xl border border-slate-200/90 bg-white border-l-[3px] ${visual.kanbanCardAccent} p-3 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/40`}
    >
      <div className="flex items-start gap-2.5 mb-2.5">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarBg}`}
        >
          {initials || '?'}
        </div>
        <div className="min-w-0 flex-1">
          {formatDob && (
            <p className="text-[10px] text-slate-400 mb-0.5">
              DOB {formatDob(appointment.patient?.date_of_birth) ?? '—'}
            </p>
          )}
          <p className="text-sm font-semibold text-slate-900 truncate leading-snug">
            {appointment.patient
              ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
              : unknownPatientLabel}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <p className="text-[10px] text-slate-400 font-mono">ID {appointment.patient_id}</p>
            <PatientSourceBadge source={appointment.patient?.created_by_source} />
          </div>
        </div>
      </div>

      <div className="space-y-1 text-[11px] text-slate-600 mb-2.5">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="truncate">{formatDate(appointment.appointment_date)}</span>
          <span className="text-slate-300">·</span>
          <span className="truncate">{formatTime(appointment.appointment_time)}</span>
        </div>
        {appointment.patient?.phone && (
          <div className="flex items-center gap-1.5 truncate">
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            <span className="truncate">{appointment.patient.phone}</span>
          </div>
        )}
        {appointment.assigned_doctor?.full_name && (
          <p className="text-emerald-700 font-medium truncate">Dr. {appointment.assigned_doctor.full_name}</p>
        )}
        {(() => {
          const treatmentType = flowboardServiceTitle(
            appointment,
            language,
            appointment.location_tenant_id
          )
          if (!treatmentType) return null
          return (
            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-violet-50 text-violet-800 border border-violet-100 text-[10px] font-medium">
              {treatmentType}
            </span>
          )
        })()}
        {awaitingEncounter && (
          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-medium">
            {pendingEncounterLabel}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-1">
        {onViewClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onViewClick(appointment, e)
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white transition-colors ${primaryBtn}`}
          >
            {viewLabel}
          </button>
        )}
        {renderCardFooter?.(appointment)}
      </div>
    </article>
  )
}
