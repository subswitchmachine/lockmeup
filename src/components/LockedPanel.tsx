import { formatRemaining } from '../lib/time'

interface LockedPanelProps {
  unlockAt: number
  now: number
  /** Whether trusted network time is available; the wait can't end without it. */
  timeVerified: boolean
  /** Hide the countdown and end time (you won't know how long is left). */
  hideTimer: boolean
}

/** A timed `wait` task: a live countdown that can't be skipped. */
export function LockedPanel({ unlockAt, now, timeVerified, hideTimer }: LockedPanelProps) {
  return (
    <div className="panel locked-panel">
      <h2>Wait</h2>
      <p className="panel-note">You must wait — the time ends on its own.</p>
      {hideTimer ? (
        <div className="countdown countdown-hidden" aria-label="Time remaining is hidden">
          ⏳
        </div>
      ) : (
        <>
          <div className="countdown">{formatRemaining(unlockAt - now)}</div>
          <p className="unlock-preview">Unlocks {new Date(unlockAt).toLocaleString()}</p>
        </>
      )}
      {!timeVerified && (
        <p className="time-warning">
          Couldn't verify the time online — the wait holds until it can (check your connection).
        </p>
      )}
    </div>
  )
}
