import { removeKey, setKey } from './jsonEdit'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

export function loaderText(map, key) {
  const value = isObject(map?.strings) && isObject(map.strings.loader) ? map.strings.loader[key] : undefined
  if (typeof value === 'string') return value
  // Plural forms written by hand: take the general one.
  if (isObject(value) && typeof value.other === 'string') return value.other
  return ''
}

function withLoader(text) {
  let next = isObject(read(text).strings) ? text : setKey(text, [], 'strings', {})
  if (!isObject(read(next).strings.loader)) next = setKey(next, ['strings'], 'loader', {})
  return next
}

function dropEmpty(text) {
  let next = text
  const strings = read(next).strings
  if (isObject(strings?.loader) && !Object.keys(strings.loader).length) next = removeKey(next, ['strings'], 'loader')
  const after = read(next).strings
  if (isObject(after) && !Object.keys(after).length) next = removeKey(next, [], 'strings')
  return next
}

export function setLoaderText(text, key, value) {
  const line = String(value ?? '').trim()
  if (!line) {
    const map = read(text)
    if (!isObject(map.strings) || !isObject(map.strings.loader)) return text
    return dropEmpty(removeKey(text, ['strings', 'loader'], key))
  }
  return setKey(withLoader(text), ['strings', 'loader'], key, line)
}
