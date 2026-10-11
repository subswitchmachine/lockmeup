import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  PIECE_OPTIONS,
  type FocusSensitivity,
  type HoldSize,
  type HoldSpeed,
  type MismatchSpeed,
  type Punishment,
  type SequenceFlashSpeed,
  type SequencePunishment,
  type SlideInterval,
  type SlideshowDraft,
  type SteadyDifficulty,
  type SteadyPunishment,
  type TapWindow,
  type TaskDraft,
} from '../lib/tasks'
import type { DurationUnit } from '../lib/time'
import {
  NumberInput,
  OptionSelect,
  RandomToggle,
  RangeInputs,
  UnitSelect,
} from './flowControls'
import { flushPendingEdits } from '../lib/flowUtils'

const KIND_TITLE: Record<TaskDraft['kind'], string> = {
  jigsaw: 'Puzzle',
  sliding: 'Sliding',
  memory: 'Memory',
  typing: 'Typing',
  wait: 'Wait',
  hold: 'Hold',
  focus: 'Hold still',
  tap: 'Tap',
  sequence: 'Sequence',
  steady: 'Steady hand',
}

const KIND_DESC: Record<TaskDraft['kind'], string> = {
  jigsaw: 'Reassemble a scrambled photo into the complete image, with an optional rotate-the-pieces twist.',
  sliding: 'Slide tiles on a grid to restore the original photo.',
  memory: 'Flip pairs of tiles to find every matching set.',
  typing: 'Type a phrase a set number of times.',
  wait: 'Simply wait out a timer before proceeding.',
  hold: 'Keep a moving circle inside a target zone for the set duration.',
  focus: 'Stay completely still — the webcam watches for movement.',
  tap: 'Tap a button on cue; miss the window and progress resets.',
  sequence: 'Watch tiles light up in a sequence, then reproduce it.',
  steady: 'Trace a path from start to end without touching the walls.',
}

interface TaskEditorProps {
  /** Initial draft to edit (a copy is held locally and committed on Save). */
  initial: TaskDraft
  title?: string
  onSave: (draft: TaskDraft) => void
  onCancel: () => void
}

/**
 * Modal editor for a single task draft. Edits are buffered locally; the parent
 * is only notified on Save. Esc and backdrop click cancel.
 */
