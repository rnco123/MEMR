/**
 * Live tenant ids, as held in every project (P1-P4):
 *   1 = Clinica San Miguel
 *   2 = Kempwood
 *   4 = Clinica Hispana Nueva Vida ("Loop")
 * Tenant 3 is free: Kempwood moved from 3 to 2 so that id and tenant_code match.
 */
export const CSM_TENANT_ID = 1
export const KEMPWOOD_TENANT_ID = 2
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
