/**
 * PostgREST caps every response at the project's "Max rows" setting and drops the rest
 * without an error. Any read whose row count grows with the clinic's history has to page.
 */
export const PAGE_SIZE = 500

/** Ids per `.in()` filter: keeps the request URL short and each response well under the cap. */
export const IN_CHUNK_SIZE = 200

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>

/**
 * Read every row of a query page by page. `page` must apply a stable `.order()` and the
 * given `.range(from, to)`; reading stops at the first short page.
 */
export async function fetchAllPages<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

/**
 * Run an `.in()` query over many ids in chunks and concatenate the results. Each chunk's
 * query is paged too, so a chunk matching more rows than the cap is still read in full.
 */
export async function fetchInChunks<T, Id>(
  ids: Id[],
  page: (chunk: Id[], from: number, to: number) => PageResult<T>
): Promise<T[]> {
  const rows: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE)
    rows.push(...(await fetchAllPages((from, to) => page(chunk, from, to))))
  }
  return rows
}
