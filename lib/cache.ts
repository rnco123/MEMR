/**
 * Caching utilities using Next.js unstable_cache
 * For production, consider using Redis or similar
 */

import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Get cached doctors list
 */
export async function getCachedDoctors() {
  return unstable_cache(
    async () => {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('doctors')
        .select('id, user_id, first_name, last_name, email, full_name')
        .eq('active', true)
        .order('last_name', { ascending: true })

      if (error) {
        throw error
      }

      return data || []
    },
    ['doctors'],
    {
      revalidate: 300, // 5 minutes
      tags: ['doctors'],
    }
  )()
}

/**
 * Get cached services list
 */
export async function getCachedServices() {
  return unstable_cache(
    async () => {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('services')
        .select('id, title_en, title_es')
        .order('title_en', { ascending: true })

      if (error) {
        throw error
      }

      return data || []
    },
    ['services'],
    {
      revalidate: 600, // 10 minutes
      tags: ['services'],
    }
  )()
}

/**
 * Get cached locations list
 */
export async function getCachedLocations() {
  return unstable_cache(
    async () => {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('locations')
        .select('id, title, address, location_code, phone, email, opening_hours, google_map_url, is_active')
        .eq('is_active', true)
        .order('title', { ascending: true })

      if (error) {
        throw error
      }

      return data || []
    },
    ['locations'],
    {
      revalidate: 600, // 10 minutes
      tags: ['locations'],
    }
  )()
}

/**
 * Revalidate cache by tag
 */
export async function revalidateCache(tag: string) {
  const { revalidateTag } = await import('next/cache')
  revalidateTag(tag)
}
