/**
 * Regression for the prod Flowboard missing the newest visits: 1,007 appointments against
 * PostgREST's 1,000-row cap, read in one unpaged query, silently lost the last 7.
 */

import { fetchAllPages, fetchInChunks, IN_CHUNK_SIZE, PAGE_SIZE } from '@/lib/supabase/fetch-pages'

const MAX_ROWS = 1000

/** A fake table that, like PostgREST, never returns more than MAX_ROWS per request. */
function cappedTable(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: i + 1 }))
  const requests: Array<{ from: number; to: number }> = []
  const page = (from: number, to: number, source = rows) => {
    requests.push({ from, to })
    const end = Math.min(to + 1, from + MAX_ROWS)
    return Promise.resolve({ data: source.slice(from, end), error: null })
  }
  return { rows, requests, page }
}

describe('fetchAllPages', () => {
  test('reads every row when the table is larger than the row cap', async () => {
    const table = cappedTable(1007)
    const rows = await fetchAllPages((from, to) => table.page(from, to))
    expect(rows).toHaveLength(1007)
    expect(rows[rows.length - 1]).toEqual({ id: 1007 })
  })

  test('stops after the first short page', async () => {
    const table = cappedTable(PAGE_SIZE + 3)
    await fetchAllPages((from, to) => table.page(from, to))
    expect(table.requests).toEqual([
      { from: 0, to: PAGE_SIZE - 1 },
      { from: PAGE_SIZE, to: 2 * PAGE_SIZE - 1 },
    ])
  })

  test('reads one more empty page when the count is an exact multiple', async () => {
    const table = cappedTable(PAGE_SIZE * 2)
    const rows = await fetchAllPages((from, to) => table.page(from, to))
    expect(rows).toHaveLength(PAGE_SIZE * 2)
    expect(table.requests).toHaveLength(3)
  })

  test('returns nothing for an empty table', async () => {
    const table = cappedTable(0)
    expect(await fetchAllPages((from, to) => table.page(from, to))).toEqual([])
  })

  test('throws the query error', async () => {
    const error = new Error('boom')
    await expect(
      fetchAllPages(() => Promise.resolve({ data: null, error }))
    ).rejects.toBe(error)
  })
})

describe('fetchInChunks', () => {
  test('splits ids into chunks and concatenates the results', async () => {
    const ids = Array.from({ length: IN_CHUNK_SIZE * 2 + 5 }, (_, i) => i + 1)
    const chunks: number[][] = []
    const rows = await fetchInChunks(ids, (chunk) => {
      if (!chunks.includes(chunk)) chunks.push(chunk)
      return Promise.resolve({ data: chunk.map((id) => ({ id })), error: null })
    })
    expect(chunks.map((c) => c.length)).toEqual([IN_CHUNK_SIZE, IN_CHUNK_SIZE, 5])
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  test('makes no request for an empty id list', async () => {
    const page = jest.fn()
    expect(await fetchInChunks([], page)).toEqual([])
    expect(page).not.toHaveBeenCalled()
  })
})
