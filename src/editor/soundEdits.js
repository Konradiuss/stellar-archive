import { removeKey, setKey } from './jsonEdit'
import { lostFiles } from './siteFiles'
import { extensionOf } from './binaryFiles'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
const done = (before, text) => ({ text, orphans: lostFiles(before, text) })

/** An object, false (sound effects off) or undefined. */
export const soundsOf = map => map?.sounds

export const soundsAreOn = map => {
  const sounds = soundsOf(map)
  return sounds !== false && !(isObject(sounds) && sounds.off === true)
}

export const soundPath = (name, fileName) => `sounds/${name}.${extensionOf(fileName) ?? 'wav'}`

export function soundState(map, name) {
  const sounds = soundsOf(map)
  const value = isObject(sounds) ? sounds[name] : undefined
  if (value === false) return { kind: 'silent' }
  if (typeof value === 'string') return { kind: 'file', path: value }
  if (isObject(value)) {
    const volume = typeof value.volume === 'number' ? value.volume : undefined
    const path = typeof value.file === 'string' ? value.file : undefined
    if (value.off === true) return { kind: 'silent', path, volume }
    return path ? { kind: 'file', path, volume } : { kind: 'site', volume }
  }
  return { kind: 'site' }
}

function withObject(text) {
  return isObject(soundsOf(read(text))) ? text : setKey(text, [], 'sounds', {})
}

function dropEmpty(text) {
  const sounds = soundsOf(read(text))
  return isObject(sounds) && !Object.keys(sounds).length ? removeKey(text, [], 'sounds') : text
}

// Off keeps the volume and the sounds of the map, for when they are on again.
export function setSoundsEnabled(text, on) {
  const sounds = soundsOf(read(text))
  if (on) {
    if (sounds === false) return done(text, removeKey(text, [], 'sounds'))
    return done(text, isObject(sounds) && 'off' in sounds ? dropEmpty(removeKey(text, ['sounds'], 'off')) : text)
  }
  if (isObject(sounds)) return done(text, setKey(text, ['sounds'], 'off', true))
  return done(text, sounds === false ? text : setKey(text, [], 'sounds', false))
}

/** percent: 0–100; null resets it to the site's default. */
export function setSoundsVolume(text, percent) {
  if (percent === null || percent === undefined || percent === '') {
    if (!isObject(soundsOf(read(text)))) return done(text, text)
    return done(text, dropEmpty(removeKey(text, ['sounds'], 'volume')))
  }
  const volume = Math.round(Math.min(100, Math.max(0, Number(percent)))) / 100
  return done(text, setKey(withObject(text), ['sounds'], 'volume', volume))
}

/** The loudness of one sound, 0–100 % of all sound effects; null takes it away. Its file and silence stay. */
export function setSoundVolume(text, name, percent) {
  const base = withObject(text)
  const value = soundsOf(read(base))[name]
  const own = typeof value === 'string' ? { file: value } : value === false ? { off: true } : isObject(value) ? { ...value } : {}
  if (percent === null || percent === undefined || percent === '') delete own.volume
  else own.volume = Math.round(Math.min(100, Math.max(0, Number(percent)))) / 100
  const keys = Object.keys(own)
  if (!keys.length) return resetSound(base, name)
  // The short forms, when nothing else is left.
  if (keys.length === 1 && typeof own.file === 'string') return done(text, setKey(base, ['sounds'], name, own.file))
  if (keys.length === 1 && own.off === true) return done(text, setKey(base, ['sounds'], name, false))
  return done(text, setKey(base, ['sounds'], name, own))
}

export function setSoundFile(text, name, path) {
  const base = withObject(text)
  const { volume } = soundState(read(base), name)
  return done(text, setKey(base, ['sounds'], name, volume === undefined ? path : { file: path, volume }))
}

// Silence keeps the sound's own file and volume, for when it is heard again.
export function silenceSound(text, name) {
  const base = withObject(text)
  const value = soundsOf(read(base))[name]
  if (typeof value === 'string') return done(text, setKey(base, ['sounds'], name, { file: value, off: true }))
  if (isObject(value)) return done(text, setKey(base, ['sounds', name], 'off', true))
  return done(text, setKey(base, ['sounds'], name, false))
}

export function unsilenceSound(text, name) {
  const sounds = soundsOf(read(text))
  const value = isObject(sounds) ? sounds[name] : undefined
  if (!isObject(value)) return resetSound(text, name)
  const rest = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'off'))
  const keys = Object.keys(rest)
  if (!keys.length) return resetSound(text, name)
  // Back to the short form when only the file is left.
  return done(text, keys.length === 1 && typeof rest.file === 'string' ? setKey(text, ['sounds'], name, rest.file) : removeKey(text, ['sounds', name], 'off'))
}

export function resetSound(text, name) {
  if (!isObject(soundsOf(read(text)))) return done(text, text)
  return done(text, dropEmpty(removeKey(text, ['sounds'], name)))
}
