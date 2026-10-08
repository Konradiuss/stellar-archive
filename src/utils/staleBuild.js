// After a deploy an old tab asks for chunks the host no longer has (vite:preloadError):
// reload once to get the new build.

const RELOAD_KEY = 'spacemap:stale-build-reload'
// A second failure within this time is left to the loader (lazyScreen in App.vue).
export const STALE_RELOAD_GUARD_MS = 10000

// Without session storage there is no loop guard, so no reload.
export function reloadForStaleBuild(event, { storage, now = Date.now(), reload }) {
  try {
    if (!storage) return false
    const last = Number(storage.getItem(RELOAD_KEY)) || 0
    if (now - last < STALE_RELOAD_GUARD_MS) return false
    storage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false
  }
  event.preventDefault()
  reload()
  return true
}
