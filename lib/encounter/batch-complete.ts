import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { completeEncounter } from '@/lib/encounter/complete-encounter'

export type BatchCompleteItemResult = {
  encounterId: number
  success: boolean
  error?: string
}

const MAX_BATCH = 50

export async function batchCompleteEncounters(
  admin: SupabaseClient,
  args: { encounterIds: number[]; userId: string }
): Promise<{ results: BatchCompleteItemResult[]; completed: number; failed: number }> {
  const uniqueIds = [...new Set(args.encounterIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (uniqueIds.length === 0) {
    return { results: [], completed: 0, failed: 0 }
  }
  if (uniqueIds.length > MAX_BATCH) {
    throw new ValidationError(`Cannot complete more than ${MAX_BATCH} encounters at once`)
  }

  const results: BatchCompleteItemResult[] = []

  for (const encounterId of uniqueIds) {
    try {
      await completeEncounter(admin, { encounterId, userId: args.userId })
      results.push({ encounterId, success: true })
    } catch (err) {
      results.push({
        encounterId,
        success: false,
        error: err instanceof Error ? err.message : 'Failed to complete encounter',
      })
    }
  }

  const completed = results.filter((r) => r.success).length
  return { results, completed, failed: results.length - completed }
}
