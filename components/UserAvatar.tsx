'use client'

import { resolveStaffAvatarUrl } from '@/lib/avatars/resolve-url'

type UserAvatarProps = {
  name?: string | null
  avatarId?: string | null
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
  ringClassName?: string
}

const SIZES = {
  sm: { box: 'h-8 w-8', text: 'text-xs', img: 32 },
  md: { box: 'h-10 w-10', text: 'text-sm', img: 40 },
  lg: { box: 'h-14 w-14', text: 'text-base', img: 56 },
}

export function UserAvatar({
  name,
  avatarId,
  avatarUrl,
  size = 'md',
  className = '',
  ringClassName = 'ring-2 ring-white',
}: UserAvatarProps) {
  const s = SIZES[size]
  const initial = (name || '?').charAt(0).toUpperCase()
  const src = avatarUrl ?? resolveStaffAvatarUrl(avatarId)

  if (src) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-full bg-slate-100 ${s.box} ${ringClassName} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name ? `${name} avatar` : 'User avatar'}
          width={s.img}
          height={s.img}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#2E6EF3] font-semibold text-white ${s.box} ${s.text} ${ringClassName} ${className}`}
      aria-hidden
    >
      {initial}
    </div>
  )
}
