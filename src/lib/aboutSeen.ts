/**
 * Remembers that the intro/About modal has been dismissed, so it only opens by
 * itself on a first visit. Storage can be unavailable (private mode, blocked
 * site data) — then the modal simply shows again next visit.
 */

const KEY = 'lockmeup:about-seen'

export function hasSeenAbout(): boolean {
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return false
  }
}

export function markAboutSeen(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Nothing to do — see above.
  }
}
