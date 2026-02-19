'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { config } from '@/lib/config'

interface VitalsFormModalProps {
  encounterId: number
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

// Validation ranges based on medical standards
const VALIDATION_RANGES = {
  bp_systolic: { min: 70, max: 250 },
  bp_diastolic: { min: 40, max: 150 },
  heart_rate: { min: 30, max: 220 },
  respiratory_rate: { min: 8, max: 40 },
  temperature_f: { min: 90, max: 110 },
  temperature_c: { min: 32, max: 43 },
  spo2: { min: 0, max: 100 },
  weight_lbs: { min: 1, max: 1000 },
  weight_kg: { min: 0.5, max: 500 },
  height_in: { min: 12, max: 96 },
  height_cm: { min: 30, max: 250 },
}

export function VitalsFormModal({ encounterId, isOpen, onClose, onSave }: VitalsFormModalProps) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState({
    bp_systolic: '',
    bp_diastolic: '',
    heart_rate: '',
    respiratory_rate: '',
    temperature: '',
    temperature_unit: 'F',
    spo2: '',
    weight: '',
    weight_unit: 'lbs',
    height: '',
    height_unit: 'in',
    notes: '',
  })

  const validateField = (name: string, value: string): string | null => {
    if (!value) return null // Allow empty fields

    const numValue = parseFloat(value)
    if (isNaN(numValue)) return 'Must be a valid number'

    switch (name) {
      case 'bp_systolic':
        if (numValue < VALIDATION_RANGES.bp_systolic.min || numValue > VALIDATION_RANGES.bp_systolic.max) {
          return `Must be between ${VALIDATION_RANGES.bp_systolic.min}-${VALIDATION_RANGES.bp_systolic.max} mmHg`
        }
        break
      case 'bp_diastolic':
        if (numValue < VALIDATION_RANGES.bp_diastolic.min || numValue > VALIDATION_RANGES.bp_diastolic.max) {
          return `Must be between ${VALIDATION_RANGES.bp_diastolic.min}-${VALIDATION_RANGES.bp_diastolic.max} mmHg`
        }
        if (formData.bp_systolic && parseFloat(formData.bp_systolic) <= numValue) {
          return 'Diastolic must be less than systolic'
        }
        break
      case 'heart_rate':
        if (numValue < VALIDATION_RANGES.heart_rate.min || numValue > VALIDATION_RANGES.heart_rate.max) {
          return `Must be between ${VALIDATION_RANGES.heart_rate.min}-${VALIDATION_RANGES.heart_rate.max} bpm`
        }
        break
      case 'respiratory_rate':
        if (numValue < VALIDATION_RANGES.respiratory_rate.min || numValue > VALIDATION_RANGES.respiratory_rate.max) {
          return `Must be between ${VALIDATION_RANGES.respiratory_rate.min}-${VALIDATION_RANGES.respiratory_rate.max} breaths/min`
        }
        break
      case 'temperature':
        if (formData.temperature_unit === 'F') {
          if (numValue < VALIDATION_RANGES.temperature_f.min || numValue > VALIDATION_RANGES.temperature_f.max) {
            return `Must be between ${VALIDATION_RANGES.temperature_f.min}-${VALIDATION_RANGES.temperature_f.max}°F`
          }
        } else {
          if (numValue < VALIDATION_RANGES.temperature_c.min || numValue > VALIDATION_RANGES.temperature_c.max) {
            return `Must be between ${VALIDATION_RANGES.temperature_c.min}-${VALIDATION_RANGES.temperature_c.max}°C`
          }
        }
        break
      case 'spo2':
        if (numValue < VALIDATION_RANGES.spo2.min || numValue > VALIDATION_RANGES.spo2.max) {
          return `Must be between ${VALIDATION_RANGES.spo2.min}-${VALIDATION_RANGES.spo2.max}%`
        }
        break
      case 'weight':
        if (formData.weight_unit === 'lbs') {
          if (numValue < VALIDATION_RANGES.weight_lbs.min || numValue > VALIDATION_RANGES.weight_lbs.max) {
            return `Must be between ${VALIDATION_RANGES.weight_lbs.min}-${VALIDATION_RANGES.weight_lbs.max} lbs`
          }
        } else {
          if (numValue < VALIDATION_RANGES.weight_kg.min || numValue > VALIDATION_RANGES.weight_kg.max) {
            return `Must be between ${VALIDATION_RANGES.weight_kg.min}-${VALIDATION_RANGES.weight_kg.max} kg`
          }
        }
        break
      case 'height':
        if (formData.height_unit === 'in') {
          if (numValue < VALIDATION_RANGES.height_in.min || numValue > VALIDATION_RANGES.height_in.max) {
            return `Must be between ${VALIDATION_RANGES.height_in.min}-${VALIDATION_RANGES.height_in.max} inches`
          }
        } else {
          if (numValue < VALIDATION_RANGES.height_cm.min || numValue > VALIDATION_RANGES.height_cm.max) {
            return `Must be between ${VALIDATION_RANGES.height_cm.min}-${VALIDATION_RANGES.height_cm.max} cm`
          }
        }
        break
    }
    return null
  }

