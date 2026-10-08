import { onScopeDispose, watch } from 'vue'
import { useUIStore } from '../stores/uiStore'
import { buildRoute, isEditorRoute, parseRoute } from '../utils/hashRoute'

// Reading and stepping through planets rewrite the address often: Safari refuses more than ~100 writes in 30 s.
const REPLACE_EVERY_MS = 250

export function useRouteSync() {
  const uiStore = useUIStore()
  let pendingRoute = null
  // Corrections during boot (unknown star in the URL) must not add history entries.
  let hasBeenIdle = false
  // A place reached by Back/Forward is written over its own entry: the address may name it otherwise
  // ('#/wiki/mars' for "Mars"), and a new entry would make Back return to it.
  let fromHistory = false
  // { url, hash }
  let waiting = null
  let waitTimer = null

  const urlOf = hash => hash || `${window.location.pathname}${window.location.search}`

  function writeWaiting() {
    clearTimeout(waitTimer)
    waitTimer = null
    if (!waiting) return
    window.history.replaceState(null, '', waiting.url)
    waiting = null
  }

  function dropWaiting() {
    clearTimeout(waitTimer)
    waitTimer = null
    waiting = null
  }

  function replaceSoon(hash) {
    waiting = { url: urlOf(hash), hash }
    if (!waitTimer) waitTimer = setTimeout(writeWaiting, REPLACE_EVERY_MS)
  }

  function writeHash(hash) {
    // Back/Forward during a transition: the address already shows the target, applied once it ends.
    if (pendingRoute) return
    const current = waiting ? waiting.hash : window.location.hash
    if ((current || '') === hash) return
    // A new system or wiki page gets a history entry; planets of one system and sections of one page replace each other.
    const from = parseRoute(current)
    const to = parseRoute(hash)
    const opensAnotherPlace = from.starId !== to.starId || from.wiki !== to.wiki
    const settling = fromHistory
    fromHistory = false
    if (hasBeenIdle && opensAnotherPlace && !settling) {
      // The entry being left keeps its last address.
      writeWaiting()
      window.history.pushState(null, '', urlOf(hash))
    } else if (hasBeenIdle && !settling) {
      replaceSoon(hash)
    } else {
      dropWaiting()
      window.history.replaceState(null, '', urlOf(hash))
    }
  }

  function applyPendingRoute() {
    if (!pendingRoute) return
    const route = pendingRoute
    // applyRoute refuses while another transition is running: retry on idle.
    if (!uiStore.applyRoute(route)) return
    pendingRoute = null
    // Nothing to switch (unknown star, planet out of range): show where we are.
    if (uiStore.transitionPhase === 'idle') {
      fromHistory = false
      const hash = buildRoute(uiStore.currentRoute)
      if ((window.location.hash || '') !== hash) window.history.replaceState(null, '', urlOf(hash))
    }
  }

  function handlePopState() {
    // The browser has moved to another entry: nothing waiting may overwrite it.
    dropWaiting()
    // App.vue reloads the page for the editor.
    if (isEditorRoute(window.location.hash)) return
    pendingRoute = parseRoute(window.location.hash)
    fromHistory = true
    applyPendingRoute()
  }

  watch(() => buildRoute(uiStore.currentRoute), writeHash)
  watch(() => uiStore.transitionPhase, phase => {
    if (phase !== 'idle') return
    hasBeenIdle = true
    applyPendingRoute()
    if (!pendingRoute && uiStore.transitionPhase === 'idle') fromHistory = false
  })

  window.addEventListener('popstate', handlePopState)
  window.addEventListener('pagehide', writeWaiting)
  onScopeDispose(() => {
    writeWaiting()
    window.removeEventListener('popstate', handlePopState)
    window.removeEventListener('pagehide', writeWaiting)
  })
}
