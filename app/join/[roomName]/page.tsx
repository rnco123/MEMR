'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
} from 'livekit-client'
import { useParams, useSearchParams } from 'next/navigation'

/**
 * Public, unauthenticated patient join page. Patients never log into MEMR — the
 * LiveKit join URL + a room-scoped VonLinkage token ride entirely in the link
 * (mirroring the trust model Daily's hosted room URL used to provide). Staff
 * generate and share this link from the /video screen.
 */
function JoinRoomPage() {
  const params = useParams<{ roomName: string }>()
  const searchParams = useSearchParams()
  const joinUrl = searchParams.get('url')
  const token = searchParams.get('t')

  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  const roomRef = useRef<Room | null>(null)
  const remoteContainerRef = useRef<HTMLDivElement | null>(null)
  const localContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect().catch(() => {})
    }
  }, [])

  const join = useCallback(async () => {
    if (!joinUrl || !token) {
      setError('This join link is invalid or missing its access token.')
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const room = new Room()
      roomRef.current = room

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _pub: unknown, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
            const el = track.attach()
            el.dataset.participant = participant.identity
            if (el instanceof HTMLVideoElement) el.playsInline = true
            remoteContainerRef.current?.appendChild(el)
            el.play().catch(() => {})
          }
        }
      )
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el: HTMLMediaElement) => el.remove())
      })
      room.on(RoomEvent.Disconnected, () => {
        setConnected(false)
        setEnded(true)
      })

      await room.connect(joinUrl, token)
      await room.localParticipant.setCameraEnabled(true)
      await room.localParticipant.setMicrophoneEnabled(true)

      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (camPub?.track && localContainerRef.current) {
        const el = camPub.track.attach()
        el.muted = true
        if (el instanceof HTMLVideoElement) el.playsInline = true
        localContainerRef.current.appendChild(el)
        el.play().catch(() => {})
      }

      setMicOn(true)
      setCamOn(true)
      setConnected(true)
    } catch (e) {
      console.error('Patient join failed:', e)
      setError(e instanceof Error ? e.message : 'Could not join the call. Please try again.')
      await roomRef.current?.disconnect().catch(() => {})
      roomRef.current = null
    } finally {
      setConnecting(false)
    }
  }, [joinUrl, token])

  const leave = useCallback(async () => {
    await roomRef.current?.disconnect().catch(() => {})
    roomRef.current = null
    setConnected(false)
    setEnded(true)
  }, [])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !micOn
    await room.localParticipant.setMicrophoneEnabled(next).catch(() => {})
    setMicOn(next)
  }, [micOn])

  const toggleCam = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !camOn
    await room.localParticipant.setCameraEnabled(next).catch(() => {})
    const container = localContainerRef.current
    if (container) {
      container.replaceChildren()
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (next && pub?.track) {
        const el = pub.track.attach()
        el.muted = true
        if (el instanceof HTMLVideoElement) el.playsInline = true
        container.appendChild(el)
        el.play().catch(() => {})
      }
    }
    setCamOn(next)
  }, [camOn])

  if (ended) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0b1220] p-6 text-center text-white">
        <p className="text-lg font-medium">You have left the call.</p>
        <p className="mt-1 text-sm text-slate-400">You can close this window now.</p>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0b1220] p-6 text-center text-white">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-[#8ab4ff]">MyClinicMD</p>
          <h1 className="mt-1 text-xl font-semibold">Join your video visit</h1>
          <p className="mt-1 text-sm text-slate-400">Room: {params.roomName}</p>
          {error && (
            <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
          )}
          <button
            type="button"
            onClick={() => void join()}
            disabled={connecting || !joinUrl || !token}
            className="mt-5 w-full rounded-lg bg-[#2E6EF3] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#256ae8] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {connecting ? 'Joining…' : 'Join call'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#0b1220]">
      <div
        ref={remoteContainerRef}
        className="absolute inset-0 grid grid-cols-1 place-items-center gap-1 [&>video]:h-full [&>video]:w-full [&>video]:object-cover [&>audio]:hidden"
      />
      <div
        ref={localContainerRef}
        className="absolute bottom-24 right-3 z-10 h-28 w-20 overflow-hidden rounded-xl border border-white/20 bg-slate-800 shadow-lg sm:h-36 sm:w-24 [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 rounded-full bg-slate-900/80 px-4 py-2.5 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => void toggleMic()}
            aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${micOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white hover:bg-red-600'}`}
          >
            {micOn ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M9 9v3.75a3 3 0 004.6 2.54M15 9V4.5a3 3 0 00-5.94-.6M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5" /></svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => void toggleCam()}
            aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${camOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white hover:bg-red-600'}`}
          >
            {camOn ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 10.5l4.72-2.36A.75.75 0 0121.5 8.8v6.4a.75.75 0 01-1.03.65L15.75 13.5m-9-9h6.75a1.5 1.5 0 011.5 1.5v8.25a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 011.5-1.5z" /></svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M15.75 10.5l4.72-2.36A.75.75 0 0121.5 8.8v6.4a.75.75 0 01-.53.71M6.75 4.5H12a1.5 1.5 0 011.5 1.5v.75M5.25 6c-.414 0-.75.336-.75.75v8.25a1.5 1.5 0 001.5 1.5h6.75" /></svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => void leave()}
            aria-label="Leave call"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.077a1 1 0 00-1.11.717l-1.08 3.247a11.042 11.042 0 01-5.516-5.517l3.247-1.08a1 1 0 00.717-1.11l-1.077-4.493A1 1 0 0017 8.72V5a2 2 0 00-2-2H5z" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default JoinRoomPage
