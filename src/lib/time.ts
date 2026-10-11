export const UNIT_MS = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
} as const

export type DurationUnit = keyof typeof UNIT_MS

/** Compact unit label for inline summaries (e.g. "5 min" / "2 h"). */
export const UNIT_SHORT: Record<DurationUnit, string> = {
  seconds: 's',
  minutes: 'min',
  hours: 'h',
  days: 'd',
}

/** Format a remaining duration (ms) as a compact "1d 2h 3m 4s" string. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (days || hours) parts.push(`${hours}h`)
  parts.push(`${mins}m`)
  parts.push(`${secs}s`)
  return parts.join(' ')
}
