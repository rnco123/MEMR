import { getStaffAvatar, type StaffAvatar } from '@/lib/avatars/catalog'

const BUCKET = 'staff-avatars'

/** Public URL for a preset avatar in Supabase Storage (after seed). */
export function getStaffAvatarStorageUrl(avatar: StaffAvatar): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) return null
  return `${base}/storage/v1/object/public/${BUCKET}/${avatar.storagePath}`
}

/** Local fallback (public/avatars) when bucket not seeded yet. */
export function getStaffAvatarLocalUrl(avatar: StaffAvatar): string {
  return `/avatars/${avatar.fileName}`
}

/**
 * URL for picker / profile display.
 * Uses bundled files in public/avatars unless storage seeding is enabled.
 */
export function resolveStaffAvatarUrl(avatarId: string | null | undefined): string | null {
  const avatar = getStaffAvatar(avatarId)
  if (!avatar) return null
  return getStaffAvatarCatalogUrl(avatar)
}

/** Catalog list + profile avatars — local files work without Supabase seed. */
export function getStaffAvatarCatalogUrl(avatar: StaffAvatar): string {
  if (process.env.NEXT_PUBLIC_STAFF_AVATARS_USE_STORAGE === 'true') {
    return getStaffAvatarStorageUrl(avatar) ?? getStaffAvatarLocalUrl(avatar)
  }
  return getStaffAvatarLocalUrl(avatar)
}
