import { safeStorage, siteFolder } from '../composables/usePersistentState'
import { bytesOf, isBinaryPath, isDataUrl, mimeOf, readRef } from './binaryFiles'
import { getBlob } from './blobStore'

const DRAFT_PREFIX = 'spacemap:draft:'
const PUBLISHED_PREFIX = 'spacemap:published:'
const PREVIEW_KEY = 'spacemap:preview'
// GitHub Pages serves old files for minutes after a commit: an editor opened meanwhile
// starts from what was published.
const PUBLISHED_FOR_MS = 30 * 60 * 1000

const store = safeStorage

export const draftKey = (pathname = globalThis.location?.pathname ?? '/') => `${DRAFT_PREFIX}${siteFolder(pathname)}`

const EMPTY = () => ({ files: {}, bases: {} })

/** { files: { path: text | null (delete) }, bases: { path: git sha when editing began | null (new) } } */
export function loadDraft(key = draftKey()) {
  try {
    const value = JSON.parse(store('localStorage')?.getItem(key) ?? 'null')
    if (value && typeof value.files === 'object' && typeof value.bases === 'object') return { files: { ...value.files }, bases: { ...value.bases } }
  } catch {
    // Corrupt draft: start empty.
  }
  return EMPTY()
}

export function saveDraft(draft, key = draftKey()) {
  try {
    const storage = store('localStorage')
    if (!storage) return false
    if (Object.keys(draft.files).length) storage.setItem(key, JSON.stringify(draft))
    else storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export const publishedKey = (pathname = globalThis.location?.pathname ?? '/') => draftKey(pathname).replace(DRAFT_PREFIX, PUBLISHED_PREFIX)

const fresh = (files, now) => Object.fromEntries(Object.entries(files ?? {})
  .filter(([, record]) => record && typeof record === 'object' && now - record.at < PUBLISHED_FOR_MS))

/** { path: { before: the host's git sha, sha, text (null: deleted), at } } */
export function loadPublished(key = publishedKey(), now = Date.now()) {
  try {
    const value = JSON.parse(store('localStorage')?.getItem(key) ?? 'null')
    if (value && typeof value.files === 'object') return fresh(value.files, now)
  } catch {
    // Nothing kept: start from what the host serves.
  }
  return {}
}

export function savePublished(files, key = publishedKey(), now = Date.now()) {
  try {
    const kept = fresh(files, now)
    const storage = store('localStorage')
    if (!storage) return false
    if (Object.keys(kept).length) storage.setItem(key, JSON.stringify({ files: kept }))
    else storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function forgetPublished(key = publishedKey()) {
  try {
    store('localStorage')?.removeItem(key)
  } catch {
    // Storage blocked.
  }
}

export async function gitBlobSha(content) {
  const body = content instanceof Uint8Array ? content : new TextEncoder().encode(content)
  const head = new TextEncoder().encode(`blob ${body.length}\0`)
  const all = new Uint8Array(head.length + body.length)
  all.set(head)
  all.set(body, head.length)
  const digest = await crypto.subtle.digest('SHA-1', all)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function setPreview(on) {
  try {
    if (on) store('sessionStorage')?.setItem(PREVIEW_KEY, '1')
    else store('sessionStorage')?.removeItem(PREVIEW_KEY)
  } catch {
    // Storage blocked: the site shows its own files.
  }
}

export function isPreview() {
  try {
    return store('sessionStorage')?.getItem(PREVIEW_KEY) === '1'
  } catch {
    return false
  }
}

export function previewDraft(key = draftKey()) {
  if (!isPreview()) return null
  const draft = loadDraft(key)
  return Object.keys(draft.files).length ? draft : null
}

export function sitePath(url, mapUrl) {
  let folder
  let target
  try {
    folder = new URL('.', mapUrl).href
    target = new URL(url, mapUrl)
  } catch {
    return null
  }
  target.search = ''
  target.hash = ''
  if (!target.href.startsWith(folder)) return null
  const path = target.href.slice(folder.length)
  try {
    return decodeURIComponent(path)
  } catch {
    // A "%" that is not an escape (e.g. "100%zz.png") is part of the name.
    return path
  }
}

export function draftFetch(fetchText, draft, mapUrl) {
  return async url => {
    const path = sitePath(url, mapUrl)
    if (path !== null && Object.hasOwn(draft.files, path)) {
      if (draft.files[path] === null) throw new Error('HTTP 404')
      return draft.files[path]
    }
    return fetchText(url)
  }
}

/** → the Response of the draft's binary file, or null for the host's. */
export async function draftResponse(url, mapUrl, draft = previewDraft()) {
  if (!draft) return null
  const path = sitePath(url, mapUrl)
  if (path === null || !isBinaryPath(path) || !Object.hasOwn(draft.files, path)) return null
  const value = draft.files[path]
  if (value === null) return new Response(null, { status: 404 })
  const headers = { 'Content-Type': mimeOf(path) }
  if (isDataUrl(value)) return new Response(bytesOf(value), { headers })
  const ref = readRef(value)
  // Gone from this browser's store: the host's file rather than none.
  const blob = ref && await getBlob(ref.sha)
  return blob ? new Response(blob, { headers }) : null
}

/** → a blob: address of the draft's binary file at `url`, or null for the host's. */
export async function draftFileUrl(url, mapUrl, draft = previewDraft()) {
  const response = await draftResponse(url, mapUrl, draft)
  return response?.ok ? URL.createObjectURL(await response.blob()) : null
}

/** Tracks whose files the draft holds play those: their `src` becomes a blob: address. */
export async function draftTracks(tracks, mapUrl, draft = previewDraft()) {
  if (!draft) return tracks
  return Promise.all(tracks.map(async track => {
    const src = await draftFileUrl(track.src, mapUrl, draft).catch(() => null)
    return src ? { ...track, src } : track
  }))
}

// Reads the draft once per page (the preview reloads to switch drafts).
export function draftFileFetch(fetchFile, mapUrl, readDraft = previewDraft) {
  let draft
  return async url => {
    if (draft === undefined) draft = readDraft()
    return (await draftResponse(url, mapUrl(), draft)) ?? fetchFile(url)
  }
}
