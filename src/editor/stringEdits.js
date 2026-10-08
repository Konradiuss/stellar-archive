// The texts of the map ("strings"): nested objects or dotted keys, as the site reads them (i18n/index.js).
// An edit goes where the text already is, so a map written by hand keeps its shape.

import { removeKey, setKey } from './jsonEdit'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

/** The path of a text in the map: under "strings", each step a key that may hold dots. */
export function stringPath(map, key) {
  const parts = key.split('.')
  const walk = (value, at) => {
    if (!isObject(value)) return null
    // The longest key first: "loader.title" before "loader" > "title".
    for (let end = parts.length; end > at; end--) {
      const name = parts.slice(at, end).join('.')
      if (!Object.hasOwn(value, name)) continue
      if (end === parts.length) return [name]
      const rest = walk(value[name], end)
      if (rest) return [name, ...rest]
    }
    return null
  }
  const found = walk(map?.strings, 0)
  return found ? ['strings', ...found] : null
}

/** A string, plural forms ({ one, other, … }) or undefined. */
export function stringValue(map, key) {
  const path = stringPath(map, key)
  if (!path) return undefined
  let value = map
  for (const step of path) value = value[step]
  return typeof value === 'string' || isObject(value) ? value : undefined
}

function dropEmpty(text, path) {
  let next = text
  for (let end = path.length - 1; end >= 1; end--) {
    let value = read(next)
    for (const step of path.slice(0, end)) value = value?.[step]
    if (!isObject(value) || Object.keys(value).length) break
    next = removeKey(next, path.slice(0, end - 1), path[end - 1])
  }
  return next
}

/**
 * Sets the text of `key` ('' removes it). With `form`, one plural form of it ('other', 'one', …); a plain text
 * the map has becomes { other } first. A new text goes nested under "strings".
 */
export function setString(text, key, value, { form = null } = {}) {
  const map = read(text)
  const line = String(value ?? '').trim()
  let path = stringPath(map, key)
  const current = path ? stringValue(map, key) : undefined
  if (form && isObject(current)) {
    if (line) return setKey(text, path, form, line)
    if (!Object.hasOwn(current, form)) return text
    const next = removeKey(text, path, form)
    // The last form gone: the text goes, and the objects it leaves empty.
    return Object.keys(current).length > 1 ? next : dropEmpty(removeKey(next, path.slice(0, -1), path.at(-1)), path)
  }
  if (!line) return path ? dropEmpty(removeKey(text, path.slice(0, -1), path.at(-1)), path) : text
  if (path) return setKey(text, path.slice(0, -1), path.at(-1), line)
  // New: nested, making the objects on the way.
  path = ['strings', ...key.split('.')]
  let next = text
  for (let end = 1; end < path.length; end++) {
    let value = read(next)
    for (const step of path.slice(0, end)) value = value?.[step]
    if (!isObject(value)) next = setKey(next, path.slice(0, end - 1), path[end - 1], {})
  }
  return setKey(next, path.slice(0, -1), path.at(-1), line)
}

/**
 * One plural form of `key` ('one', 'few', …). A plain text the map has is its general form ('other');
 * nothing yet becomes { [form]: value }; the last form emptied removes the text.
 */
export function setPluralForm(text, key, form, value) {
  const map = read(text)
  const current = stringValue(map, key)
  const line = String(value ?? '').trim()
  if (isObject(current)) return setString(text, key, value, { form })
  if (typeof current === 'string') {
    if (form === 'other') return setString(text, key, value)
    return line ? setKey(text, stringPath(map, key).slice(0, -1), stringPath(map, key).at(-1), { other: current, [form]: line }) : text
  }
  if (!line) return text
  // New: the form alone, made as a plain text first so the objects on the way are made too.
  const made = setString(text, key, line)
  const path = stringPath(read(made), key)
  return setKey(made, path.slice(0, -1), path.at(-1), { [form]: line })
}

/** A loader line as one text: a line with plural forms shows its general one. */
export function loaderText(map, key) {
  const value = stringValue(map, `loader.${key}`)
  if (typeof value === 'string') return value
  return isObject(value) && typeof value.other === 'string' ? value.other : ''
}

// Plural forms written by hand stay: only the general one changes.
export function setLoaderText(text, key, value) {
  const current = stringValue(read(text), `loader.${key}`)
  return setString(text, `loader.${key}`, value, { form: isObject(current) ? 'other' : null })
}