export function TaskEditor({ initial, title, onSave, onCancel }: TaskEditorProps) {
  const [draft, setDraft] = useState<TaskDraft>(initial)
  // Mirrors the latest committed draft so save can read it after a blur-driven
  // flush, even though the click handler's closure captured an older value.
  // useLayoutEffect (not useEffect) because flushSync flushes layout effects
  // synchronously but defers passive effects to after it returns.
  const draftRef = useRef(draft)
  useLayoutEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Save needs to commit any in-flight number-input edits first (blurring runs
  // NumberInput's finalise: clamp + min ≤ max coupling), then read draftRef
  // rather than the closure to pick up the freshly flushed state.
  const handleSave = () => {
    flushPendingEdits()
    onSave(draftRef.current)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title ?? KIND_TITLE[draft.kind]}</h2>
        {!title && <p className="modal-desc">{KIND_DESC[draft.kind]}</p>}
        <div className="modal-body">
          <Fields draft={draft} onChange={setDraft} />
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!isValid(draft)} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function isValid(draft: TaskDraft): boolean {
  if (draft.kind === 'typing') return draft.line.trim().length > 0
  return true
}

function Fields({
  draft,
  onChange,
}: {
  draft: TaskDraft
  onChange: (d: TaskDraft) => void
}) {
  switch (draft.kind) {
    case 'jigsaw':
      return (
        <>
          <CountField
            label="Pieces"
            options={PIECE_OPTIONS}
            random={draft.random}
            min={draft.minPieces}
            max={draft.maxPieces}
            setRandom={(r) =>
              onChange({ ...draft, random: r, maxPieces: r ? draft.maxPieces : draft.minPieces })
            }
            setSingle={(v) => onChange({ ...draft, minPieces: v, maxPieces: v })}
            setMin={(v) =>
              onChange({ ...draft, minPieces: v, maxPieces: Math.max(v, draft.maxPieces) })
            }
            setMax={(v) =>
              onChange({ ...draft, minPieces: Math.min(v, draft.minPieces), maxPieces: v })
            }
          />
          <Row label="Rotate pieces">
            <label className="modal-checkbox">
              <input
                type="checkbox"
                checked={draft.rotate}
                onChange={(e) => onChange({ ...draft, rotate: e.target.checked })}
              />
              Pieces start turned; tap to rotate
            </label>
          </Row>
        </>
      )
    case 'sliding':
      return (
        <>
          <CountField
            label="Tiles per short side"
            random={draft.random}
            min={draft.minSize}
            max={draft.maxSize}
            setRandom={(r) =>
              onChange({ ...draft, random: r, maxSize: r ? draft.maxSize : draft.minSize })
            }
            setSingle={(v) => onChange({ ...draft, minSize: v, maxSize: v })}
            setMin={(v) => onChange({ ...draft, minSize: v, maxSize: Math.max(v, draft.maxSize) })}
            setMax={(v) => onChange({ ...draft, minSize: Math.min(v, draft.minSize), maxSize: v })}
          />
          <Row label="Solid-tile assist">
            <label className="modal-checkbox">
              <input
                type="checkbox"
                checked={draft.assist ?? true}
                onChange={(e) => onChange({ ...draft, assist: e.target.checked })}
              />
              Number hard-to-place tiles
            </label>
          </Row>
        </>
      )
    case 'memory':
      return (
        <>
          <CountField
            label="Pairs"
            random={draft.random}
            min={draft.minPairs}
            max={draft.maxPairs}
            setRandom={(r) =>
              onChange({ ...draft, random: r, maxPairs: r ? draft.maxPairs : draft.minPairs })
            }
            setSingle={(v) => onChange({ ...draft, minPairs: v, maxPairs: v })}
            setMin={(v) =>
              onChange({ ...draft, minPairs: v, maxPairs: Math.max(v, draft.maxPairs) })
            }
            setMax={(v) =>
              onChange({ ...draft, minPairs: Math.min(v, draft.minPairs), maxPairs: v })
            }
          />
          <Row label="Mismatch flip-back">
            <select
              value={draft.mismatchSpeed}
              onChange={(e) =>
                onChange({ ...draft, mismatchSpeed: e.target.value as MismatchSpeed })
              }
            >
              <option value="quick">Quick (0.5s)</option>
              <option value="normal">Normal (0.8s)</option>
              <option value="slow">Slow (1.5s)</option>
              <option value="verySlow">Very slow (3s)</option>
            </select>
          </Row>
          <Row label="Wait between guesses">
            <label className="modal-checkbox">
              <input
                type="checkbox"
                checked={draft.guessDelay}
                onChange={(e) => onChange({ ...draft, guessDelay: e.target.checked })}
              />
              Force a pause
            </label>
            {draft.guessDelay && (
              <>
                <NumberInput
                  value={draft.guessDelayAmount}
                  min={1}
                  onChange={(v) => onChange({ ...draft, guessDelayAmount: v })}
                />
                <UnitSelect
                  value={draft.guessDelayUnit}
                  onChange={(u) => onChange({ ...draft, guessDelayUnit: u })}
                />
              </>
            )}
          </Row>
        </>
      )
    case 'typing':
      return (
        <>
          <Row label="Line to type">
            <textarea
              className="typing-task-line-input"
              value={draft.line}
              spellCheck={false}
              onChange={(e) => onChange({ ...draft, line: e.target.value })}
              placeholder="Enter the text to type…"
            />
          </Row>
          {draft.line.trim().length === 0 && (
            <p className="modal-validation">Enter the line to type before saving.</p>
          )}
          <CountField
            label="Repetitions"
            random={draft.random}
            min={draft.minReps}
            max={draft.maxReps}
            setRandom={(r) =>
              onChange({ ...draft, random: r, maxReps: r ? draft.maxReps : draft.minReps })
            }
            setSingle={(v) => onChange({ ...draft, minReps: v, maxReps: v })}
            setMin={(v) => onChange({ ...draft, minReps: v, maxReps: Math.max(v, draft.maxReps) })}
            setMax={(v) => onChange({ ...draft, minReps: Math.min(v, draft.minReps), maxReps: v })}
          />
          <ModalSection label="On mistake" />
          <Row label="Penalty reps">
            {draft.penaltyRandom ? (
              <RangeInputs
                min={draft.minPenaltyReps}
                max={draft.maxPenaltyReps}
                onChange={(min, max) => onChange({ ...draft, minPenaltyReps: min, maxPenaltyReps: max })}
              />
            ) : (
              <NumberInput
                value={draft.minPenaltyReps}
                min={0}
                onChange={(v) => onChange({ ...draft, minPenaltyReps: v, maxPenaltyReps: v })}
              />
            )}
            <RandomToggle
              checked={draft.penaltyRandom}
              onChange={(r) => onChange({ ...draft, penaltyRandom: r, maxPenaltyReps: r ? draft.maxPenaltyReps : draft.minPenaltyReps })}
            />
          </Row>
          <ModalSection label="Display" />
          <SlideshowField
            value={draft.slideshow}
            onChange={(s) => onChange({ ...draft, slideshow: s })}
          />
        </>
      )
    case 'wait':
      return (
        <>
          <DurationField
            label="Duration"
            random={draft.random}
            minAmount={draft.minAmount}
            maxAmount={draft.maxAmount}
            unit={draft.unit}
            setRandom={(r) =>
              onChange({ ...draft, random: r, maxAmount: r ? draft.maxAmount : draft.minAmount })
            }
            setSingle={(v) => onChange({ ...draft, minAmount: v, maxAmount: v })}
            setRange={(min, max) => onChange({ ...draft, minAmount: min, maxAmount: max })}
            setUnit={(u) => onChange({ ...draft, unit: u })}
          />
          <ModalSection label="Display" />
          <SlideshowField
            value={draft.slideshow}
            onChange={(s) => onChange({ ...draft, slideshow: s })}
          />
        </>
      )
    case 'hold':
      return (
        <>
          <DurationField
            label="Duration"
            random={draft.random}
            minAmount={draft.minAmount}
            maxAmount={draft.maxAmount}
            unit={draft.unit}
            setRandom={(r) =>
              onChange({ ...draft, random: r, maxAmount: r ? draft.maxAmount : draft.minAmount })
            }
            setSingle={(v) => onChange({ ...draft, minAmount: v, maxAmount: v })}
            setRange={(min, max) => onChange({ ...draft, minAmount: min, maxAmount: max })}
            setUnit={(u) => onChange({ ...draft, unit: u })}
          />
          <Row label="Circle speed">
            <select
              value={draft.speed}
              onChange={(e) => onChange({ ...draft, speed: e.target.value as HoldSpeed })}
            >
              <option value="slow">Slow</option>
              <option value="medium">Medium</option>
              <option value="fast">Fast</option>
            </select>
          </Row>
          <Row label="Circle size">
            <select
              value={draft.size}
              onChange={(e) => onChange({ ...draft, size: e.target.value as HoldSize })}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </Row>
          <ModalSection label="On failure" />
          <PunishmentField
            value={draft.punishment}
            onChange={(p) => onChange({ ...draft, punishment: p })}
          />
          <ModalSection label="Display" />
          <SlideshowField
            value={draft.slideshow}
            onChange={(s) => onChange({ ...draft, slideshow: s })}
          />
        </>
      )
    case 'focus':
      return (
        <>
          <DurationField
            label="Duration"
            random={draft.random}
            minAmount={draft.minAmount}
            maxAmount={draft.maxAmount}
            unit={draft.unit}
            setRandom={(r) =>
              onChange({ ...draft, random: r, maxAmount: r ? draft.maxAmount : draft.minAmount })
            }
            setSingle={(v) => onChange({ ...draft, minAmount: v, maxAmount: v })}
            setRange={(min, max) => onChange({ ...draft, minAmount: min, maxAmount: max })}
            setUnit={(u) => onChange({ ...draft, unit: u })}
          />
          <Row label="Motion sensitivity">
            <select
              value={draft.sensitivity}
              onChange={(e) =>
                onChange({ ...draft, sensitivity: e.target.value as FocusSensitivity })
              }
            >
              <option value="strict">Strict — tiniest movement punishes</option>
              <option value="normal">Normal</option>
              <option value="relaxed">Relaxed — tolerates fidgeting</option>
            </select>
          </Row>
          <Row label="Require">
            <label className="modal-checkbox">
              <input
                type="checkbox"
                checked={draft.requireFace}
                onChange={(e) => onChange({ ...draft, requireFace: e.target.checked })}
              />
              face in frame
            </label>
            <label className="modal-checkbox">
              <input
                type="checkbox"
                checked={draft.requireTabFocus}
                onChange={(e) => onChange({ ...draft, requireTabFocus: e.target.checked })}
              />
              tab focus
            </label>
          </Row>
          <Row label="Camera">
            <label className="modal-checkbox">
              <input
                type="checkbox"
                checked={draft.showCamera}
                onChange={(e) => onChange({ ...draft, showCamera: e.target.checked })}
              />
              show camera preview
            </label>
          </Row>
          <ModalSection label="On failure" />
          <PunishmentField
            value={draft.punishment}
            onChange={(p) => onChange({ ...draft, punishment: p })}
          />
          <ModalSection label="Display" />
          <SlideshowField
            value={draft.slideshow}
            onChange={(s) => onChange({ ...draft, slideshow: s })}
          />
        </>
      )
    case 'tap':
      return (
        <>
          <DurationField
            label="Duration"
            random={draft.random}
            minAmount={draft.minAmount}
            maxAmount={draft.maxAmount}
            unit={draft.unit}
            setRandom={(r) =>
              onChange({ ...draft, random: r, maxAmount: r ? draft.maxAmount : draft.minAmount })
            }
            setSingle={(v) => onChange({ ...draft, minAmount: v, maxAmount: v })}
            setRange={(min, max) => onChange({ ...draft, minAmount: min, maxAmount: max })}
            setUnit={(u) => onChange({ ...draft, unit: u })}
          />
          <Row label="Button frequency">
            {draft.intervalRandom ? (
              <RangeInputs
                min={draft.intervalAmount}
                max={draft.intervalMaxAmount}
                onChange={(min, max) => onChange({ ...draft, intervalAmount: min, intervalMaxAmount: max })}
              />
            ) : (
              <NumberInput
                value={draft.intervalAmount}
                min={1}
                onChange={(v) => onChange({ ...draft, intervalAmount: v })}
              />
            )}
            <UnitSelect
              value={draft.intervalUnit}
              onChange={(u) => onChange({ ...draft, intervalUnit: u })}
            />
            <RandomToggle
              checked={draft.intervalRandom}
              onChange={(r) => onChange({ ...draft, intervalRandom: r, intervalMaxAmount: r ? draft.intervalMaxAmount : draft.intervalAmount })}
            />
          </Row>
          <Row label="Tap window">
            <select
              value={draft.window}
              onChange={(e) => onChange({ ...draft, window: e.target.value as TapWindow })}
            >
              <option value="quick">Quick (0.8s)</option>
              <option value="normal">Normal (1.8s)</option>
              <option value="slow">Slow (3.5s)</option>
            </select>
          </Row>
          <ModalSection label="On failure" />
          <PunishmentField
            value={draft.punishment}
            onChange={(p) => onChange({ ...draft, punishment: p })}
          />
          <ModalSection label="Display" />
          <SlideshowField
            value={draft.slideshow}
            onChange={(s) => onChange({ ...draft, slideshow: s })}
          />
        </>
      )
    case 'sequence':
      return (
        <>
          <Row label="Tile count">
            <select
              value={draft.imageCount}
              onChange={(e) => onChange({ ...draft, imageCount: Number(e.target.value) })}
            >
              <option value={4}>4 tiles (2×2)</option>
              <option value={6}>6 tiles (2×3)</option>
              <option value={9}>9 tiles (3×3)</option>
            </select>
          </Row>
          <Row label="Start length">
            {draft.startRandom ? (
              <RangeInputs
                min={draft.minStartLength}
                max={draft.maxStartLength}
                onChange={(min, max) =>
                  onChange({
                    ...draft,
                    minStartLength: min,
                    maxStartLength: max,
                    minTargetLength: Math.max(min, draft.minTargetLength),
                    maxTargetLength: Math.max(max, draft.maxTargetLength),
                  })
                }
              />
            ) : (
              <NumberInput
                value={draft.minStartLength}
                min={1}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    minStartLength: v,
                    maxStartLength: v,
                    minTargetLength: Math.max(v, draft.minTargetLength),
                    maxTargetLength: Math.max(v, draft.maxTargetLength),
                  })
                }
              />
            )}
            <RandomToggle
              checked={draft.startRandom}
              onChange={(r) =>
                onChange({ ...draft, startRandom: r, maxStartLength: r ? draft.maxStartLength : draft.minStartLength })
              }
            />
          </Row>
          <Row label="Target length">
            {draft.targetRandom ? (
              <RangeInputs
                min={draft.minTargetLength}
                max={draft.maxTargetLength}
                onChange={(min, max) =>
                  onChange({ ...draft, minTargetLength: min, maxTargetLength: max })
                }
              />
            ) : (
              <NumberInput
                value={draft.minTargetLength}
                min={draft.minStartLength}
                onChange={(v) =>
                  onChange({ ...draft, minTargetLength: v, maxTargetLength: v })
                }
              />
            )}
            <RandomToggle
              checked={draft.targetRandom}
              onChange={(r) =>
                onChange({ ...draft, targetRandom: r, maxTargetLength: r ? draft.maxTargetLength : draft.minTargetLength })
              }
            />
          </Row>
          <Row label="Flash speed">
            <select
              value={draft.flashSpeed}
              onChange={(e) =>
                onChange({ ...draft, flashSpeed: e.target.value as SequenceFlashSpeed })
              }
            >
              <option value="slow">Slow (1s)</option>
              <option value="normal">Normal (0.6s)</option>
              <option value="fast">Fast (0.35s)</option>
            </select>
          </Row>
          <ModalSection label="On wrong tap" />
          <SequencePunishmentField
            value={draft.punishment}
            onChange={(p) => onChange({ ...draft, punishment: p })}
          />
        </>
      )
    case 'steady':
      return (
        <>
          <Row label="Difficulty">
            <select
              value={draft.random ? 'random' : draft.difficulty}
              onChange={(e) => {
                if (e.target.value === 'random') {
                  onChange({ ...draft, random: true })
                } else {
                  onChange({ ...draft, random: false, difficulty: e.target.value as SteadyDifficulty })
                }
              }}
            >
              <option value="easy">Easy — wide corridor</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard — narrow corridor</option>
              <option value="random">Random</option>
            </select>
          </Row>
          <ModalSection label="On wall contact" />
          <SteadyPunishmentField
            value={draft.punishment}
            onChange={(p) => onChange({ ...draft, punishment: p })}
          />
          <ModalSection label="Display" />
          <SlideshowField
            value={draft.slideshow}
            onChange={(s) => onChange({ ...draft, slideshow: s })}
          />
        </>
      )
  }
}

