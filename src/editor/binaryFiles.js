import { language, t } from '../i18n'

// The draft holds strings (localStorage): a binary file is a reference to its bytes in the
// blob store, "binary:<git sha>:<size>". A data URL is what drafts held before, and what the
// draft keeps when the browser has no IndexedDB.
// A file is a sound or a picture by its extension only, never by its content.

// Every audio type a map may name: a missing one is read as text and corrupted on publish.
const SOUND_TYPES = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm'
}
// SVG is text: it stays a text file.
const IMAGE_TYPES = {
  png: 'image/png',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon'
}
const TYPES = { ...SOUND_TYPES, ...IMAGE_TYPES }
const EXTENSION = new RegExp(`\\.(${Object.keys(TYPES).join('|')})$`, 'i')

/** Uploads accept only what every browser plays or shows. */
export const UPLOAD_EXTENSIONS = Object.freeze(['wav', 'mp3', 'ogg'])
export const IMAGE_UPLOAD_EXTENSIONS = Object.freeze(['png', 'gif', 'jpg', 'jpeg', 'webp', 'ico'])

export const MAX_SOUND_BYTES = 2 * 1024 * 1024
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_MUSIC_BYTES = 20 * 1024 * 1024
// Without IndexedDB a file goes into localStorage as a data URL: a bigger one would not fit.
export const MAX_INLINE_BYTES = 2 * 1024 * 1024

export const isBinaryPath = path => EXTENSION.test(String(path ?? ''))

export const extensionOf = path => EXTENSION.exec(String(path ?? ''))?.[1].toLowerCase() ?? null

export const isImagePath = path => Object.hasOwn(IMAGE_TYPES, extensionOf(path) ?? '')

export const isAudioPath = path => Object.hasOwn(SOUND_TYPES, extensionOf(path) ?? '')

export const mimeOf = path => TYPES[extensionOf(path)] ?? 'application/octet-stream'

export const base64Of = dataUrl => String(dataUrl ?? '').slice(String(dataUrl ?? '').indexOf(',') + 1)

// Chunked: spreading a long file into one call overflows the argument limit.
export function toBase64(bytes) {
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(binary)
}

export function bytesOf(dataUrl) {
  const binary = atob(base64Of(dataUrl))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const toDataUrl = (bytes, path) => `data:${mimeOf(path)};base64,${toBase64(bytes)}`

export const isDataUrl = value => typeof value === 'string' && value.startsWith('data:')

const REF = /^binary:([0-9a-f]{40}):(\d+)$/

export const binaryRef = (sha, size) => `binary:${sha}:${size}`

/** → { sha, size }, or null for anything else. */
export function readRef(value) {
  const match = REF.exec(typeof value === 'string' ? value : '')
  return match ? { sha: match[1], size: Number(match[2]) } : null
}

/** The bytes of a text or of a data URL; a reference has none of its own (see the blob store). */
export const fileBytes = (path, value) => (isBinaryPath(path) ? bytesOf(value) : new TextEncoder().encode(value))

/** The size in bytes of what the draft holds for a binary file. */
export const binarySize = value => readRef(value)?.size ?? (isDataUrl(value) ? bytesOf(value).length : 0)

/** "310 KB", "2.4 MB", in the units of the strings. */
export function sizeText(bytes) {
  if (bytes < 1024 * 1024) return t('editor.sizeKb', { size: Math.ceil(bytes / 1024) })
  return t('editor.sizeMb', { size: (Math.round((bytes / (1024 * 1024)) * 10) / 10).toLocaleString(language()) })
}
