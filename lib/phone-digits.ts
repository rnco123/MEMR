/** Keep only 0-9 for phone inputs. */
export function phoneDigitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}
