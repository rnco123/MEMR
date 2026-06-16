'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { loadVerifyingAccessAnimation } from '@/lib/lottie/verifying-access'

const Lottie = dynamic(() => import('lottie-react'), { ssr: false })

interface LoadingSpinnerProps {
  message?: string
  showPercentage?: boolean
  progress?: number
  size?: 'xs' | 'sm' | 'md' | 'lg'
  variant?: 'light' | 'dark'
  /** Inline row layout for toolbars/buttons — hides percentage */
  compact?: boolean
  className?: string
}

const lottieSizeClasses = {
  xs: 'h-6 w-6',
  sm: 'h-10 w-10',
  md: 'h-[5.5rem] w-[5.5rem]',
  lg: 'h-24 w-24',
}

const percentSizeClasses = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-lg',
  lg: 'text-xl',
}

const messageSizeClasses = {
  xs: 'text-xs',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}

function LottieAnimation({
  animationData,
  size,
  placeholderColor,
}: {
  animationData: object | null
  size: keyof typeof lottieSizeClasses
  placeholderColor: string
}) {
  if (animationData) {
    return (
      <Lottie
        animationData={animationData}
        loop
        className={lottieSizeClasses[size]}
        aria-hidden
      />
    )
  }

  return (
    <div
      className={`${lottieSizeClasses[size]} animate-pulse rounded-xl ${placeholderColor}`}
      aria-hidden
    />
  )
}

export function LoadingSpinner({
  message = 'Loading...',
  showPercentage = true,
  progress,
  size = 'md',
  variant = 'light',
  compact = false,
  className = '',
}: LoadingSpinnerProps) {
  const [animationData, setAnimationData] = useState<object | null>(null)
  const [simulatedProgress, setSimulatedProgress] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadVerifyingAccessAnimation().then((data) => {
      if (!cancelled && data) setAnimationData(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (progress !== undefined) {
      setSimulatedProgress(progress)
      return
    }

    const interval = setInterval(() => {
      setSimulatedProgress((prev) => {
        if (prev >= 95) return prev
        return Math.min(prev + Math.random() * 3 + 1, 95)
      })
    }, 220)

    return () => clearInterval(interval)
  }, [progress])

  const displayProgress = Math.round(progress !== undefined ? progress : simulatedProgress)
  const isDark = variant === 'dark'
  const percentColor = isDark ? 'text-blue-400' : 'text-[#2E6EF3]'
  const messageColor = isDark ? 'text-white/70' : 'text-slate-500'
  const placeholderColor = isDark ? 'bg-white/10' : 'bg-blue-100'

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <LottieAnimation
          animationData={animationData}
          size={size}
          placeholderColor={placeholderColor}
        />
        {message ? (
          <span className={`${messageColor} ${messageSizeClasses[size]}`}>{message}</span>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <div className={`relative flex items-center justify-center ${lottieSizeClasses[size]}`}>
        <LottieAnimation
          animationData={animationData}
          size={size}
          placeholderColor={placeholderColor}
        />
      </div>

      {showPercentage && (
        <p
          className={`mt-1 font-semibold tabular-nums tracking-tight ${percentColor} ${percentSizeClasses[size]}`}
          aria-live="polite"
        >
          {displayProgress}%
        </p>
      )}

      {message ? (
        <p className={`mt-2 ${messageColor} ${messageSizeClasses[size]}`}>{message}</p>
      ) : null}
    </div>
  )
}

/** @deprecated Use LoadingSpinner */
export const VerifyingAccessLoader = LoadingSpinner
