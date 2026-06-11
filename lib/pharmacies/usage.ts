import type { SupabaseClient } from '@supabase/supabase-js'

export type PharmacyLinkCounts = {
  encounterCount: number
  prescriptionCount: number
}

export async function countPharmacyLinks(
  admin: SupabaseClient,
  pharmacyId: number
): Promise<PharmacyLinkCounts> {
  const [{ count: encounterCount }, { count: prescriptionCount }] = await Promise.all([
    admin
      .from('encounters')
      .select('id', { count: 'exact', head: true })
      .eq('pharmacy_id', pharmacyId),
    admin
      .from('prescriptions')
      .select('id', { count: 'exact', head: true })
      .eq('pharmacy_id', pharmacyId),
  ])

  return {
    encounterCount: encounterCount ?? 0,
    prescriptionCount: prescriptionCount ?? 0,
  }
}

/** Count encounters per pharmacy id (batch for list views). */
export async function countEncounterLinksByPharmacyIds(
  admin: SupabaseClient,
  pharmacyIds: number[]
): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
  if (pharmacyIds.length === 0) return counts

  const { data, error } = await admin
    .from('encounters')
    .select('pharmacy_id')
    .in('pharmacy_id', pharmacyIds)

  if (error) throw error

  for (const row of data ?? []) {
    const pid = Number(row.pharmacy_id)
    if (!Number.isFinite(pid)) continue
    counts.set(pid, (counts.get(pid) ?? 0) + 1)
  }

  return counts
}

export async function delinkPharmacyFromEncountersAndPrescriptions(
  admin: SupabaseClient,
  pharmacyId: number
): Promise<PharmacyLinkCounts> {
  const before = await countPharmacyLinks(admin, pharmacyId)

  const [{ error: encErr }, { error: rxErr }] = await Promise.all([
    admin.from('encounters').update({ pharmacy_id: null }).eq('pharmacy_id', pharmacyId),
    admin.from('prescriptions').update({ pharmacy_id: null }).eq('pharmacy_id', pharmacyId),
  ])

  if (encErr) throw encErr
  if (rxErr) throw rxErr

  return before
}
