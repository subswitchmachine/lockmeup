import { useEffect, useState } from 'react'

/**
 * Returns the current time (ms epoch), re-rendering on an interval while
 * `active`. Used to drive the lock countdown and the reveal transition.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    // Refresh immediately (async, to avoid a synchronous setState in the effect)
    // then tick on the interval.
    const initial = setTimeout(() => setNow(Date.now()), 0)
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => {
      clearTimeout(initial)
      clearInterval(id)
    }
  }, [active, intervalMs])

  return now
}
