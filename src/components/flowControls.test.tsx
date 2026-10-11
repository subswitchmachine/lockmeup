// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NumberInput,
  OptionSelect,
  RandomToggle,
  RangeInputs,
  RowButtons,
  UnitSelect,
} from './flowControls'

afterEach(cleanup)

describe('NumberInput', () => {
  it('renders the current value', () => {
    render(<NumberInput value={7} onChange={() => undefined} />)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('7')
  })

  it('commits on the native change event (blur), clamping to min', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} min={1} />)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(input, { target: { value: '12' } })
    expect(onChange).toHaveBeenCalledWith(12)
  })

  it('floors floats and clamps below min back up', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} min={3} />)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('Enter blurs the input', () => {
    render(<NumberInput value={5} onChange={() => undefined} />)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(document.activeElement).not.toBe(input)
  })
})

describe('RangeInputs', () => {
  it('keeps min ≤ max by bumping max when min exceeds it', () => {
    const onChange = vi.fn()
    render(<RangeInputs min={2} max={5} onChange={onChange} />)
    const [minInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    fireEvent.change(minInput, { target: { value: '9' } })
    expect(onChange).toHaveBeenCalledWith(9, 9)
  })

  it('keeps min ≤ max by lowering min when max drops below it', () => {
    const onChange = vi.fn()
    render(<RangeInputs min={5} max={10} onChange={onChange} />)
    const [, maxInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    fireEvent.change(maxInput, { target: { value: '3' } })
    expect(onChange).toHaveBeenCalledWith(3, 3)
  })
})

describe('OptionSelect', () => {
  it('renders the provided options and emits numeric values', () => {
    const onChange = vi.fn()
    render(<OptionSelect options={[5, 10, 25] as const} value={10} onChange={onChange} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['5', '10', '25'])
    fireEvent.change(select, { target: { value: '25' } })
    expect(onChange).toHaveBeenCalledWith(25)
  })
})

describe('UnitSelect', () => {
  it('renders all four duration units and emits the string value', () => {
    const onChange = vi.fn()
    render(<UnitSelect value="seconds" onChange={onChange} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'seconds',
      'minutes',
      'hours',
      'days',
    ])
    fireEvent.change(select, { target: { value: 'hours' } })
    expect(onChange).toHaveBeenCalledWith('hours')
  })
})

describe('RandomToggle', () => {
  it('toggles checked state and emits the new value', () => {
    const onChange = vi.fn()
    render(<RandomToggle checked={false} onChange={onChange} />)
    const cb = screen.getByRole('checkbox') as HTMLInputElement
    fireEvent.click(cb)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('RowButtons', () => {
  it('wires up/down/remove handlers when provided', () => {
    const onUp = vi.fn()
    const onDown = vi.fn()
    const onRemove = vi.fn()
    render(<RowButtons onUp={onUp} onDown={onDown} onRemove={onRemove} />)
    fireEvent.click(screen.getByLabelText('Move up'))
    fireEvent.click(screen.getByLabelText('Move down'))
    fireEvent.click(screen.getByLabelText('Remove'))
    expect(onUp).toHaveBeenCalled()
    expect(onDown).toHaveBeenCalled()
    expect(onRemove).toHaveBeenCalled()
  })

  it('disables the up/down arrows when their handler is omitted', () => {
    render(<RowButtons onRemove={() => undefined} />)
    expect((screen.getByLabelText('Move up') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Move down') as HTMLButtonElement).disabled).toBe(true)
  })
})
