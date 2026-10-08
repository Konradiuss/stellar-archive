// One shared query, read every frame: its `matches` follows the setting live.
// A new matchMedia (e.g. a test stub) gets a new query.
const QUERY = '(prefers-reduced-motion: reduce)'
let source = null
let query = null

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  if (source !== window.matchMedia) {
    source = window.matchMedia
    query = window.matchMedia(QUERY)
  }
  return !!query?.matches
}
