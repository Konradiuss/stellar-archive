import { describe, expect, it, vi } from 'vitest'
import { SLEEP_AFTER_MS, createSoundEngine } from '../engine'
import { FakeAudioContext } from './fakeAudio'

function engineOf(options = {}) {
  let time = 1000
  const clock = { advance: ms => { time += ms } }
  const fetchFile = vi.fn(async url => ({ ok: !url.includes('missing'), status: 404, arrayBuffer: async () => `bytes of ${url}` }))
  const onFileFailed = vi.fn()
  const engine = createSoundEngine({ AudioContextClass: FakeAudioContext, fetchFile, onFileFailed, now: () => time, random: () => 0.5, ...options })
  return { engine, clock, fetchFile, onFileFailed }
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('the sound engine', () => {
  it('is silent until the first press lets the page sound', () => {
    const { engine } = engineOf()
    expect(engine.play('click')).toBe(false)
    expect(engine.unlock()).toBe(true)
    expect(engine.play('click')).toBe(true)
    expect(engine.recent()).toEqual(['click'])
  })

  it('is silent when turned off, and without Web Audio at all', () => {
    const { engine } = engineOf()
    engine.unlock()
    engine.setEnabled(false)
    expect(engine.play('click')).toBe(false)
    const bare = createSoundEngine({ AudioContextClass: null })
    expect(bare.unlock()).toBe(false)
    expect(bare.play('click')).toBe(false)
    expect(engine.play('no such sound')).toBe(false)
  })

  it('keeps the printing to one blip in 45 ms', () => {
    const { engine, clock } = engineOf()
    engine.unlock()
    let blips = 0
    for (let step = 0; step < 30; step++) {
      if (engine.play('typing')) blips++
      clock.advance(15)
    }
    // 450 ms of letters every 15 ms: ten blips, not thirty.
    expect(blips).toBe(10)
  })

  it('lets a sound of its own stand for a press, but not the printing going on behind', () => {
    const { engine, clock } = engineOf()
    engine.unlock()
    engine.play('menuOpen')
    expect(engine.cuedWithin(50)).toBe(true)
    clock.advance(60)
    expect(engine.cuedWithin(50)).toBe(false)
    // Was: the lore printing every 15 ms kept the click of every button quiet.
    engine.play('typing')
    engine.play('hover')
    expect(engine.cuedWithin(50)).toBe(false)
  })

  it('squares the volume of the slider: the low half is heard finer', () => {
    let ctx = null
    const { engine } = engineOf({ AudioContextClass: class extends FakeAudioContext { constructor() { super(); ctx = this } } })
    engine.setVolume(0.5)
    engine.unlock()
    // The first gain made is the master, before the speakers.
    const master = ctx.gains[0]
    expect(master.target).toBe(ctx.destination)
    expect(master.gain.value).toBeCloseTo(0.25)
    engine.setVolume(0.2)
    expect(master.gain.value).toBeCloseTo(0.04)
    engine.setVolume(7)
    expect(master.gain.value).toBe(1)
  })

  it('plays the recording of the site and the files of the map, the recipe until they are loaded', async () => {
    let ctx = null
    const { engine, fetchFile } = engineOf({ files: { breaker: 'assets/breaker.wav' }, AudioContextClass: class extends FakeAudioContext { constructor() { super(); ctx = this } } })
    engine.setOverrides({ click: { src: 'https://site.example/sounds/click.wav' }, hover: { silent: true } })
    engine.unlock()
    // Fetched on the first press (in a promise), decoded a moment later.
    await Promise.resolve()
    expect(fetchFile.mock.calls.map(([url]) => url).sort()).toEqual(['assets/breaker.wav', 'https://site.example/sounds/click.wav'])
    await flush()
    engine.play('click')
    engine.play('breaker')
    expect(engine.play('hover')).toBe(false)
    expect(engine.recent()).toEqual(['click', 'breaker'])
    expect(ctx.started.filter(sound => sound.kind === 'recording').map(sound => sound.buffer.from).sort())
      .toEqual(['bytes of assets/breaker.wav', 'bytes of https://site.example/sounds/click.wav'])
    expect(ctx.started.filter(sound => sound.kind === 'oscillator')).toEqual([])
  })

  it('falls back to the recipe when a file of the map cannot be played, and says so', async () => {
    const { engine, onFileFailed } = engineOf()
    engine.setOverrides({ click: { src: 'sounds/missing.wav' } })
    engine.unlock()
    await flush()
    expect(onFileFailed).toHaveBeenCalledWith('click', 'sounds/missing.wav')
    expect(engine.play('click')).toBe(true)
  })

  // Suspended, as a browser keeps it until a press counts (a finger on a phone, an iPhone after a call).
  class SuspendedContext extends FakeAudioContext {
    constructor() {
      super()
      this.state = 'suspended'
      this.resumed = 0
      SuspendedContext.last = this
    }

    resume() {
      this.resumed++
      return Promise.resolve()
    }

    start() {
      this.state = 'running'
      this.onstatechange?.()
    }
  }

  // Was: sounds asked for meanwhile were kept by the context and all played at once when it started.
  it('gives a context not running yet no sound, and asks it to start on every press', () => {
    const states = []
    const { engine } = engineOf({ AudioContextClass: SuspendedContext, onStateChange: running => states.push(running) })
    engine.unlock()
    const ctx = SuspendedContext.last
    expect(engine.play('click')).toBe(false)
    expect(engine.play('typing')).toBe(false)
    expect(ctx.started).toEqual([])
    expect(engine.running).toBe(false)
    engine.unlock()
    expect(ctx.resumed).toBe(2)

    ctx.start()
    expect(states).toEqual([false, true])
    expect(engine.running).toBe(true)
    expect(engine.play('click')).toBe(true)
    expect(ctx.started.length).toBeGreaterThan(0)
    engine.unlock()
    expect(ctx.resumed).toBe(2)
  })

  it('wakes a context an iPhone interrupted', () => {
    const { engine } = engineOf({ AudioContextClass: SuspendedContext })
    engine.unlock()
    const ctx = SuspendedContext.last
    ctx.start()
    ctx.state = 'interrupted'
    expect(engine.play('click')).toBe(false)
    engine.unlock()
    expect(ctx.resumed).toBe(2)
  })

  // Was: a file the draft could not give (a broken data URL) threw out of the first press of the page.
  it('fails a file that cannot be asked for, not the press', async () => {
    const onFileFailed = vi.fn()
    const { engine } = engineOf({ files: { breaker: 'x.wav' }, fetchFile: () => { throw new Error('broken') }, onFileFailed })
    expect(() => engine.unlock()).not.toThrow()
    await flush()
    expect(onFileFailed).toHaveBeenCalledWith('breaker', 'x.wav')
    expect(engine.play('breaker')).toBe(true)
  })

  // Was: ▶ of Special:Sounds was silent with the sound effects off, and said nothing.
  it('plays a sound asked for by name even when turned off, as the site has it', () => {
    const { engine } = engineOf()
    engine.unlock()
    engine.setOverrides({ hover: { silent: true } })
    engine.setEnabled(false)
    expect(engine.play('click')).toBe(false)
    expect(engine.play('click', { evenIfOff: true })).toBe(true)
    expect(engine.play('hover', { evenIfOff: true })).toBe(false)
    expect(engine.recent()).toEqual(['click'])
  })

  class SleepyContext extends FakeAudioContext {
    constructor() {
      super()
      this.suspended = 0
      SleepyContext.last = this
    }

    suspend() {
      this.suspended++
      this.state = 'suspended'
      return Promise.resolve()
    }

    resume() {
      this.state = 'running'
      return Promise.resolve()
    }
  }

  // Was: turned off, the sound kept its context running until the tab closed.
  it('puts its context to sleep once turned off, after the sound playing then', () => {
    vi.useFakeTimers()
    try {
      const { engine } = engineOf({ AudioContextClass: SleepyContext })
      engine.unlock()
      const ctx = SleepyContext.last
      engine.play('toggleOff')
      engine.setEnabled(false)
      vi.advanceTimersByTime(SLEEP_AFTER_MS - 1)
      expect(ctx.suspended).toBe(0)
      vi.advanceTimersByTime(1)
      expect(ctx.suspended).toBe(1)

      engine.setEnabled(true)
      engine.unlock()
      engine.setEnabled(false)
      engine.setEnabled(true)
      vi.advanceTimersByTime(SLEEP_AFTER_MS)
      expect(ctx.suspended).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('wakes for a sound asked for by a press, and sleeps again after it while off', async () => {
    vi.useFakeTimers()
    try {
      const { engine } = engineOf({ AudioContextClass: SleepyContext })
      engine.unlock()
      const ctx = SleepyContext.last
      engine.setEnabled(false)
      vi.advanceTimersByTime(SLEEP_AFTER_MS)
      expect(engine.play('success', { evenIfOff: true })).toBe(false)
      expect(await engine.wake()).toBe(true)
      expect(engine.play('success', { evenIfOff: true })).toBe(true)
      vi.advanceTimersByTime(SLEEP_AFTER_MS)
      expect(ctx.suspended).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cannot wake without Web Audio', async () => {
    expect(await createSoundEngine({ AudioContextClass: null }).wake()).toBe(false)
  })
})

