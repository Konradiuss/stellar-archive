import { removeKey, setKey } from './jsonEdit'
import { lostFiles } from './siteFiles'
import { extensionOf } from './binaryFiles'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
const done = (before, text) => ({ text, orphans: lostFiles(before, text) })

/** An object, false (sound effects off) or undefined. */
export const soundsOf = map => map?.sounds

export const soundPath = (name, fileName) => `sounds/${name}.${extensionOf(fileName) ?? 'wav'}`

export function soundState(map, name) {
  const sounds = soundsOf(map)
  const value = isObject(sounds) ? sounds[name] : undefined
  if (value === false) return { kind: 'silent' }
  if (typeof value === 'string') return { kind: 'file', path: value }
  if (isObject(value)) {
    const volume = typeof value.volume === 'number' ? value.volume : undefined
    return typeof value.file === 'string' ? { kind: 'file', path: value.file, volume } : { kind: 'site', volume }
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

export function setSoundsEnabled(text, on) {
  const next = on ? (soundsOf(read(text)) === false ? removeKey(text, [], 'sounds') : text) : setKey(text, [], 'sounds', false)
  return done(text, next)
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

export function setSoundFile(text, name, path) {
  const base = withObject(text)
  const { volume } = soundState(read(base), name)
  return done(text, setKey(base, ['sounds'], name, volume === undefined ? path : { file: path, volume }))
}

export const silenceSound = (text, name) => done(text, setKey(withObject(text), ['sounds'], name, false))

export function resetSound(text, name) {
  if (!isObject(soundsOf(read(text)))) return done(text, text)
  return done(text, dropEmpty(removeKey(text, ['sounds'], name)))
}
