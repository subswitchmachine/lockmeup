import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'error'

// `focusMode` is a real MediaStreamTrack constraint but isn't in the standard
// DOM lib types yet, so we extend the types locally.
interface FocusCapabilities {
  focusMode?: string[]
}
interface FocusConstraintSet extends MediaTrackConstraintSet {
  focusMode?: 'continuous' | 'single-shot' | 'manual'
}

/**
 * Best-effort: ask the camera for continuous autofocus so the lock stays sharp
 * as it's moved into frame. Many desktop webcams don't expose focusMode — in
 * that case this is a no-op and the device keeps its default behaviour.
 */
async function enableContinuousFocus(track: MediaStreamTrack | undefined): Promise<boolean> {
  if (!track?.getCapabilities) return false
  try {
    const caps = track.getCapabilities() as MediaTrackCapabilities & FocusCapabilities
    if (caps.focusMode?.includes('continuous')) {
      await track.applyConstraints({
        advanced: [{ focusMode: 'continuous' } as FocusConstraintSet],
      })
      return true
    }
  } catch {
    // Unsupported / rejected constraint — ignore and keep default focus.
  }
  return false
}

export interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: CameraStatus
  error: string | null
  /** Whether continuous autofocus was successfully enabled on the active camera. */
  continuousFocus: boolean
  /**
   * The resolved facing mode of the active track, when the browser exposes it.
   * Desktop webcams typically report nothing, so `null` should be treated as
   * "probably user-facing" for mirroring purposes.
   */
  resolvedFacingMode: 'user' | 'environment' | 'left' | 'right' | null
  /** The active stream, so other video elements (e.g. the blur overlay) can share it. */
  stream: MediaStream | null
  /** Start (or restart) the camera. Safe to call repeatedly. */
  start: () => void
  /** Stop all tracks and release the camera. */
  stop: () => void
}

export interface UseCameraOptions {
  /** Preferred camera. `environment` = rear (default), `user` = front/selfie. */
  facingMode?: 'environment' | 'user'
}

/**
 * Manages a getUserMedia stream bound to a <video> element. Defaults to the
 * rear/environment camera (best for pointing at a lock); pass `facingMode:
 * 'user'` for selfie-facing tasks. Either way it's an `ideal` constraint, so
 * devices with only one camera still work.
 *
 * Requires a secure context (https or localhost) — getUserMedia is otherwise
 * unavailable.
 */
export function useCamera(options: UseCameraOptions = {}): UseCameraResult {
  const facingMode = options.facingMode ?? 'environment'
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [continuousFocus, setContinuousFocus] = useState(false)
  const [resolvedFacingMode, setResolvedFacingMode] = useState<UseCameraResult['resolvedFacingMode']>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStream(null)
    setContinuousFocus(false)
    setResolvedFacingMode(null)
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('Camera API unavailable. Use a secure context (https or localhost).')
      return
    }
    setStatus('requesting')
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      })
      streamRef.current = stream
      setStream(stream)
      const track = stream.getVideoTracks()[0]
      const settings = track?.getSettings?.() as MediaTrackSettings & { facingMode?: string } | undefined
      const fm = settings?.facingMode
      setResolvedFacingMode(
        fm === 'user' || fm === 'environment' || fm === 'left' || fm === 'right' ? fm : null,
      )
      setContinuousFocus(await enableContinuousFocus(track))
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => {
          /* autoplay can reject silently; metadata still loads */
        })
      }
      setStatus('ready')
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStatus('denied')
        setError('Camera permission was denied. Allow access and try again.')
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setStatus('error')
        setError('No camera found on this device.')
      } else {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to start the camera.')
      }
    }
  }, [facingMode])

  // Release the camera on unmount.
  useEffect(() => stop, [stop])

  return { videoRef, status, error, continuousFocus, resolvedFacingMode, stream, start, stop }
}
