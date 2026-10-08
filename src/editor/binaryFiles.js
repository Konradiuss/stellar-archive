// The draft holds strings (localStorage), so a sound is kept as a data URL.
// A file is a sound by its extension only, never by its content.

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
const EXTENSION = new RegExp(`\\.(${Object.keys(SOUND_TYPES).join('|')})$`, 'i')

/** Uploads accept only what every browser plays. */
export const UPLOAD_EXTENSIONS = Object.freeze(['wav', 'mp3', 'ogg'])

// The draft has ~5 MB of localStorage and base64 adds a third.
export const MAX_SOUND_BYTES = 300 * 1024

export const isBinaryPath = path => EXTENSION.test(String(path ?? ''))

export const extensionOf = path => EXTENSION.exec(String(path ?? ''))?.[1].toLowerCase() ?? null

export const mimeOf = path => SOUND_TYPES[extensionOf(path)] ?? 'application/octet-stream'

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

export const fileBytes = (path, value) => (isBinaryPath(path) ? bytesOf(value) : new TextEncoder().encode(value))
