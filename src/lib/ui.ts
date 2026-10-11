/**
 * Conic-gradient background for a circular progress ring: filled `deg` degrees
 * from the accent colour, with the remainder in the panel colour. Shared by the
 * timed tasks that paint a progress ring via inline styles (hold, tap).
 */
export function accentRing(deg: number): string {
  return `conic-gradient(var(--accent, #4f8cff) ${deg}deg, var(--panel) 0)`
}
