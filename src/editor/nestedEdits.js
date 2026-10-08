// Settings kept in objects of the map (`site`, `terminal`, `theme.colors`, …): an empty value
// removes its key, and an object left empty goes with it.

import { removeKey, setKey } from './jsonEdit'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
const isEmpty = value => value === null || value === undefined || (typeof value === 'string' && !value.trim())

// The object at `path` (keys only), made where it is missing.
function withObject(text, path) {
  let next = text
  for (let depth = 1; depth <= path.length; depth++) {
    let value = read(next)
    for (const key of path.slice(0, depth)) value = value?.[key]
    if (!isObject(value)) next = setKey(next, path.slice(0, depth - 1), path[depth - 1], {})
  }
  return next
}

function removeEmpty(text, path) {
  let next = text
  for (let depth = path.length; depth >= 1; depth--) {
    let value = read(next)
    for (const key of path.slice(0, depth)) value = value?.[key]
    if (!isObject(value) || Object.keys(value).length) break
    next = removeKey(next, path.slice(0, depth - 1), path[depth - 1])
  }
  return next
}

/** Sets `key` of the object at `path`, making the objects on the way; an empty value removes it. */
export function setIn(text, path, key, value) {
  let owner = read(text)
  for (const step of path) owner = owner?.[step]
  if (isEmpty(value)) {
    if (!isObject(owner) || !Object.hasOwn(owner, key)) return text
    return removeEmpty(removeKey(text, path, key), path)
  }
  return setKey(withObject(text, path), path, key, value)
}
