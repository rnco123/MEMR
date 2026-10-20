import type { Locator } from '@playwright/test'

/**
 * True if `locator` becomes visible within `timeout` ms.
 *
 * Use this instead of `locator.isVisible({ timeout })`: Playwright ignores that
 * timeout and answers immediately, so optional-UI checks run before the page
 * has rendered and wrongly take the "not there" branch.
 */
export async function isShown(locator: Locator, timeout = 5000): Promise<boolean> {
  return locator
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false)
}
