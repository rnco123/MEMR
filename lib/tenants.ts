/**
 * Live tenant ids (see migrations 065/096):
 *   1 = Clinica San Miguel (renamed from Default Tenant)
 *   3 = Kempwood
 *   4 = Loop
 * Tenant 2 (Kempen) was removed by migration 096.
 */
export const CSM_TENANT_ID = 1
export const KEMPWOOD_TENANT_ID = 3
export const LOOP_TENANT_ID = 4

/**
 * Tenants whose Add Encounter flow offers only immigration services.
 * Kempwood keeps the full services list.
 */
export const IMMIGRATION_ONLY_TENANT_IDS: readonly number[] = [CSM_TENANT_ID, LOOP_TENANT_ID]

export function isImmigrationOnlyTenant(tenantId: number | null | undefined): boolean {
  return tenantId != null && IMMIGRATION_ONLY_TENANT_IDS.includes(tenantId)
}

/**
 * Kempwood and Loop hide the "$220" exam fee in service titles (CSM shows it).
 * The separator goes with the fee: "Immigration Medical Exam – $220" becomes
 * "Immigration Medical Exam", never "Immigration Medical Exam –".
 */
export function stripServiceFeeForTenant(title: string, tenantId: number | null | undefined): string {
  if (tenantId !== KEMPWOOD_TENANT_ID && tenantId !== LOOP_TENANT_ID) return title
  return title.replace(/\s*[-–—]?\s*\$220\s*$/, '')
}