  const handleFieldChange = (name: string, value: string) => {
    setFormData({ ...formData, [name]: value })
    const error = validateField(name, value)
    if (error) {
      setErrors({ ...errors, [name]: error })
    } else {
      const newErrors = { ...errors }
      delete newErrors[name]
      setErrors(newErrors)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate all fields
    const validationErrors: Record<string, string> = {}
    Object.keys(formData).forEach((key) => {
      if (key !== 'notes' && key !== 'temperature_unit' && key !== 'weight_unit' && key !== 'height_unit') {
        const error = validateField(key, formData[key as keyof typeof formData])
        if (error) {
          validationErrors[key] = error
        }
      }
    })

    // Also validate diastolic against systolic
    if (formData.bp_systolic && formData.bp_diastolic) {
      const systolic = parseFloat(formData.bp_systolic)
      const diastolic = parseFloat(formData.bp_diastolic)
      if (diastolic >= systolic) {
        validationErrors.bp_diastolic = 'Diastolic must be less than systolic'
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setSaving(true)
    setErrors({})

    try {
      // Verify encounter exists
      const { data: encounterCheck, error: encounterCheckError } = await supabase
        .from('encounters')
        .select('id')
        .eq('id', encounterId)
        .single()

      if (encounterCheckError || !encounterCheck) {
        console.error('Encounter not found:', encounterCheckError)
        alert(`Error: Encounter not found. Please refresh and try again.`)
        setSaving(false)
        return
      }

      // Calculate BMI if weight and height are provided
      let bmi = null
      if (formData.weight && formData.height) {
        const weightKg = formData.weight_unit === 'lbs' 
          ? parseFloat(formData.weight) * 0.453592 
          : parseFloat(formData.weight)
        const heightM = formData.height_unit === 'in'
          ? parseFloat(formData.height) * 0.0254
          : parseFloat(formData.height) / 100
        if (heightM > 0) {
          bmi = weightKg / (heightM * heightM)
        }
      }

      // Insert vitals
      const { error: vitalsError } = await supabase
        .from('vitals')
        .insert({
          encounter_id: encounterId,
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
        })

      if (vitalsError) {
        console.error('Error saving vitals:', vitalsError)
        alert(`Failed to save vitals: ${vitalsError.message || 'Unknown error'}. Please check the console for details.`)
        setSaving(false)
        return
      }

      // Update encounter status to vitals_assessed
      const { error: encounterError } = await supabase
        .from('encounters')
        .update({ 
          status: 'vitals_assessed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', encounterId)

      if (encounterError) {
        console.error('Error updating encounter status:', encounterError)
        // Don't fail - vitals were saved
      }

      // Call external Complete SOAP Notes API (fire-and-forget)
      // This will generate objective/assessment/plan in ai_soapnotes
      const soapApiUrl = config.soapNotes.apiUrl
      if (soapApiUrl) {
        try {
          // We don't await this call so the nurse isn't blocked by AI processing time
          void fetch(soapApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              encounter_id: encounterId.toString(),
            }),
          })
        } catch (apiError) {
          // Log but don't interrupt the nurse workflow
          console.error('Error calling Complete SOAP Notes API:', apiError)
        }
      }

      onSave()
      // Reset form and errors
      setFormData({
        bp_systolic: '',
        bp_diastolic: '',
        heart_rate: '',
        respiratory_rate: '',
        temperature: '',
        temperature_unit: 'F',
        spo2: '',
        weight: '',
        weight_unit: 'lbs',
        height: '',
        height_unit: 'in',
        notes: '',
      })
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
    setFormData({
      bp_systolic: '',
      bp_diastolic: '',
      heart_rate: '',
      respiratory_rate: '',
      temperature: '',
      temperature_unit: 'F',
      spo2: '',
      weight: '',
      weight_unit: 'lbs',
      height: '',
      height_unit: 'in',
      notes: '',
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 border border-white/20 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">Add Vitals</h3>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Blood Pressure */}
            <div>
              <label className="block text-blue-200 text-sm mb-2">Blood Pressure (Systolic)</label>
              <input
                type="number"
                min={VALIDATION_RANGES.bp_systolic.min}
                max={VALIDATION_RANGES.bp_systolic.max}
                value={formData.bp_systolic}
                onChange={(e) => handleFieldChange('bp_systolic', e.target.value)}
                placeholder={`${VALIDATION_RANGES.bp_systolic.min}-${VALIDATION_RANGES.bp_systolic.max}`}
                className={`w-full px-4 py-2 bg-white/5 border rounded-lg text-white placeholder-blue-300/50 focus:outline-none ${
                  errors.bp_systolic ? 'border-red-500' : 'border-white/20 focus:border-blue-500'
                }`}
              />
              {errors.bp_systolic && (
                <p className="text-red-400 text-xs mt-1">{errors.bp_systolic}</p>
              )}
            </div>
            <div>
              <label className="block text-blue-200 text-sm mb-2">Blood Pressure (Diastolic)</label>
              <input
                type="number"
                min={VALIDATION_RANGES.bp_diastolic.min}
                max={VALIDATION_RANGES.bp_diastolic.max}
                value={formData.bp_diastolic}
                onChange={(e) => handleFieldChange('bp_diastolic', e.target.value)}
                placeholder={`${VALIDATION_RANGES.bp_diastolic.min}-${VALIDATION_RANGES.bp_diastolic.max}`}
                className={`w-full px-4 py-2 bg-white/5 border rounded-lg text-white placeholder-blue-300/50 focus:outline-none ${
                  errors.bp_diastolic ? 'border-red-500' : 'border-white/20 focus:border-blue-500'
                }`}
              />
              {errors.bp_diastolic && (
                <p className="text-red-400 text-xs mt-1">{errors.bp_diastolic}</p>
              )}
            </div>

            {/* Heart Rate */}
            <div>
              <label className="block text-blue-200 text-sm mb-2">Heart Rate (bpm)</label>
              <input
                type="number"
                min={VALIDATION_RANGES.heart_rate.min}
                max={VALIDATION_RANGES.heart_rate.max}
                value={formData.heart_rate}
                onChange={(e) => handleFieldChange('heart_rate', e.target.value)}
                placeholder={`${VALIDATION_RANGES.heart_rate.min}-${VALIDATION_RANGES.heart_rate.max}`}
                className={`w-full px-4 py-2 bg-white/5 border rounded-lg text-white placeholder-blue-300/50 focus:outline-none ${
                  errors.heart_rate ? 'border-red-500' : 'border-white/20 focus:border-blue-500'
                }`}
              />
              {errors.heart_rate && (
                <p className="text-red-400 text-xs mt-1">{errors.heart_rate}</p>
              )}
            </div>

            {/* Respiratory Rate */}
            <div>
              <label className="block text-blue-200 text-sm mb-2">Respiratory Rate (/min)</label>
              <input
                type="number"
                min={VALIDATION_RANGES.respiratory_rate.min}
                max={VALIDATION_RANGES.respiratory_rate.max}
                value={formData.respiratory_rate}
                onChange={(e) => handleFieldChange('respiratory_rate', e.target.value)}
                placeholder="16"
                className={`w-full px-4 py-2 bg-white/5 border rounded-lg text-white placeholder-blue-300/50 focus:outline-none ${
                  errors.respiratory_rate ? 'border-red-500' : 'border-white/20 focus:border-blue-500'
                }`}
              />
              {errors.respiratory_rate && (
                <p className="text-red-400 text-xs mt-1">{errors.respiratory_rate}</p>
              )}
            </div>

            {/* Temperature */}
            <div>
              <label className="block text-blue-200 text-sm mb-2">Temperature</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  min={formData.temperature_unit === 'F' ? VALIDATION_RANGES.temperature_f.min : VALIDATION_RANGES.temperature_c.min}
                  max={formData.temperature_unit === 'F' ? VALIDATION_RANGES.temperature_f.max : VALIDATION_RANGES.temperature_c.max}
                  value={formData.temperature}
                  onChange={(e) => handleFieldChange('temperature', e.target.value)}
                  placeholder={
                    formData.temperature_unit === 'F'
                      ? `${VALIDATION_RANGES.temperature_f.min}-${VALIDATION_RANGES.temperature_f.max}`
                      : `${VALIDATION_RANGES.temperature_c.min}-${VALIDATION_RANGES.temperature_c.max}`
                  }
                  className={`flex-1 px-4 py-2 bg-white/5 border rounded-lg text-white placeholder-blue-300/50 focus:outline-none ${
                    errors.temperature ? 'border-red-500' : 'border-white/20 focus:border-blue-500'
                  }`}
                />
                <select
                  value={formData.temperature_unit}
                  onChange={(e) => {
                    setFormData({ ...formData, temperature_unit: e.target.value, temperature: '' })
                    if (errors.temperature) {
                      const newErrors = { ...errors }
                      delete newErrors.temperature
                      setErrors(newErrors)
                    }
                  }}
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500 min-w-[80px]"
                >
                  <option value="F">°F</option>
                  <option value="C">°C</option>
                </select>
              </div>
              {errors.temperature && (
                <p className="text-red-400 text-xs mt-1">{errors.temperature}</p>
              )}
            </div>

            {/* SpO2 */}
            <div>
              <label className="block text-blue-200 text-sm mb-2">SpO2 (%)</label>
              <input
                type="number"
                min={VALIDATION_RANGES.spo2.min}
                max={VALIDATION_RANGES.spo2.max}
                value={formData.spo2}
                onChange={(e) => handleFieldChange('spo2', e.target.value)}
                placeholder={`${VALIDATION_RANGES.spo2.min}-${VALIDATION_RANGES.spo2.max}`}
                className={`w-full px-4 py-2 bg-white/5 border rounded-lg text-white placeholder-blue-300/50 focus:outline-none ${
                  errors.spo2 ? 'border-red-500' : 'border-white/20 focus:border-blue-500'
                }`}
              />
              {errors.spo2 && (
                <p className="text-red-400 text-xs mt-1">{errors.spo2}</p>
              )}
            </div>

            {/* Weight */}
            <div>
              <label className="block text-blue-200 text-sm mb-2">Weight</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  min={formData.weight_unit === 'lbs' ? VALIDATION_RANGES.weight_lbs.min : VALIDATION_RANGES.weight_kg.min}
                  max={formData.weight_unit === 'lbs' ? VALIDATION_RANGES.weight_lbs.max : VALIDATION_RANGES.weight_kg.max}
                  value={formData.weight}
                  onChange={(e) => handleFieldChange('weight', e.target.value)}
                  placeholder={
                    formData.weight_unit === 'lbs'
                      ? `${VALIDATION_RANGES.weight_lbs.min}-${VALIDATION_RANGES.weight_lbs.max}`
                      : `${VALIDATION_RANGES.weight_kg.min}-${VALIDATION_RANGES.weight_kg.max}`
                  }
                  className={`flex-1 px-4 py-2 bg-white/5 border rounded-lg text-white placeholder-blue-300/50 focus:outline-none ${
                    errors.weight ? 'border-red-500' : 'border-white/20 focus:border-blue-500'
                  }`}
                />
                <select
                  value={formData.weight_unit}
                  onChange={(e) => {
                    setFormData({ ...formData, weight_unit: e.target.value, weight: '' })
                    if (errors.weight) {
                      const newErrors = { ...errors }
                      delete newErrors.weight
                      setErrors(newErrors)
                    }
                  }}
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500 min-w-[70px]"
                >
                  <option value="lbs">lbs</option>
                  <option value="kg">kg</option>
                </select>
              </div>
              {errors.weight && (
                <p className="text-red-400 text-xs mt-1">{errors.weight}</p>
              )}
            </div>

            {/* Height */}
            <div>
              <label className="block text-blue-200 text-sm mb-2">Height</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  min={formData.height_unit === 'in' ? VALIDATION_RANGES.height_in.min : VALIDATION_RANGES.height_cm.min}
                  max={formData.height_unit === 'in' ? VALIDATION_RANGES.height_in.max : VALIDATION_RANGES.height_cm.max}
                  value={formData.height}
                  onChange={(e) => handleFieldChange('height', e.target.value)}
                  placeholder={
                    formData.height_unit === 'in'
                      ? `${VALIDATION_RANGES.height_in.min}-${VALIDATION_RANGES.height_in.max}`
                      : `${VALIDATION_RANGES.height_cm.min}-${VALIDATION_RANGES.height_cm.max}`
                  }
                  className={`flex-1 px-4 py-2 bg-white/5 border rounded-lg text-white placeholder-blue-300/50 focus:outline-none ${
                    errors.height ? 'border-red-500' : 'border-white/20 focus:border-blue-500'
                  }`}
                />
                <select
                  value={formData.height_unit}
                  onChange={(e) => {
                    setFormData({ ...formData, height_unit: e.target.value, height: '' })
                    if (errors.height) {
                      const newErrors = { ...errors }
                      delete newErrors.height
                      setErrors(newErrors)
                    }
                  }}
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500 min-w-[70px]"
                >
                  <option value="in">in</option>
                  <option value="cm">cm</option>
                </select>
              </div>
              {errors.height && (
                <p className="text-red-400 text-xs mt-1">{errors.height}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-blue-200 text-sm mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={3}
              className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Vitals'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
