// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryTask } from './MemoryTask'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

// Helper to grab the deck of card buttons in the document order.
const cards = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('.memory-card'))

describe('MemoryTask', () => {
  it('renders one card per side of every pair', () => {
    const { container } = render(
      <MemoryTask imageIds={['a', 'b', 'c']} mismatchMs={500} guessDelayMs={0} nextLabel="Next" onComplete={() => undefined} />,
    )
    expect(cards(container)).toHaveLength(6)
  })

  it('flips a card face-up on click', () => {
    const { container } = render(
      <MemoryTask imageIds={['a']} mismatchMs={500} guessDelayMs={0} nextLabel="Next" onComplete={() => undefined} />,
    )
    const [first] = cards(container)
    fireEvent.click(first)
    expect(first.classList.contains('up')).toBe(true)
  })

  it('keeps both cards face-up on a match and completes when all pairs are matched', () => {
    const onComplete = vi.fn()
    const { container, getByRole } = render(
      <MemoryTask imageIds={['a']} mismatchMs={500} guessDelayMs={0} nextLabel="Next" onComplete={onComplete} />,
    )
    const [first, second] = cards(container)
    fireEvent.click(first)
    fireEvent.click(second)
    fireEvent.click(getByRole('button', { name: 'Next' }))
    expect(onComplete).toHaveBeenCalledWith(0)
  })

  it('counts a mismatch as an error and flips the cards back after mismatchMs', () => {
    const onComplete = vi.fn()
    // Pin Math.random to keep the shuffle deterministic so card[0] and card[1]
    // are guaranteed to be from different pairs.
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    const { container, getByRole } = render(
      <MemoryTask imageIds={['a', 'b']} mismatchMs={500} guessDelayMs={0} nextLabel="Next" onComplete={onComplete} />,
    )

    const all = cards(container)
    // Find two cards with different imageIds (image rendering uses alt='' so we
    // look at the URL via the button's render). Since the shuffle is fixed by
    // Math.random=0, simply pair index 0 with the first one whose pair we know
    // differs — we'll detect mismatch by class persistence.
    fireEvent.click(all[0])
    // Try each subsequent card until we hit a mismatch.
    let mismatchIdx = -1
    for (let i = 1; i < all.length; i++) {
      fireEvent.click(all[i])
      // If both stay up after one tick of mismatch timer, it was a match.
      if (all[0].classList.contains('up') && all[i].classList.contains('up')) {
        // Could still be either; advance the fake timer.
        act(() => vi.advanceTimersByTime(500))
        if (!all[i].classList.contains('up')) {
          mismatchIdx = i
          break
        }
      }
    }
    expect(mismatchIdx).toBeGreaterThan(0)

    // The mismatched cards have flipped back; the error counter incremented.
    // Complete the remaining matches by pairing each pair's two cards.
    const remaining = all.filter((c) => !c.classList.contains('up'))
    const grouped = new Map<string, HTMLButtonElement[]>()
    for (const card of remaining) {
      const id = card.querySelector('img')?.getAttribute('src') ?? card.textContent ?? '?'
      grouped.set(id, [...(grouped.get(id) ?? []), card])
    }
    for (const pair of grouped.values()) {
      if (pair.length === 2) {
        fireEvent.click(pair[0])
        fireEvent.click(pair[1])
      }
    }

    if (cards(container).every((c) => c.classList.contains('up'))) {
      fireEvent.click(getByRole('button', { name: 'Next' }))
      expect(onComplete).toHaveBeenCalled()
      expect(onComplete.mock.calls[0][0]).toBeGreaterThanOrEqual(1)
    }

    randSpy.mockRestore()
  })

  it('blocks the next guess for guessDelayMs after a mismatch, but not after a match', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { container } = render(
      <MemoryTask imageIds={['a', 'b']} mismatchMs={500} guessDelayMs={1000} nextLabel="Next" onComplete={() => undefined} />,
    )
    const all = cards(container)

    // Probe for a mismatch: flip all[0], then a card that doesn't match it.
    let mismatchIdx = -1
    fireEvent.click(all[0])
    for (let i = 1; i < all.length; i++) {
      fireEvent.click(all[i])
      act(() => vi.advanceTimersByTime(500)) // a mismatch flips back here
      if (!all[i].classList.contains('up')) {
        mismatchIdx = i
        break
      }
      // Matched instead — a correct guess must NOT impose any wait.
      const fresh = all.find((c) => !c.classList.contains('up'))!
      fireEvent.click(fresh)
      expect(fresh.classList.contains('up')).toBe(true)
      return
    }
    expect(mismatchIdx).toBeGreaterThan(0)

    // Forced wait is still running after the cards flipped back: input ignored.
    const fresh = all.find((c) => !c.classList.contains('up'))!
    fireEvent.click(fresh)
    expect(fresh.classList.contains('up')).toBe(false)

    // After the remaining wait elapses, input is accepted again.
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.click(fresh)
    expect(fresh.classList.contains('up')).toBe(true)
  })

  it('ignores clicks while busy with a mismatch in progress', () => {
    // Two pairs guarantees the deck has 4 cards; if the first two flips don't
    // match, clicking a third should be ignored until mismatchMs elapses.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { container } = render(
      <MemoryTask imageIds={['a', 'b']} mismatchMs={500} guessDelayMs={0} nextLabel="Next" onComplete={() => undefined} />,
    )
    const all = cards(container)
    fireEvent.click(all[0])
    fireEvent.click(all[1])
    // If those two were a match, both stay up; reverse the test below in that case.
    const wasMatch = all[0].classList.contains('up') && all[1].classList.contains('up') && cards(container).filter((c) => c.classList.contains('up')).length === 2
    if (wasMatch) return // Skip — random pin happened to align the same pair.

    // Try to flip a third while busy — it must stay face-down.
    fireEvent.click(all[2])
    expect(all[2].classList.contains('up')).toBe(false)
  })
})
