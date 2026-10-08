// The playlist, `music.tracks`: [{ title, author, file, url, license, duration }].
// An empty value removes its key; keys the site does not read stay.

import { appendItem, removeItem, removeKey, setKey, swapItems } from './jsonEdit'
import { EditError } from './starEdits'
import { isWebAddress } from './siteEdits'
import { lostFiles, sitePathOf } from './siteFiles'
import { isAudioPath } from './binaryFiles'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
const isEmpty = value => value === null || value === undefined || (typeof value === 'string' && !value.trim())
const done = (before, text) => ({ text, orphans: lostFiles(before, text) })

export const TRACK_FIELDS = ['title', 'author', 'url', 'license', 'duration']

export const tracksOf = map => (Array.isArray(map?.music?.tracks) ? map.music.tracks : [])

/** "225", "3:45" or "1:02:03" → seconds; null for anything else. */
export function parseDuration(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  const typed = String(value ?? '').trim().replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(typed)) return Number(typed) > 0 ? Number(typed) : null
  if (!/^\d+(:[0-5]\d){1,2}$/.test(typed)) return null
  const seconds = typed.split(':').reduce((total, part) => total * 60 + Number(part), 0)
  return seconds > 0 ? seconds : null
}

/** A site path of an audio file, or an http(s) address. */
export function trackFile(value) {
  const typed = String(value ?? '').trim()
  if (isWebAddress(typed)) return typed
  const path = sitePathOf(typed)
  if (!path || !isAudioPath(path)) throw new EditError('editor.badTrackFile', { file: typed })
  return path
}

function trackAt(text, index) {
  const track = tracksOf(read(text))[index]
  if (!isObject(track)) throw new EditError('editor.trackNotObject', { number: index + 1 })
  return track
}

/** track: { file, title?, duration? }; → { text, index }. */
export function addTrack(text, track) {
  const item = { ...track, file: trackFile(track.file) }
  for (const key of Object.keys(item)) if (isEmpty(item[key])) delete item[key]
  const map = read(text)
  const index = tracksOf(map).length
  if (!isObject(map.music)) return { text: setKey(text, [], 'music', { tracks: [item] }), index }
  if (!Array.isArray(map.music.tracks)) return { text: setKey(text, ['music'], 'tracks', [item]), index }
  return { text: appendItem(text, ['music', 'tracks'], item), index }
}

/** field: one of TRACK_FIELDS. */
export function setTrackField(text, index, field, value) {
  if (!TRACK_FIELDS.includes(field)) throw new Error(`No track field ${field}`)
  trackAt(text, index)
  const typed = typeof value === 'string' ? value.trim() : value
  let written = typed
  if (!isEmpty(typed)) {
    if (field === 'url' && !isWebAddress(typed)) throw new EditError('editor.badTrackUrl', { url: typed })
    if (field === 'duration') {
      const seconds = parseDuration(typed)
      if (seconds === null) throw new EditError('editor.badDuration', { value: String(typed) })
      written = Math.round(seconds)
    }
  }
  const path = ['music', 'tracks', index]
  return isEmpty(written) ? removeKey(text, path, field) : setKey(text, path, field, written)
}

/** A file of the site the playlist no longer names is deleted. */
export function setTrackFile(text, index, file) {
  trackAt(text, index)
  return done(text, setKey(text, ['music', 'tracks', index], 'file', trackFile(file)))
}

export function moveTrack(text, index, step) {
  const other = index + step
  const count = tracksOf(read(text)).length
  return other >= 0 && other < count ? swapItems(text, ['music', 'tracks'], index, other) : text
}

/** The last track takes `music` with it, unless it holds more than the list. */
export function removeTrack(text, index) {
  let next = removeItem(text, ['music', 'tracks'], index)
  const music = read(next).music
  if (!tracksOf({ music }).length && Object.keys(music).length === 1) next = removeKey(next, [], 'music')
  return done(text, next)
}

/** `music/<name>.<ext>`, not one of `taken`. */
export function musicPath(fileName, taken) {
  const dot = fileName.lastIndexOf('.')
  const extension = fileName.slice(dot + 1).toLowerCase()
  const stem = (dot > 0 ? fileName.slice(0, dot) : fileName).toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track'
  for (let number = 1; ; number++) {
    const path = `music/${number === 1 ? stem : `${stem}-${number}`}.${extension}`
    if (!taken.has(path)) return path
  }
}

/** "night_at the-citadel.mp3" → "night at the citadel". */
export const titleOf = fileName => fileName.replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').trim() || fileName
