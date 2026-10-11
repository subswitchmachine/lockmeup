// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LockedPanel } from './LockedPanel'

afterEach(cleanup)

describe('LockedPanel', () => {
  it('renders the countdown when time is verified and not hidden', () => {
    const now = 1_700_000_000_000
    render(<LockedPanel now={now} unlockAt={now + 90_000} timeVerified hideTimer={false} />)
    expect(screen.getByText('1m 30s')).toBeTruthy()
    expect(screen.getByText(/Unlocks/)).toBeTruthy()
  })

  it('hides the countdown when hideTimer is true', () => {
    render(<LockedPanel now={0} unlockAt={60_000} timeVerified hideTimer />)
    expect(screen.getByLabelText('Time remaining is hidden')).toBeTruthy()
    expect(screen.queryByText(/Unlocks/)).toBeNull()
  })

  it('shows the time-verification warning when the network failed to verify', () => {
    render(<LockedPanel now={0} unlockAt={1000} timeVerified={false} hideTimer={false} />)
    expect(screen.getByText(/Couldn't verify the time online/)).toBeTruthy()
  })

  it('clamps to 0m 0s when the deadline has already passed', () => {
    render(<LockedPanel now={1000} unlockAt={0} timeVerified hideTimer={false} />)
    expect(screen.getByText('0m 0s')).toBeTruthy()
  })
})
