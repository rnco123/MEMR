'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line,
  PieChart, Pie,
} from 'recharts'
import { useT } from '@/lib/i18n'
import type {
  ComplianceDashboardResponse,
  CompliancePendingReview,
  ComplianceProviderSummary,
} from '@/lib/compliance/types'

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

type DatePreset = 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth'

type PendingReview = CompliancePendingReview

type SortField = 'patient' | 'provider' | 'clinic' | 'encounterDate' | 'daysPending' | 'riskScore'
type SortDir = 'asc' | 'desc'

const EMPTY_DASHBOARD: ComplianceDashboardResponse = {
  kpi: { total: 0, required: 0, reviewed: 0, remaining: 0, compliance: 100, pending: 0, overdue: 0 },
  providers: [],
  pending: [],
  trend: [],
  velocity: [],
  filterOptions: { providers: [], clinics: [] },
  sparklines: {
    total: [0], required: [0], reviewed: [0], remaining: [0], compliance: [100], overdue: [0],
  },
}

function statusFilterToParam(statusLabel: string, t: (k: string) => string): string {
  if (statusLabel === t('compliance.compliant')) return 'compliant'
  if (statusLabel === t('compliance.warning')) return 'warning'
  if (statusLabel === t('compliance.critical')) return 'critical'
  return 'all'
}

// ═══════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════

function useCountUp(end: number, duration = 1100) {
  const [val, setVal] = useState(0)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const p = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(end * eased)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [end, duration])
  return val
}

// ═══════════════════════════════════════════════════════
// UTILITY COMPONENTS
// ═══════════════════════════════════════════════════════

function ClientOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return <>{fallback ?? <div className="h-full w-full animate-pulse rounded-xl bg-slate-100" />}</>
  return <>{children}</>
}

function Sparkline({ data, color, fillColor }: { data: number[]; color: string; fillColor?: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const W = 100, H = 36
  const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * W, y: H - ((v - min) / range) * H * 0.9 }))
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
      {fillColor && <path d={areaPath} fill={fillColor} opacity="0.18" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrendBadge({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const isGood = inverted ? value < 0 : value >= 0
  const sign = value >= 0 ? '+' : ''
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
      {value >= 0
        ? <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 3l7 7H3l7-7z" /></svg>
        : <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 17l-7-7h14l-7 7z" /></svg>}
      {sign}{Math.abs(value)}%
    </span>
  )
}

// ═══════════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════════

interface KpiCardProps {
  title: string
  value: number
  decimals?: number
  suffix?: string
  trend: number
  sparkData: number[]
  color: string
  fillColor: string
  icon: React.ReactNode
  description: string
  inverted?: boolean
  delay?: number
}

function KpiCard({ title, value, decimals = 0, suffix = '', trend, sparkData, color, fillColor, icon, description, inverted, delay = 0 }: KpiCardProps) {
  const count = useCountUp(value)
  const display = decimals > 0 ? count.toFixed(decimals) : Math.round(count).toLocaleString()

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.18 } }}
      className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow cursor-default"
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{title}</p>
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${color}15` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
      <div className="flex items-end gap-2 mb-2">
        <span className="text-2xl font-bold text-slate-900 tabular-nums leading-none">
          {display}{suffix}
        </span>
        <div className="mb-0.5">
          <TrendBadge value={trend} inverted={inverted} />
        </div>
      </div>
      <div className="h-7">
        <Sparkline data={sparkData} color={color} fillColor={fillColor} />
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400 truncate">{description}</p>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════
// FILTER BAR
// ═══════════════════════════════════════════════════════

interface FilterBarProps {
  preset: DatePreset
  onPreset: (p: DatePreset) => void
  clinicFilter: string
  onClinic: (c: string) => void
  providerFilter: string
  onProvider: (p: string) => void
  statusFilter: string
  onStatus: (s: string) => void
  providerOptions: string[]
  clinicOptions: string[]
}

function FilterBar({
  preset, onPreset, clinicFilter, onClinic, providerFilter, onProvider, statusFilter, onStatus,
  providerOptions, clinicOptions,
}: FilterBarProps) {
  const { t } = useT()

  const PRESETS: { id: DatePreset; label: string }[] = [
    { id: 'today',     label: t('compliance.preset_today') },
    { id: 'last7',     label: t('compliance.preset_last7') },
    { id: 'last30',    label: t('compliance.preset_last30') },
    { id: 'thisMonth', label: t('compliance.preset_this_month') },
    { id: 'lastMonth', label: t('compliance.preset_last_month') },
  ]

  const CLINICS = [t('compliance.all_clinics'), ...clinicOptions]
  const PROVIDERS_FILTER = [t('compliance.all_providers'), ...providerOptions]

  const selectClass = 'h-8 min-w-[8.5rem] px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer'

  return (
    <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-[#f8f4ff] border-b border-slate-200">
      <div className="flex flex-col xl:flex-row xl:items-center gap-2">
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-0.5">{t('compliance.period')}</span>
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => onPreset(p.id)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${preset === p.id
                ? 'bg-[#2E6EF3] text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap xl:flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{t('compliance.provider')}</span>
            <select value={providerFilter} onChange={e => onProvider(e.target.value)} className={selectClass}>
              {PROVIDERS_FILTER.map(pr => <option key={pr}>{pr}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{t('compliance.clinic')}</span>
            <select value={clinicFilter} onChange={e => onClinic(e.target.value)} className={selectClass}>
              {CLINICS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{t('compliance.status')}</span>
            <select value={statusFilter} onChange={e => onStatus(e.target.value)} className={selectClass}>
              <option>{t('compliance.all_status')}</option>
              <option>{t('compliance.compliant')}</option>
              <option>{t('compliance.warning')}</option>
              <option>{t('compliance.critical')}</option>
            </select>
          </div>
          <div className="xl:ml-auto flex items-center gap-1.5 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-slate-400">{t('compliance.live')} · {t('compliance.updated_just_now')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// CHART HELPERS
// ═══════════════════════════════════════════════════════

function ChartCard({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm ${className}`}>
      <div className="mb-2 shrink-0">
        <h3 className="text-sm font-semibold text-slate-900 leading-tight">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-3 py-2.5 text-xs">
      <p className="font-semibold text-slate-500 mb-1.5">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-600">{p.name}:</span>
          <span className="font-bold text-slate-900">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// RADIAL SCORE
