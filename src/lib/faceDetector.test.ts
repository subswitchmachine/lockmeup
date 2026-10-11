import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Each test gets a fresh module so the singleton state resets.
async function freshModule() {
  vi.resetModules()
  return await import('./faceDetector')
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.doUnmock('@mediapipe/tasks-vision')
})

describe('getFaceDetector', () => {
  it('lazily constructs the detector with the bundled WASM + model URLs', async () => {
    const detector = { id: 'face-detector-instance' }
    const createFromOptions = vi.fn().mockResolvedValue(detector)
    const forVisionTasks = vi.fn().mockResolvedValue({ wasmFileset: true })
    vi.doMock('@mediapipe/tasks-vision', () => ({
      FaceDetector: { createFromOptions },
      FilesetResolver: { forVisionTasks },
    }))

    const m = await freshModule()
    const out = await m.getFaceDetector()
    expect(out).toBe(detector)
    expect(forVisionTasks).toHaveBeenCalledTimes(1)
    expect(forVisionTasks.mock.calls[0][0]).toContain('cdn.jsdelivr.net')
    expect(createFromOptions).toHaveBeenCalledTimes(1)
    expect(createFromOptions.mock.calls[0][1]).toMatchObject({
      runningMode: 'VIDEO',
      baseOptions: { modelAssetPath: expect.stringContaining('blaze_face_short_range') },
    })
  })

  it('returns the same shared instance across calls (singleton)', async () => {
    const detector = { id: 'shared' }
    vi.doMock('@mediapipe/tasks-vision', () => ({
      FaceDetector: { createFromOptions: vi.fn().mockResolvedValue(detector) },
      FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
    }))

    const m = await freshModule()
    const a = m.getFaceDetector()
    const b = m.getFaceDetector()
    expect(a).toBe(b) // same Promise reference, no second init
    expect(await a).toBe(detector)
  })

  it('clears the cached promise after failure so a later call can retry', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ id: 'after-retry' })
    vi.doMock('@mediapipe/tasks-vision', () => ({
      FaceDetector: { createFromOptions: create },
      FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
    }))

    const m = await freshModule()
    await expect(m.getFaceDetector()).rejects.toThrow('network')

    // Calling again retries — must initialise the module a second time.
    const second = await m.getFaceDetector()
    expect(second).toEqual({ id: 'after-retry' })
    expect(create).toHaveBeenCalledTimes(2)
  })
})
