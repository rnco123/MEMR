'use client'

import { useEffect, useState } from 'react'

interface LoadingSpinnerProps {
  message?: string
  showPercentage?: boolean
  progress?: number // 0-100, if provided, uses this value instead of simulated
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({
  message = 'Loading...',
  showPercentage = true,
  progress,
  size = 'md',
  className = '',
}: LoadingSpinnerProps) {
  const [simulatedProgress, setSimulatedProgress] = useState(0)

  // Simulate progress if no explicit progress is provided
  useEffect(() => {
    if (progress !== undefined) {
      setSimulatedProgress(progress)
      return
    }

    // Simulate loading progress
    const interval = setInterval(() => {
      setSimulatedProgress((prev) => {
        if (prev >= 95) {
          return prev // Stop at 95% until actual loading completes
        }
        // Increment by random amount between 1-5% with some randomness
        const increment = Math.random() * 4 + 1
        return Math.min(prev + increment, 95)
      })
    }, 200) // Update every 200ms

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

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <div className="relative">
        {/* Spinner */}
        <div
          className={`${sizeClasses[size]} border-blue-500 border-t-transparent rounded-full animate-spin`}
        ></div>
        {/* Percentage overlay on spinner */}
        {showPercentage && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-blue-400 font-bold ${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'}`}>
              {Math.round(displayProgress)}%
            </span>
          </div>
        )}
      </div>
      {/* Message */}
      <div className="flex flex-col items-center gap-1">
        <p className={`text-white/70 ${textSizeClasses[size]}`}>{message}</p>
        {/* Progress bar */}
        {showPercentage && (
          <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${displayProgress}%` }}
            ></div>
          </div>
        )}
      </div>
    </div>
  )
}
