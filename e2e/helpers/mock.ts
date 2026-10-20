import type { Page, Request } from '@playwright/test'

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
type Json = Record<string, unknown> | unknown[] | string | number | boolean | null

/**
 * Answers matching requests with JSON instead of hitting the server.
 * Used for flows whose real side effects reach shared data (signup approval,
 * public-site publishing, moving visits), so the UI path is still exercised.
 * Returns the list of intercepted requests for assertions.
 */
export async function mockJson(
  page: Page,
  url: string | RegExp,
  body: Json | ((req: Request) => Json),
  opts: { method?: Method; status?: number } = {}
) {
  const calls: Request[] = []
  await page.route(url, async route => {
    const req = route.request()
    if (opts.method && req.method() !== opts.method) return route.fallback()
    calls.push(req)
    const payload = typeof body === 'function' ? body(req) : body
    await route.fulfill({
      status: opts.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
  return calls
}

/** Accepts every native confirm()/alert() the page raises. */
export function acceptDialogs(page: Page) {
  const messages: string[] = []
  page.on('dialog', d => {
    messages.push(d.message())
    void d.accept()
  })
  return messages
}

/** Dismisses every native confirm() the page raises. */
export function dismissDialogs(page: Page) {
  const messages: string[] = []
  page.on('dialog', d => {
    messages.push(d.message())
    void d.dismiss()
  })
  return messages
}

/** Opt-in switch for tests that write to shared staging data the public site reads. */
export const allowPublish = process.env.PLAYWRIGHT_ALLOW_PUBLISH === '1'
