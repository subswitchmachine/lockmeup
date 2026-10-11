/** Shared, small form controls used by the FlowBuilder and the TaskEditor. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { RowCtrl } from '../lib/flowUtils'
import type { DurationUnit } from '../lib/time'

/**
 * Number input with typed-then-blur semantics. Typing only updates local text
 * (so "4", backspace, "8" yields "8" — no min-fallback to 1 mid-edit), while
 * the native `change` event fires both on blur (after typing) AND immediately
 * after a spinner click — that's where we commit + clamp. The single onChange
 * prop therefore fires on every real commit, never on intermediate typing
 * keystrokes, so callers (like RangeInputs) can always couple safely.
 */
export function NumberInput({
  value,
  onChange,
  min = 1,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
}) {
  // Local text mirrors value but lets the user pass through transient empties.
  const [text, setText] = useState(String(value))
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setText(String(value))
  }

  // The native `change` event fires on spinner clicks and on blur with an
  // actual value change. React's synthetic `onChange` is mapped to the DOM
  // `input` event, which fires on every keystroke — that's not what we want
  // for committing, so we listen to the native event directly. Re-attaching
  // each render is cheap and keeps the closure deps fresh.
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const commit = () => {
      const n = Math.floor(Number(el.value))
      const clamped = Number.isFinite(n) && n >= min ? n : min
      if (String(clamped) !== el.value) setText(String(clamped))
      if (clamped !== value) onChange(clamped)
    }
    el.addEventListener('change', commit)
    return () => el.removeEventListener('change', commit)
  }, [onChange, value, min])

  return (
    <input
      ref={ref}
      type="number"
      min={min}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

/**
 * "min – max" pair of integer inputs that keeps min ≤ max. The coupling is
 * applied on every committed change — since NumberInput only commits on blur
 * or spinner (not per keystroke), typing "12" doesn't clobber min from a
 * stale "1" intermediate state.
 */
export function RangeInputs({
  min,
  max,
  onChange,
}: {
  min: number
  max: number
  onChange: (min: number, max: number) => void
}) {
  return (
    <>
      <NumberInput value={min} onChange={(v) => onChange(v, Math.max(v, max))} />
      <span className="flow-dash">–</span>
      <NumberInput value={max} onChange={(v) => onChange(Math.min(v, min), v)} />
    </>
  )
}

export function OptionSelect({
  options,
  value,
  onChange,
}: {
  options: readonly number[]
  value: number
  onChange: (v: number) => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

export function UnitSelect({
  value,
  onChange,
}: {
  value: DurationUnit
  onChange: (u: DurationUnit) => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as DurationUnit)}>
      <option value="seconds">seconds</option>
      <option value="minutes">minutes</option>
      <option value="hours">hours</option>
      <option value="days">days</option>
    </select>
  )
}

export function RandomToggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flow-random">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      random
    </label>
  )
}

export function RowButtons({ onUp, onDown, onRemove }: RowCtrl) {
  return (
    <div className="flow-row-actions">
      <button type="button" onClick={onUp} disabled={!onUp} aria-label="Move up">
        ▲
      </button>
      <button type="button" onClick={onDown} disabled={!onDown} aria-label="Move down">
        ▼
      </button>
      <button type="button" onClick={onRemove} aria-label="Remove">
        ✕
      </button>
    </div>
  )
}
