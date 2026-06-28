import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AI_SOAP_RISK_SELECT,
  AI_SOAP_SELECT,
  AI_SOAP_SUBJECTIVE_SELECT,
} from '@/lib/encounters/encounter-detail-selects'

/** Latest AI SOAP note by encounter_id, then appointment_id fallback. */
export async function loadAiSoapForEncounter<T extends Record<string, unknown> = Record<string, unknown>>(
  admin: SupabaseClient,
  encounterId: number,
  appointmentId: number | null,
  select: string = AI_SOAP_SELECT
): Promise<T | null> {
  const { data: byEncounter, error: encErr } = await admin
    .from('ai_soapnotes')
    .select(select)
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!encErr && byEncounter) return byEncounter as unknown as T

  if (appointmentId && Number.isFinite(appointmentId)) {
    const { data: byAppt, error: apptErr } = await admin
      .from('ai_soapnotes')
      .select(select)
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!apptErr && byAppt) return byAppt as unknown as T
  }

  return null
}

export function loadAiSoapSubjectiveForEncounter(
  admin: SupabaseClient,
  encounterId: number,
  appointmentId: number | null
) {
  return loadAiSoapForEncounter<{ subjective_text?: string | null }>(
    admin,
    encounterId,
    appointmentId,
    AI_SOAP_SUBJECTIVE_SELECT
  )
}

export function loadAiSoapRiskContextForEncounter(
  admin: SupabaseClient,
  encounterId: number,
  appointmentId: number | null
) {
  return loadAiSoapForEncounter<{
    subjective_text?: string | null
    objective_text?: string | null
    assessment_text?: string | null
    plan_text?: string | null
  }>(admin, encounterId, appointmentId, AI_SOAP_RISK_SELECT)
}
