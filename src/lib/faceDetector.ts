import type { FaceDetector } from '@mediapipe/tasks-vision'

/**
 * Lazily-loaded MediaPipe face detector, used to confirm a person is actually in
 * front of the camera (presence) for the hold-still task. The WASM runtime and
 * the small BlazeFace model are fetched from a CDN; if either fails to load the
 * caller should fall back gracefully (stillness-only) rather than lock the user
 * out.
 */
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

let detectorPromise: Promise<FaceDetector> | null = null

/** Get the shared face detector (loads it on first call; VIDEO running mode). */
export function getFaceDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      // Dynamic import so the (heavy) vision runtime is code-split into its own
      // chunk, loaded only when a task that needs presence actually runs.
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const vision = await FilesetResolver.forVisionTasks(WASM_URL)
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'VIDEO',
      })
    })().catch((err) => {
      detectorPromise = null // let a later mount retry
      throw err
    })
  }
  return detectorPromise
}
