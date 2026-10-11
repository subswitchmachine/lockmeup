// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCamera } from './useCamera'

// Build a fake MediaStream + track that records constraint applications.
function makeTrack(opts: {
  facingMode?: string
  capabilities?: { focusMode?: string[] }
  applyShouldThrow?: boolean
} = {}) {
  const applyConstraints = vi.fn(async () => {
    if (opts.applyShouldThrow) throw new Error('rejected')
  })
  const track = {
    stop: vi.fn(),
    getSettings: () => (opts.facingMode ? { facingMode: opts.facingMode } : {}),
    getCapabilities: () => opts.capabilities ?? {},
    applyConstraints,
  }
  return track as unknown as MediaStreamTrack & { applyConstraints: typeof applyConstraints }
}

function makeStream(track: MediaStreamTrack) {
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
}

beforeEach(() => {
  // Default: clear navigator.mediaDevices so individual tests can configure it.
  ;(globalThis.navigator as unknown as { mediaDevices?: unknown }).mediaDevices = undefined
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCamera', () => {
  it('reports an error when the Camera API is unavailable', async () => {
    const { result } = renderHook(() => useCamera())
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toMatch(/secure context/i)
  })

  it('transitions to ready and exposes the stream + facingMode', async () => {
    const track = makeTrack({ facingMode: 'user' })
    const stream = makeStream(track)
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    ;(navigator as unknown as { mediaDevices: { getUserMedia: typeof getUserMedia } }).mediaDevices = {
      getUserMedia,
    }

    const { result } = renderHook(() => useCamera({ facingMode: 'user' }))
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.stream).toBe(stream)
    expect(result.current.resolvedFacingMode).toBe('user')
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'user' } },
      audio: false,
    })
  })

  it('applies continuous-focus constraints when the device supports it', async () => {
    const track = makeTrack({ capabilities: { focusMode: ['continuous', 'manual'] } })
    ;(navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(makeStream(track)),
    }
    const { result } = renderHook(() => useCamera())
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.continuousFocus).toBe(true)
    expect((track as unknown as { applyConstraints: ReturnType<typeof vi.fn> }).applyConstraints)
      .toHaveBeenCalled()
  })

  it('reports continuousFocus=false when the device omits focusMode', async () => {
    const track = makeTrack({ capabilities: {} })
    ;(navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(makeStream(track)),
    }
    const { result } = renderHook(() => useCamera())
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.continuousFocus).toBe(false)
  })

  it('reports continuousFocus=false when applyConstraints rejects', async () => {
    const track = makeTrack({
      capabilities: { focusMode: ['continuous'] },
      applyShouldThrow: true,
    })
    ;(navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(makeStream(track)),
    }
    const { result } = renderHook(() => useCamera())
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.continuousFocus).toBe(false)
  })

  it('classifies NotAllowedError as denied with a permission message', async () => {
    const err = new DOMException('blocked', 'NotAllowedError')
    ;(navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
      getUserMedia: vi.fn().mockRejectedValue(err),
    }
    const { result } = renderHook(() => useCamera())
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.status).toBe('denied')
    expect(result.current.error).toMatch(/permission/i)
  })

  it('classifies NotFoundError as error with a "no camera" message', async () => {
    const err = new DOMException('none', 'NotFoundError')
    ;(navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
      getUserMedia: vi.fn().mockRejectedValue(err),
    }
    const { result } = renderHook(() => useCamera())
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toMatch(/no camera/i)
  })

  it('falls back to a generic error message for unknown failure types', async () => {
    ;(navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
      getUserMedia: vi.fn().mockRejectedValue(new Error('weird')),
    }
    const { result } = renderHook(() => useCamera())
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('weird')
  })

  it('stop() releases tracks and resets state', async () => {
    const track = makeTrack({ facingMode: 'user' })
    ;(navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(makeStream(track)),
    }
    const { result } = renderHook(() => useCamera())
    await act(async () => {
      await result.current.start()
    })
    act(() => {
      result.current.stop()
    })
    expect((track as unknown as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(result.current.stream).toBeNull()
    expect(result.current.continuousFocus).toBe(false)
  })

  it('unmount releases the camera', async () => {
    const track = makeTrack({ facingMode: 'user' })
    ;(navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(makeStream(track)),
    }
    const { result, unmount } = renderHook(() => useCamera())
    await act(async () => {
      await result.current.start()
    })
    unmount()
    expect((track as unknown as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalled()
  })
})
