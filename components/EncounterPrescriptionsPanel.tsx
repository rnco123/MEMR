'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { isForbiddenResponse } from '@/lib/http/api-response'
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
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { findPharmacyById, type PharmacyRecord } from '@/lib/pharmacies/normalize'
import { printUsPrescriptions } from '@/lib/prescriptions/us-prescription-print'
import type { PrescriptionPrintContext } from '@/lib/prescriptions/load-prescription-print-context'
import type { PrescriptionAuditSummary } from '@/lib/prescriptions/prescription-audit'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'

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

type Props = {
  encounterId: number
  encounterStatus: string
  /** Add/edit/remove prescription rows */
  canEdit?: boolean
  /** Assign pharmacy or add to registry (clinical staff only) */
  canManagePharmacy?: boolean
  /** View/print saved prescriptions without edit rights (e.g. admin oversight) */
  canPrintPrescriptions?: boolean
  /** Physician: send prescriptions to pharmacy (locks edits) */
  canSendToAdmin?: boolean
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
  canPrintPrescriptions = false,
  canSendToAdmin = false,
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
  const [released, setReleased] = useState(false)
  const [sendingReady, setSendingReady] = useState(false)
  const [sendToPharmacyConfirmOpen, setSendToPharmacyConfirmOpen] = useState(false)
  const editable = canEdit && canEditEncounterPrescriptions(encounterStatus) && !released
  const pharmacyEditable = canManagePharmacy && !released
  const canPrint = editable || canManagePharmacy || canPrintPrescriptions
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<PrescriptionRow[]>([])
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<StructuredRxForm>(() => emptyStructuredRxForm())
  const [dragPendingKey, setDragPendingKey] = useState<string | null>(null)
  const [dragOverPendingKey, setDragOverPendingKey] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [lastRxAudit, setLastRxAudit] = useState<PrescriptionAuditSummary>(null)

  const resolvedPharmacy = useMemo(
    () => assignedPharmacy ?? findPharmacyById(pharmacies, pharmacyId),
    [assignedPharmacy, pharmacies, pharmacyId]
  )

  const formatRxAudit = (audit: NonNullable<PrescriptionAuditSummary>) => {
    const when = formatClinicDateTimeForLanguage(audit.created_at, language)
    const name = audit.editor_name || t('common.unknown')
    const roleLabel =
      audit.editor_role === 'doctor'
        ? t('encounter_modal.soap_role_doctor')
        : audit.editor_role === 'nurse' || audit.editor_role === 'staff'
          ? t('encounter_modal.soap_role_nurse')
          : audit.editor_role === 'admin'
            ? t('encounter_modal.soap_role_admin')
            : audit.editor_role || ''
    const actionLabel =
      audit.action === 'create'
        ? t('encounter_modal.rx_audit_created')
        : audit.action === 'cancel'
          ? t('encounter_modal.rx_audit_cancelled')
          : t('encounter_modal.rx_audit_updated')
    const med = audit.medication_name?.trim() || t('encounter_modal.rx_audit_medication')
    return t('encounter_modal.rx_last_edited', { name, role: roleLabel, action: actionLabel, medication: med, when })
  }

  const loadPrescriptions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/prescriptions`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) {
          setRows([])
          return
        }
        throw new Error(json.error || t('encounter_modal.rx_load_failed'))
      }
      setRows((json.data as PrescriptionRow[]) ?? [])
      setLastRxAudit((json.last_audit as PrescriptionAuditSummary) ?? null)
      setReleased(Boolean(json.released))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.rx_load_failed'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [encounterId, t])

  useEffect(() => {
    void loadPrescriptions()
  }, [encounterId, loadPrescriptions])

  const canSaveNew = editable && hasDoctor
  const hasPending = pendingRows.length > 0
  const isEditingSaved = editingId !== null
  const showTableShell =
    rows.length > 0 ||
    hasPending ||
    isEditingSaved ||
    canSaveNew ||
    pharmacyId != null ||
    canManagePharmacy ||
    released
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

  const sendPrescriptionsToAdmin = async () => {
    if (!canSendToAdmin || released || rows.length === 0 || sendingReady) return

    setSendingReady(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/prescriptions/send-ready`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) return
        throw new Error(json.error || t('encounter_modal.rx_send_admin_failed'))
      }
      toast.success(t('encounter_modal.rx_send_admin_success'))
      setSendToPharmacyConfirmOpen(false)
      await loadPrescriptions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('encounter_modal.rx_send_admin_failed'))
    } finally {
      setSendingReady(false)
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
      const result = await printUsPrescriptions(
        json.data as PrescriptionPrintContext,
        printWindow
      )
      if (!result.ok) {
        throw new Error(t('encounter_modal.rx_print_failed'))
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

  const submitAllPending = async () => {
    if (!canSaveNew || pendingRows.length === 0) return

    const valid = pendingRows.filter((row) => row.form.medication_name.trim())
    if (valid.length === 0) {
      toast.error(t('encounter_modal.rx_medication_required'))
      return
    }

    setSaving(true)
    let saved = 0
    try {
      for (const row of valid) {
        const res = await fetch(`/api/encounters/${encounterId}/prescriptions`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(structuredFormToApiPayload(row.form)),
        })
        const json = await res.json()
        if (!res.ok) {
          if (isForbiddenResponse(res.status)) return
          throw new Error(json.error || t('encounter_modal.rx_save_failed'))
        }
        saved++
      }
      toast.success(t('encounter_modal.rx_saved_count', { count: saved }))
      setPendingRows([])
      await loadPrescriptions()
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
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) return
        throw new Error(json.error || t('encounter_modal.rx_update_failed'))
      }
      toast.success(t('encounter_modal.rx_updated'))
      setEditingId(null)
      await loadPrescriptions()
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
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) return
        throw new Error(json.error || t('encounter_modal.rx_remove_failed'))
      }
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
      <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-2">
        <svg className="w-5 h-5 text-violet-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        {t('encounter_modal.rx_pharmacy_title')}
        </span>
        {canSendToAdmin && !released && rows.length > 0 && hasDoctor && (
          <button
            type="button"
            disabled={sendingReady || saving || isEditingSaved}
            onClick={() => setSendToPharmacyConfirmOpen(true)}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {sendingReady ? t('encounter_modal.rx_send_admin_sending') : t('encounter_modal.rx_send_admin')}
          </button>
        )}
      </h3>
      {lastRxAudit ? (
        <p className="text-xs text-violet-700 mt-2 font-medium mb-3">{formatRxAudit(lastRxAudit)}</p>
      ) : null}
      <p className="text-sm text-slate-600 mb-3">{t('encounter_modal.rx_subtitle')}</p>

      {released ? (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {t('encounter_modal.rx_released_to_admin')}
        </p>
      ) : null}

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
                  editable={pharmacyEditable}
                  onUpdated={onPharmacyUpdated}
                  onPharmaciesReload={onPharmaciesReload}
                  compact
                  showEditButton
                />
                {rows.length > 0 && canPrint && (
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

      <ConfirmDialog
        open={sendToPharmacyConfirmOpen}
        onClose={() => {
          if (!sendingReady) setSendToPharmacyConfirmOpen(false)
        }}
        onConfirm={sendPrescriptionsToAdmin}
        title={t('encounter_modal.rx_send_admin_confirm_title')}
        message={t('encounter_modal.rx_send_admin_confirm')}
        confirmLabel={t('encounter_modal.rx_send_admin')}
        accent="violet"
        loading={sendingReady}
        icon={
          <div
            className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-emerald-100 text-emerald-700"
            aria-hidden
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
          </div>
        }
      />
    </div>
  )
}
