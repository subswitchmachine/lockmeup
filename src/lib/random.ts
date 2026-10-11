/**
 * Small shared randomness helpers. Centralised so the Fisher–Yates shuffle and
 * uniform pick/range logic live in one place instead of being re-implemented at
 * each call site. All use `Math.random()` — fine for gameplay; not for secrets.
 */

/** Inclusive random integer in [a, b] (bounds tolerated in any order). */
export function randInt(a: number, b: number): number {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

/** A uniformly random element of a non-empty array. */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** In-place Fisher–Yates shuffle; returns the same array for convenience. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
