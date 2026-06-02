'use client'

import Image from 'next/image'

export type BrandLogoVariant = 'header' | 'hero' | 'inline'

interface BrandLogoProps {
  variant?: BrandLogoVariant
  className?: string
}

/** MyClinic MD wordmark (black on white panel) — use on dark UI backgrounds. */
export function BrandLogo({ variant = 'header', className = '' }: BrandLogoProps) {
  const heightClass =
    variant === 'hero' ? 'h-14 sm:h-16 md:h-20' : variant === 'inline' ? 'h-8 sm:h-9' : 'h-9 sm:h-10'
  const paddingClass = variant === 'hero' ? 'px-3 py-2.5' : 'px-2 py-1.5'
  const roundedClass = variant === 'hero' ? 'rounded-2xl' : 'rounded-xl'

  return (
    <div
      className={`inline-flex shrink-0 bg-white shadow-md ${paddingClass} ${roundedClass} ${className}`}
    >
      <Image
        src="/myclinic-md-logo.png"
        alt="MyClinic MD"
        width={360}
        height={90}
        className={`${heightClass} w-auto max-w-[min(90vw,320px)] object-contain object-left`}
        priority={variant === 'header' || variant === 'hero'}
      />
    </div>
  )
}
