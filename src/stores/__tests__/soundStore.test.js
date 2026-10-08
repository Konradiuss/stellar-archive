// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSoundStore } from '../soundStore'
import { useUIStore } from '../uiStore'
import { useMapStore } from '../mapStore'
import { soundEngine, soundReady } from '../../sound'

describe('the sound effects of the visitor', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  // Was: an alarm and the crackle of the glitches played over the music of SYNDICATE.EXE.
  it('are silent while SYNDICATE.EXE runs, and the setting of the visitor stays', async () => {
    const sound = useSoundStore()
    const ui = useUIStore()
    expect(sound.audible).toBe(true)
    ui.startSyndicateHack()
    await nextTick()
    expect(sound.audible).toBe(false)
    expect(sound.on).toBe(true)
  })

  it('are off when the visitor or the map turns them off', () => {
    const sound = useSoundStore()
    sound.toggle()
    expect(sound.audible).toBe(false)
    sound.toggle()
    expect(sound.audible).toBe(true)
    useMapStore().sounds = { enabled: false, volume: null, sounds: {} }
    expect(sound.available).toBe(false)
    expect(sound.audible).toBe(false)
  })

  it('wait for the first press while on, and do not while off', () => {
    soundReady.value = false
    const sound = useSoundStore()
    expect(sound.waiting).toBe(true)
    soundReady.value = true
    expect(sound.ready).toBe(true)
    expect(sound.waiting).toBe(false)
    soundReady.value = false
    sound.toggle()
    expect(sound.waiting).toBe(false)
  })

  it('wake the sound in the press that turns them on, not in the one that turns them off', async () => {
    const wake = vi.spyOn(soundEngine, 'wake').mockResolvedValue(true)
    const sound = useSoundStore()
    expect(await sound.toggle()).toBe(false)
    expect(wake).not.toHaveBeenCalled()
    expect(await sound.toggle()).toBe(true)
    expect(wake).toHaveBeenCalledTimes(1)
    sound.toggle()
    await sound.setVolume(0.4)
    expect(wake).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })
})

