import { describe, expect, it } from 'vitest'
import { newDraft, newFlowId, type TaskDraft } from '../lib/tasks'
import {
  HIDE_MODE_LABEL,
  KIND_LABEL,
  newLoop,
  newPoolChild,
  newTaskChild,
  summarize,
} from './flowModel'

describe('KIND_LABEL', () => {
  it('has a label for every TaskDraft kind', () => {
    const kinds: TaskDraft['kind'][] = [
      'jigsaw',
      'sliding',
      'memory',
      'typing',
      'wait',
      'hold',
      'focus',
      'tap',
      'sequence',
      'steady',
    ]
    for (const k of kinds) {
      expect(KIND_LABEL[k]).toBeTruthy()
      expect(typeof KIND_LABEL[k]).toBe('string')
    }
  })
})

describe('HIDE_MODE_LABEL', () => {
  it('covers all three hide modes', () => {
    expect(HIDE_MODE_LABEL['show']).toMatch(/show/i)
    expect(HIDE_MODE_LABEL['hide-random']).toMatch(/random/i)
    expect(HIDE_MODE_LABEL['hide-all']).toMatch(/all|details/i)
  })
})

describe('newTaskChild', () => {
  it('wraps a fresh draft of the requested kind', () => {
    const child = newTaskChild('memory')
    expect(child.type).toBe('task')
    if (child.type === 'task') {
      expect(child.task.kind).toBe('memory')
    }
    expect(child.id).toMatch(/^f\d+$/)
  })

  it('produces unique ids across calls', () => {
    const a = newTaskChild('wait')
    const b = newTaskChild('wait')
    expect(a.id).not.toBe(b.id)
  })
})

describe('newPoolChild', () => {
  it('starts with a single jigsaw draft', () => {
    const pool = newPoolChild()
    expect(pool.type).toBe('pool')
    if (pool.type === 'pool') {
      expect(pool.tasks).toHaveLength(1)
      expect(pool.tasks[0].task.kind).toBe('jigsaw')
    }
  })
})

describe('newLoop', () => {
  it('defaults to a fixed 2x repeat over a jigsaw child', () => {
    const loop = newLoop()
    expect(loop.type).toBe('loop')
    if (loop.type === 'loop') {
      expect(loop.random).toBe(false)
      expect(loop.minRepeat).toBe(2)
      expect(loop.maxRepeat).toBe(2)
      expect(loop.children).toHaveLength(1)
    }
  })
})

describe('summarize', () => {
  // Use newFlowId here just to demonstrate it's unused inside summarize.
  newFlowId()

  it('uses a singular form when min === max', () => {
    expect(summarize(newDraft('jigsaw'))).toBe('30 pieces')
    expect(summarize(newDraft('sliding'))).toBe('3 tiles/side')
    expect(summarize(newDraft('memory'))).toBe('4 pairs')
  })

  it('renders ranges with an en-dash when min !== max', () => {
    const draft: TaskDraft = { ...newDraft('jigsaw'), random: true, minPieces: 20, maxPieces: 40 }
    expect(summarize(draft)).toBe('20–40 pieces')
  })

  it('shows a fixed wait duration with its unit', () => {
    expect(summarize(newDraft('wait'))).toBe('5 minutes')
  })

  it('truncates long typing lines with an ellipsis', () => {
    const draft: TaskDraft = {
      ...newDraft('typing'),
      line: 'this is quite a long line indeed for testing',
    }
    const out = summarize(draft)
    expect(out.startsWith('"this is quite a long li')).toBe(true)
    expect(out).toContain('…')
    expect(out).toContain('5 reps')
  })

  it('renders an empty typing line placeholder', () => {
    expect(summarize(newDraft('typing'))).toContain('(no line set)')
  })

  it('appends a penalty suffix for hold/focus/tap with a penalty', () => {
    const draft: TaskDraft = {
      ...newDraft('hold'),
      punishment: { mode: 'penalty', random: false, minAmount: 10, maxAmount: 10, unit: 'seconds' },
    }
    expect(summarize(draft)).toContain('−10s on fail')
  })

  it('omits the penalty suffix when punishment is reset', () => {
    expect(summarize(newDraft('hold'))).not.toContain('on fail')
  })

  it('summarises a sequence draft with tile and step info', () => {
    expect(summarize(newDraft('sequence'))).toBe('4 tiles · 3→8 steps')
  })

  it('summarises ranged sequence start/target lengths', () => {
    const draft: TaskDraft = {
      ...newDraft('sequence'),
      startRandom: true,
      minStartLength: 2,
      maxStartLength: 4,
      targetRandom: true,
      minTargetLength: 6,
      maxTargetLength: 10,
    }
    expect(summarize(draft)).toBe('4 tiles · 2–4→6–10 steps')
  })

  it('labels steady tasks by difficulty or random', () => {
    expect(summarize(newDraft('steady'))).toBe('normal')
    const draft: TaskDraft = { ...newDraft('steady'), random: true }
    expect(summarize(draft)).toBe('random difficulty')
  })
})
