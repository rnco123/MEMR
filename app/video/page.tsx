'use client'

import { useEffect, useRef, useState } from 'react'
import DailyIframe from '@daily-co/daily-js'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { UserRole } from '@/lib/roles'

function VideoPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meetingState, setMeetingState] = useState<string>('not-joined')
  const [roomInfo, setRoomInfo] = useState<any>(null)
  const dailyRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isInitializingRef = useRef(false)
  const isCleaningUpRef = useRef(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirectedFrom=/video')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    // Reset cleanup flag for new mount
    isCleaningUpRef.current = false
    
    // Guard: Prevent multiple initializations (React Strict Mode protection)
    if (isInitializingRef.current || dailyRef.current) {
      return
    }

    isInitializingRef.current = true

    const initializeVideo = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Wait for container to be available
        await new Promise(resolve => setTimeout(resolve, 100))

        if (!containerRef.current) {
          throw new Error('Container element not found')
        }

        // Guard: Check again after async delay (React Strict Mode double-mount protection)
        if (dailyRef.current) {
          console.log('Daily instance already exists, skipping initialization')
          isInitializingRef.current = false
          return
        }

        // Create Daily.co room via API
        const response = await fetch('/api/daily/room', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        })

        if (!response.ok) {
          throw new Error('Failed to create video room')
        }

        const room = await response.json()
        setRoomInfo(room)
        const roomUrl = room.url

        console.log('Room created:', room)
        console.log('Room URL:', roomUrl)

        if (!roomUrl) {
          throw new Error('Room URL not provided in response')
        }

        // Ensure URL is properly formatted
        if (!roomUrl.startsWith('http')) {
          throw new Error(`Invalid room URL format: ${roomUrl}`)
        }

        // Final guard: Check one more time before creating iframe
        if (dailyRef.current) {
          console.log('Daily instance created during async operations, skipping iframe creation')
          isInitializingRef.current = false
          return
        }

        // Create Daily iframe (Daily.co manages the DOM, don't manipulate it directly)
        const daily = DailyIframe.createFrame(containerRef.current!, {
          showLeaveButton: true,
          iframeStyle: {
            position: 'relative',
            width: '100%',
            height: '100%',
            border: '0',
          },
        })

        dailyRef.current = daily

        // Set up event listeners BEFORE joining
        // Use dailyRef.current in closures to ensure we have the latest reference
        daily.on('loaded', () => {
          console.log('Daily iframe loaded')
          // Verify instance still exists
          if (!dailyRef.current || isCleaningUpRef.current) {
            console.warn('Daily instance removed during loaded event')
          }
        })

        daily.on('joined-meeting', () => {
          console.log('Successfully joined meeting')
          // Only update state if instance still exists and not cleaning up
          if (dailyRef.current && !isCleaningUpRef.current) {
            setMeetingState('joined-meeting')
            setIsLoading(false)
          }
        })

        daily.on('left-meeting', () => {
          console.log('Left meeting')
          // Only navigate if not already cleaning up
          if (!isCleaningUpRef.current) {
            setMeetingState('left-meeting')
            window.location.href = '/'
          }
        })

        daily.on('error', (ev: any) => {
          console.error('Daily.co error:', ev)
          // Only set error if not cleaning up
          if (!isCleaningUpRef.current) {
            setError(ev?.errorMsg || ev?.error || 'An error occurred')
            setIsLoading(false)
          }
        })

        daily.on('participant-joined', (ev: any) => {
          console.log('Participant joined:', ev)
        })

        daily.on('participant-left', (ev: any) => {
          console.log('Participant left:', ev)
        })

        // Wait for iframe to be ready
        setMeetingState('joining-meeting')
        
        // Guard: Check if cleanup started or instance is gone
        if (!dailyRef.current || isCleaningUpRef.current) {
          console.log('Daily instance removed before join, aborting')
          isInitializingRef.current = false
          return
        }

        // Wait for iframe to be fully initialized in the DOM
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Guard: Check again after delay
        if (!dailyRef.current || isCleaningUpRef.current) {
          console.log('Daily instance removed during initialization, aborting')
          isInitializingRef.current = false
          return
        }

        // Verify iframe exists in DOM and is ready before joining
        let iframeElement = containerRef.current?.querySelector('iframe')
        if (!iframeElement) {
          console.warn('Iframe not found in DOM, waiting a bit more...')
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Final check
          iframeElement = containerRef.current?.querySelector('iframe')
          if (!iframeElement) {
            throw new Error('Iframe failed to initialize in DOM')
          }
        }

        // Verify iframe has contentWindow (iframe is loaded and ready)
        let retries = 0
        const maxRetries = 10
        while (retries < maxRetries && !iframeElement?.contentWindow) {
          // Check if cleanup started - abort immediately
          if (isCleaningUpRef.current || !dailyRef.current) {
            throw new Error('Cleanup started, aborting join')
          }
          await new Promise(resolve => setTimeout(resolve, 200))
          iframeElement = containerRef.current?.querySelector('iframe')
          retries++
        }

        // Final check before proceeding
        if (isCleaningUpRef.current || !dailyRef.current) {
          throw new Error('Daily instance destroyed before join')
        }

        if (!iframeElement?.contentWindow) {
          throw new Error('Iframe contentWindow not available - iframe may not be fully loaded')
        }

        console.log('Attempting to join room:', roomUrl)
        console.log('Daily object:', dailyRef.current)
        console.log('Container:', containerRef.current)
        console.log('Iframe element:', iframeElement)

        // Load the iframe first (if needed), then join
        try {
          // Final guard before any operations
          if (!dailyRef.current || isCleaningUpRef.current) {
            throw new Error('Daily instance was destroyed before join')
          }

          // Some versions require load() before join()
          if (typeof dailyRef.current.load === 'function') {
            console.log('Loading Daily iframe...')
            await dailyRef.current.load({ url: roomUrl })
            console.log('Iframe loaded')
            
            // Guard after load
            if (!dailyRef.current || isCleaningUpRef.current) {
              throw new Error('Daily instance was destroyed after load')
            }
          }

          // Final guard before join
          if (!dailyRef.current || isCleaningUpRef.current) {
            throw new Error('Daily instance was destroyed before join')
          }

          // Join the room
          console.log('Joining room...')
          const joinResult = await dailyRef.current.join({
            url: roomUrl,
            showLeaveButton: true,
            userName: 'User',
          })
          console.log('Join result:', joinResult)
        } catch (joinError) {
          console.error('Join error details:', joinError)
          const errorMessage = joinError instanceof Error ? joinError.message : 'Unknown error'
          console.error('Join failed:', errorMessage)
          
          // Try to get more error details (only if instance still exists)
          if (dailyRef.current && !isCleaningUpRef.current) {
            try {
              const meetingState = dailyRef.current.meetingState()
              console.log('Meeting state after failed join:', meetingState)
            } catch (e) {
              console.error('Could not get meeting state:', e)
            }
          }
          
          setError(`Failed to join room: ${errorMessage}. Please check browser console for details.`)
          setIsLoading(false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize video')
        setIsLoading(false)
      } finally {
        isInitializingRef.current = false
      }
    }

    initializeVideo()

    return () => {
      // Prevent double cleanup (React Strict Mode protection)
      if (isCleaningUpRef.current) {
        return
      }
      
      isCleaningUpRef.current = true
      
      // Cleanup: Destroy existing Daily iframe instance
      if (dailyRef.current) {
        const daily = dailyRef.current
        // Clear ref immediately to prevent re-use
        dailyRef.current = null
        isInitializingRef.current = false
        
        try {
          // Leave the meeting first (async, don't wait)
          if (typeof daily.leave === 'function') {
            daily.leave().catch(() => {
              // Silently ignore - component is unmounting
            })
          }
          // Destroy the iframe (this removes it from DOM)
          // Wrap in try-catch to handle cases where DOM is already modified
          if (typeof daily.destroy === 'function') {
            try {
              daily.destroy()
            } catch (destroyError) {
              // Ignore DOM errors - node might already be removed by React
              // This prevents "removeChild" errors
            }
          }
        } catch (err) {
          // Silently ignore all errors during cleanup - component is unmounting
        }
      } else {
        isInitializingRef.current = false
      }
    }
  }, [])

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <LoadingSpinner message="Loading..." />
      </div>
    )
  }

  if (!user) {
    return null // Will redirect via useEffect
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="text-red-500 mb-4">Error: {error}</div>
        <button
          onClick={() => window.location.href = '/'}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go Back
        </button>
      </div>
    )
  }

  const handleLeave = () => {
    if (dailyRef.current) {
      dailyRef.current.leave()
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="bg-gray-800 text-white px-4 py-2 flex justify-between items-center flex-shrink-0">
        <h1 className="text-lg font-bold">MyclinicMD Video Call</h1>
        <div className="flex items-center gap-4">
          {meetingState === 'joined-meeting' && (
            <span className="text-sm text-green-400">● Connected</span>
          )}
          {meetingState === 'joining-meeting' && (
            <span className="text-sm text-yellow-400">● Connecting...</span>
          )}
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Leave Call
          </button>
        </div>
      </div>
      <div 
        ref={containerRef} 
        className="flex-1 w-full h-full relative"
      >
        {isLoading && meetingState !== 'joined-meeting' && (
          <div className="flex flex-col items-center justify-center h-full absolute inset-0 bg-black z-10">
            <LoadingSpinner message="Loading video call..." />
            {roomInfo && (
              <div className="text-sm text-gray-400 text-center max-w-md">
                <p>Room: {roomInfo.name}</p>
                <p className="text-xs mt-2 break-all">URL: {roomInfo.url}</p>
                <p className="text-xs mt-1">State: {meetingState}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Protect video page - only doctors and nurses can access
// Protect video page - only doctors can access
export default withRoleProtection(VideoPage, {
  allowedRoles: [UserRole.DOCTOR],
  redirectTo: '/dashboard',
})