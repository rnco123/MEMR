'use client'

import Image from 'next/image'
import Link from 'next/link'

const sizeMap = {
  sm: 'h-9 w-9',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
} as const

type BrandMarkProps = {
  href?: string
  size?: keyof typeof sizeMap
  className?: string
  theme?: 'blue' | 'purple'
}

/** Compact circular clinic mark for sidebar rail and collapsed states. */
export function BrandMark({ href, size = 'md', className = '', theme = 'blue' }: BrandMarkProps) {
  const ring =
    theme === 'purple'
      ? 'ring-2 ring-purple-100 border-purple-100'
      : 'ring-2 ring-slate-100 border-slate-200'

  const inner = (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white shadow-md ${ring} ${sizeMap[size]} ${className}`}
    >
      <Image
        src="/myclinic-md-logo.png"
        alt="MyClinic MD"
        width={44}
        height={44}
        className="h-[130%] w-[130%] max-w-none object-cover object-left"
      />
    </span>
  )

  if (href) {
    return (
      <Link href={href} className="inline-flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]">
        {inner}
      </Link>
    )
  }

  return inner
}
