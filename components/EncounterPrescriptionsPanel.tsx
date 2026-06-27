'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { canEditEncounterPrescriptions } from '@/lib/prescriptions/encounter-prescriptions'
import {
  emptyStructuredRxForm,
  rowToStructuredForm,
  structuredFormToApiPayload,
} from '@/lib/prescriptions/rx-form-format'
import type { StructuredRxForm } from '@/lib/prescriptions/rx-form-format'
import {
  PrescriptionTableDisplayRow,
  PrescriptionTableHeader,
  PrescriptionTableInputRow,
} from '@/components/PrescriptionTableRow'
import { EncounterPharmacyEditor } from '@/components/EncounterPharmacyEditor'
import { findPharmacyById, type PharmacyRecord } from '@/lib/pharmacies/normalize'
import { formatPharmEmailSentAtCentral } from '@/lib/email/format-pharm-sent-at'
import { printUsPrescriptions } from '@/lib/prescriptions/us-prescription-print'
import type { PrescriptionPrintContext } from '@/lib/prescriptions/load-prescription-print-context'

type PrescriptionRow = {
  id: number
  medication_name: string
  strength: string | null
  dosage_instruction: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  quantity: string | null
  refills: number
  notes: string | null
  status: string
  created_at: string
}

type PendingRow = {
  key: string
  form: StructuredRxForm
}

type PharmEmailLastSend = {
  sent_at: string
  sent_by_name: string | null
  send_count: number
}

type Props = {
  encounterId: number
  encounterStatus: string
  /** Add/edit/remove prescription rows */
  canEdit?: boolean
  /** Assign pharmacy or add to registry (admin + clinical staff) */
  canManagePharmacy?: boolean
  hasDoctor: boolean
  hasPharmacy: boolean
  pharmacyId: number | null
  assignedPharmacy?: PharmacyRecord | null
  pharmacies: PharmacyRecord[]
  onPharmacyUpdated: () => void | Promise<void>
  onPharmaciesReload?: () => void | Promise<void>
}

function newPendingRow(): PendingRow {
  return { key: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, form: emptyStructuredRxForm() }
}

