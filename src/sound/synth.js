// A recipe is `(kit) => void`: kit = { ctx, out, noise, random }, `out` the node to play into.

export const SOUND_NAMES = Object.freeze([
  'click', 'hover', 'menuOpen', 'menuClose', 'menuMove', 'toggleOn', 'toggleOff', 'error', 'success',
  'screenOn', 'screenOff', 'warp', 'static', 'glitch',
  'loaderLine', 'loaded', 'loadError', 'disk',
  'breaker', 'starLock', 'planetHover', 'planetSelect', 'typing', 'windowOpen', 'windowClose',
  'badCommand', 'pageTurn', 'wikiPage'
])

const BEEP_WAVE = 'square'
const BEEP_LOWPASS = 3800

export function createNoiseBuffer(ctx, seconds = 2, random = Math.random) {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1
  return buffer
}

// f in Hz; dur and at in seconds.
export function tone(kit, { f, f2 = null, dur, type = BEEP_WAVE, gain = 0.12, at = 0, attack = 0.003, release = 0.03, lowpass = BEEP_LOWPASS }) {
  const { ctx, out } = kit
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(f, t)
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + dur)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = lowpass
  const level = ctx.createGain()
  level.gain.setValueAtTime(0, t)
  level.gain.linearRampToValueAtTime(gain, t + attack)
  level.gain.setValueAtTime(gain, t + Math.max(attack, dur - release))
  level.gain.linearRampToValueAtTime(0, t + dur)
  osc.connect(filter).connect(level).connect(out)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

// decay: falls away (a knock) instead of holding (a hiss).
export function noise(kit, { dur, gain = 0.3, type = 'bandpass', f = 1000, f2 = null, q = 1, at = 0, attack = 0.001, decay = true }) {
  const { ctx, out, random } = kit
  const t = ctx.currentTime + at
  const source = ctx.createBufferSource()
  source.buffer = kit.noise
  source.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(f, t)
  if (f2) filter.frequency.exponentialRampToValueAtTime(f2, t + dur)
  filter.Q.value = q
  const level = ctx.createGain()
  level.gain.setValueAtTime(0.0001, t)
  level.gain.exponentialRampToValueAtTime(gain, t + attack)
  if (decay) {
    level.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  } else {
    level.gain.setValueAtTime(gain, t + Math.max(attack, dur - 0.02))
    level.gain.linearRampToValueAtTime(0, t + dur)
  }
  source.connect(filter).connect(level).connect(out)
  // Each burst starts somewhere else in the noise: no two sound alike.
  source.start(t, random() * 1.5)
  source.stop(t + dur + 0.02)
}

const between = (kit, min, max) => min + kit.random() * (max - min)

