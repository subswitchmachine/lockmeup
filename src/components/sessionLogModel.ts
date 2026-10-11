import type { TaskResult, TaskSpec } from '../lib/tasks'
import { formatRemaining } from '../lib/time'

/**
 * Pure formatting helpers shared by the SessionLog UI. Kept separate from the
 * component so they can be unit-tested without React.
 */

export const KIND_LABEL: Record<TaskResult['kind'], string> = {
  jigsaw: 'Puzzle',
  sliding: 'Sliding puzzle',
  memory: 'Memory',
  typing: 'Typing',
  wait: 'Wait',
  hold: 'Hold still',
  focus: 'Focus',
  sequence: 'Sequence',
  tap: 'Tap',
  steady: 'Steady hand',
}

export function specSummary(spec: TaskSpec): string {
  switch (spec.kind) {
    case 'jigsaw':
      return `${spec.pieces} pieces${spec.rotate ? ' · rotate' : ''}`
    case 'sliding':
      return `${spec.size}×${spec.size}`
    case 'memory':
      return `${spec.imageIds.length} tiles`
    case 'typing': {
      const pen =
        spec.minPenaltyReps === spec.maxPenaltyReps
          ? `${spec.minPenaltyReps}`
          : `${spec.minPenaltyReps}–${spec.maxPenaltyReps}`
      return `${spec.reps} reps · +${pen} reps on mistake`
    }
    case 'sequence':
      return `${spec.imageIds.length} tiles · ${spec.startLength}→${spec.targetLength} steps`
    case 'wait':
      return formatRemaining(spec.durationMs)
    case 'hold':
      return `${formatRemaining(spec.durationMs)} · ${spec.speed} speed · ${spec.size} target`
    case 'focus': {
      const extras = [
        spec.requireFace && 'face required',
        spec.requireTabFocus && 'tab focus required',
      ].filter(Boolean)
      return [formatRemaining(spec.durationMs), spec.sensitivity, ...extras].join(' · ')
    }
    case 'tap':
      return `${formatRemaining(spec.durationMs)} · every ${formatRemaining(spec.intervalMs)}`
    case 'steady':
      return spec.difficulty
  }
}
