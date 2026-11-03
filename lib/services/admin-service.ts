import { z } from 'zod'

/**
 * A service as the admin panel sees it. Mastered in the EMR; mcm-bridge mirrors it
 * into the portal's `services` / `services_es` pair on every write.
 */
export type AdminService = {
  id: number
  title_en: string | null
  title_es: string | null
  description_en: string | null
  description_es: string | null
  image: string | null
  icon: string | null
  slug: string | null
}

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null))

export const serviceCreateSchema = z.object({
  title_en: z.string().trim().min(1).max(200),
  title_es: optionalText(200),
  description_en: optionalText(4000),
  description_es: optionalText(4000),
  image: optionalText(2000),
  icon: optionalText(2000),
  slug: optionalText(200),
})

export const serviceUpdateSchema = z.object({
  title_en: z.string().trim().min(1).max(200).optional(),
  title_es: optionalText(200),
  description_en: optionalText(4000),
  description_es: optionalText(4000),
  image: optionalText(2000),
  icon: optionalText(2000),
  slug: optionalText(200),
})
