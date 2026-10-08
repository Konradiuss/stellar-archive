// The settings of the whole site: `site`, `terminal`, `loreConfig`, `wiki.portal`.
// An empty value removes its key, and an object left empty goes with it.

import { renameKey, setKey } from './jsonEdit'
import { EditError } from './starEdits'
import { lostFiles, sitePathOf } from './siteFiles'
import { setIn } from './nestedEdits'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
const isEmpty = value => value === null || value === undefined || (typeof value === 'string' && !value.trim())

export const isWebAddress = value => {
  try {
    return /^https?:$/.test(new URL(String(value).trim()).protocol)
  } catch {
    return false
  }
}

export const SITE_FIELDS = ['title', 'titleTemplate', 'description', 'language', 'url', 'favicon', 'preview']

/** field: one of SITE_FIELDS; a picture the map no longer names is deleted. */
export function setSiteField(text, field, value) {
  const next = siteField(text, field, value)
  return { text: next, orphans: lostFiles(text, next) }
}

function siteField(text, field, value) {
  if (!SITE_FIELDS.includes(field)) throw new Error(`No site field ${field}`)
  const typed = typeof value === 'string' ? value.trim() : value
  if (!isEmpty(typed)) {
    if (field === 'titleTemplate' && !typed.includes('{page}')) throw new EditError('editor.templateNeedsPage')
    if (field === 'url' && !isWebAddress(typed)) throw new EditError('editor.badSiteUrl', { url: typed })
    if (field === 'language') {
      let tag = null
      try {
        tag = Intl.getCanonicalLocales(typed)[0] ?? null
      } catch {
        tag = null
      }
      if (!tag) throw new EditError('editor.badLanguage', { language: typed })
      return setIn(text, ['site'], field, tag)
    }
  }
  return setIn(text, ['site'], field, typed)
}

// Must match utils/terminal.js.
const DOS_NAME = /^[^\s\\/:*?"<>|]+$/
const terminalFiles = map => (isObject(map.terminal?.files) ? map.terminal.files : {})

function dosName(map, name, except = null) {
  const wanted = String(name ?? '').trim().toUpperCase()
  if (!DOS_NAME.test(wanted)) throw new EditError('editor.badDosName', { name: wanted })
  const taken = Object.keys(terminalFiles(map)).some(each => each.toUpperCase() === wanted && each !== except)
  if (taken) throw new EditError('editor.dosNameTaken', { name: wanted })
  return wanted
}

function textPath(value) {
  const path = sitePathOf(value)
  if (!path) throw new EditError('editor.badFilePath', { file: String(value ?? '') })
  return path
}

/** '' goes back to the built-in script; a script the map no longer names is deleted. */
export function setTerminalScript(text, path) {
  const next = setIn(text, ['terminal'], 'script', isEmpty(path) ? '' : textPath(path))
  return { text: next, orphans: lostFiles(text, next) }
}

/** A file of C:\ for TYPE: its DOS name and the text file it shows. */
export function addTerminalFile(text, name, path) {
  const map = read(text)
  const key = dosName(map, name)
  const file = textPath(path)
  return { text: setIn(text, ['terminal', 'files'], key, file), create: { path: file, text: '' } }
}

export function renameTerminalFile(text, name, newName) {
  const map = read(text)
  const key = dosName(map, newName, name)
  if (key === name) return text
  return renameKey(text, ['terminal', 'files'], name, key)
}

export function setTerminalFilePath(text, name, path) {
  const next = setKey(text, ['terminal', 'files'], name, textPath(path))
  return { text: next, create: { path: textPath(path), text: '' }, orphans: lostFiles(text, next) }
}

export function removeTerminalFile(text, name) {
  const next = setIn(text, ['terminal', 'files'], name, '')
  return { text: next, orphans: lostFiles(text, next) }
}

/** On is the default, so only `false` is written. */
export const setSyndicate = (text, on) => setIn(text, ['terminal'], 'syndicate', on ? '' : false)

/** field: 'format' | 'images' | 'wikiUrl'. */
export function setLoreConfig(text, field, value) {
  const typed = typeof value === 'string' ? value.trim() : value
  if (field === 'wikiUrl' && !isEmpty(typed) && !isWebAddress(typed)) throw new EditError('editor.badWikiUrl', { url: typed })
  if (field === 'images' && !isEmpty(typed) && !sitePathOf(typed)) throw new EditError('editor.badFilePath', { file: typed })
  return setIn(text, ['loreConfig'], field, typed)
}

/** The portal of the home page is on unless `wiki.portal` is false. */
export const setPortal = (text, on) => setIn(text, ['wiki'], 'portal', on ? '' : false)
