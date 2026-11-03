/**
 * Service titles carry their consumer price in the text — "Immigration Medical
 * Exam – $220". The staff EMR books and charges through POS, so the fee is noise
 * in a picker, and it is stripped for every clinic.
 *
 * This used to depend on the tenant, which meant the same service read differently
 * from one clinic to the next and stopped stripping entirely when Kempwood was
 * renumbered. The separator goes with the fee: never "Immigration Medical Exam –".
 */
export function stripServiceFee(title: string): string {
  return title.replace(/\s*[-–—]?\s*\$\d[\d,]*(?:\.\d{2})?\s*$/, '')
}