function ModalSection({ label }: { label: string }) {
  return <div className="modal-section">{label}</div>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="modal-row">
      <span className="modal-row-label">{label}</span>
      <div className="modal-row-controls">{children}</div>
    </div>
  )
}

function CountField({
  label,
  options,
  random,
  min,
  max,
  setRandom,
  setSingle,
  setMin,
  setMax,
}: {
  label: string
  options?: readonly number[]
  random: boolean
  min: number
  max: number
  setRandom: (r: boolean) => void
  setSingle: (v: number) => void
  setMin: (v: number) => void
  setMax: (v: number) => void
}) {
  const field = (value: number, on: (v: number) => void) =>
    options ? (
      <OptionSelect options={options} value={value} onChange={on} />
    ) : (
      <NumberInput value={value} onChange={on} />
    )
  return (
    <Row label={label}>
      {random ? (
        <>
          {field(min, setMin)}
          <span className="flow-dash">–</span>
          {field(max, setMax)}
        </>
      ) : (
        field(min, setSingle)
      )}
      <RandomToggle checked={random} onChange={setRandom} />
    </Row>
  )
}

function DurationField({
  label,
  random,
  minAmount,
  maxAmount,
  unit,
  setRandom,
  setSingle,
  setRange,
  setUnit,
}: {
  label: string
  random: boolean
  minAmount: number
  maxAmount: number
  unit: DurationUnit
  setRandom: (r: boolean) => void
  setSingle: (v: number) => void
  setRange: (min: number, max: number) => void
  setUnit: (u: DurationUnit) => void
}) {
  return (
    <Row label={label}>
      {random ? (
        <RangeInputs min={minAmount} max={maxAmount} onChange={setRange} />
      ) : (
        <NumberInput value={minAmount} onChange={setSingle} />
      )}
      <UnitSelect value={unit} onChange={setUnit} />
      <RandomToggle checked={random} onChange={setRandom} />
    </Row>
  )
}

