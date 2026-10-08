// Browsers let a page sound only after a press: the AudioContext is made on the first one (unlock),
// and until then every sound is skipped silently.

import { RECIPES, SOUND_NAMES, createNoiseBuffer } from './synth'

// The least time between two plays of one sound, so quick repeats do not pile up into a buzz.
const MIN_GAP_MS = {
  typing: 45, hover: 30, click: 30, menuMove: 25, loaderLine: 40,
  starLock: 60, planetHover: 60, pageTurn: 40,
  // The snow of every side screen switching together is one hiss.
  static: 400,
  glitch: 600
}
const DEFAULT_GAP_MS = 20
// Every sound of synth.js is shorter than this.
export const SLEEP_AFTER_MS = 1500
// Sounds that answer no press: the generic click is not kept quiet for them.
const BACKGROUND = new Set(['typing', 'static', 'glitch', 'hover', 'starLock', 'planetHover', 'loaderLine', 'loaded', 'disk', 'screenOn'])
export const RECENT_LIMIT = 200
// The volume of the slider is squared: the ear hears the low half finer.
const loudness = volume => volume * volume

// files: { name: url }; fetchFile(url) → Response.
export function createSoundEngine({
  AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  fetchFile = url => fetch(url),
  now = () => globalThis.performance?.now() ?? Date.now(),
  random = Math.random,
  files = {},
  onFileFailed = (name, url) => console.warn(`Sound "${name}": ${url} cannot be played, the sound of the site is used.`),
  onStateChange = () => {}
} = {}) {
  let ctx = null
  let master = null
  let kit = null
  let volume = 0.35
  let enabled = true
  // { name: { src, silent, volume } } of the map file.
  let overrides = {}
  // url → AudioBuffer | 'loading' | null (failed)
  const buffers = new Map()
  const lastPlayed = new Map()
  const played = []
  let playedCount = 0
  let lastCueAt = -Infinity

  const running = () => ctx?.state === 'running'

  // Off: the context is suspended once the last sound is out; a running one keeps the device's audio busy (phone battery).
  let sleepTimer = null
  function sleepSoon() {
    clearTimeout(sleepTimer)
    sleepTimer = setTimeout(() => {
      if (!enabled && running()) ctx.suspend?.()?.catch?.(() => {})
    }, SLEEP_AFTER_MS)
  }

  function unlock() {
    if (!AudioContextClass) return false
    if (!ctx) {
      try {
        ctx = new AudioContextClass()
      } catch {
        AudioContextClass = null
        return false
      }
      master = ctx.createGain()
      master.gain.value = loudness(volume)
      master.connect(ctx.destination)
      kit = { ctx, out: master, noise: createNoiseBuffer(ctx, 2, random), random }
      ctx.onstatechange = () => onStateChange(running())
      onStateChange(running())
      loadFiles()
    }
    // Suspended before the first press, or "interrupted" on an iPhone after a call.
    if (!running()) ctx.resume?.()?.catch?.(() => {})
    return true
  }

  function sourceOf(name) {
    const override = overrides[name]
    if (override?.src) return override.src
    return files[name] ?? null
  }

  function loadFiles() {
    if (!ctx) return
    for (const name of SOUND_NAMES) {
      const src = sourceOf(name)
      if (!src || buffers.has(src)) continue
      buffers.set(src, 'loading')
      // In a promise: a fetchFile that throws at once fails this file, not the press.
      Promise.resolve()
        .then(() => fetchFile(src))
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.arrayBuffer()
        })
        .then(data => ctx.decodeAudioData(data))
        .then(buffer => buffers.set(src, buffer))
        .catch(() => {
          buffers.set(src, null)
          onFileFailed(name, src)
        })
    }
  }

  // false when not played. `evenIfOff`: played though the visitor turned the effects off (▶ of Special:Sounds).
  function play(name, { evenIfOff = false } = {}) {
    // Counted even when silent: it stands for this press, so the generic click keeps quiet.
    if (!BACKGROUND.has(name)) lastCueAt = now()
    const recipe = RECIPES[name]
    const override = overrides[name]
    // A context not running yet queues what it is given and plays it all at once when it starts.
    if (!recipe || (!enabled && !evenIfOff) || !running() || override?.silent) return false
    const time = now()
    if (time - (lastPlayed.get(name) ?? -Infinity) < (MIN_GAP_MS[name] ?? DEFAULT_GAP_MS)) return false
    lastPlayed.set(name, time)

    let out = master
    if (override?.volume !== undefined && override.volume !== null) {
      out = ctx.createGain()
      out.gain.value = override.volume
      out.connect(master)
    }
    const src = sourceOf(name)
    const buffer = src ? buffers.get(src) : null
    if (buffer && buffer !== 'loading') {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(out)
      source.start()
    } else {
      recipe({ ...kit, out })
    }
    if (!enabled) sleepSoon()
    played.push(name)
    playedCount++
    if (played.length > RECENT_LIMIT) played.shift()
    return true
  }

  // decodeAudioData detaches its buffer, so it gets a copy.
  const decode = bytes => ctx.decodeAudioData(bytes.slice().buffer)

  // Plays even with the visitor's effects off, at their volume.
  async function audition(name, bytes = null) {
    if (!unlock()) return false
    try {
      if (bytes) {
        const source = ctx.createBufferSource()
        source.buffer = await decode(bytes)
        source.connect(master)
        source.start()
      } else if (RECIPES[name]) {
        RECIPES[name](kit)
      } else {
        return false
      }
      return true
    } catch {
      return false
    }
  }

  // true where there is no Web Audio to ask.
  async function canDecode(bytes) {
    if (!unlock()) return true
    try {
      await decode(bytes)
      return true
    } catch {
      return false
    }
  }

  // Resumes the context and waits for it: a press may ask for a sound while the effects were off and asleep.
  async function wake() {
    clearTimeout(sleepTimer)
    if (!unlock()) return false
    if (!running()) {
      try {
        await ctx.resume?.()
      } catch {
        return false
      }
    }
    return running()
  }

  return {
    unlock,
    wake,
    play,
    audition,
    canDecode,
    // 0..1
    setVolume(value) {
      volume = Math.min(1, Math.max(0, Number(value) || 0))
      if (master) master.gain.value = loudness(volume)
    },
    setEnabled(on) {
      enabled = !!on
      if (enabled) clearTimeout(sleepTimer)
      else sleepSoon()
    },
    setOverrides(next) {
      overrides = next ?? {}
      loadFiles()
    },
    cuedWithin(ms) {
      return now() - lastCueAt < ms
    },
    recent() {
      return [...played]
    },
    get playedCount() {
      return playedCount
    },
    get unlocked() {
      return !!ctx
    },
    get running() {
      return running()
    }
  }
}
