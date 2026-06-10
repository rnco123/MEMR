'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { findPharmacyById, type PharmacyRecord } from '@/lib/pharmacies/normalize'
import { phoneDigitsOnly } from '@/lib/phone-digits'

type PharmacyForm = {
  name: string
  address: string
  phone: string
  email: string
}

const blankPharmacyForm = (): PharmacyForm => ({
  name: '',
  address: '',
  phone: '',
  email: '',
})

type Props = {
  encounterId: number
  pharmacyId: number | null
  assignedPharmacy?: PharmacyRecord | null
  pharmacies: PharmacyRecord[]
  editable: boolean
  onUpdated: () => void | Promise<void>
  onPharmaciesReload?: () => void | Promise<void>
  compact?: boolean
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  showEditButton?: boolean
}

function pharmacyLabel(p: PharmacyRecord, numbered: (id: number) => string) {
  return p.name || numbered(p.id)
}

function PharmacyPicker({
  pharmacies,
  value,
  onChange,
  disabled,
  placeholder,
  searchPlaceholder,
  noMatchesLabel,
  formatPharmacyNumber,
}: {
  pharmacies: PharmacyRecord[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  placeholder: string
  searchPlaceholder: string
  noMatchesLabel: string
  formatPharmacyNumber: (id: number) => string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = pharmacies.find((p) => String(p.id) === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pharmacies
    return pharmacies.filter((p) => {
      const label = [p.name, p.address, p.phone, p.email, String(p.id)].filter(Boolean).join(' ').toLowerCase()
      return label.includes(q)
    })
  }, [pharmacies, query])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const triggerLabel = selected
    ? `${pharmacyLabel(selected, formatPharmacyNumber)}${selected.address ? ` — ${selected.address}` : ''}`
    : placeholder

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 hover:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{triggerLabel}</span>
        <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-[200] mt-1 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200"
              autoFocus
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1" role="listbox">
            <li>
              <button
                type="button"
                onClick={() => pick('')}
                className="w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
              >
                {placeholder}
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-slate-500">{noMatchesLabel}</li>
            ) : (
              filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === String(p.id)}
                    onClick={() => pick(String(p.id))}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-violet-50 ${
                      value === String(p.id) ? 'bg-violet-50 text-violet-800 font-medium' : 'text-slate-800'
                    }`}
                  >
                    <span className="block font-medium truncate">
                      {pharmacyLabel(p, formatPharmacyNumber)}
                    </span>
                    {p.address && <span className="block text-xs text-slate-500 truncate">{p.address}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

function PharmacyDetailsPreview({
  pharmacy,
  na,
  formatPharmacyNumber,
}: {
  pharmacy: PharmacyRecord
  na: string
  formatPharmacyNumber: (id: number) => string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 space-y-1">
      <p className="font-medium text-slate-800">{pharmacyLabel(pharmacy, formatPharmacyNumber)}</p>
      <p>
        <span className="text-slate-500">ID {pharmacy.id}</span>
        {pharmacy.address ? ` · ${pharmacy.address}` : ''}
      </p>
      <p>
        {pharmacy.phone || na}
        {pharmacy.email ? ` · ${pharmacy.email}` : ''}
      </p>
    </div>
  )
}

export function EncounterPharmacyEditor({
  encounterId,
  pharmacyId,
  assignedPharmacy: assignedPharmacyProp,
  pharmacies,
  editable,
  onUpdated,
  onPharmaciesReload,
  compact = false,
  editing: editingProp,
  onEditingChange,
  showEditButton = true,
}: Props) {
  const { t } = useT()
  const [editingInternal, setEditingInternal] = useState(false)
  const editing = editingProp ?? editingInternal
  const setEditing = (value: boolean) => {
    onEditingChange?.(value)
    if (editingProp === undefined) setEditingInternal(value)
  }
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<PharmacyForm>(blankPharmacyForm)
  const [selectedId, setSelectedId] = useState(pharmacyId ? String(pharmacyId) : '')
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelectedId(pharmacyId ? String(pharmacyId) : '')
  }, [pharmacyId])

  useEffect(() => {
    if (editing) {
      editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [editing])

  const assigned =
    assignedPharmacyProp ?? findPharmacyById(pharmacies, pharmacyId)
  const selected = useMemo(
    () => (selectedId ? findPharmacyById(pharmacies, selectedId) : null),
    [pharmacies, selectedId]
  )

  const formatPharmacyNumber = (id: number) =>
    t('encounter_modal.pharmacy_numbered', { id })

  const assignedLabel = assigned
    ? pharmacyLabel(assigned, (id) => t('encounter_modal.pharmacy_numbered', { id }))
    : pharmacyId != null
      ? t('encounter_modal.pharmacy_numbered', { id: Number(pharmacyId) })
      : t('encounter_modal.pharmacy_none_assigned')

  const assignPharmacyId = async (nextId: number | null) => {
    const res = await fetch(`/api/encounters/${encounterId}/rooming`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ pharmacy_id: nextId }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || t('encounter_modal.toast_save_failed'))
  }

  const savePharmacy = async () => {
    const nextId = selectedId ? Number(selectedId) : null
    if (nextId === pharmacyId || (!nextId && !pharmacyId)) {
      setEditing(false)
      setShowCreateForm(false)
      return
    }

    setSaving(true)
    try {
      await assignPharmacyId(nextId)
      toast.success(t('encounter_modal.rx_pharmacy_updated'))
      setEditing(false)
      setShowCreateForm(false)
      await onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.toast_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const createAndAssignPharmacy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.name.trim()) {
      toast.error(t('pharmacies.name_req'))
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/pharmacies/registry', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          address: createForm.address.trim() || null,
          phone: createForm.phone.trim() || null,
          email: createForm.email.trim() || null,
          assign_to_encounter_id: encounterId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_create_failed'))

      const created = json.data as PharmacyRecord
      await onPharmaciesReload?.()
      setSelectedId(String(created.id))
      if (!json.encounter_assigned) {
        await assignPharmacyId(created.id)
      }
      toast.success(t('encounter_modal.rx_pharmacy_created_assigned'))
      setCreateForm(blankPharmacyForm())
      setShowCreateForm(false)
      setEditing(false)
      await onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('pharmacies.toast_create_failed'))
    } finally {
      setCreating(false)
    }
  }

  const cancelEdit = () => {
    setSelectedId(pharmacyId ? String(pharmacyId) : '')
    setShowCreateForm(false)
    setCreateForm(blankPharmacyForm())
    setEditing(false)
  }

  const inputClass =
    'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 disabled:opacity-50'

  if (!editable) {
    return (
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        <p className={compact ? 'text-sm text-slate-700' : 'text-slate-600'}>{assignedLabel}</p>
        {assigned && (
          <PharmacyDetailsPreview
            pharmacy={assigned}
            na={t('common.na')}
            formatPharmacyNumber={formatPharmacyNumber}
          />
        )}
      </div>
    )
  }

  if (editing) {
    return (
      <div ref={editorRef} className={compact ? 'space-y-2' : 'space-y-3'}>
        <p className="text-xs text-slate-500">{t('encounter_modal.rx_pharmacy_id_hint')}</p>

        {showCreateForm ? (
          <form
            onSubmit={(e) => void createAndAssignPharmacy(e)}
            className="rounded-lg border border-violet-200 bg-violet-50/30 p-4 space-y-3"
          >
            <h4 className="text-sm font-semibold text-slate-900">{t('encounter_modal.rx_pharmacy_create_title')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">{t('pharmacies.name_req')}</label>
                <input
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('pharmacies.name_placeholder')}
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">{t('pharmacies.address')}</label>
                <input
                  value={createForm.address}
                  onChange={(e) => setCreateForm((f) => ({ ...f, address: e.target.value }))}
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{t('pharmacies.phone')}</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: phoneDigitsOnly(e.target.value) }))}
                  placeholder={t('pharmacies.phone_placeholder')}
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{t('pharmacies.email')}</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder={t('pharmacies.email_placeholder_form')}
                  className={`${inputClass} mt-1`}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
              >
                {creating ? t('common.saving') : t('encounter_modal.rx_pharmacy_add_and_assign')}
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() => {
                  setShowCreateForm(false)
                  setCreateForm(blankPharmacyForm())
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        ) : pharmacies.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 space-y-3">
            <p>{t('encounter_modal.rx_pharmacy_empty')}</p>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(true)
                setCreateForm(blankPharmacyForm())
              }}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
            >
              {t('encounter_modal.rx_pharmacy_add_new')}
            </button>
          </div>
        ) : (
          <>
            <PharmacyPicker
              pharmacies={pharmacies}
              value={selectedId}
              onChange={setSelectedId}
              disabled={saving}
              placeholder={t('encounter_modal.rooming_pharmacy_select')}
              searchPlaceholder={t('encounter_modal.rx_pharmacy_search')}
              noMatchesLabel={t('encounter_modal.rx_pharmacy_picker_no_matches')}
              formatPharmacyNumber={formatPharmacyNumber}
            />
            {selected && (
              <PharmacyDetailsPreview
                pharmacy={selected}
                na={t('common.na')}
                formatPharmacyNumber={formatPharmacyNumber}
              />
            )}
          </>
        )}

        {!showCreateForm && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || creating || (pharmacies.length === 0 && !showCreateForm)}
              onClick={() => void savePharmacy()}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <button
              type="button"
              disabled={saving || creating}
              onClick={() => {
                setShowCreateForm(true)
                setCreateForm(blankPharmacyForm())
              }}
              className="px-4 py-2 rounded-lg border border-violet-300 bg-white text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            >
              {t('encounter_modal.rx_pharmacy_add_new')}
            </button>
            <button
              type="button"
              disabled={saving || creating}
              onClick={cancelEdit}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${compact ? '' : 'space-y-3'}`}>
      <div className="flex w-full items-center justify-between gap-3">
        <p className={compact ? 'text-sm text-slate-800 font-medium' : 'text-slate-900 font-semibold'}>
          {assignedLabel}
        </p>
        {showEditButton && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 rounded-lg border border-violet-300 bg-white text-sm font-medium text-violet-700 hover:bg-violet-50"
          >
            {t('encounter_modal.edit_pharmacy')}
          </button>
        )}
      </div>
      {assigned && (
        <PharmacyDetailsPreview
          pharmacy={assigned}
          na={t('common.na')}
          formatPharmacyNumber={formatPharmacyNumber}
        />
      )}
    </div>
  )
}
