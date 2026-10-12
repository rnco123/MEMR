'use client'

import Image from 'next/image'
import Link from 'next/link'
import { LanguageToggle } from '@/components/LanguageToggle'
import { HeroIllustration } from '@/components/landing/HeroIllustration'
import { useT } from '@/lib/i18n'

const NAVY = 'text-[#0B2545]'

type IconName = 'flow' | 'video' | 'sparkles' | 'pill' | 'flask' | 'shield' | 'globe' | 'pin' | 'check' | 'arrow' | 'search' | 'bell' | 'mail' | 'file'

const ICON_PATHS: Record<IconName, string[]> = {
  flow: ['M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z'],
  video: ['M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'],
  sparkles: ['M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.29 6.87L22 12l-6.71 2.13L13 21l-2.29-6.87L4 12l6.71-2.13z'],
  pill: ['M10.5 20.5a4.95 4.95 0 01-7-7l6-6a4.95 4.95 0 017 7l-6 6zM8.5 8.5l7 7'],
  flask: ['M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 006 21h12a1.7 1.7 0 001.5-2.5L14 9V3M7.5 15h9'],
  shield: ['M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3zM9 12l2 2 4-4'],
  globe: ['M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18'],
  pin: ['M17.66 16.66L13.41 20.9a2 2 0 01-2.82 0l-4.25-4.24a8 8 0 1111.32 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z'],
  check: ['M5 13l4 4L19 7'],
  arrow: ['M5 12h14M13 6l6 6-6 6'],
  search: ['M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z'],
  mail: ['M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zM3.5 7l8.5 6 8.5-6'],
  file: ['M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5M9 13h6M9 17h4'],
  bell: ['M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0'],
}

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      {ICON_PATHS[name].map((d) => (
        <path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />
      ))}
    </svg>
  )
}

