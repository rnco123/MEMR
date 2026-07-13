/**
 * Minimal ambient types for the `zipcodes` package (v8, CommonJS, ships no types).
 * Only the members we use are declared.
 */
declare module 'zipcodes' {
  interface ZipLookup {
    zip: string
    latitude: number
    longitude: number
    city: string
    state: string
    country: string
  }

  /** Look up a ZIP's centroid + place; undefined when the ZIP is unknown. */
  export function lookup(zip: string | number): ZipLookup | undefined
  /** Great-circle distance in miles between two ZIPs; null when either is unknown. */
  export function distance(zipA: string | number, zipB: string | number): number | null

  const zipcodes: {
    lookup: typeof lookup
    distance: typeof distance
  }
  export default zipcodes
}
