import { logAuditEvent } from '@/lib/audit-server'
import type { AuditAction } from '@/lib/audit'

export type I693AuditOperation =
  | 'viewed'
  | 'saved'
  | 'ai_filled'
  | 'pdf_exported'
  | 'workflow_updated'

const ACTION_BY_OP: Record<I693AuditOperation, AuditAction> = {
  viewed: 'i693_viewed',
  saved: 'i693_saved',
  ai_filled: 'i693_ai_filled',
  pdf_exported: 'i693_pdf_exported',
  workflow_updated: 'i693_workflow_updated',
}

export async function logI693Audit(
  operation: I693AuditOperation,
  encounterId: number,
  metadata?: {
    patient_id?: number | null
    status?: string
    role?: string
    pdf_mode?: string
    ai_model?: string
    source?: 'admin' | 'clinical'
  }
): Promise<void> {
  await logAuditEvent(ACTION_BY_OP[operation], 'i693', encounterId, {
    operation,
    encounter_id: encounterId,
    ...metadata,
  })
}