export const RECIPES = Object.freeze({
  click: kit => tone(kit, { f: 1800, dur: 0.045, gain: 0.1 }),
  hover: kit => tone(kit, { f: 2400, dur: 0.018, gain: 0.035, release: 0.01 }),
  menuOpen: kit => {
    tone(kit, { f: 880, dur: 0.04 })
    tone(kit, { f: 1320, dur: 0.05, at: 0.045 })
  },
  menuClose: kit => {
    tone(kit, { f: 1320, dur: 0.04 })
    tone(kit, { f: 880, dur: 0.05, at: 0.045 })
  },
  menuMove: kit => tone(kit, { f: 1200, dur: 0.022, gain: 0.06, release: 0.01 }),
  toggleOn: kit => {
    tone(kit, { f: 600, dur: 0.035, gain: 0.09 })
    tone(kit, { f: 900, dur: 0.045, gain: 0.09, at: 0.04 })
  },
  toggleOff: kit => {
    tone(kit, { f: 900, dur: 0.035, gain: 0.09 })
    tone(kit, { f: 600, dur: 0.045, gain: 0.09, at: 0.04 })
  },
  error: kit => {
    tone(kit, { f: 150, dur: 0.12, gain: 0.14, lowpass: 1800 })
    tone(kit, { f: 150, dur: 0.16, gain: 0.14, lowpass: 1800, at: 0.15 })
  },
  success: kit => [1046, 1318, 1568].forEach((f, i) => tone(kit, { f, dur: i === 2 ? 0.14 : 0.07, gain: 0.09, at: i * 0.075 })),

  screenOn: kit => {
    noise(kit, { dur: 0.008, type: 'highpass', f: 2000, gain: 0.5 })
    tone(kit, { f: 70, f2: 38, dur: 0.3, gain: 0.35, type: 'sine', release: 0.2 })
    tone(kit, { f: 50, dur: 0.9, gain: 0.08, type: 'sawtooth', lowpass: 380, attack: 0.12, release: 0.6, at: 0.03 })
    for (let i = 0; i < 9; i++) noise(kit, { dur: 0.012, f: between(kit, 2000, 6000), q: 2, gain: between(kit, 0.05, 0.2), at: between(kit, 0.04, 0.45) })
    tone(kit, { f: 15600, dur: 1.0, gain: 0.012, type: 'sine', lowpass: 20000, attack: 0.3, release: 0.4, at: 0.2 })
  },
  screenOff: kit => {
    tone(kit, { f: 1500, f2: 60, dur: 0.2, gain: 0.18, type: 'sine', release: 0.05 })
    noise(kit, { dur: 0.14, type: 'highpass', f: 1500, gain: 0.18 })
    tone(kit, { f: 55, dur: 0.12, gain: 0.25, type: 'sine', at: 0.02 })
  },
  warp: kit => {
    noise(kit, { dur: 0.55, f: 200, f2: 4500, q: 5, gain: 0.45, attack: 0.15 })
    tone(kit, { f: 140, f2: 1100, dur: 0.5, gain: 0.07, type: 'sine', attack: 0.1, release: 0.15 })
    tone(kit, { f: 60, dur: 0.18, gain: 0.25, type: 'sine', at: 0.5 })
  },
  static: kit => {
    noise(kit, { dur: 0.45, type: 'bandpass', f: 3500, q: 0.6, gain: 0.1, decay: false })
    for (let i = 0; i < 7; i++) noise(kit, { dur: 0.01, f: between(kit, 1500, 7000), q: 3, gain: between(kit, 0.05, 0.2), at: between(kit, 0, 0.42) })
  },
  glitch: kit => {
    for (let i = 0; i < 9; i++) {
      if (kit.random() < 0.5) tone(kit, { f: between(kit, 90, 3000), dur: 0.024, gain: 0.08, at: i * 0.026, release: 0.004 })
      else noise(kit, { dur: 0.024, f: between(kit, 500, 6000), q: 4, gain: 0.25, at: i * 0.026, decay: false })
    }
  },

  loaderLine: kit => tone(kit, { f: between(kit, 1900, 2300), dur: 0.025, gain: 0.05, release: 0.01 }),
  loaded: kit => tone(kit, { f: 1000, dur: 0.2, gain: 0.1 }),
  loadError: kit => {
    tone(kit, { f: 330, dur: 0.25, gain: 0.12, lowpass: 2000 })
    tone(kit, { f: 220, dur: 0.45, gain: 0.12, lowpass: 2000, at: 0.27 })
  },
  disk: kit => {
    tone(kit, { f: 90, dur: 0.8, gain: 0.05, type: 'sawtooth', lowpass: 300, attack: 0.05, release: 0.1 })
    let at = 0.05
    for (let i = 0; i < 10; i++) {
      at += between(kit, 0.025, 0.07)
      noise(kit, { dur: 0.012, f: 1200, q: 6, gain: 0.35, at })
    }
  },

  // Stands in for the recording (engine.js) until it loads, or when it cannot.
  breaker: kit => {
    noise(kit, { dur: 0.006, type: 'highpass', f: 1800, gain: 0.6 })
    noise(kit, { dur: 0.07, type: 'lowpass', f: 900, q: 1, gain: 0.7 })
    tone(kit, { f: 110, f2: 55, dur: 0.13, gain: 0.45, type: 'sine', release: 0.1 })
    noise(kit, { dur: 0.005, f: 2500, q: 2, gain: 0.25, at: 0.035 })
  },
  starLock: kit => {
    tone(kit, { f: 1600, dur: 0.035, gain: 0.08 })
    tone(kit, { f: 2200, dur: 0.05, gain: 0.08, at: 0.05 })
  },
  planetHover: kit => tone(kit, { f: 1400, dur: 0.05, gain: 0.06, type: 'triangle' }),
  planetSelect: kit => [700, 1050, 1400, 1050, 1750].forEach((f, i) => tone(kit, { f, dur: 0.03, gain: 0.07, at: i * 0.04 })),
  typing: kit => tone(kit, { f: between(kit, 620, 900), dur: 0.014, gain: 0.04, release: 0.006 }),
  windowOpen: kit => tone(kit, { f: 400, f2: 1300, dur: 0.09, gain: 0.08 }),
  windowClose: kit => tone(kit, { f: 1300, f2: 400, dur: 0.09, gain: 0.08 }),
  badCommand: kit => tone(kit, { f: 880, dur: 0.2, gain: 0.11, lowpass: 5000 }),
  pageTurn: kit => tone(kit, { f: 900, dur: 0.022, gain: 0.07, release: 0.01 }),
  // Readers go from page to page often: short, and pitched a little apart each time.
  wikiPage: kit => {
    const shift = between(kit, 0.92, 1.08)
    ;[1200, 1800, 2400].forEach((f, i) => tone(kit, { f: f * shift, dur: 0.02, gain: 0.06, at: i * 0.025, release: 0.008 }))
  }
})
