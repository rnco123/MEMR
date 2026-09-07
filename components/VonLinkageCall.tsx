'use client'

/**
 * Themed LiveKit call surface for VonLinkage telemedicine.
 *
 * Daily gave us a complete prebuilt UI in an iframe; LiveKit has no iframe
 * equivalent. `<VideoConference />` from `@livekit/components-react` is the
 * closest prebuilt option, but it would not match the MEMR frame, so the
 * surface is composed here from LiveKit's primitives against the same palette
 * the Daily theme used.
 *
 * This component owns the call surface only — the page around it keeps the
 * pre-visit summary, SOAP notes and connection modal.
 *
 * NOTE: it never sees the VonLinkage API key. It receives a join token minted
 * server-side, scoped to one room, one identity and one role.
 */

import { useCallback } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
  useLocalParticipant,
  useConnectionState,
  useParticipants,
  isTrackReference,
} from '@livekit/components-react'
import { ConnectionState, Track, type Participant } from 'livekit-client'

/** Same palette as the Daily theme it replaces, so the call stays on-brand. */
const THEME = {
  accent: '#2E6EF3',
  accentText: '#FFFFFF',
  mainAreaBg: '#EEF4FF',
  tileBg: '#DCE8FD',
  baseText: '#1e293b',
  supportiveText: '#64748b',
  border: '#e2e8f0',
  danger: '#dc2626',
} as const

export type VonLinkageCallProps = {
  /** Join token minted by the server, scoped to one room/identity/role. */
  token: string
  /** Realtime URL — comes from the room, not the token response. */
  serverUrl: string
  /** Called once the local participant is connected. */
  onConnected?: () => void
  /** Called when the room disconnects, for any reason. */
  onDisconnected?: () => void
  /** Called when the clinician presses Leave. */
  onLeave?: () => void
  onError?: (error: Error) => void
}

