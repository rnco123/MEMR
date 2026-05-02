'use client'

import { useEffect, useState } from 'react'

interface LoadingSpinnerProps {
  message?: string
  showPercentage?: boolean
  progress?: number // 0-100, if provided, uses this value instead of simulated
  size?: 'sm' | 'md' | 'lg'
  variant?: 'light' | 'dark' // 'light' (default) for light backgrounds, 'dark' for dark backgrounds
  className?: string
}

export function LoadingSpinner({
  message = 'Loading...',
  showPercentage = true,
  progress,
  size = 'md',
  variant = 'light',
  className = '',
}: LoadingSpinnerProps) {
  const [simulatedProgress, setSimulatedProgress] = useState(0)

  useEffect(() => {
    if (progress !== undefined) {
      setSimulatedProgress(progress)
      return
    }

    const interval = setInterval(() => {
      setSimulatedProgress((prev) => {
        if (prev >= 95) {
          return prev
        }
        const increment = Math.random() * 4 + 1
        return Math.min(prev + increment, 95)
      })
    }, 200)

    return () => clearInterval(interval)
  }, [progress])

  const displayProgress = progress !== undefined ? progress : simulatedProgress
  const sizeClasses = {
    sm: 'w-12 h-12 border-2',
    md: 'w-16 h-16 border-4',
    lg: 'w-20 h-20 border-4',
  }

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl',
  }

  const isDark = variant === 'dark'
  const spinnerColor = isDark ? 'border-blue-500' : 'border-[#2E6EF3]'
  const percentColor = isDark ? 'text-blue-400' : 'text-[#2E6EF3]'
  const messageColor = isDark ? 'text-white/70' : 'text-slate-600'
  const trackColor = isDark ? 'bg-white/10' : 'bg-slate-200'
  const fillColor = isDark
    ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
    : 'bg-[#2E6EF3]'

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <div className="relative">
        <div
          className={`${sizeClasses[size]} ${spinnerColor} border-t-transparent rounded-full animate-spin`}
        ></div>
        {showPercentage && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`${percentColor} font-bold ${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'}`}>
              {Math.round(displayProgress)}%
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className={`${messageColor} ${textSizeClasses[size]}`}>{message}</p>
        {showPercentage && (
          <div className={`w-48 h-1.5 ${trackColor} rounded-full overflow-hidden mt-2`}>
            <div
              className={`h-full ${fillColor} rounded-full transition-all duration-300 ease-out`}
              style={{ width: `${displayProgress}%` }}
            ></div>
          </div>
        )}
      </div>
    </div>
  )
}
