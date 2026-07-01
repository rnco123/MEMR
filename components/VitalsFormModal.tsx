'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { VitalsFormFields } from '@/components/VitalsFormFields'
import {
  EMPTY_VITALS_FORM_INPUT,
  validateVitalsForm,
  type VitalsFormInput,
} from '@/lib/vitals/vitals-form-ui'
import { calculateVitalsBmi } from '@/lib/vitals/save-encounter-vitals'

interface VitalsFormModalProps {
  encounterId: number
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

export function VitalsFormModal({ encounterId, isOpen, onClose, onSave }: VitalsFormModalProps) {
  const { t } = useT()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<VitalsFormInput>({ ...EMPTY_VITALS_FORM_INPUT })

  const handleFieldValidate = (next: VitalsFormInput) => {
    setFormData(next)
    setErrors(validateVitalsForm(next))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validationErrors = validateVitalsForm(formData)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setSaving(true)
    setErrors({})

    try {
      let bmi = calculateVitalsBmi(formData)

      const vitalsRes = await fetch(`/api/encounters/${encounterId}/vitals`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bp_systolic: formData.bp_systolic ? parseInt(formData.bp_systolic) : null,
          bp_diastolic: formData.bp_diastolic ? parseInt(formData.bp_diastolic) : null,
          heart_rate: formData.heart_rate ? parseInt(formData.heart_rate) : null,
          respiratory_rate: formData.respiratory_rate ? parseInt(formData.respiratory_rate) : null,
          temperature: formData.temperature ? parseFloat(formData.temperature) : null,
          temperature_unit: formData.temperature_unit,
          spo2: formData.spo2 ? parseInt(formData.spo2) : null,
          weight: formData.weight ? parseFloat(formData.weight) : null,
          weight_unit: formData.weight_unit,
          height: formData.height ? parseFloat(formData.height) : null,
          height_unit: formData.height_unit,
          bmi: bmi ? parseFloat(bmi.toFixed(1)) : null,
          notes: formData.notes || null,
        }),
      })

      const vitalsJson = await vitalsRes.json().catch(() => ({}))
      if (!vitalsRes.ok) {
        console.error('Error saving vitals:', vitalsJson)
        alert(`Failed to save vitals: ${vitalsJson.error || vitalsJson.message || 'Unknown error'}. Please check the console for details.`)
        setSaving(false)
        return
      }

      // Trigger SOAP completion via our API route (proxies to external API; avoids CORS and env)
      toast.info('AI is completing SOAP note…', {
        description: 'Objective, assessment, and plan will appear when ready.',
      })
      try {
        const soapRes = await fetch('/api/soap/complete-soap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ encounter_id: encounterId.toString() }),
        })

        const soapJson = await soapRes.json().catch(() => ({} as any))

        if (!soapRes.ok || !soapJson?.success) {
          console.error('SOAP complete-soap failed:', soapRes.status, soapJson)
          const payload = soapJson as
            | {
                message?: string
                error?: string
                details?: { message?: string } | string
              }
            | undefined
          const detailMessage =
            typeof payload?.details === 'object' && payload?.details
              ? payload.details.message
              : typeof payload?.details === 'string'
                ? payload.details
                : undefined
          toast.error('SOAP note could not be started', {
            description:
              payload?.message ||
              detailMessage ||
              payload?.error ||
              `Server returned ${soapRes.status}. Check console.`,
          })
        } else {
          toast.success('SOAP note saved successfully', {
            description: soapJson.message || 'SOAP data stored successfully.',
          })
        }
      } catch (apiError) {
        console.error('Error calling SOAP complete-soap:', apiError)
        toast.error('SOAP note could not be started', {
          description: apiError instanceof Error ? apiError.message : 'Network or server error.',
        })
      }

      onSave()
      // Reset form and errors
      setFormData({ ...EMPTY_VITALS_FORM_INPUT })
      setErrors({})
      onClose()
    } catch (error) {
      console.error('Error in handleSubmit:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      alert(`Failed to save vitals: ${errorMessage}. Please check the console for details.`)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setErrors({})
    setFormData({ ...EMPTY_VITALS_FORM_INPUT })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vitals-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-300/40 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <h3 id="vitals-modal-title" className="text-xl font-semibold text-slate-900 tracking-tight">
            {t('vitals.modal_title')}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/50"
            aria-label={t('common.close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <VitalsFormFields
              form={formData}
              onChange={handleFieldValidate}
              errors={errors}
              disabled={saving}
              clearValueOnUnitChange
            />
          </div>

          <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/90 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-[#2E6EF3] text-white text-sm font-semibold rounded-xl hover:bg-[#256ae8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/60 focus-visible:ring-offset-2"
            >
              {saving ? t('vitals.saving') : t('vitals.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