/** Squared, letter-spaced button — the dark primary and outlined secondary styles. */
function CtaLink({ href, children, variant = 'dark' }: { href: string; children: React.ReactNode; variant?: 'dark' | 'outline' | 'light' }) {
  const styles = {
    dark: 'bg-[#0B2545] text-white hover:bg-[#13315C]',
    outline: 'border-2 border-[#0B2545] text-[#0B2545] hover:bg-[#0B2545] hover:text-white',
    light: 'bg-white text-[#0B2545] hover:bg-[#EAF4FE]',
  }[variant]
  return (
    <Link
      href={href}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-md px-7 text-xs font-bold uppercase tracking-[0.18em] transition-colors ${styles}`}
    >
      {children}
    </Link>
  )
}

/* ---------- Product mocks: pure markup with placeholder data, no real patients ---------- */

function Bar({ w, tone = 'bg-slate-200' }: { w: string; tone?: string }) {
  return <span className={`block h-2 rounded-full ${tone} ${w}`} />
}

function DesktopMock() {
  const tabs = ['Encounters', 'Medical history', 'Medications', 'Forms', 'Documents']
  return (
    <div className="rounded-[22px] bg-[#0B2545] p-2.5 shadow-[0_40px_90px_-30px_rgba(11,37,69,0.55)] sm:p-3.5">
      <div className="overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0B2545]">
            <Image src="/favicon.svg" alt="" width={18} height={18} />
            MyClinicMD
          </div>
          <div className="hidden h-8 w-56 items-center gap-2 rounded-md border border-slate-200 px-2.5 text-xs text-slate-400 sm:flex">
            <Icon name="search" className="h-3.5 w-3.5" /> Patient search
          </div>
          <div className="flex items-center gap-3 text-slate-500">
            <Icon name="bell" className="h-4 w-4" />
            <span className="h-7 w-7 rounded-full bg-[#CFE6FC]" />
          </div>
        </div>
        <div className="grid grid-cols-12">
          <aside className="col-span-3 hidden space-y-1 border-r border-slate-100 p-3 text-xs md:block lg:col-span-2">
            {['Virtual waiting room', 'Appointments', 'Patients history', 'Form I-693', 'Compliance'].map((item, i) => (
              <div key={item} className={`rounded-md px-2.5 py-2 ${i === 2 ? 'bg-[#EAF4FE] font-semibold text-[#2E6EF3]' : 'text-slate-600'}`}>
                {item}
              </div>
            ))}
          </aside>
          <main className="col-span-12 p-4 sm:p-5 md:col-span-6 lg:col-span-7">
            <div className="flex items-center justify-between">
              <p className={`text-lg font-semibold ${NAVY}`}>John Doe</p>
            </div>
            <div className="mt-3 flex gap-4 overflow-hidden border-b border-slate-100 text-[11px] text-slate-500">
              {tabs.map((tab, i) => (
                <span key={tab} className={`shrink-0 pb-2 ${i === 0 ? 'border-b-2 border-[#0B2545] font-semibold text-[#0B2545]' : ''}`}>{tab}</span>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {['Vitals', 'Medical history', 'Medications', 'Documents'].map((title) => (
                <div key={title}>
                  <p className={`mb-2 text-xs font-semibold ${NAVY}`}>{title}</p>
                  <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                    <div className="flex justify-between"><Bar w="w-16" /><Bar w="w-10" /></div>
                    <div className="flex justify-between"><Bar w="w-20" /><Bar w="w-8" /></div>
                    <div className="flex justify-between"><Bar w="w-12" /><Bar w="w-14" /></div>
                  </div>
                </div>
              ))}
            </div>
          </main>
          <aside className="col-span-3 hidden border-l border-slate-100 p-5 text-center md:block">
            <span className="mx-auto block h-14 w-14 rounded-full bg-gradient-to-br from-[#CFE6FC] to-[#9CC9F5]" />
            <p className={`mt-3 text-sm font-semibold ${NAVY}`}>John Doe</p>
            <p className="text-[11px] text-slate-500">Male · 45 years</p>
            <div className="mt-5 space-y-3 text-left">
              {['Date of birth', 'Phone', 'Email', 'Location'].map((k) => (
                <div key={k}>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">{k}</p>
                  <Bar w="w-20" tone="bg-slate-100" />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

/** Browser window frame — MyClinicMD is a web app, nothing to install. */
function BrowserFrame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`w-full max-w-[260px] rounded-2xl bg-[#0B2545] p-1.5 shadow-[0_30px_70px_-25px_rgba(11,37,69,0.6)] ${className}`}>
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <span className="h-2 w-2 rounded-full bg-white/30" />
        <span className="h-2 w-2 rounded-full bg-white/30" />
        <span className="h-2 w-2 rounded-full bg-white/30" />
        <span className="ml-2 h-4 flex-1 rounded bg-white/10" />
      </div>
      <div className="min-h-[360px] overflow-hidden rounded-xl bg-white p-3.5">{children}</div>
    </div>
  )
}

function PatientListCard() {
  const people: [string, string][] = [['Eve Benson', 'Provider assigned'], ['Anna Hardy', 'Vitals assessed'], ['Marco Diaz', 'In consultation'], ['Lena Ortiz', 'Completed'], ['Sam Patel', 'Final review']]
  const tone: Record<string, string> = {
    'Provider assigned': 'bg-amber-100 text-amber-700',
    'Vitals assessed': 'bg-sky-100 text-sky-700',
    'In consultation': 'bg-violet-100 text-violet-700',
    'Final review': 'bg-blue-100 text-blue-700',
    Completed: 'bg-emerald-100 text-emerald-700',
  }
  return (
    <BrowserFrame>
      <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-2 text-[10px] text-slate-400">
        <Icon name="search" className="h-3 w-3" /> Patient search
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {people.map(([name, status]) => (
          <li key={name} className="flex items-center gap-2.5 py-2.5">
            <span className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[#CFE6FC] to-[#9CC9F5]" />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-[11px] font-semibold ${NAVY}`}>{name}</p>
              <Bar w="w-16" tone="bg-slate-100" />
            </div>
            <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold ${tone[status]}`}>{status}</span>
          </li>
        ))}
      </ul>
    </BrowserFrame>
  )
}

function VitalsCard() {
  return (
    <BrowserFrame>
      <p className={`text-sm font-semibold ${NAVY}`}>John Doe</p>
      <p className="text-[10px] text-slate-500">Male · 45 years</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {[['BP', '118/76'], ['HR', '72'], ['Temp', '98.4°'], ['SpO₂', '99%']].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-[#EAF4FE] p-2.5">
            <p className="text-[9px] uppercase tracking-wide text-slate-500">{k}</p>
            <p className={`text-sm font-bold ${NAVY}`}>{v}</p>
          </div>
        ))}
      </div>
      <p className={`mt-4 text-[11px] font-semibold ${NAVY}`}>Visit</p>
      <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
        <Bar w="w-full" /><Bar w="w-4/5" /><Bar w="w-3/5" />
      </div>
      <div className="mt-4 flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#0B2545] text-[10px] font-bold uppercase tracking-widest text-white">
        <Icon name="video" className="h-3.5 w-3.5" /> Join video
      </div>
    </BrowserFrame>
  )
}

function FlowboardMock() {
  const cols = [
    { title: 'Provider assigned', dot: 'bg-amber-400', n: 3 },
    { title: 'Vitals assessed', dot: 'bg-sky-400', n: 2 },
    { title: 'In consultation', dot: 'bg-violet-400', n: 2 },
    { title: 'Final review', dot: 'bg-emerald-400', n: 3 },
  ]
  return (
    <div className="rounded-[22px] bg-[#0B2545] p-2.5 shadow-[0_40px_90px_-30px_rgba(11,37,69,0.55)]">
      <div className="grid grid-cols-2 gap-2.5 rounded-2xl bg-white p-3.5 sm:grid-cols-4">
        {cols.map((c) => (
          <div key={c.title} className="rounded-lg bg-slate-50 p-2.5">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <span className={`h-2 w-2 rounded-full ${c.dot}`} /> {c.title}
            </p>
            <div className="space-y-2">
              {Array.from({ length: c.n }).map((_, i) => (
                <div key={i} className="rounded-md border border-slate-200/80 bg-white p-2 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-[#CFE6FC]" />
                    <Bar w="w-14" />
                  </div>
                  <span className="mt-1.5 block"><Bar w="w-10" tone="bg-slate-100" /></span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function I693Card() {
  const steps = ['Applicant information', 'Medical history', 'TB screening', 'STI screening', 'Vaccinations', 'Civil surgeon review']
  return (
    <BrowserFrame>
      <p className={`text-sm font-semibold ${NAVY}`}>I-693 exam</p>
      <ul className="mt-4 space-y-2.5">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2 text-[11px]">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${i < 3 ? 'bg-emerald-500 text-white' : i === 3 ? 'border-2 border-[#2E6EF3]' : 'border border-slate-300'}`}>
              {i < 3 && <Icon name="check" className="h-3 w-3" />}
            </span>
            <span className={i === 3 ? `font-semibold ${NAVY}` : 'text-slate-500'}>{s}</span>
          </li>
        ))}
      </ul>
    </BrowserFrame>
  )
}

function CheckList({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => (
        <li key={item} className={`flex items-start gap-3 text-sm ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${dark ? 'bg-[#2E6EF3] text-white' : 'bg-[#CFE6FC] text-[#0B2545]'}`}>
            <Icon name="check" className="h-3 w-3" />
          </span>
          {item}
        </li>
      ))}
    </ul>
  )
}