// ═══════════════════════════════════════════════════════

function RadialScore({ score, t }: { score: number; t: (key: string) => string }) {
  const [animated, setAnimated] = useState(false)
  useEffect(() => { setTimeout(() => setAnimated(true), 300) }, [score])
  const r = 58
  const circ = 2 * Math.PI * r
  const filled = animated ? (score / 100) * circ : 0
  const color = score >= 90 ? '#10B981' : score >= 70 ? '#F59E0B' : '#F43F5E'
  const bg    = score >= 90 ? '#D1FAE5' : score >= 70 ? '#FEF3C7' : '#FFE4E6'

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <svg width="148" height="148" viewBox="0 0 148 148">
        <circle cx="74" cy="74" r={r} fill="none" stroke={bg} strokeWidth="12" />
        <motion.circle
          cx="74" cy="74" r={r} fill="none"
          stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - filled }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          transform="rotate(-90 74 74)"
        />
        <text x="74" y="70" textAnchor="middle" fontSize="24" fontWeight="700" fill="#0F172A" fontFamily="system-ui">
          {score}%
        </text>
        <text x="74" y="86" textAnchor="middle" fontSize="10" fill="#94A3B8" fontFamily="system-ui">
          {t('compliance.score_label')}
        </text>
      </svg>
      <div className="text-center">
        <p className="text-[11px] text-slate-500 mb-1">{t('compliance.score_target')}</p>
        <div className="flex gap-2 text-[10px]">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-slate-500">{t('compliance.score_good')}</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-slate-500">{t('compliance.score_warn')}</span></div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// REVIEW DRAWER
// ═══════════════════════════════════════════════════════

interface DrawerProps {
  review: PendingReview | null
  readOnly?: boolean
  patientFileHref?: string | null
  onClose: () => void
  onSave: (encounterId: number, status: string, notes: string, findings: string) => Promise<void>
  t: (key: string) => string
}

