// Keeps the `place` of the articles pointing at the map: a renamed star or body takes them along,
// and a deleted one leaves no article tied to nothing.

import { removeKey, setValue } from './jsonEdit'
import { createPlaceFinder } from '../utils/placeFinder'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
const keyOf = name => String(name ?? '').trim().replace(/_/g, ' ').toLowerCase()

function finderOf(map) {
  const stars = (Array.isArray(map.stars) ? map.stars : []).filter(isObject)
  const systems = {}
  for (const [id, system] of Object.entries(isObject(map.systems) ? map.systems : {})) {
    if (isObject(system)) systems[id] = { planets: (Array.isArray(system.planets) ? system.planets : []).filter(isObject) }
  }
  return createPlaceFinder(stars, systems)
}

/** Whether the site finds something on the map by this name or id. */
export const placeExists = (map, name) => !!finderOf(map)(name)

function placed(map) {
  const articles = Array.isArray(map.wiki?.articles) ? map.wiki.articles : []
  return articles.map((article, index) => ({ index, place: isObject(article) && typeof article.place === 'string' ? article.place : null }))
    .filter(entry => entry.place)
}

/** After a rename: articles placed at one of `oldNames`, which leads nowhere now, are placed at `newName`. */
export function followRename(after, oldNames, newName) {
  const old = new Set(oldNames.filter(name => typeof name === 'string' && name.trim()).map(keyOf))
  const map = read(after)
  const find = finderOf(map)
  let next = after
  for (const { index, place } of placed(map)) {
    if (old.has(keyOf(place)) && !find(place)) next = setValue(next, ['wiki', 'articles', index, 'place'], newName)
  }
  return next
}

/** After a deletion: an article placed where the map had something, and has nothing now, loses its place. */
export function dropLostPlaces(before, after) {
  const findBefore = finderOf(read(before))
  const map = read(after)
  const findAfter = finderOf(map)
  let next = after
  // From the last, though removing a key keeps the indices.
  for (const { index, place } of placed(map).reverse()) {
    if (findBefore(place) && !findAfter(place)) next = removeKey(next, ['wiki', 'articles', index], 'place')
  }
  return next
}