function VideoVisitMock() {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-2.5 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.6)]">
      <div className="grid gap-2.5 sm:grid-cols-[1.6fr_1fr]">
        {/* Call */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-[#1B3A63] to-[#0B2545] sm:aspect-auto sm:min-h-[300px]">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center">
              <span className="h-20 w-20 rounded-full bg-[#CFE6FC]/90" />
              <span className="-mt-2 h-12 w-32 rounded-t-full bg-[#CFE6FC]/90" />
            </div>
          </div>
          <div className="absolute right-3 top-3 h-20 w-16 overflow-hidden rounded-xl border-2 border-white/20 bg-[#2E6EF3]/40">
            <span className="mx-auto mt-3 block h-7 w-7 rounded-full bg-white/80" />
            <span className="mx-auto mt-1 block h-5 w-11 rounded-t-full bg-white/80" />
          </div>
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-semibold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> 12:48
          </span>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {['bg-white/15', 'bg-white/15', 'bg-white/15', 'bg-red-500'].map((c, i) => (
              <span key={i} className={`flex h-9 w-9 items-center justify-center rounded-full ${c}`}>
                <span className="h-3 w-3 rounded-sm bg-white/80" />
              </span>
            ))}
          </div>
        </div>
        {/* Chart beside the call */}
        <div className="space-y-2.5 rounded-2xl bg-white p-4">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-full bg-[#CFE6FC]" />
            <div className="space-y-1.5"><Bar w="w-20" tone="bg-[#0B2545]" /><Bar w="w-14" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[['BP', '118/76'], ['HR', '72']].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-[#EAF4FE] p-2">
                <p className="text-[9px] uppercase tracking-wide text-slate-500">{k}</p>
                <p className="text-sm font-bold text-[#0B2545]">{v}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <Bar w="w-full" /><Bar w="w-5/6" /><Bar w="w-2/3" />
          </div>
          <div className="space-y-1.5 rounded-lg border border-dashed border-[#2E6EF3]/40 p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-semibold text-[#2E6EF3]">
              <Icon name="sparkles" className="h-3 w-3" /> Transcript
            </p>
            <Bar w="w-full" tone="bg-[#2E6EF3]/20" /><Bar w="w-3/4" tone="bg-[#2E6EF3]/20" />
          </div>
        </div>
      </div>
    </div>
  )
}

function AiSoapMock({ badge }: { badge: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-30px_rgba(11,37,69,0.35)]">
      <div className="mb-3 flex items-center justify-between">
        <Bar w="w-24" tone="bg-[#0B2545]" />
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
          <Icon name="sparkles" className="h-3 w-3" /> {badge}
        </span>
      </div>
      <div className="space-y-2.5">
        {['S', 'O', 'A', 'P'].map((letter, i) => (
          <div key={letter} className="flex items-start gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#EAF4FE] text-[11px] font-bold text-[#2E6EF3]">{letter}</span>
            <div className="flex-1 space-y-1.5 pt-1">
              <Bar w="w-full" />
              <Bar w={['w-4/5', 'w-2/3', 'w-3/4', 'w-1/2'][i] ?? 'w-1/2'} tone="bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AiFillMock() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-30px_rgba(11,37,69,0.35)]">
      <p className="mb-3 text-xs font-semibold text-[#0B2545]">I‑693</p>
      <div className="space-y-2">
        {[true, true, true, false].map((filled, i) => (
          <div key={i} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${filled ? 'border-[#2E6EF3]/30 bg-[#2E6EF3]/[0.04]' : 'border-slate-200'}`}>
            <span className="w-14"><Bar w="w-12" tone="bg-slate-200" /></span>
            <span className="flex-1">{filled ? <Bar w={['w-24', 'w-16', 'w-20'][i] ?? 'w-16'} tone="bg-[#0B2545]/70" /> : <Bar w="w-6" tone="bg-slate-100" />}</span>
            {filled && <Icon name="sparkles" className="h-3.5 w-3.5 text-violet-500" />}
          </div>
        ))}
      </div>
    </div>
  )
}

function EmailMock() {
  return (
    <div className="rounded-[22px] bg-[#0B2545] p-2.5 shadow-[0_40px_90px_-30px_rgba(11,37,69,0.55)]">
      <div className="overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#CFE6FC] text-[#0B2545]">
            <Icon name="mail" className="h-5 w-5" />
          </span>
          <div className="flex-1 space-y-1.5">
            <Bar w="w-32" tone="bg-[#0B2545]" />
            <Bar w="w-48" />
          </div>
          <span className="hidden text-[11px] text-slate-400 sm:block">9:41 AM</span>
        </div>
        <div className="space-y-4 px-5 py-5">
          <Bar w="w-40" tone="bg-[#0B2545]/80" />
          <div className="space-y-2"><Bar w="w-full" tone="bg-slate-100" /><Bar w="w-5/6" tone="bg-slate-100" /></div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {['S', 'O', 'A', 'P'].map((letter) => (
              <div key={letter} className="rounded-xl bg-[#EAF4FE] p-3">
                <p className="text-[11px] font-bold text-[#2E6EF3]">{letter}</p>
                <div className="mt-2 space-y-1.5"><Bar w="w-full" tone="bg-white" /><Bar w="w-2/3" tone="bg-white" /></div>
              </div>
            ))}
          </div>
          <span className="inline-flex h-9 items-center rounded-md bg-[#0B2545] px-4"><Bar w="w-20" tone="bg-white/80" /></span>
        </div>
      </div>
    </div>
  )
}

/* ---------- Page ---------- */

const FEATURES: { key: string; icon: IconName }[] = [
  { key: 'flowboard', icon: 'flow' },
  { key: 'erx', icon: 'pill' },
  { key: 'orders', icon: 'flask' },
  { key: 'compliance', icon: 'shield' },
]

export function LandingPage() {
  const { t, language } = useT()
  const year = new Date().getFullYear()

  const trust: { icon: IconName; label: string }[] = [
    { icon: 'globe', label: t('landing.trust.languages') },
    { icon: 'pin', label: t('landing.trust.locations') },
    { icon: 'shield', label: t('landing.trust.audit') },
  ]

  return (
    <div className={`min-h-[100dvh] overflow-x-hidden bg-white ${NAVY}`}>
      {/* Top bar */}
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center">
          <Image src="/myclinic-md-logo.png" alt="MyClinic MD" width={240} height={60} className="h-14 w-auto sm:h-16" priority />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageToggle />
          <Link
            href="/login"
            className="px-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0B2545] transition-colors hover:text-[#2E6EF3] sm:px-3"
          >
            {t('landing.nav.sign_in')}
          </Link>
          <span className="hidden sm:inline-flex">
            <CtaLink href="/signup" variant="outline">{t('landing.nav.get_started')}</CtaLink>
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#EAF4FE] via-[#DCEEFD] to-[#CFE6FC]">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/40 blur-3xl" aria-hidden />
          <div className="grid items-center gap-8 px-5 pb-8 pt-10 sm:px-10 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:px-14 lg:py-16">
            <div className="relative text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[#2E6EF3] shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2E6EF3]" />
                {t('landing.hero.badge')}
              </span>
              <h1
                className="mx-auto mt-5 max-w-xl text-balance font-bold leading-[1.06] tracking-tight lg:mx-0"
                style={{
                  fontSize:
                    language === 'es'
                      ? 'clamp(1.9rem, 1.2rem + 3.2vw, 3.4rem)'
                      : 'clamp(2.2rem, 1.3rem + 4vw, 4.1rem)',
                }}
              >
                {t('landing.hero.title')}
              </h1>
              <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-[#0B2545]/75 sm:text-base lg:mx-0">
                {t('landing.hero.subtitle')}
              </p>
              <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
                <CtaLink href="/signup">{t('landing.hero.cta_primary')}</CtaLink>
                <CtaLink href="/login" variant="outline">{t('landing.hero.cta_secondary')}</CtaLink>
              </div>
              <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-[#0B2545]/80 lg:justify-start">
                {trust.map((item) => (
                  <li key={item.label} className="inline-flex items-center gap-1.5">
                    <Icon name={item.icon} className="h-4 w-4 text-[#2E6EF3]" />
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto w-full max-w-[420px] sm:max-w-[520px] lg:max-w-[580px]">
              <HeroIllustration className="h-auto w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* Insights + desktop mock */}
      <section className="mx-auto max-w-6xl px-5 pt-16 sm:px-8 lg:pt-28">
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-end">
          <h2 className="text-3xl font-medium leading-tight tracking-tight sm:text-5xl">{t('landing.insights.title')}</h2>
          <p className="text-sm leading-relaxed text-slate-600 lg:pb-2">{t('landing.insights.subtitle')}</p>
        </div>
        <div className="mt-12 lg:mt-16">
          <DesktopMock />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-20 sm:px-8 lg:py-28">
        <div className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.key}>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#CFE6FC]">
                <Icon name={f.icon} className="h-5 w-5 text-[#0B2545]" />
              </span>
              <h3 className="mt-6 text-2xl font-medium leading-snug tracking-tight">{t(`landing.feature.${f.key}.title`)}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{t(`landing.feature.${f.key}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Telemedicine */}
      <section className="bg-[#0B2545] text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.25fr] lg:py-28">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">{t('landing.tele.eyebrow')}</p>
            <h2 className="mt-3 text-3xl font-medium leading-tight tracking-tight sm:text-4xl">{t('landing.tele.title')}</h2>
            <p className="mt-5 text-sm leading-relaxed text-slate-300">{t('landing.tele.desc')}</p>
            <CheckList dark items={[t('landing.tele.point1'), t('landing.tele.point2'), t('landing.tele.point3')]} />
          </div>
          <VideoVisitMock />
        </div>
      </section>

      {/* AI */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-violet-600">
            <Icon name="sparkles" className="h-4 w-4" /> {t('landing.ai.eyebrow')}
          </p>
          <h2 className="mt-3 text-3xl font-medium leading-tight tracking-tight sm:text-4xl">{t('landing.ai.title')}</h2>
          <p className="mt-5 text-sm leading-relaxed text-slate-600">{t('landing.ai.desc')}</p>
        </div>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {[
            { key: 'soap', icon: 'file' as IconName, visual: <AiSoapMock badge={t('landing.ai.badge')} /> },
            { key: 'fill', icon: 'sparkles' as IconName, visual: <AiFillMock /> },
            {
              key: 'review',
              icon: 'check' as IconName,
              visual: (
                <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-30px_rgba(11,37,69,0.35)]">
                  {['bg-amber-400', 'bg-emerald-500', 'bg-[#2E6EF3]'].map((dot, i) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <div className="flex-1 space-y-1.5"><Bar w="w-full" /><Bar w="w-2/3" tone="bg-slate-100" /></div>
                    </div>
                  ))}
                </div>
              ),
            },
          ].map((card) => (
            <div key={card.key} className="flex flex-col rounded-[28px] bg-gradient-to-b from-[#F5F3FF] to-[#EAF4FE] p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
                <Icon name={card.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-xl font-medium">{t(`landing.ai.${card.key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(`landing.ai.${card.key}.desc`)}</p>
              <div className="mt-6 flex-1">{card.visual}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Mobile */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="rounded-[28px] bg-[#CFE6FC] p-8 sm:p-12">
            <h2 className="text-4xl font-medium leading-tight tracking-tight sm:text-5xl">{t('landing.mobile.title')}</h2>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-[#0B2545]/80">{t('landing.mobile.desc')}</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#0B2545]/80">{t('landing.mobile.desc2')}</p>
          </div>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center sm:gap-6">
            <PatientListCard />
            <VitalsCard />
          </div>
        </div>
      </section>

      {/* Focus — flowboard */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-medium leading-tight tracking-tight sm:text-4xl">{t('landing.focus.title')}</h2>
            <p className="mt-5 text-sm leading-relaxed text-slate-600">{t('landing.focus.desc')}</p>
            <div className="mt-8">
              <a href="#how" className="inline-flex h-11 items-center rounded-md border-2 border-[#0B2545] px-6 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors hover:bg-[#0B2545] hover:text-white">
                {t('landing.focus.cta')}
              </a>
            </div>
          </div>
          <FlowboardMock />
        </div>
      </section>

      {/* I-693 */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="flex justify-center rounded-[28px] bg-[#EAF4FE] px-5 py-12">
            <I693Card />
          </div>
          <div>
            <h2 className="text-3xl font-medium leading-tight tracking-tight sm:text-4xl">{t('landing.i693.title')}</h2>
            <p className="mt-5 text-sm leading-relaxed text-slate-600">{t('landing.i693.desc')}</p>
            <div className="mt-8">
              <CtaLink href="/signup" variant="outline">{t('landing.i693.cta')}</CtaLink>
            </div>
          </div>
        </div>
      </section>

      {/* Email notifications */}
      <section className="mx-auto max-w-6xl px-5 pt-20 sm:px-8 lg:pt-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div className="order-2 lg:order-1">
            <EmailMock />
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2E6EF3]">{t('landing.email.eyebrow')}</p>
            <h2 className="mt-3 text-3xl font-medium leading-tight tracking-tight sm:text-4xl">{t('landing.email.title')}</h2>
            <p className="mt-5 text-sm leading-relaxed text-slate-600">{t('landing.email.desc')}</p>
            <CheckList items={[t('landing.email.point1'), t('landing.email.point2'), t('landing.email.point3')]} />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-20 sm:px-8 lg:py-28">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2E6EF3]">{t('landing.how.eyebrow')}</p>
        <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">{t('landing.how.title')}</h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <li key={n} className="border-t-2 border-[#0B2545] pt-6">
              <span className="text-sm font-bold text-[#2E6EF3]">0{n}</span>
              <h3 className="mt-3 text-xl font-medium">{t(`landing.how.step${n}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(`landing.how.step${n}.desc`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA band */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28">
        <div className="relative overflow-hidden rounded-[28px] bg-[#CFE6FC] px-6 py-16 text-center sm:px-16">
          <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-[#BBDCFA]" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden>
            <path fill="currentColor" d="M0 60c150-40 300-40 450 0s300 40 450 0 225-30 300-10v70H0z" />
          </svg>
          <h2 className="relative mx-auto max-w-2xl text-3xl font-medium leading-tight tracking-tight sm:text-4xl">{t('landing.cta.title')}</h2>
          <p className="relative mx-auto mt-4 max-w-lg text-sm text-[#0B2545]/75">{t('landing.cta.subtitle')}</p>
          <div className="relative mt-8">
            <CtaLink href="/signup" variant="light">{t('landing.cta.button')}</CtaLink>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:px-8">
          <p>© {year} MyClinicMD. {t('landing.footer.rights')}</p>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-[#0B2545]">{t('landing.nav.sign_in')}</Link>
            <Link href="/signup" className="hover:text-[#0B2545]">{t('landing.nav.get_started')}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
