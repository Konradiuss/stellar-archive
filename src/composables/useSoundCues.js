import { onScopeDispose, watch } from 'vue'
import { useUIStore } from '../stores/uiStore'
import { useSoundStore } from '../stores/soundStore'
import { playSound, soundEngine } from '../sound'

// Each press beeps, unless a sound of its own already stands for it or it is inside data-sfx="none"
// (it sounds by itself later). A slider is dragged, not pressed: no click when it is let go.
const PRESSABLE = 'button, a[href], [role="button"], [role^="menuitem"], [role="tab"], .terminal-link, .rt-link'
// A sound asked for this long before the click came from the same press.
const OWN_SOUND_MS = 50
// The tube lights after the "ready" beep of the loader, not under it.
const AFTER_LOADED_MS = 180
export const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']

const pressableOf = target => (target instanceof Element ? target.closest(PRESSABLE) : null)
const silenced = element => !!element.closest('[data-sfx="none"]')

export function useSoundCues() {
  const uiStore = useUIStore()
  const soundStore = useSoundStore()

  // Only the start of the site has the disk and the "ready" beep, or every switch would rattle the drive.
  let booting = uiStore.booting
  let openTimer = null

  watch(() => uiStore.transitionPhase, phase => {
    if (phase === 'closing') {
      const intoSystem = uiStore.transitionTarget?.kind === 'star' && uiStore.currentView === 'galaxy'
      playSound(intoSystem ? 'warp' : 'screenOff')
    } else if (phase === 'opening') {
      if (booting && !uiStore.loadError) {
        playSound('loaded')
        clearTimeout(openTimer)
        openTimer = setTimeout(() => playSound('screenOn'), AFTER_LOADED_MS)
      } else {
        playSound('screenOn')
      }
      booting = false
    }
  })

  watch(() => uiStore.loadingLog.length, (count, before) => {
    if (count <= (before ?? 0)) return
    if (booting && !before) playSound('disk')
    playSound('loaderLine')
  })
  watch(() => uiStore.loadError, error => {
    if (error) playSound('loadError')
  })

  watch(() => uiStore.systemWindows.minimized.length, (count, before) => {
    if (count > before) playSound('windowClose')
    else if (count < before) playSound('windowOpen')
  })

  // Only on the open screen, not for a planet set by the address.
  watch(() => uiStore.selectedPlanetIndex, index => {
    if (uiStore.currentView !== 'system' || uiStore.transitionPhase !== 'idle') return
    playSound(index === null ? 'glitch' : 'planetSelect')
  })

  // Into the wiki from the map the tube sounds instead.
  watch(() => uiStore.wikiSlug, (slug, before) => {
    if (slug !== before && uiStore.currentView === 'wiki' && uiStore.transitionPhase === 'idle') playSound('wikiPage')
  })

  // Turned off, the page makes no context and downloads no recordings; soundStore.toggle wakes it.
  const unlock = () => {
    if (soundStore.on) soundEngine.unlock()
  }

  function handleClick(event) {
    const element = pressableOf(event.target)
    if (!element || silenced(element) || element.matches(':disabled, [aria-disabled="true"]')) return
    if (soundEngine.cuedWithin(OWN_SOUND_MS)) return
    playSound('click')
  }

  // Mouse only: a finger has no hover.
  const fine = globalThis.matchMedia?.('(pointer: fine)')
  function handlePointerOver(event) {
    if (!fine?.matches || event.pointerType !== 'mouse') return
    const element = pressableOf(event.target)
    if (!element || element.contains(event.relatedTarget)) return
    if (element.matches(':disabled, [aria-disabled="true"]')) return
    playSound('hover')
  }

  if (typeof document !== 'undefined') {
    // On touch the browser counts the lifting, not the touch, as the press that unlocks sound: all are listened to.
    for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlock, true)
    // Bubbling: the handlers of the components, and the Vue watchers after them, come first.
    document.addEventListener('click', handleClick)
    document.addEventListener('pointerover', handlePointerOver)
  }

  onScopeDispose(() => {
    clearTimeout(openTimer)
    if (typeof document === 'undefined') return
    for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlock, true)
    document.removeEventListener('click', handleClick)
    document.removeEventListener('pointerover', handlePointerOver)
  })
}
