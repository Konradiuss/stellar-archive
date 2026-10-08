import { collectMapNotes } from '../utils/mapJournal'
import { MAP_FILE, checkMap } from '../utils/mapCheck'
import { normalizeWiki } from '../utils/wikiPages'
import { loreEntries } from '../utils/richText/lore'
import { isImagePath } from './binaryFiles'

// Relative and inside the site: no scheme, no leading "/", no "..".
export const isSitePath = path => typeof path === 'string' && !!path.trim() && !/^[a-z][a-z\d+.-]*:|^\/|(^|\/)\.\.(\/|$)/i.test(path.trim())
export const cleanPath = path => path.trim().replace(/^\.\//, '')
export const sitePathOf = path => (isSitePath(path) ? cleanPath(path) : null)

/** [{ path, kind: 'map' | 'text' | 'terminal' | 'sound' | 'picture' }]: the map first, then sorted. */
export function textFiles(raw) {
  const files = new Map([[MAP_FILE, 'map']])
  // Through checkMap (quietly), so the parts of a broken map are found where the site finds them.
  const { result: data } = collectMapNotes(() => {
    const checked = checkMap(raw)
    return checked.data ? { ...checked.data, wiki: normalizeWiki(checked.data.wiki) } : null
  })
  if (data) {
    for (const entry of loreEntries(data)) if (isSitePath(entry.file)) files.set(cleanPath(entry.file), 'text')
    const terminal = data.terminal
    if (isSitePath(terminal?.script)) files.set(cleanPath(terminal.script), 'terminal')
    for (const [, path] of terminal?.files ?? []) if (isSitePath(path)) files.set(cleanPath(path), 'terminal')
    for (const path of [data.site?.favicon, data.site?.preview]) if (isSitePath(path) && isImagePath(path)) files.set(cleanPath(path), 'picture')
  }
  for (const path of soundFiles(raw)) files.set(path, 'sound')
  const [map, ...others] = [...files]
  others.sort(([a], [b]) => (a < b ? -1 : 1))
  return [map, ...others].map(([path, kind]) => ({ path, kind }))
}

export function soundFiles(raw) {
  const sounds = raw?.sounds
  if (!sounds || typeof sounds !== 'object' || Array.isArray(sounds)) return []
  const paths = Object.entries(sounds)
    .filter(([name]) => name !== 'volume')
    .map(([, value]) => (typeof value === 'string' ? value : value?.file))
    .map(sitePathOf)
    .filter(Boolean)
  return [...new Set(paths)]
}

// Not read with the others when the editor opens: a playlist is many megabytes.
export function musicFiles(raw) {
  const tracks = Array.isArray(raw?.music?.tracks) ? raw.music.tracks : []
  return [...new Set(tracks.map(track => sitePathOf(track?.file)).filter(Boolean))]
}

const read = text => {
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    return null
  }
}

export function namedPaths(raw) {
  const paths = new Set()
  const walk = value => {
    if (typeof value === 'string') {
      const path = sitePathOf(value)
      if (path) paths.add(path)
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) walk(item)
    }
  }
  walk(raw)
  return paths
}

// A file that any other part of the map still names (e.g. the playlist) is not lost.
export function lostFiles(before, after) {
  const kept = namedPaths(read(after))
  // Nothing in the map names the map file itself.
  kept.add(MAP_FILE)
  const named = read(before)
  return [...new Set([...textFiles(named).map(file => file.path), ...musicFiles(named)])].filter(path => !kept.has(path))
}
