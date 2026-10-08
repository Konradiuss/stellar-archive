import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { usePersistentState } from '../composables/usePersistentState'
import { useMapStore } from './mapStore'
import { useUIStore } from './uiStore'
import { DEFAULT_SOUND_VOLUME, soundEngine, soundReady } from '../sound'

// `volume` stays null until the slider moves: the map may give new visitors its own (sounds.volume).
const DEFAULTS = Object.freeze({ on: true, volume: null })

export const useSoundStore = defineStore('sound', () => {
  const mapStore = useMapStore()
  const uiStore = useUIStore()
  const settings = usePersistentState('sfx', { ...DEFAULTS })

  const available = computed(() => mapStore.sounds?.enabled !== false)
  const on = computed(() => available.value && settings.value.on !== false)
  const volume = computed(() => {
    const own = settings.value.volume
    if (typeof own === 'number' && own >= 0 && own <= 1) return own
    return mapStore.sounds?.volume ?? DEFAULT_SOUND_VOLUME
  })

  // SYNDICATE.EXE has its own music: nothing else is heard over it; the visitor's setting stays.
  const audible = computed(() => on.value && !uiStore.syndicateHack)
  const ready = computed(() => soundReady.value)
  const waiting = computed(() => on.value && !ready.value)
  watch(audible, value => soundEngine.setEnabled(value), { immediate: true })
  watch(volume, value => soundEngine.setVolume(value), { immediate: true })
  watch(() => mapStore.sounds?.sounds, sounds => soundEngine.setOverrides(sounds), { immediate: true })

  // Woken inside the visitor's press: while off, the page made no context. Resolves true once it can sound.
  function wakeIfOn() {
    if (!on.value) return Promise.resolve(false)
    soundEngine.setEnabled(audible.value)
    return soundEngine.wake()
  }

  function toggle() {
    settings.value = { ...settings.value, on: !on.value }
    return wakeIfOn()
  }

  function setVolume(value) {
    settings.value = { ...settings.value, on: true, volume: Math.min(1, Math.max(0, value)) }
    return wakeIfOn()
  }

  return {
    available,
    on,
    audible,
    ready,
    waiting,
    volume,
    toggle,
    setVolume,
    recent: () => soundEngine.recent(),
    playedCount: () => soundEngine.playedCount
  }
})