function SlideshowField({
  value,
  onChange,
}: {
  value: SlideshowDraft
  onChange: (s: SlideshowDraft) => void
}) {
  return (
    <Row label="Slideshow">
      <label className="modal-checkbox">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Show background images
      </label>
      {value.enabled && (
        <select
          value={value.interval}
          onChange={(e) => onChange({ ...value, interval: e.target.value as SlideInterval })}
        >
          <option value="fast">Fast (10s)</option>
          <option value="medium">Normal (30s)</option>
          <option value="slow">Slow (60s)</option>
        </select>
      )}
    </Row>
  )
}

function PunishmentField({
  value,
  onChange,
}: {
  value: Punishment
  onChange: (p: Punishment) => void
}) {
  return (
    <>
      <Row label="Action">
        <select
          value={value.mode}
          onChange={(e) => {
            if (e.target.value === 'reset') {
              onChange({ mode: 'reset' })
            } else {
              // Default when toggling to penalty: 5 seconds, fixed.
              const prev = value.mode === 'penalty' ? value : null
              onChange({
                mode: 'penalty',
                random: prev?.random ?? false,
                minAmount: prev?.minAmount ?? 5,
                maxAmount: prev?.maxAmount ?? 5,
                unit: prev?.unit ?? 'seconds',
              })
            }
          }}
        >
          <option value="reset">Reset to zero</option>
          <option value="penalty">Subtract time</option>
        </select>
      </Row>
      {value.mode === 'penalty' && (
        <Row label="Time lost per failure">
          {value.random ? (
            <RangeInputs
              min={value.minAmount}
              max={value.maxAmount}
              onChange={(min, max) => onChange({ ...value, minAmount: min, maxAmount: max })}
            />
          ) : (
            <NumberInput
              value={value.minAmount}
              onChange={(v) => onChange({ ...value, minAmount: v, maxAmount: v })}
            />
          )}
          <UnitSelect value={value.unit} onChange={(u) => onChange({ ...value, unit: u })} />
          <RandomToggle
            checked={value.random}
            onChange={(r) =>
              onChange({
                ...value,
                random: r,
                maxAmount: r ? value.maxAmount : value.minAmount,
              })
            }
          />
        </Row>
      )}
    </>
  )
}

