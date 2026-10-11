import {
  newDraft,
  newFlowId,
  penaltyLabel,
  type FlowChild,
  type FlowItem,
  type HideMode,
  type TaskDraft,
} from '../lib/tasks'

/**
 * Pure flow-design model helpers shared by the FlowBuilder UI: task-kind labels,
 * the factory functions for new flow items, and the read-only summary strings.
 * No React here — just data shaping over the `tasks.ts` draft types.
 */

export type TaskKind = TaskDraft['kind']

export const KIND_LABEL: Record<TaskKind, string> = {
  jigsaw: '🧩 Puzzle',
  sliding: '🔢 Sliding',
  memory: '🃏 Memory',
  typing: '⌨ Typing',
  wait: '⏱ Wait',
  hold: '✊ Hold',
  focus: '🧘 Hold still',
  tap: '👆 Tap',
  sequence: '🧠 Sequence',
  steady: '✋ Steady hand',
}

export const newTaskChild = (kind: TaskKind): FlowChild => ({
  id: newFlowId(),
  type: 'task',
  task: newDraft(kind),
})
export const newPoolChild = (): FlowChild => ({
  id: newFlowId(),
  type: 'pool',
  tasks: [{ id: newFlowId(), task: newDraft('jigsaw') }],
})
export const newLoop = (): FlowItem => ({
  id: newFlowId(),
  type: 'loop',
  random: false,
  minRepeat: 2,
  maxRepeat: 2,
  children: [newTaskChild('jigsaw')],
})

/** A short summary of a draft for the click-to-edit row. */
export function summarize(d: TaskDraft): string {
  const rng = (mn: number, mx: number, unit: string) =>
    mn === mx ? `${mn} ${unit}` : `${mn}–${mx} ${unit}`
  switch (d.kind) {
    case 'jigsaw':
      return rng(d.minPieces, d.maxPieces, 'pieces') + (d.rotate ? ' · rotate' : '')
    case 'sliding':
      return rng(d.minSize, d.maxSize, 'tiles/side')
    case 'memory':
      return rng(d.minPairs, d.maxPairs, 'pairs')
    case 'typing': {
      const linePreview = d.line.length > 24 ? d.line.slice(0, 24) + '…' : d.line || '(no line set)'
      return `"${linePreview}" × ${rng(d.minReps, d.maxReps, 'reps')}`
    }
    case 'wait':
      return rng(d.minAmount, d.maxAmount, d.unit)
    case 'hold':
      return (
        rng(d.minAmount, d.maxAmount, d.unit) +
        (d.punishment.mode === 'penalty' ? ` · −${penaltyLabel(d.punishment)} on fail` : '')
      )
    case 'focus':
      return (
        rng(d.minAmount, d.maxAmount, d.unit) +
        (d.punishment.mode === 'penalty' ? ` · −${penaltyLabel(d.punishment)} on fail` : '')
      )
    case 'tap':
      return (
        rng(d.minAmount, d.maxAmount, d.unit) +
        (d.punishment.mode === 'penalty' ? ` · −${penaltyLabel(d.punishment)} on fail` : '')
      )
    case 'sequence': {
      const s = d.minStartLength === d.maxStartLength ? `${d.minStartLength}` : `${d.minStartLength}–${d.maxStartLength}`
      const t = d.minTargetLength === d.maxTargetLength ? `${d.minTargetLength}` : `${d.minTargetLength}–${d.maxTargetLength}`
      return `${d.imageCount} tiles · ${s}→${t} steps`
    }
    case 'steady':
      return d.random ? 'random difficulty' : d.difficulty
  }
}

export const HIDE_MODE_LABEL: Record<HideMode, string> = {
  'show': 'Show everything',
  'hide-random': 'Hide random values',
  'hide-all': 'Hide all details',
}