function ReviewDrawer({ review, readOnly = false, patientFileHref, onClose, onSave, t }: DrawerProps) {
  const [reviewStatus, setReviewStatus] = useState('reviewed')
  const [notes, setNotes] = useState('')
  const [findings, setFindings] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detail, setDetail] = useState<PendingReview | null>(null)

  useEffect(() => {
    if (!review) {
      setDetail(null)
      return
    }
    setReviewStatus('reviewed')
    setNotes('')
    setFindings('')
    setDetail(review)
    setLoadingDetail(true)

    fetch(`/api/compliance/reviews/${review.encounterIdNum}`)
      .then(async res => {
        if (!res.ok) return null
        return res.json()
      })
      .then(data => {
        if (!data) return
        setReviewStatus(data.reviewStatus ?? 'reviewed')
        setNotes(data.notes ?? '')
        setFindings(data.findings ?? '')
        setDetail(prev => prev ? {
          ...prev,
          patient: data.patient?.name ?? prev.patient,
          patientId: data.patient?.patientCode ?? prev.patientId,
          dob: data.patient?.dob ?? prev.dob,
          chiefComplaint: data.patient?.chiefComplaint ?? prev.chiefComplaint,
          provider: data.provider ?? prev.provider,
          clinic: data.clinic ?? prev.clinic,
          encounterDate: data.encounterDate ?? prev.encounterDate,
          encounterId: data.encounterCode ?? prev.encounterId,
          soap: data.soap ?? prev.soap,
        } : prev)
      })
      .finally(() => setLoadingDetail(false))
  }, [review?.id, review?.encounterIdNum])

  const active = detail ?? review

  const handleSave = async () => {
    if (!review) return
    setSaving(true)
    try {
      await onSave(review.encounterIdNum, reviewStatus, notes, findings)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const soapLabels: Record<string, string> = {
    subjective: t('compliance.soap_subjective'),
    objective:  t('compliance.soap_objective'),
    assessment: t('compliance.soap_assessment'),
    plan:       t('compliance.soap_plan'),
  }

  const StatusBtn = ({ value, label, desc }: { value: string; label: string; desc: string }) => (
    <button
      onClick={() => setReviewStatus(value)}
      className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${reviewStatus === value
        ? 'border-[#2E6EF3] bg-blue-50'
        : 'border-slate-200 hover:border-slate-300 bg-white'}`}
    >
      <div className={`text-xs font-bold mb-0.5 ${reviewStatus === value ? 'text-[#2E6EF3]' : 'text-slate-700'}`}>{label}</div>
      <div className="text-[10px] text-slate-400 leading-tight">{desc}</div>
    </button>
  )

  return (
    <AnimatePresence>
      {review && active && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100]"
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 h-full w-[560px] max-w-full bg-white z-[110] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {readOnly ? t('compliance.drawer_view_title') : t('compliance.drawer_title')}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{active.encounterId} · {active.patient}</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {loadingDetail && (
                <div className="text-xs text-slate-400 animate-pulse">{t('compliance.drawer_loading')}</div>
              )}
              {/* Patient summary */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">{t('compliance.drawer_patient')}</p>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div><span className="text-slate-400 text-xs">{t('compliance.drawer_name')}</span><p className="font-semibold text-slate-900">{active.patient}</p></div>
                  <div><span className="text-slate-400 text-xs">{t('compliance.drawer_id')}</span><p className="font-semibold text-slate-900">{active.patientId}</p></div>
                  <div><span className="text-slate-400 text-xs">{t('compliance.drawer_dob')}</span><p className="font-semibold text-slate-900">{active.dob}</p></div>
                  <div><span className="text-slate-400 text-xs">{t('compliance.drawer_complaint')}</span><p className="font-semibold text-slate-900 text-xs leading-snug">{active.chiefComplaint}</p></div>
                </div>
              </div>

              {/* Encounter info */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">{t('compliance.drawer_encounter')}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-[10px] text-slate-400 mb-1">{t('compliance.drawer_enc_provider')}</p>
                    <p className="font-semibold text-slate-900 text-xs leading-snug">{active.provider}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-[10px] text-slate-400 mb-1">{t('compliance.drawer_enc_clinic')}</p>
                    <p className="font-semibold text-slate-900 text-xs">{active.clinic}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-[10px] text-slate-400 mb-1">{t('compliance.drawer_enc_date')}</p>
                    <p className="font-semibold text-slate-900 text-xs">{active.encounterDate}</p>
                  </div>
                </div>
              </div>

              {/* SOAP */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">{t('compliance.drawer_soap')}</p>
                {(['subjective', 'objective', 'assessment', 'plan'] as const).map(section => (
                  <div key={section} className="mb-3">
                    <p className="text-xs font-bold text-slate-600 mb-1">{soapLabels[section]}</p>
                    <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3">
                      {active.soap[section] || t('compliance.drawer_soap_empty')}
                    </p>
                  </div>
                ))}
              </div>

              {/* Diagnoses */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">{t('compliance.drawer_diagnoses')}</p>
                <div className="space-y-1.5">
                  {active.diagnoses.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-700">
                      <span className="mt-0.5 text-[#2E6EF3] font-bold">Dx</span>{d}
                    </div>
                  ))}
                  {active.diagnoses.length === 0 && <p className="text-xs text-slate-400 italic">{t('compliance.drawer_no_diagnoses')}</p>}
                </div>
              </div>

              {/* Medications */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">{t('compliance.drawer_medications')}</p>
                {active.medications.length ? (
                  <div className="flex flex-wrap gap-2">
                    {active.medications.map((m, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        {m}
                      </span>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400 italic">{t('compliance.drawer_no_medications')}</p>}
              </div>

              {/* Orders */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">{t('compliance.drawer_orders')}</p>
                {active.orders.length ? (
                  <div className="flex flex-wrap gap-2">
                    {active.orders.map((o, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-teal-50 text-teal-700 border border-teal-200">{o}</span>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400 italic">{t('compliance.drawer_no_orders')}</p>}
              </div>

              {/* Review form */}
              {!readOnly && (
              <div className="border-t border-slate-100 pt-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">{t('compliance.drawer_review')}</p>

                <p className="text-xs font-semibold text-slate-700 mb-2">{t('compliance.drawer_review_status')}</p>
                <div className="flex flex-col gap-2 mb-4">
                  <StatusBtn value="reviewed"           label={t('compliance.review_reviewed')}           desc={t('compliance.review_reviewed_desc')} />
                  <StatusBtn value="consult_concluded"  label={t('compliance.review_consult_concluded')}  desc={t('compliance.review_consult_concluded_desc')} />
                  <StatusBtn value="physician_signed"   label={t('compliance.review_physician_signed')}   desc={t('compliance.review_physician_signed_desc')} />
                </div>

                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">{t('compliance.drawer_notes')}</label>
                  <textarea
                    value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    placeholder={t('compliance.drawer_notes_placeholder')}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] resize-none"
                  />
                </div>
                {reviewStatus === 'consult_concluded' && (
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">{t('compliance.drawer_findings')}</label>
                    <textarea
                      value={findings} onChange={e => setFindings(e.target.value)} rows={3}
                      placeholder={t('compliance.drawer_findings_placeholder')}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-amber-200 bg-amber-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                    />
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0 bg-white">
              {readOnly ? (
                <>
                  <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                    {t('compliance.drawer_btn_close')}
                  </button>
                  {patientFileHref && (
                    <Link
                      href={patientFileHref}
                      className="flex-[2] h-10 rounded-xl bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#1f5ad2] transition-colors flex items-center justify-center"
                    >
                      {t('compliance.drawer_open_chart')}
                    </Link>
                  )}
                </>
              ) : (
                <>
              <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                {t('compliance.drawer_btn_cancel')}
              </button>
              <button
                onClick={handleSave} disabled={saving}
                className="flex-[2] h-10 rounded-xl bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#1f5ad2] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                    {t('compliance.drawer_btn_saving')}
                  </>
                ) : t('compliance.drawer_btn_save')}
              </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ═══════════════════════════════════════════════════════
// PROVIDER AUDIT TABLE
// ═══════════════════════════════════════════════════════

const barColor = (compliance: number) => compliance >= 90 ? '#10B981' : compliance >= 70 ? '#F59E0B' : '#F43F5E'

interface ProviderAuditTableProps {
  providers: ComplianceProviderSummary[]
  t: (key: string) => string
}

function ProviderAuditTable({ providers, t }: ProviderAuditTableProps) {
  const thClass = 'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-left whitespace-nowrap'
  const tdClass = 'px-3 py-2.5 text-sm'

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">{t('compliance.audit_table_title')}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{t('compliance.audit_table_subtitle')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className={thClass}>{t('compliance.audit_col_provider')}</th>
              <th className={`${thClass} text-right`}>{t('compliance.audit_col_total')}</th>
              <th className={`${thClass} text-right`}>{t('compliance.audit_col_required')}</th>
              <th className={`${thClass} text-right`}>{t('compliance.audit_col_completed')}</th>
              <th className={`${thClass} text-right`}>{t('compliance.audit_col_remaining')}</th>
              <th className={`${thClass} text-right`}>{t('compliance.audit_col_pct')}</th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-slate-400">{t('compliance.audit_table_empty')}</td>
              </tr>
            ) : providers.map((p, idx) => {
              const remaining = Math.max(0, p.required - p.reviewed)
              return (
                <motion.tr
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.04 }}
                  className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
                >
                  <td className={tdClass}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0">{p.avatar}</div>
                      <div>
                        <p className="font-semibold text-slate-900 text-xs">{p.name}</p>
                        <p className="text-[10px] text-slate-400">{p.role} · {p.clinic}</p>
                      </div>
                    </div>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums font-medium text-slate-800`}>{p.total}</td>
                  <td className={`${tdClass} text-right tabular-nums text-slate-600`}>{p.required}</td>
                  <td className={`${tdClass} text-right tabular-nums font-semibold text-emerald-600`}>{p.reviewed}</td>
                  <td className={`${tdClass} text-right tabular-nums font-semibold ${remaining > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{remaining}</td>
                  <td className={`${tdClass} text-right tabular-nums font-bold`} style={{ color: barColor(p.compliance) }}>{p.compliance}%</td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// PENDING TABLE
// ═══════════════════════════════════════════════════════

interface TableProps {
  reviews: PendingReview[]
  onReview: (r: PendingReview) => void
  onView: (r: PendingReview) => void
  t: (key: string) => string
}

function PendingTable({ reviews, onReview, onView, t }: TableProps) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'daysPending', dir: 'desc' })
  const [page, setPage] = useState(1)
  const pageSize = 5

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const data = reviews.filter(r =>
      !q || r.patient.toLowerCase().includes(q) || r.encounterId.toLowerCase().includes(q) ||
      r.provider.toLowerCase().includes(q) || r.clinic.toLowerCase().includes(q)
    )
    return [...data].sort((a, b) => {
      const aVal = a[sort.field as keyof PendingReview]
      const bVal = b[sort.field as keyof PendingReview]
      if (typeof aVal === 'number' && typeof bVal === 'number') return sort.dir === 'asc' ? aVal - bVal : bVal - aVal
      return sort.dir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
    })
  }, [reviews, search, sort])

  const pages = Math.ceil(filtered.length / pageSize)
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const toggleSort = (field: SortField) => {
    setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' })
    setPage(1)
  }

  const SortIcon = ({ field }: { field: SortField }) => (
    <svg className="w-3 h-3 ml-1 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
        d={sort.field === field ? (sort.dir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7') : 'M8 9l4-4 4 4M8 15l4 4 4-4'} />
    </svg>
  )

  const StatusPill = ({ status }: { status: PendingReview['status'] }) => {
    const styles = {
      pending:   'bg-amber-50 text-amber-700 border-amber-200',
      overdue:   'bg-rose-50 text-rose-700 border-rose-200',
      in_review: 'bg-blue-50 text-blue-700 border-blue-200',
    }
    const labels: Record<PendingReview['status'], string> = {
      pending:   t('compliance.status_pending'),
      overdue:   t('compliance.status_overdue'),
      in_review: t('compliance.status_in_review'),
    }
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${styles[status]}`}>{labels[status]}</span>
  }

  const RiskScore = ({ score }: { score: number }) => {
    const color = score >= 8 ? 'text-rose-600' : score >= 6 ? 'text-amber-600' : 'text-emerald-600'
    const bar   = score >= 8 ? 'bg-rose-400'  : score >= 6 ? 'bg-amber-400'  : 'bg-emerald-400'
    return (
      <div className="flex items-center gap-1.5">
        <span className={`text-xs font-bold tabular-nums ${color}`}>{score.toFixed(1)}</span>
        <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${score * 10}%` }} />
        </div>
      </div>
    )
  }

  type ColDef = { label: string; field?: SortField }
  const columns: ColDef[] = [
    { label: t('compliance.col_patient'),   field: 'patient' },
    { label: t('compliance.col_encounter') },
    { label: t('compliance.col_provider'),  field: 'provider' },
    { label: t('compliance.col_clinic'),    field: 'clinic' },
    { label: t('compliance.col_date'),      field: 'encounterDate' },
    { label: t('compliance.col_days'),      field: 'daysPending' },
    { label: t('compliance.col_status') },
    { label: t('compliance.col_risk'),      field: 'riskScore' },
    { label: t('compliance.col_actions') },
  ]

  const thClass = 'px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-left whitespace-nowrap select-none'
  const tdClass = 'px-3 py-2 text-sm'

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t('compliance.table_title')}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('compliance.table_subtitle').replace('{n}', String(filtered.length))}</p>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('compliance.table_search')}
            className="pl-9 pr-3 h-8 w-56 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {columns.map(col => (
                <th key={col.label}
                  className={`${thClass} ${col.field ? 'cursor-pointer hover:text-slate-600 transition-colors' : ''}`}
                  onClick={() => col.field && toggleSort(col.field)}>
                  <span className="flex items-center">{col.label}{col.field && <SortIcon field={col.field} />}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={9} className="py-16 text-center text-slate-400 text-sm">{t('compliance.table_no_results')}</td></tr>
            ) : (
              paged.map((r, idx) => (
                <motion.tr key={r.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
                >
                  <td className={tdClass}>
                    <div>
                      <p className="font-semibold text-slate-900">{r.patient}</p>
                      <p className="text-[11px] text-slate-400">{r.patientId}</p>
                    </div>
                  </td>
                  <td className={`${tdClass} font-mono text-xs text-slate-500`}>{r.encounterId}</td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#2E6EF3] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {r.provider.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <p className="text-xs font-semibold text-slate-900 leading-none">{r.provider}</p>
                    </div>
                  </td>
                  <td className={`${tdClass} text-xs text-slate-600`}>{r.clinic}</td>
                  <td className={`${tdClass} text-xs text-slate-600 tabular-nums`}>{r.encounterDate}</td>
                  <td className={tdClass}>
                    <span className={`font-bold text-sm tabular-nums ${r.daysPending > 7 ? 'text-rose-600' : r.daysPending > 4 ? 'text-amber-600' : 'text-slate-700'}`}>
                      {r.daysPending}d
                    </span>
                  </td>
                  <td className={tdClass}><StatusPill status={r.status} /></td>
                  <td className={tdClass}><RiskScore score={r.riskScore} /></td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => onReview(r)} className="h-7 px-3 rounded-lg bg-[#2E6EF3] text-white text-[11px] font-semibold hover:bg-[#1f5ad2] transition-colors">
                        {t('compliance.btn_review')}
                      </button>
                      <button onClick={() => onView(r)} className="h-7 px-3 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                        {t('compliance.btn_view')}
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            {t('compliance.pagination_showing')
              .replace('{from}', String((page - 1) * pageSize + 1))
              .replace('{to}', String(Math.min(page * pageSize, filtered.length)))
              .replace('{total}', String(filtered.length))}
          </p>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="h-7 w-7 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 text-xs flex items-center justify-center transition-colors">‹</button>
            {Array.from({ length: pages }).map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)}
                className={`h-7 w-7 rounded-lg text-xs font-semibold transition-colors ${page === i + 1 ? 'bg-[#2E6EF3] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {i + 1}
              </button>
            ))}
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
              className="h-7 w-7 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 text-xs flex items-center justify-center transition-colors">›</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function CompliancePage() {
  const { t } = useT()
  const pathname = usePathname()
  const [preset, setPreset] = useState<DatePreset>('thisMonth')
  const [clinicFilter, setClinicFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null)
  const [drawerReadOnly, setDrawerReadOnly] = useState(false)
  const [chartKey, setChartKey] = useState(0)
  const [dashboard, setDashboard] = useState<ComplianceDashboardResponse>(EMPTY_DASHBOARD)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const allClinicsLabel    = t('compliance.all_clinics')
  const allProvidersLabel  = t('compliance.all_providers')
  const allStatusLabel     = t('compliance.all_status')

  useEffect(() => {
    if (!clinicFilter) setClinicFilter(allClinicsLabel)
    if (!providerFilter) setProviderFilter(allProvidersLabel)
    if (!statusFilter) setStatusFilter(allStatusLabel)
  }, [allClinicsLabel, allProvidersLabel, allStatusLabel, clinicFilter, providerFilter, statusFilter])

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams({ preset })
      if (providerFilter && providerFilter !== allProvidersLabel) {
        params.set('provider', providerFilter)
      }
      if (clinicFilter && clinicFilter !== allClinicsLabel) {
        params.set('clinic', clinicFilter)
      }
      const statusParam = statusFilterToParam(statusFilter, t)
      if (statusParam !== 'all') params.set('status', statusParam)

      const res = await fetch(`/api/compliance?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || err?.message || 'Failed to load compliance data')
      }
      const data = (await res.json()) as ComplianceDashboardResponse
      setDashboard(data)
      setChartKey(k => k + 1)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to load compliance data')
      setDashboard(EMPTY_DASHBOARD)
    } finally {
      setLoading(false)
    }
  }, [preset, providerFilter, clinicFilter, statusFilter, allProvidersLabel, allClinicsLabel, t])

  useEffect(() => {
    if (!providerFilter || !clinicFilter || !statusFilter) return
    fetchDashboard()
  }, [fetchDashboard, providerFilter, clinicFilter, statusFilter])

  const presetLabel = useMemo(() => {
    const map: Record<DatePreset, string> = {
      today:     t('compliance.preset_today'),
      last7:     t('compliance.preset_last7'),
      last30:    t('compliance.preset_last30'),
      thisMonth: t('compliance.preset_this_month'),
      lastMonth: t('compliance.preset_last_month'),
    }
    return map[preset]
  }, [preset, t])

  const kpi = dashboard.kpi
  const providers = dashboard.providers
  const trendData = dashboard.trend.length ? dashboard.trend : [{ date: '—', reviewed: 0, required: 0, compliance: 100 }]
  const velocityData = dashboard.velocity.length ? dashboard.velocity : [{ week: 'Wk 1', reviews: 0 }]
  const sparklines = dashboard.sparklines

  const velocityDelta = useMemo(() => {
    if (velocityData.length < 2) return null
    const last = velocityData[velocityData.length - 1]?.reviews ?? 0
    const prev = velocityData[velocityData.length - 2]?.reviews ?? 0
    if (prev === 0) return last > 0 ? 100 : 0
    return Math.round(((last - prev) / prev) * 100)
  }, [velocityData])

  const attentionProviders = useMemo(
    () => [...providers].filter(p => p.compliance < 100).sort((a, b) => a.compliance - b.compliance).slice(0, 5),
    [providers]
  )

  const donutData = [
    { name: t('compliance.legend_reviewed'), value: kpi.reviewed, color: '#10B981' },
    { name: t('compliance.kpi_remaining'),   value: kpi.remaining, color: '#F59E0B' },
    { name: t('compliance.kpi_overdue'),     value: kpi.overdue,  color: '#F43F5E' },
  ]

  const patientFileHref = useMemo(() => {
    if (!selectedReview?.patientIdNum) return null
    const base = pathname.startsWith('/admin') ? '/admin/patient-file' : '/patient-file'
    return `${base}/${selectedReview.patientIdNum}`
  }, [pathname, selectedReview?.patientIdNum])

  const openReviewDrawer = useCallback((review: PendingReview, readOnly: boolean) => {
    setDrawerReadOnly(readOnly)
    setSelectedReview(review)
  }, [])

  const closeReviewDrawer = useCallback(() => {
    setSelectedReview(null)
    setDrawerReadOnly(false)
  }, [])

  const handleSaveReview = useCallback(async (
    encounterId: number,
    status: string,
    notes: string,
    findings: string
  ) => {
    const res = await fetch(`/api/compliance/reviews/${encounterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        review_status: status,
        notes,
        findings,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || err?.message || 'Failed to save review')
    }
    await fetchDashboard()
    closeReviewDrawer()
  }, [fetchDashboard, closeReviewDrawer])

  return (
    <div className="w-full space-y-3">
      <FilterBar
        preset={preset} onPreset={setPreset}
        clinicFilter={clinicFilter}   onClinic={setClinicFilter}
        providerFilter={providerFilter} onProvider={setProviderFilter}
        statusFilter={statusFilter}   onStatus={setStatusFilter}
        providerOptions={dashboard.filterOptions.providers}
        clinicOptions={dashboard.filterOptions.clinics}
      />

      <div className="space-y-3">

        {fetchError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
            {fetchError}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500 animate-pulse">
            {t('compliance.loading')}
          </div>
        )}

        {!loading && kpi.total === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            {t('compliance.empty_no_data')}
          </div>
        )}

        {/* ── PAGE HEADER ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#2E6EF3] flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900 leading-none">{t('compliance.title')}</h1>
                  {kpi.compliance >= 90
                    ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">{t('compliance.on_track')}</span>
                    : <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">{t('compliance.needs_attention')}</span>}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{t('compliance.subtitle')}</p>
              </div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="flex gap-2 shrink-0">
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
              <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              {t('compliance.export_pdf')}
            </button>
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#2E6EF3] text-white text-xs font-semibold hover:bg-[#1f5ad2] transition-colors shadow-sm shadow-blue-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6M4 4h16v16H4V4z" />
              </svg>
              {t('compliance.export_excel')}
            </button>
          </motion.div>
        </div>

        {/* Chart vs encounter explainer */}
        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
          <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-900">{t('compliance.info_title')}</p>
            <p className="text-xs text-blue-800/90 mt-0.5 leading-relaxed">{t('compliance.info_body')}</p>
          </div>
        </div>

        {/* Alert banner */}
        <AnimatePresence>
          {(kpi.overdue > 0 || kpi.remaining > 0 || kpi.compliance < 100) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-900">{t('compliance.alert_title')}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {kpi.overdue > 0 && (
                      <span className="text-xs text-amber-700">
                        {t('compliance.alert_overdue').replace('{n}', String(kpi.overdue)).replace('{s}', kpi.overdue > 1 ? 's' : '')}
                      </span>
                    )}
                    {kpi.remaining > 0 && (
                      <span className="text-xs text-amber-700">
                        {t('compliance.alert_remaining').replace('{n}', String(kpi.remaining)).replace('{s}', kpi.remaining > 1 ? 's' : '')}
                      </span>
                    )}
                    {kpi.compliance < 100 && (
                      <span className="text-xs text-amber-700">
                        {t('compliance.alert_rate').replace('{pct}', String(kpi.compliance))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── ROW 1: KPI CARDS ── */}
        <AnimatePresence mode="wait">
          <motion.div key={`kpi-${preset}`} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiCard title={t('compliance.kpi_total')}      value={kpi.total}      trend={0}  sparkData={sparklines.total}      color="#3B82F6" fillColor="#3B82F6" delay={0}    description={t('compliance.kpi_total_desc')}
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
            <KpiCard title={t('compliance.kpi_required')}   value={kpi.required}   trend={0}   sparkData={sparklines.required}   color="#F59E0B" fillColor="#F59E0B" delay={0.06} description={t('compliance.kpi_required_desc')}
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
            <KpiCard title={t('compliance.kpi_reviewed')}   value={kpi.reviewed}   trend={0}   sparkData={sparklines.reviewed}   color="#10B981" fillColor="#10B981" delay={0.12} description={t('compliance.kpi_reviewed_desc')}
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
            <KpiCard title={t('compliance.kpi_remaining')}  value={kpi.remaining}  trend={0} sparkData={sparklines.remaining}  color="#F97316" fillColor="#F97316" delay={0.18} description={t('compliance.kpi_remaining_desc')}  inverted
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
            <KpiCard title={t('compliance.kpi_compliance')} value={kpi.compliance} trend={0}   sparkData={sparklines.compliance} color="#8B5CF6" fillColor="#8B5CF6" delay={0.24} description={t('compliance.kpi_compliance_desc')} decimals={1} suffix="%"
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
            <KpiCard title={t('compliance.kpi_overdue')}    value={kpi.overdue}    trend={0} sparkData={sparklines.overdue}    color="#F43F5E" fillColor="#F43F5E" delay={0.3}  description={t('compliance.kpi_overdue_desc')}    inverted
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>} />
          </motion.div>
        </AnimatePresence>

        {/* ── PROVIDER AUDIT SUMMARY ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 }}>
          <ProviderAuditTable providers={providers} t={t} />
        </motion.div>

        {/* ── ROW 2: TREND + RADIAL ── */}
        <div className="grid grid-cols-10 gap-3 items-stretch">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="col-span-10 lg:col-span-7 h-full">
            <ChartCard
              title={t('compliance.trend_title')}
              subtitle={t('compliance.trend_subtitle').replace('{period}', presetLabel)}
              className="h-full flex flex-col"
            >
              <div className="flex-1 min-h-[200px]">
                <ClientOnly fallback={<div className="h-full min-h-[200px] animate-pulse bg-slate-100 rounded-lg" />}>
                  <AnimatePresence mode="wait">
                    <motion.div key={`trend-${chartKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="h-full min-h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="gradReviewed" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gradRequired" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.12} />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="required" name={t('compliance.legend_required')} stroke="#3B82F6" strokeWidth={1.5} fill="url(#gradRequired)" strokeDasharray="4 2" />
                        <Area type="monotone" dataKey="reviewed" name={t('compliance.legend_reviewed')} stroke="#10B981" strokeWidth={2} fill="url(#gradReviewed)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </motion.div>
                </AnimatePresence>
              </ClientOnly>
              </div>
              <div className="mt-2 flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5"><div className="w-5 h-0.5 bg-emerald-500 rounded" /><span className="text-xs text-slate-400">{t('compliance.legend_reviewed')}</span></div>
                <div className="flex items-center gap-1.5"><div className="w-5 border-t-2 border-dashed border-blue-400" /><span className="text-xs text-slate-400">{t('compliance.legend_required')}</span></div>
              </div>
            </ChartCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="col-span-10 lg:col-span-3 h-full">
            <ChartCard title={t('compliance.score_title')} subtitle={t('compliance.score_subtitle')} className="h-full flex flex-col">
              <div className="flex-1 flex items-center justify-center min-h-[160px]">
                <AnimatePresence mode="wait">
                  <motion.div key={`radial-${chartKey}`} className="w-full">
                    <RadialScore score={kpi.compliance} t={t} />
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 shrink-0">
                <div className="text-center">
                  <p className="text-base font-bold text-slate-900">{kpi.reviewed}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t('compliance.score_reviewed')}</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-slate-900">{kpi.required}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t('compliance.score_required')}</p>
                </div>
              </div>
            </ChartCard>
          </motion.div>
        </div>

        {/* ── ROW 3: PROVIDERS + DONUT (matched height) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="lg:col-span-7 h-full">
            <ChartCard title={t('compliance.providers_title')} subtitle={t('compliance.providers_subtitle')} className="h-full flex flex-col">
              <div className="flex-1 min-h-[200px]">
                <ClientOnly fallback={<div className="h-full min-h-[200px] animate-pulse bg-slate-100 rounded-lg" />}>
                  <AnimatePresence mode="wait">
                    <motion.div key={`bar-${chartKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full min-h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={providers} layout="vertical" margin={{ top: 4, right: 16, left: 80, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} unit="%" />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} width={76} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="compliance" name={t('compliance.kpi_compliance')} radius={[0, 4, 4, 0]} barSize={12}>
                            {providers.map(p => <Cell key={p.id} fill={barColor(p.compliance)} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </motion.div>
                  </AnimatePresence>
                </ClientOnly>
              </div>
            </ChartCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18 }} className="lg:col-span-5 h-full">
            <ChartCard title={t('compliance.donut_title')} subtitle={t('compliance.donut_subtitle')} className="h-full flex flex-col">
              <div className="flex-1 min-h-[140px] flex items-center justify-center">
                <ClientOnly fallback={<div className="w-full h-full min-h-[140px] animate-pulse bg-slate-100 rounded-lg" />}>
                  <AnimatePresence mode="wait">
                    <motion.div key={`donut-${chartKey}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.4 }} className="relative w-full h-full min-h-[140px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={donutData} cx="50%" cy="50%" innerRadius="58%" outerRadius="82%" paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                            {donutData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-lg font-bold text-slate-900">{kpi.required}</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">{t('compliance.donut_total')}</span>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </ClientOnly>
              </div>
              <div className="space-y-1 mt-1.5 shrink-0">
                {donutData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                      <span className="text-slate-600 font-medium">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{d.value}</span>
                      <span className="text-slate-400">{kpi.required > 0 ? Math.round((d.value / kpi.required) * 100) : 0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </motion.div>
        </div>

        {/* ── ROW 4: ATTENTION + VELOCITY (matched height) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="lg:col-span-7 h-full">
            <ChartCard title={t('compliance.attention_title')} subtitle={t('compliance.attention_subtitle')} className="h-full flex flex-col">
              <div className="flex-1 space-y-1.5">
                {attentionProviders.map((p, i) => (
                  <motion.div key={p.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: i * 0.07 }}
                    className="flex items-center gap-2.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${i === 0 ? 'bg-rose-500' : i === 1 ? 'bg-orange-500' : 'bg-amber-400'}`}>
                      {i + 1}
                    </div>
                    <div className="w-5 h-5 rounded-md bg-slate-200 text-slate-600 text-[8px] font-bold flex items-center justify-center shrink-0">{p.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-semibold text-slate-800 truncate">{p.name}</span>
                        <span className="text-xs font-bold ml-2 shrink-0" style={{ color: barColor(p.compliance) }}>{p.compliance}%</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div className="h-full rounded-full" style={{ backgroundColor: barColor(p.compliance) }}
                          initial={{ width: 0 }} animate={{ width: `${p.compliance}%` }} transition={{ duration: 0.9, delay: 0.2 + i * 0.07 }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {p.clinic} · {t('compliance.attention_pending').replace('{n}', String(p.pending + p.overdue)).replace('{s}', (p.pending + p.overdue) !== 1 ? 's' : '')}
                      </p>
                    </div>
                  </motion.div>
                ))}
                {attentionProviders.length === 0 && (
                  <div className="text-center py-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-1.5">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{t('compliance.attention_empty')}</p>
                    <p className="text-xs text-slate-400">{t('compliance.attention_empty_desc')}</p>
                  </div>
                )}
              </div>
            </ChartCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.27 }} className="lg:col-span-5 h-full">
            <ChartCard title={t('compliance.velocity_title')} subtitle={t('compliance.velocity_subtitle')} className="h-full flex flex-col">
              <div className="flex-1 min-h-[160px]">
                <ClientOnly fallback={<div className="h-full min-h-[160px] animate-pulse bg-slate-100 rounded-lg" />}>
                  <AnimatePresence mode="wait">
                    <motion.div key={`velocity-${chartKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full min-h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={velocityData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                          <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <Line type="monotone" dataKey="reviews" name={t('compliance.velocity_title')} stroke="#2E6EF3" strokeWidth={2}
                            dot={{ r: 3, fill: '#2E6EF3', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </motion.div>
                  </AnimatePresence>
                </ClientOnly>
              </div>
              <div className="mt-1.5 flex items-center justify-between pt-2 border-t border-slate-100 shrink-0">
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-900">{velocityData.length ? Math.round(velocityData.reduce((s, d) => s + d.reviews, 0) / velocityData.length) : 0}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t('compliance.velocity_avg')}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-900">{velocityData.length ? Math.max(...velocityData.map(d => d.reviews)) : 0}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t('compliance.velocity_best')}</p>
                </div>
                <div className="text-center">
                  <p className={`text-sm font-bold ${velocityDelta == null ? 'text-slate-400' : velocityDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {velocityDelta == null ? '—' : `${velocityDelta >= 0 ? '↑' : '↓'} ${Math.abs(velocityDelta)}%`}
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t('compliance.velocity_vs_prior')}</p>
                </div>
              </div>
            </ChartCard>
          </motion.div>
        </div>

        {/* ── ROW 5: PENDING TABLE ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }}>
          <PendingTable
            reviews={dashboard.pending}
            onReview={r => openReviewDrawer(r, false)}
            onView={r => openReviewDrawer(r, true)}
            t={t}
          />
        </motion.div>
      </div>

      <ReviewDrawer
        review={selectedReview}
        readOnly={drawerReadOnly}
        patientFileHref={patientFileHref}
        onClose={closeReviewDrawer}
        onSave={handleSaveReview}
        t={t}
      />
    </div>
  )
}
