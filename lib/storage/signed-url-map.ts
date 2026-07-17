import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Batch-sign storage paths in a single request instead of one round trip per file.
 * Returns a path -> signedUrl map; paths that fail to sign are omitted.
 */
export async function createSignedUrlMap(
  client: SupabaseClient,
  bucket: string,
  paths: string[],
  expiresIn: number
): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  const map = new Map<string, string>()
  if (uniquePaths.length === 0) return map

  const { data, error } = await client.storage.from(bucket).createSignedUrls(uniquePaths, expiresIn)
  if (error) {
    console.error(`[createSignedUrlMap] ${bucket}:`, error.message)
  } else {
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        map.set(item.path, item.signedUrl)
      } else if (item.path) {
        console.error(`[createSignedUrlMap] ${bucket}/${item.path}:`, item.error ?? 'sign failed')
      }
    }
  }

  // A single bad path can fail the whole batch. Retry missing paths individually so
  // unrelated chart documents remain previewable.
  const missingPaths = uniquePaths.filter((path) => !map.has(path))
  if (missingPaths.length > 0) {
    const results = await Promise.all(
      missingPaths.map(async (path) => {
        const { data: signed, error: signError } = await client.storage
          .from(bucket)
          .createSignedUrl(path, expiresIn)
        if (signError || !signed?.signedUrl) {
          console.error(
            `[createSignedUrlMap] ${bucket}/${path}:`,
            signError?.message ?? 'sign failed'
          )
          return null
        }
        return [path, signed.signedUrl] as const
      })
    )
    for (const result of results) {
      if (result) map.set(result[0], result[1])
    }
  }

  return map
}
