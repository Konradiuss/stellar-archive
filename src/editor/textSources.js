// A text of the map lives in map.json or in a file of its own, with an optional format:
// the lore of a body, the world page, a legend, an article. Each is named by its owner:
// { at: 'body', place } | { at: 'root' } | { at: 'system', star } | { at: 'article', title }, and `keys`.

import { removeKey, setKey } from './jsonEdit'
import { EditError, idOf } from './starEdits'
import { bodyAt, bodyPath } from './systemEdits'
import { articleIndex } from './articleEdits'
import { isSitePath, lostFiles, sitePathOf, textFiles } from './siteFiles'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

export const SOURCE_KEYS = Object.freeze({
  lore: { text: 'lore', file: 'loreFile', format: 'loreFormat' },
  world: { text: 'worldLore', file: 'worldLoreFile', format: 'worldLoreFormat' },
  legend: { text: 'legend', file: 'legendFile', format: 'legendFormat' },
  article: { text: 'text', file: 'file', format: 'format' }
})

const keysOf = owner => SOURCE_KEYS[owner.keys]

/** → the owner object of the map, or null when it is not there (yet). */
export function sourceOwner(map, owner) {
  if (owner.at === 'root') return map
  if (owner.at === 'body') return bodyAt(map, owner.place)
  if (owner.at === 'system') return isObject(map.systems?.[owner.star]) ? map.systems[owner.star] : null
  const index = articleIndex(map, owner.title)
  return index < 0 ? null : map.wiki.articles[index]
}

/** → { text, file, format } as the map writes them. */
export function sourceOf(map, owner) {
  const object = sourceOwner(map, owner) ?? {}
  const keys = keysOf(owner)
  const value = key => (typeof object[key] === 'string' ? object[key] : null)
  return { text: value(keys.text), file: value(keys.file), format: value(keys.format) }
}

function pathOf(map, owner) {
  if (owner.at === 'root') return []
  if (owner.at === 'system') return ['systems', owner.star]
  if (owner.at === 'article') {
    const index = articleIndex(map, owner.title)
    if (index < 0) throw new EditError('editor.noArticle', { title: owner.title })
    return ['wiki', 'articles', index]
  }
  if (!bodyAt(map, owner.place)) throw new EditError('editor.noBody')
  return bodyPath(owner.place, map)
}

// A system is made for its legend: a star may have none yet.
function withOwner(text, owner) {
  const map = read(text)
  if (owner.at !== 'system' || sourceOwner(map, owner)) return text
  if (!(Array.isArray(map.stars) && map.stars.some(star => star?.id === owner.star))) throw new EditError('editor.noStar', { id: owner.star })
  return isObject(map.systems) ? setKey(text, ['systems'], owner.star, {}) : setKey(text, [], 'systems', { [owner.star]: {} })
}

function setField(text, owner, key, value) {
  if (value === null || value === undefined || value === '') {
    const map = read(text)
    return sourceOwner(map, owner) && Object.hasOwn(sourceOwner(map, owner), key) ? removeKey(text, pathOf(map, owner), key) : text
  }
  const next = withOwner(text, owner)
  return setKey(next, pathOf(read(next), owner), key, value)
}

/** The text written in map.json; an empty one is removed. */
export const setSourceText = (text, owner, value) => setField(text, owner, keysOf(owner).text, String(value ?? '').trim() ? String(value) : '')

/** 'wikitext' | 'markdown'; '' goes back to the format found from the file and the site. */
export const setSourceFormat = (text, owner, format) => setField(text, owner, keysOf(owner).format, format || '')

function filePath(value) {
  const path = sitePathOf(value)
  if (!path) throw new EditError('editor.badFilePath', { file: String(value ?? '') })
  return path
}

/** Out of map.json into a file of the site, which takes the text. */
export function sourceToFile(text, owner, path, inline = '') {
  const file = filePath(path)
  let next = setField(text, owner, keysOf(owner).file, file)
  next = setField(next, owner, keysOf(owner).text, '')
  return { text: next, create: { path: file, text: inline ?? '' } }
}

/** From its file into map.json; the file is deleted unless the map names it elsewhere. */
export function sourceToMap(text, owner, fileText = '') {
  let next = setField(text, owner, keysOf(owner).file, '')
  next = setSourceText(next, owner, fileText)
  return { text: next, orphans: lostFiles(text, next) }
}

/** Another file: a new path takes the text of the old file, an existing one is only pointed at. */
export function moveSourceFile(text, owner, path, fileText = '') {
  const file = filePath(path)
  const next = setField(text, owner, keysOf(owner).file, file)
  return { text: next, create: { path: file, text: fileText ?? '' }, orphans: lostFiles(text, next) }
}

function baseName(map, owner) {
  if (owner.at === 'root') return owner.keys === 'world' ? 'lore/world' : 'lore/legend'
  if (owner.at === 'system') return `lore/${idOf(owner.star)}-legend`
  if (owner.at === 'article') return `wiki/${idOf(owner.title, 'article')}`
  return `lore/${idOf(sourceOwner(map, owner)?.name, 'lore')}`
}

/** A free path for the text of `owner` in this format; `exists(path)` tells the files of the draft. */
export function suggestSourceFile(map, owner, format, exists = () => false) {
  const taken = new Set(textFiles(map).map(file => file.path))
  const base = baseName(map, owner)
  const extension = format === 'markdown' ? 'md' : 'wiki'
  let path = `${base}.${extension}`
  for (let n = 2; taken.has(path) || exists(path); n++) path = `${base}-${n}.${extension}`
  return path
}

export const isOutsideFile = file => typeof file === 'string' && !!file.trim() && !isSitePath(file)