function SequencePunishmentField({
  value,
  onChange,
}: {
  value: SequencePunishment
  onChange: (p: SequencePunishment) => void
}) {
  return (
    <>
      <Row label="Action">
        <select
          value={value.mode}
          onChange={(e) => {
            if (e.target.value === 'reset') {
              onChange({ mode: 'reset' })
            } else {
              onChange({ mode: 'penalty', steps: value.mode === 'penalty' ? value.steps : 1 })
            }
          }}
        >
          <option value="reset">Reset to start length</option>
          <option value="penalty">Go back N steps</option>
        </select>
      </Row>
      {value.mode === 'penalty' && (
        <Row label="Steps lost per mistake">
          <NumberInput
            value={value.steps}
            min={1}
            onChange={(v) => onChange({ mode: 'penalty', steps: v })}
          />
        </Row>
      )}
    </>
  )
}

function SteadyPunishmentField({
  value,
  onChange,
}: {
  value: SteadyPunishment
  onChange: (p: SteadyPunishment) => void
}) {
  return (
    <>
      <Row label="Action">
        <select
          value={value.mode}
          onChange={(e) => {
            if (e.target.value === 'reset') {
              onChange({ mode: 'reset' })
            } else {
              onChange({ mode: 'penalty', percent: value.mode === 'penalty' ? value.percent : 25 })
            }
          }}
        >
          <option value="reset">Restart from beginning</option>
          <option value="penalty">Lose progress (%)</option>
        </select>
      </Row>
      {value.mode === 'penalty' && (
        <Row label="Progress lost (%)">
          <NumberInput
            value={value.percent}
            min={1}
            onChange={(v) => onChange({ mode: 'penalty', percent: Math.min(100, v) })}
          />
        </Row>
      )}
    </>
  )
}
