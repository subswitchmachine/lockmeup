import { useEffect, useRef } from 'react'
import { STATE_LABELS, type CaptureState } from '../lib/captureConfig'

/** Must match the .camera-view aspect-ratio in App.css (used to size the blur clip). */
const VIEW_ASPECT = 4 / 3

interface CameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** The active camera stream, shared with the blur-overlay video. */
  stream: MediaStream | null
  state: CaptureState
  roiFraction: number
  /** 0..1 settle progress, drives the ring on the framing box. */
  settleProgress: number
  /** Whether the live preview is horizontally flipped. Captures are unaffected. */
  mirrored: boolean
}

/**
 * The live video with a centered framing box and a state badge. The combo is
 * hidden on screen by a second video bound to the same stream, blurred and
 * clipped to the center square — robust against remounts (unlike backdrop-filter
 * over a GPU-composited, mirrored video).
 */
export function CameraView({
  videoRef,
  stream,
  state,
  roiFraction,
  settleProgress,
  mirrored,
}: CameraViewProps) {
  const blurVideoRef = useRef<HTMLVideoElement | null>(null)
  const boxPct = `${roiFraction * 100}%`

  // Share the camera stream with the blur-overlay video.
  useEffect(() => {
    const v = blurVideoRef.current
    if (!v) return
    v.srcObject = stream
    if (stream) v.play().catch(() => {})
    return () => {
      v.srcObject = null
    }
  }, [stream])

  // Clip the blurred overlay to the same centered square as the framing box.
  const vInset = ((1 - roiFraction) / 2) * 100
  const hInset = ((1 - roiFraction / VIEW_ASPECT) / 2) * 100
  const clipPath = `inset(${vInset}% ${hInset}% round 10px)`

  return (
    <div className={`camera-view state-${state}${mirrored ? ' mirrored' : ''}`}>
      <video ref={videoRef} playsInline muted />
      <video ref={blurVideoRef} className="blur-feed" style={{ clipPath }} playsInline muted />
      <div className="frame-box" style={{ height: boxPct }}>
        <div
          className="settle-ring"
          style={{ opacity: state === 'settling' ? 1 : 0, transform: `scale(${0.85 + settleProgress * 0.15})` }}
        />
      </div>
      <div className={`state-badge badge-${state}`}>{STATE_LABELS[state]}</div>
    </div>
  )
}
