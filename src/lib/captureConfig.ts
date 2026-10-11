/**
 * Tunable parameters for the auto-capture pipeline.
 *
 * All image metrics are computed on a downscaled grayscale analysis frame
 * (see ANALYSIS_WIDTH) over a centered region of interest (the framing box).
 * Thresholds are expressed in the units each metric produces so they can be
 * read straight off the live-metrics overlay while tuning.
 */
export interface CaptureConfig {
  /** Width (px) the video is downscaled to for cheap analysis. Height follows aspect ratio. */
  analysisWidth: number
  /** Side length of the centered ROI as a fraction (0..1) of the smaller analysis dimension. */
  roiFraction: number

  /** Laplacian variance above this counts as "in focus". */
  focusThreshold: number
  /** Mean abs frame-to-frame diff above this counts as "motion". */
  motionThreshold: number
  /** Mean abs frame-to-frame diff below this counts as "still". */
  stillThreshold: number
  /** Mean abs diff from the empty-scene baseline above this counts as "a subject is present". */
  arrivalThreshold: number
  /** Baseline diff below this counts as "scene is empty again" (used to re-arm after a capture). */
  emptyThreshold: number

  /** How long (ms) to sample the empty scene before arming. */
  calibrationMs: number
  /** How long (ms) the subject must stay present + still + sharp before firing. */
  settleMs: number
  /** Minimum time (ms) to stay in cooldown after a capture before re-arming. */
  cooldownMs: number

  /** Frames captured per trigger, for redundancy. */
  burstCount: number
  /** Spacing (ms) between burst frames. */
  burstIntervalMs: number
}

export const DEFAULT_CONFIG: CaptureConfig = {
  analysisWidth: 320,
  roiFraction: 0.6,

  focusThreshold: 700,
  motionThreshold: 16,
  stillThreshold: 10,
  arrivalThreshold: 18,
  emptyThreshold: 10,

  calibrationMs: 1000,
  settleMs: 600,
  cooldownMs: 1500,

  burstCount: 3,
  burstIntervalMs: 400,
}

export type CaptureState =
  | 'idle'
  | 'calibrating'
  | 'waiting'
  | 'settling'
  | 'captured'
  | 'cooldown'

/** Human-readable labels for the state badge. */
export const STATE_LABELS: Record<CaptureState, string> = {
  idle: 'Idle',
  calibrating: 'Calibrating…',
  waiting: 'Waiting for lock',
  settling: 'Hold steady…',
  captured: 'Captured!',
  cooldown: 'Remove lock',
}
