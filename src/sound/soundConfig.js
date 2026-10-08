// "sounds": false (no sound effects), or { "volume": 0.35 (for a new visitor),
//   "<name>": "sounds/click.wav" | false (silence) | { "file", "volume" } }.

import { SOUND_NAMES } from './synth'
import { warnMap } from '../utils/mapJournal'
import { noteFileSource } from '../utils/fileSources'
import { safeImageSrc } from '../utils/richText/sanitize'

export const DEFAULT_SOUND_VOLUME = 0.35

const defaults = () => ({ enabled: true, volume: null, sounds: {} })

function volumeOf(value, where) {
  if (typeof value === 'number' && value >= 0 && value <= 1) return value
  warnMap(where, 'Must be a number from 0 to 1: left out.')
  return null
}

function fileOf(value, where, baseUrl) {
  const safe = typeof value === 'string' ? safeImageSrc(value) : null
  if (safe) {
    let src = null
    try {
      src = new URL(safe, baseUrl).href
    } catch {
      // Not an address a browser can read: told below.
    }
    if (src) {
      noteFileSource(src, baseUrl, { what: 'sound' })
      return src
    }
  }
  warnMap(where, `Bad file "${value}": the sound of the site is used.`)
  return null
}

function soundOf(name, value, baseUrl) {
  const where = `sounds.${name}`
  if (value === false) return { silent: true }
  if (typeof value === 'string') {
    const src = fileOf(value, where, baseUrl)
    return src ? { src } : null
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sound = {}
    if (value.file !== undefined) {
      const src = fileOf(value.file, `${where}.file`, baseUrl)
      if (src) sound.src = src
    }
    if (value.volume !== undefined) {
      const volume = volumeOf(value.volume, `${where}.volume`)
      if (volume !== null) sound.volume = volume
    }
    return Object.keys(sound).length ? sound : null
  }
  warnMap(where, 'Must be a file, false or { "file", "volume" }: the sound of the site is used.')
  return null
}

// → { enabled, volume (null: the default), sounds: { name: { src?, silent?, volume? } } }; paths are read against `baseUrl`.
export function normalizeSoundConfig(raw, baseUrl) {
  if (raw === undefined || raw === null) return defaults()
  if (raw === false) return { ...defaults(), enabled: false }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    warnMap('sounds', 'Must be an object or false: the sounds of the site are used.')
    return defaults()
  }
  const config = defaults()
  for (const [name, value] of Object.entries(raw)) {
    if (name === 'volume') {
      config.volume = volumeOf(value, 'sounds.volume')
    } else if (!SOUND_NAMES.includes(name)) {
      warnMap(`sounds.${name}`, 'Is not a sound of the site: left out. The names are on the wiki page Special:Sounds.')
    } else {
      const sound = soundOf(name, value, baseUrl)
      if (sound) config.sounds[name] = sound
    }
  }
  return config
}
