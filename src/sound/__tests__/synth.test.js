import { describe, expect, it } from 'vitest'
import { RECIPES, SOUND_NAMES, createNoiseBuffer } from '../synth'
import { FakeAudioContext } from './fakeAudio'

function kitOf() {
  const ctx = new FakeAudioContext()
  const out = ctx.createGain()
  return { ctx, out, noise: createNoiseBuffer(ctx, 1, () => 0.5), random: () => 0.5 }
}
const played = name => {
  const kit = kitOf()
  RECIPES[name](kit)
  return kit.ctx.started
}

describe('the sounds made in code', () => {
  it('have a recipe for every name a map file may replace', () => {
    expect(Object.keys(RECIPES).sort()).toEqual([...SOUND_NAMES].sort())
    for (const name of SOUND_NAMES) expect(played(name).length, name).toBeGreaterThan(0)
  })

  it('beep as a PC speaker: square waves', () => {
    for (const name of ['click', 'menuOpen', 'menuClose', 'menuMove', 'toggleOn', 'toggleOff', 'error', 'success', 'loaded', 'badCommand', 'pageTurn', 'typing', 'wikiPage']) {
      expect(played(name).every(sound => sound.type === 'square'), name).toBe(true)
    }
  })

  it('tell on from off and open from close by the direction of the pitch', () => {
    const pitches = name => played(name).map(sound => sound.frequency)
    expect(pitches('toggleOn')).toEqual([600, 900])
    expect(pitches('toggleOff')).toEqual([900, 600])
    expect(pitches('menuOpen')).toEqual([880, 1320])
    expect(pitches('menuClose')).toEqual([1320, 880])
  })

  it('print in blips shorter than the letters come', () => {
    const kit = kitOf()
    const oscillators = []
    const create = kit.ctx.createOscillator.bind(kit.ctx)
    kit.ctx.createOscillator = () => {
      const osc = create()
      oscillators.push(osc)
      return osc
    }
    RECIPES.typing(kit)
    expect(oscillators).toHaveLength(1)
    expect(oscillators[0].stoppedAt).toBeLessThan(0.04)
  })

  it('make the tube, the snow and the disk of noise, not of beeps alone', () => {
    for (const name of ['screenOn', 'screenOff', 'static', 'disk', 'warp', 'breaker']) {
      expect(played(name).some(sound => sound.kind === 'noise'), name).toBe(true)
    }
  })
})