export default function VonLinkageCall({
  token,
  serverUrl,
  onConnected,
  onDisconnected,
  onLeave,
  onError,
}: VonLinkageCallProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      // Start muted, matching the Daily room's start_audio_off/start_video_off:
      // a clinician should choose when they are seen and heard.
      video={false}
      audio={false}
      onConnected={onConnected}
      onDisconnected={onDisconnected}
      onError={onError}
      style={{ height: '100%', width: '100%', backgroundColor: THEME.mainAreaBg }}
    >
      <CallSurface onLeave={onLeave} />
      {/* Plays every remote audio track; without this the call is silent. */}
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

function CallSurface({ onLeave }: { onLeave?: () => void }) {
  const connectionState = useConnectionState()
  const participants = useParticipants()

  // Camera and screen share, local and remote. Screen share is placed first so
  // a shared document takes the large tile.
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false }
  )

  const isReconnecting = connectionState === ConnectionState.Reconnecting

  return (
    <div className="relative flex h-full w-full flex-col" style={{ backgroundColor: THEME.mainAreaBg }}>
      {isReconnecting && (
        <div
          className="absolute inset-x-0 top-0 z-30 px-3 py-2 text-center text-sm font-medium"
          style={{ backgroundColor: THEME.accent, color: THEME.accentText }}
          role="status"
        >
          Reconnecting…
        </div>
      )}

      <div className="min-h-0 flex-1 p-2 sm:p-3">
        {tracks.length === 0 ? (
          <WaitingForOthers participantCount={participants.length} />
        ) : (
          <div
            className={`grid h-full w-full gap-2 ${
              tracks.length === 1
                ? 'grid-cols-1'
                : tracks.length <= 4
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {tracks.map((trackRef) => (
              <ParticipantTile
                key={`${trackRef.participant.identity}:${trackRef.source}`}
                trackRef={trackRef}
              />
            ))}
          </div>
        )}
      </div>

      <ControlBar onLeave={onLeave} />
    </div>
  )
}

function WaitingForOthers({ participantCount }: { participantCount: number }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-base sm:text-lg" style={{ color: THEME.baseText }}>
        {participantCount > 1 ? 'Connecting video…' : 'Waiting for the patient to join…'}
      </p>
      <p className="text-sm" style={{ color: THEME.supportiveText }}>
        They will appear here as soon as they connect.
      </p>
    </div>
  )
}

type TrackRef = ReturnType<typeof useTracks>[number]

function ParticipantTile({ trackRef }: { trackRef: TrackRef }) {
  const { participant, publication, source } = trackRef
  const isMuted = publication?.isMuted ?? true
  const label = participant.name || participant.identity

  return (
    <div
      className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-xl border"
      style={{ backgroundColor: THEME.tileBg, borderColor: THEME.border }}
    >
      {/* The guard is inline so it narrows away the placeholder case, which
          carries no publication and must not reach <VideoTrack>. */}
      {isTrackReference(trackRef) && Boolean(publication?.track) && !isMuted ? (
        <VideoTrack trackRef={trackRef} className="h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold"
            style={{ backgroundColor: THEME.accent, color: THEME.accentText }}
            aria-hidden="true"
          >
            {initialsOf(label)}
          </div>
          <span className="text-sm" style={{ color: THEME.supportiveText }}>
            Camera off
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/55 to-transparent px-3 py-2">
        <span className="truncate text-sm font-medium text-white">
          {label}
          {source === Track.Source.ScreenShare ? ' — screen' : ''}
        </span>
        {source === Track.Source.Camera && <MicIndicator participant={participant} />}
      </div>
    </div>
  )
}

function MicIndicator({ participant }: { participant: Participant }) {
  // The camera publication says nothing about the microphone — the participant
  // is the only thing that knows whether they are muted.
  if (participant.isMicrophoneEnabled) return null
  return (
    <svg className="h-4 w-4 shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Muted">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l4-4m0 4l-4-4" />
    </svg>
  )
}

function ControlBar({ onLeave }: { onLeave?: () => void }) {
  const { localParticipant } = useLocalParticipant()

  const micEnabled = localParticipant?.isMicrophoneEnabled ?? false
  const cameraEnabled = localParticipant?.isCameraEnabled ?? false
  const screenShareEnabled = localParticipant?.isScreenShareEnabled ?? false

  const toggleMic = useCallback(() => {
    void localParticipant?.setMicrophoneEnabled(!micEnabled)
  }, [localParticipant, micEnabled])

  const toggleCamera = useCallback(() => {
    void localParticipant?.setCameraEnabled(!cameraEnabled)
  }, [localParticipant, cameraEnabled])

  const toggleScreenShare = useCallback(() => {
    void localParticipant?.setScreenShareEnabled(!screenShareEnabled)
  }, [localParticipant, screenShareEnabled])

  return (
    <div className="flex shrink-0 items-center justify-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:gap-3">
      <ControlButton
        active={micEnabled}
        onClick={toggleMic}
        label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {micEnabled ? <MicOnIcon /> : <MicOffIcon />}
      </ControlButton>

      <ControlButton
        active={cameraEnabled}
        onClick={toggleCamera}
        label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
      >
        {cameraEnabled ? <CameraOnIcon /> : <CameraOffIcon />}
      </ControlButton>

      <ControlButton
        active={screenShareEnabled}
        onClick={toggleScreenShare}
        label={screenShareEnabled ? 'Stop sharing screen' : 'Share screen'}
        className="hidden sm:inline-flex"
      >
        <ScreenShareIcon />
      </ControlButton>

      <button
        type="button"
        onClick={onLeave}
        aria-label="Leave call"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ backgroundColor: THEME.danger }}
      >
        Leave
      </button>
    </div>
  )
}

function ControlButton({
  active,
  onClick,
  label,
  children,
  className = '',
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`}
      style={{
        backgroundColor: active ? THEME.accent : '#FFFFFF',
        color: active ? THEME.accentText : THEME.baseText,
        borderColor: active ? THEME.accent : THEME.border,
      }}
    >
      {children}
    </button>
  )
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/* Icons kept inline to match the page's existing inline-SVG style. */

function MicOnIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0M12 19v3m0-18a3 3 0 013 3v6a3 3 0 11-6 0V7a3 3 0 013-3z" />
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-11.3 5.5M12 19v3M9 9V7a3 3 0 015.2-2M3 3l18 18" />
    </svg>
  )
}

function CameraOnIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function CameraOffIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 3l18 18M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H8" />
    </svg>
  )
}

function ScreenShareIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}
