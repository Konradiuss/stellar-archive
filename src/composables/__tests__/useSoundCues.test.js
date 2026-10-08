// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'
import { UNLOCK_EVENTS, useSoundCues } from '../useSoundCues'
import { soundEngine } from '../../sound'
import { useSoundStore } from '../../stores/soundStore'

describe('the first press of the page', () => {
  afterEach(() => vi.restoreAllMocks())

  // Was: only pointerdown and keydown were heard; for a finger the browser counts the lifting, so a phone stayed silent.
  it('lets the page sound however it comes: a key, a mouse, a finger lifted', () => {
    setActivePinia(createPinia())
    const unlock = vi.spyOn(soundEngine, 'unlock').mockReturnValue(true)
    const scope = effectScope()
    scope.run(() => useSoundCues())
    expect(UNLOCK_EVENTS).toEqual(expect.arrayContaining(['pointerup', 'touchend', 'click']))
    for (const type of ['pointerup', 'touchend', 'click']) {
      unlock.mockClear()
      document.body.dispatchEvent(new Event(type, { bubbles: true }))
      expect(unlock, type).toHaveBeenCalled()
    }
    scope.stop()
    unlock.mockClear()
    document.body.dispatchEvent(new Event('touchend', { bubbles: true }))
    expect(unlock).not.toHaveBeenCalled()
  })

  // Was: with the sound effects off, the first press still created the audio context and downloaded the map's recordings.
  it('prepares no sound on a press while the sound effects are off', () => {
    localStorage.clear()
    setActivePinia(createPinia())
    const unlock = vi.spyOn(soundEngine, 'unlock').mockReturnValue(true)
    vi.spyOn(soundEngine, 'wake').mockResolvedValue(true)
    const scope = effectScope()
    scope.run(() => useSoundCues())
    const sound = useSoundStore()
    sound.toggle()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(unlock).not.toHaveBeenCalled()
    sound.toggle()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(unlock).toHaveBeenCalled()
    scope.stop()
  })
})

