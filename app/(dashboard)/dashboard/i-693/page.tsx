'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { FULL_CLINICAL_DASHBOARD_ROLES } from '@/lib/roles'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { I693PdfFormEditor } from '@/components/I693PdfFormEditor'
import { I693WorkflowBoard } from '@/components/I693WorkflowBoard'
import { buildI693Href } from '@/lib/i693/paths'
import { useT } from '@/lib/i18n'

function I693PageInner() {
  const { t } = useT()
  const router = useRouter()
  const pathname = usePathname()
  const basePath = pathname.startsWith('/admin') ? '/admin/i-693' : '/dashboard/i-693'
  const searchParams = useSearchParams()
  const selectedFromUrl = searchParams?.get('encounter') ?? null
  const tabFromUrl = searchParams?.get('tab') ?? null
  const parsed = selectedFromUrl ? Number(selectedFromUrl) : NaN
  const initialEncounter = Number.isFinite(parsed) && parsed > 0 ? parsed : null

  const [selectedId, setSelectedId] = useState<number | null>(initialEncounter)
  const [selectedPatientName, setSelectedPatientName] = useState<string | null>(null)
  const [tab, setTab] = useState<'workflow' | 'pdf'>(
    tabFromUrl === 'pdf' || tabFromUrl === 'form' ? 'pdf' : 'workflow'
  )
  useEffect(() => {
    if (initialEncounter) setSelectedId(initialEncounter)
  }, [initialEncounter])

  useEffect(() => {
    if (!selectedId || selectedPatientName) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/i693/cases', { credentials: 'include', cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || cancelled) return
        const row = (json.data ?? []).find(
          (r: { encounter_id: number }) => r.encounter_id === selectedId
        )
        if (row?.patient_name && !cancelled) setSelectedPatientName(row.patient_name)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId, selectedPatientName])

  useEffect(() => {
    setTab(tabFromUrl === 'pdf' || tabFromUrl === 'form' ? 'pdf' : 'workflow')
  }, [tabFromUrl])

  useEffect(() => {
    if (tabFromUrl !== 'form') return
    router.replace(
      buildI693Href(basePath, {
        encounterId: selectedId ?? initialEncounter ?? undefined,
        tab: 'pdf',
      }),
      { scroll: false }
    )
  }, [tabFromUrl, selectedId, initialEncounter, router, basePath])

  const setTabAndUrl = useCallback(
    (next: 'workflow' | 'pdf', encounterId?: number | null) => {
      setTab(next)
      const id = encounterId ?? selectedId
      router.replace(buildI693Href(basePath, { encounterId: id ?? undefined, tab: next }), {
        scroll: false,
      })
    },
    [router, selectedId, basePath]
  )

  const selectEncounter = (id: number, patientName?: string) => {
    setSelectedId(id)
    if (patientName) setSelectedPatientName(patientName)
    router.replace(buildI693Href(basePath, { encounterId: id, tab }), { scroll: false })
  }

  const clearSelection = () => {
    setSelectedId(null)
    setSelectedPatientName(null)
    router.replace(buildI693Href(basePath, { tab }), { scroll: false })
  }

  const openPdfEditor = (id: number, patientName?: string) => {
    setSelectedId(id)
    if (patientName) setSelectedPatientName(patientName)
    setTabAndUrl('pdf', id)
  }

  return (
    <div className="p-6 lg:p-8 min-h-[calc(100vh-5rem)]">
      <div className="max-w-[1800px] mx-auto">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{t('i693.page_title')}</h1>
            <p className="text-slate-500 text-sm mt-1">{t('i693.page_subtitle_workflow')}</p>
            {selectedPatientName && (
              <p className="text-sm text-[#2E6EF3] font-medium mt-2">
                {t('i693.selected_patient')}: {selectedPatientName}
                {selectedId != null && (
                  <span className="text-slate-500 font-normal ml-2">
                    ({t('i693.encounter_label')} #{selectedId})
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setTabAndUrl('workflow')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tab === 'workflow' ? 'bg-[#2E6EF3] text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t('i693.tab_workflow')}
            </button>
            <button
              type="button"
              onClick={() => selectedId && setTabAndUrl('pdf')}
              disabled={!selectedId}
              className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 ${
                tab === 'pdf' ? 'bg-[#2E6EF3] text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t('i693.tab_pdf_editor')}
            </button>
          </div>
        </div>

        {tab === 'workflow' ? (
          <I693WorkflowBoard
            selectedEncounterId={selectedId}
            onSelectEncounter={selectEncounter}
            onClearSelection={clearSelection}
            onOpenPdfEditor={openPdfEditor}
          />
        ) : tab === 'pdf' && selectedId ? (
          <I693PdfFormEditor
            key={`pdf-${selectedId}`}
            encounterId={selectedId}
            patientName={selectedPatientName ?? undefined}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
            {t('i693.select_encounter')}
          </div>
        )}
      </div>
    </div>
  )
}

function I693Page() {
  return (
    <Suspense
      fallback={
        <div className="p-12 flex justify-center">
          <LoadingSpinner message="Loading…" variant="light" />
        </div>
      }
    >
      <I693PageInner />
    </Suspense>
  )
}

export default withRoleProtection(I693Page, {
  allowedRoles: [...FULL_CLINICAL_DASHBOARD_ROLES],
})
