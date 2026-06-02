/**
 * Preset staff avatars (3 male, 3 female healthcare workers).
 * Files live in storage bucket `staff-avatars` at presets/{id}.svg
 * and ship in public/avatars/ for local fallback before seeding.
 */

export type AvatarGender = 'male' | 'female'

export type StaffAvatar = {
  id: string
  label: string
  gender: AvatarGender
  roleLabel: string
  storagePath: string
  fileName: string
}

export const STAFF_AVATAR_IDS = [
  'hw-male-doctor',
  'hw-male-nurse',
  'hw-male-medic',
  'hw-female-doctor',
  'hw-female-nurse',
  'hw-female-surgeon',
] as const

export type StaffAvatarId = (typeof STAFF_AVATAR_IDS)[number]

export const STAFF_AVATARS: StaffAvatar[] = [
  {
    id: 'hw-male-doctor',
    label: 'Male doctor',
    gender: 'male',
    roleLabel: 'Doctor',
    storagePath: 'presets/hw-male-doctor.svg',
    fileName: 'hw-male-doctor.svg',
  },
  {
    id: 'hw-male-nurse',
    label: 'Male nurse',
    gender: 'male',
    roleLabel: 'Nurse',
    storagePath: 'presets/hw-male-nurse.svg',
    fileName: 'hw-male-nurse.svg',
  },
  {
    id: 'hw-male-medic',
    label: 'Male medic',
    gender: 'male',
    roleLabel: 'Paramedic',
    storagePath: 'presets/hw-male-medic.svg',
    fileName: 'hw-male-medic.svg',
  },
  {
    id: 'hw-female-doctor',
    label: 'Female doctor',
    gender: 'female',
    roleLabel: 'Doctor',
    storagePath: 'presets/hw-female-doctor.svg',
    fileName: 'hw-female-doctor.svg',
  },
  {
    id: 'hw-female-nurse',
    label: 'Female nurse',
    gender: 'female',
    roleLabel: 'Nurse',
    storagePath: 'presets/hw-female-nurse.svg',
    fileName: 'hw-female-nurse.svg',
  },
  {
    id: 'hw-female-surgeon',
    label: 'Female surgeon',
    gender: 'female',
    roleLabel: 'Surgeon',
    storagePath: 'presets/hw-female-surgeon.svg',
    fileName: 'hw-female-surgeon.svg',
  },
]

const avatarById = new Map(STAFF_AVATARS.map((a) => [a.id, a]))

export function isStaffAvatarId(id: string): id is StaffAvatarId {
  return avatarById.has(id)
}

export function getStaffAvatar(id: string | null | undefined): StaffAvatar | null {
  if (!id) return null
  return avatarById.get(id) ?? null
}

export const DEFAULT_STAFF_AVATAR_ID: StaffAvatarId = 'hw-male-doctor'