export function EncounterPrescriptionsPanel({
  encounterId,
  encounterStatus,
  canEdit = true,
  canManagePharmacy: canManagePharmacyProp,
  hasDoctor,
  hasPharmacy,
  pharmacyId,
  assignedPharmacy,
  pharmacies,
  onPharmacyUpdated,
  onPharmaciesReload,
}: Props) {
  const { t, language } = useT()
  const canManagePharmacy = canManagePharmacyProp ?? canEdit
  const editable = canEdit && canEditEncounterPrescriptions(encounterStatus)
  const rxLocked = !canEditEncounterPrescriptions(encounterStatus)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<PrescriptionRow[]>([])
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<StructuredRxForm>(() => emptyStructuredRxForm())
  const [dragPendingKey, setDragPendingKey] = useState<string | null>(null)
  const [dragOverPendingKey, setDragOverPendingKey] = useState<string | null>(null)
  const [sendToPharmacyEmail, setSendToPharmacyEmail] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [lastPharmEmailSend, setLastPharmEmailSend] = useState<PharmEmailLastSend | null>(null)

  const resolvedPharmacy = useMemo(
    () => assignedPharmacy ?? findPharmacyById(pharmacies, pharmacyId),
    [assignedPharmacy, pharmacies, pharmacyId]
  )
  const pharmacyEmail = resolvedPharmacy?.email?.trim() ?? ''
  const canEmailPharmacy = hasPharmacy && Boolean(pharmacyEmail)

  const loadPrescriptions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/prescriptions`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('encounter_modal.rx_load_failed'))
      setRows((json.data as PrescriptionRow[]) ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.rx_load_failed'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [encounterId, t])

  const loadLastPharmEmailSend = useCallback(async () => {
    try {
      const res = await fetch(`/api/encounters/${encounterId}/prescriptions/pharm-email-log`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) return
      setLastPharmEmailSend((json.data as PharmEmailLastSend | null) ?? null)
    } catch {
      setLastPharmEmailSend(null)
    }
  }, [encounterId])

  useEffect(() => {
    void loadPrescriptions()
    void loadLastPharmEmailSend()
  }, [encounterId, loadLastPharmEmailSend])

  const canSaveNew = editable && hasDoctor
  const hasPending = pendingRows.length > 0
  const isEditingSaved = editingId !== null
  const showTableShell =
    rows.length > 0 ||
    hasPending ||
    isEditingSaved ||
    canSaveNew ||
    pharmacyId != null ||
    canManagePharmacy
  const showRowControls = editable && (rows.length > 0 || hasPending || isEditingSaved)

  const updatePendingRow = (key: string, form: StructuredRxForm) => {
    setPendingRows((prev) => prev.map((row) => (row.key === key ? { ...row, form } : row)))
  }

  const removePendingRow = (key: string) => {
    setPendingRows((prev) => prev.filter((row) => row.key !== key))
  }

  const movePendingRow = (fromKey: string, toKey: string) => {
    setPendingRows((prev) => {
      const fromIdx = prev.findIndex((row) => row.key === fromKey)
      const toIdx = prev.findIndex((row) => row.key === toKey)
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev
      const next = [...prev]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item!)
      return next
    })
  }

  const cancelPending = () => {
    setPendingRows([])
  }

  const startAddMedicine = () => {
    setEditingId(null)
    setPendingRows((prev) => [...prev, newPendingRow()])
  }

  const sendCurrentPrescriptionsToPharmacy = async () => {
    if (!canEmailPharmacy || rows.length === 0 || sendingEmail) return

    setSendingEmail(true)
    try {
      const emailed = await emailPrescriptionsToPharmacy(rows.map((row) => row.id))
      toast.success(t('encounter_modal.rx_email_pharmacy_sent', { email: emailed.pharmacy_email }))
      await loadLastPharmEmailSend()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('encounter_modal.rx_email_pharmacy_failed')
      )
    } finally {
      setSendingEmail(false)
    }
  }

  const printCurrentPrescriptions = async () => {
    if (rows.length === 0 || printing || saving || isEditingSaved) return

    // Open the print tab synchronously within the click handler so the browser
    // keeps the user-gesture and does not block it as a popup. It is filled in
    // once the PDF is built (or closed if anything fails).
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(
        '<!DOCTYPE html><html><head><title>Preparing prescription…</title></head>' +
          '<body style="font-family:sans-serif;color:#444;padding:24px">Preparing prescription…</body></html>'
      )
    }

    setPrinting(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/prescriptions/print-data`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || t('encounter_modal.rx_print_failed'))
      }
      const opened = await printUsPrescriptions(
        json.data as PrescriptionPrintContext,
        printWindow
      )
      if (!opened) {
        throw new Error(t('encounter_modal.rx_print_popup_blocked'))
      }
    } catch (err) {
      if (printWindow && !printWindow.closed) {
        try {
          printWindow.close()
        } catch {
          /* ignore */
        }
      }
      toast.error(err instanceof Error ? err.message : t('encounter_modal.rx_print_failed'))
    } finally {
      setPrinting(false)
    }
  }

  const emailPrescriptionsToPharmacy = async (prescriptionIds: number[]) => {
    const res = await fetch(`/api/encounters/${encounterId}/prescriptions/send-to-pharmacy`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prescription_ids: prescriptionIds }),
    })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error || t('encounter_modal.rx_email_pharmacy_failed'))
    }
    return json.data as { pharmacy_email: string }
  }

  const submitAllPending = async () => {
    if (!canSaveNew || pendingRows.length === 0) return

    const valid = pendingRows.filter((row) => row.form.medication_name.trim())
    if (valid.length === 0) {
      toast.error(t('encounter_modal.rx_medication_required'))
      return
    }

    setSaving(true)
    let saved = 0
    const savedIds: number[] = []
    try {
      for (const row of valid) {
        const res = await fetch(`/api/encounters/${encounterId}/prescriptions`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(structuredFormToApiPayload(row.form)),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || t('encounter_modal.rx_save_failed'))
        const rxId = Number(json.data?.id)
        if (Number.isFinite(rxId) && rxId > 0) savedIds.push(rxId)
        saved++
      }
      toast.success(t('encounter_modal.rx_saved_count', { count: saved }))
      setPendingRows([])
      setSendToPharmacyEmail(false)
      await loadPrescriptions()

      if (sendToPharmacyEmail && savedIds.length > 0) {
        try {
          const emailed = await emailPrescriptionsToPharmacy(savedIds)
          toast.success(
            t('encounter_modal.rx_email_pharmacy_sent', { email: emailed.pharmacy_email })
          )
          await loadLastPharmEmailSend()
        } catch (emailErr) {
          toast.error(
            emailErr instanceof Error
              ? emailErr.message
              : t('encounter_modal.rx_email_pharmacy_failed')
          )
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('encounter_modal.rx_save_failed'))
      if (saved > 0) await loadPrescriptions()
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (row: PrescriptionRow) => {
    setEditingId(row.id)
    setEditForm(rowToStructuredForm(row))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(emptyStructuredRxForm())
  }

  const submitEdit = async (rxId: number) => {
    if (!editable || editingId !== rxId) return
    if (!editForm.medication_name.trim()) {
      toast.error(t('encounter_modal.rx_medication_required'))
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/prescriptions/${rxId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(structuredFormToApiPayload(editForm)),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('encounter_modal.rx_update_failed'))
      toast.success(t('encounter_modal.rx_updated'))
      const shouldEmail = sendToPharmacyEmail
      setEditingId(null)
      setSendToPharmacyEmail(false)
      await loadPrescriptions()

      if (shouldEmail) {
        try {
          const emailed = await emailPrescriptionsToPharmacy([rxId])
          toast.success(
            t('encounter_modal.rx_email_pharmacy_sent', { email: emailed.pharmacy_email })
          )
          await loadLastPharmEmailSend()
        } catch (emailErr) {
          toast.error(
            emailErr instanceof Error
              ? emailErr.message
              : t('encounter_modal.rx_email_pharmacy_failed')
          )
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('encounter_modal.rx_update_failed'))
    } finally {
      setSaving(false)
    }
  }

  const removeRx = async (rxId: number) => {
    if (!editable) return
    if (!window.confirm(t('encounter_modal.rx_confirm_remove'))) return

    setSaving(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/prescriptions/${rxId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('encounter_modal.rx_remove_failed'))
      toast.success(t('encounter_modal.rx_removed'))
      if (editingId === rxId) setEditingId(null)
      await loadPrescriptions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('encounter_modal.rx_remove_failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-6 shadow-sm ring-1 ring-violet-100">
      <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
        <svg className="w-5 h-5 text-violet-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        {t('encounter_modal.rx_pharmacy_title')}
      </h3>
      <p className="text-sm text-slate-600 mb-3">{t('encounter_modal.rx_subtitle')}</p>

      {rxLocked && (
        <p className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          {t('encounter_modal.rx_locked_completed')}
        </p>
      )}

      {editable && !hasDoctor && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('encounter_modal.rx_needs_doctor')}
        </p>
      )}

      {editable && hasDoctor && !hasPharmacy && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('encounter_modal.rx_needs_pharmacy')}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">{t('rx.loading')}</p>
      ) : (
        <>
          {showTableShell ? (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="relative z-20 border-b border-slate-200 bg-amber-50/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  {t('encounter_modal.rooming_pharmacy')}
                </p>
                <EncounterPharmacyEditor
                  encounterId={encounterId}
                  pharmacyId={pharmacyId}
                  assignedPharmacy={resolvedPharmacy}
                  pharmacies={pharmacies}
                  editable={canManagePharmacy}
                  onUpdated={onPharmacyUpdated}
                  onPharmaciesReload={onPharmaciesReload}
                  compact
                  showEditButton
                />
                {rows.length > 0 && (editable || canManagePharmacy) && (
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={printing || saving || isEditingSaved}
                      onClick={() => void printCurrentPrescriptions()}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      {printing ? t('encounter_modal.rx_printing') : t('encounter_modal.rx_print')}
                    </button>
                    {editable && canEmailPharmacy && (
                      <button
                        type="button"
                        disabled={sendingEmail || saving || isEditingSaved}
                        onClick={() => void sendCurrentPrescriptionsToPharmacy()}
                        className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                      >
                        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {sendingEmail
                          ? t('encounter_modal.rx_send_to_pharmacy_sending')
                          : (lastPharmEmailSend?.send_count ?? 0) > 0
                            ? t('encounter_modal.rx_send_to_pharmacy_again')
                            : t('encounter_modal.rx_send_to_pharmacy')}
                      </button>
                    )}
                    {editable && lastPharmEmailSend?.sent_at && canEmailPharmacy && (
                      <p className="w-full mt-1 text-xs text-slate-400">
                        {lastPharmEmailSend.sent_by_name
                          ? t('encounter_modal.rx_send_to_pharmacy_last_sent', {
                              datetime: formatPharmEmailSentAtCentral(
                                lastPharmEmailSend.sent_at,
                                language
                              ),
                              name: lastPharmEmailSend.sent_by_name,
                            })
                          : t('encounter_modal.rx_send_to_pharmacy_last_sent_no_name', {
                              datetime: formatPharmEmailSentAtCentral(
                                lastPharmEmailSend.sent_at,
                                language
                              ),
                            })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto overscroll-x-contain">
                <table className="w-max min-w-full text-sm border-collapse">
                  <PrescriptionTableHeader showControls={showRowControls} />
                  <tbody className="divide-y divide-slate-100">
                    {rows.length === 0 && !hasPending && !isEditingSaved && canSaveNew && (
                      <tr>
                        <td
                          colSpan={showRowControls ? 10 : 9}
                          className="px-4 py-6 text-center text-sm text-slate-500"
                        >
                          {t('rx.empty')}
                        </td>
                      </tr>
                    )}

                    {rows.map((row) =>
                      editingId === row.id && editable ? (
                        <PrescriptionTableInputRow
                          key={row.id}
                          value={editForm}
                          onChange={setEditForm}
                          idPrefix={`edit-${row.id}`}
                          rowClassName="bg-amber-50/50"
                          showControls={showRowControls}
                          rowControls={{
                            editDisabled: true,
                            dragDisabled: true,
                            onDelete: () => void removeRx(row.id),
                            deleteDisabled: saving,
                          }}
                        />
                      ) : (
                        <PrescriptionTableDisplayRow
                          key={row.id}
                          row={row}
                          editable={editable && !hasPending && !isEditingSaved}
                          showControls={showRowControls}
                          onEdit={() => startEdit(row)}
                          onRemove={() => void removeRx(row.id)}
                          na={t('common.na')}
                          editLabel={t('common.edit')}
                          removeLabel={t('common.remove')}
                        />
                      )
                    )}

                    {canSaveNew &&
                      pendingRows.map((pending) => (
                        <PrescriptionTableInputRow
                          key={pending.key}
                          value={pending.form}
                          onChange={(next) => {
                            const resolved =
                              typeof next === 'function' ? next(pending.form) : next
                            updatePendingRow(pending.key, resolved)
                          }}
                          idPrefix={`new-${pending.key}`}
                          rowClassName="bg-violet-50/30"
                          showControls={showRowControls}
                          isDragOver={dragOverPendingKey === pending.key && dragPendingKey !== pending.key}
                          rowControls={{
                            editDisabled: true,
                            draggable: pendingRows.length > 1,
                            dragDisabled: pendingRows.length <= 1,
                            onDragStart: (e) => {
                              setDragPendingKey(pending.key)
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', pending.key)
                            },
                            onDragOver: (e) => {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              setDragOverPendingKey(pending.key)
                            },
                            onDrop: (e) => {
                              e.preventDefault()
                              const fromKey = dragPendingKey ?? e.dataTransfer.getData('text/plain')
                              if (fromKey) movePendingRow(fromKey, pending.key)
                              setDragPendingKey(null)
                              setDragOverPendingKey(null)
                            },
                            onDragEnd: () => {
                              setDragPendingKey(null)
                              setDragOverPendingKey(null)
                            },
                            onDelete: () => removePendingRow(pending.key),
                            deleteDisabled: saving,
                          }}
                        />
                      ))}
                  </tbody>
                </table>
              </div>

              {(hasPending || isEditingSaved) && (
                <div className="space-y-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3">
                  {canEmailPharmacy ? (
                    <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendToPharmacyEmail}
                        disabled={saving}
                        onChange={(e) => setSendToPharmacyEmail(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span>
                        {t('encounter_modal.rx_email_pharmacy', { email: pharmacyEmail })}
                      </span>
                    </label>
                  ) : hasPharmacy ? (
                    <p className="text-sm text-amber-800">
                      {t('encounter_modal.rx_email_pharmacy_no_email')}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                  {hasPending && (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void submitAllPending()}
                        className="px-5 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                      >
                        {saving
                          ? t('common.saving')
                          : t('encounter_modal.rx_save_all', { count: pendingRows.length })}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={cancelPending}
                        className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {t('common.cancel')}
                      </button>
                    </>
                  )}
                  {isEditingSaved && (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void submitEdit(editingId!)}
                        className="px-5 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                      >
                        {saving ? t('common.saving') : t('rx.save')}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={cancelEdit}
                        className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {t('common.cancel')}
                      </button>
                    </>
                  )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('rx.empty')}</p>
          )}

          {canSaveNew && editable && !isEditingSaved && showTableShell && (
            <button
              type="button"
              onClick={startAddMedicine}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-violet-300 bg-white/60 px-4 py-3.5 text-sm font-medium text-violet-700 hover:bg-white hover:border-violet-400 transition-colors"
            >
              <span className="text-lg leading-none" aria-hidden>
                +
              </span>
              {t('encounter_modal.rx_add_medicine')}
            </button>
          )}
        </>
      )}
    </div>
  )
}
