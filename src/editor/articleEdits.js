import { appendItem, removeItem, removeKey, setKey, setValue, swapItems } from './jsonEdit'
import { EditError, idOf, uniqueId } from './starEdits'
import { lostFiles, textFiles } from './siteFiles'
import { MAX_GROUP_DEPTH, pageKey } from '../utils/wikiPages'
import { isObject } from '../utils/guards'

const read = text => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
const articles = map => (isObject(map.wiki) && Array.isArray(map.wiki.articles) ? map.wiki.articles : [])

export const ARTICLE_FORMATS = ['wikitext', 'markdown']

export const articleIndex = (map, title) => articles(map).findIndex(article => isObject(article) && pageKey(article.title) === pageKey(title))

function index(map, title) {
  const found = articleIndex(map, title)
  if (found < 0) throw new EditError('editor.noArticle', { title })
  return found
}

function freeTitle(map, title, except = null) {
  const wanted = String(title ?? '').trim()
  if (!wanted) throw new EditError('editor.emptyTitle')
  if (articles(map).some(article => isObject(article) && pageKey(article.title) === pageKey(wanted) && pageKey(wanted) !== pageKey(except))) {
    throw new EditError('editor.titleTaken', { title: wanted })
  }
  return wanted
}

export function articleFile(map, title, format = 'wikitext') {
  const taken = new Set(textFiles(map).map(file => file.path))
  const extension = format === 'markdown' ? 'md' : 'wiki'
  const base = idOf(title, 'article')
  let path = `wiki/${base}.${extension}`
  for (let n = 2; taken.has(path); n++) path = `wiki/${base}-${n}.${extension}`
  return path
}

export function addArticle(text, { title, format = 'wikitext', group = null }) {
  const map = read(text)
  const name = freeTitle(map, title)
  const file = articleFile(map, name, format)
  const article = { title: name, file, ...(group ? { group } : {}) }
  let next
  if (!isObject(map.wiki)) next = setKey(text, [], 'wiki', { articles: [article] })
  else if (!Array.isArray(map.wiki.articles)) next = setKey(text, ['wiki'], 'articles', [article])
  else next = appendItem(text, ['wiki', 'articles'], article)
  const body = format === 'markdown' ? `**${name}**\n` : `'''${name}'''\n`
  return { text: next, file, create: { path: file, text: body } }
}

/** field: 'group' | 'place' | 'tabTitle' | 'text'; empty removes it. */
export function setArticleField(text, title, field, value) {
  const at = index(read(text), title)
  const empty = value === null || value === undefined || (typeof value === 'string' && !value.trim())
  return empty ? removeKey(text, ['wiki', 'articles', at], field) : setKey(text, ['wiki', 'articles', at], field, value)
}

/** field: 'aliases' | 'categories'; an empty list removes it. */
export function setArticleList(text, title, field, list) {
  const at = index(read(text), title)
  const items = [...new Set((list ?? []).map(item => String(item).trim()).filter(Boolean))]
  return items.length ? setKey(text, ['wiki', 'articles', at], field, items) : removeKey(text, ['wiki', 'articles', at], field)
}

export const splitList = value => String(value ?? '').split(',').map(item => item.trim()).filter(Boolean)

export function renameArticle(text, title, newTitle, { keepAlias = true } = {}) {
  const map = read(text)
  const at = index(map, title)
  const article = articles(map)[at]
  const name = freeTitle(map, newTitle, article.title)
  if (name === article.title) return text
  let next = setValue(text, ['wiki', 'articles', at, 'title'], name)
  const aliases = Array.isArray(article.aliases) ? article.aliases : []
  if (keepAlias && pageKey(name) !== pageKey(article.title) && !aliases.some(alias => pageKey(alias) === pageKey(article.title))) {
    next = setArticleList(next, name, 'aliases', [...aliases, article.title])
  }
  if (pageKey(map.wiki.home) === pageKey(article.title)) next = setValue(next, ['wiki', 'home'], name)
  return next
}

export function setHome(text, title) {
  const map = read(text)
  if (title === null) return isObject(map.wiki) ? removeKey(text, ['wiki'], 'home') : text
  const article = articles(map)[index(map, title)]
  return setKey(text, ['wiki'], 'home', article.title)
}

export function removeArticle(text, title) {
  const map = read(text)
  const at = index(map, title)
  let next = removeItem(text, ['wiki', 'articles'], at)
  if (pageKey(map.wiki.home) === pageKey(title)) next = removeKey(next, ['wiki'], 'home')
  return { text: next, orphans: lostFiles(text, next) }
}

const groupList = value => (Array.isArray(value) ? value : [])
const isGroup = group => isObject(group) && typeof group.id === 'string'

export function wikiGroups(map) {
  const list = []
  const walk = (groups, depth, parent) => {
    const own = groupList(groups).filter(isGroup)
    let deepest = 0
    own.forEach((group, at) => {
      const entry = {
        id: group.id,
        title: typeof group.title === 'string' ? group.title : group.id,
        icon: typeof group.icon === 'string' ? group.icon : null,
        depth,
        height: 1,
        parent,
        first: at === 0,
        last: at === own.length - 1
      }
      list.push(entry)
      entry.height = 1 + walk(group.groups, depth + 1, group.id)
      deepest = Math.max(deepest, entry.height)
    })
    return deepest
  }
  walk(isObject(map.wiki) ? map.wiki.groups : null, 0, null)
  return list
}

function placing(map, id) {
  const groups = wikiGroups(map)
  const group = groups.find(each => each.id === id)
  if (!group) throw new EditError('editor.unknownGroup', { id })
  // wikiGroups lists parents before children, so one pass collects all descendants.
  const inside = new Set([id])
  for (const each of groups) if (inside.has(each.parent)) inside.add(each.id)
  const fits = depth => depth + group.height <= MAX_GROUP_DEPTH
  const targets = group.parent !== null && fits(0) ? [null] : []
  for (const each of groups) {
    if (!inside.has(each.id) && each.id !== group.parent && fits(each.depth + 1)) targets.push(each.id)
  }
  return { groups, group, inside, targets }
}

export const groupTargets = (map, id) => placing(map, id).targets

function findGroup(map, id) {
  const walk = (groups, path) => {
    for (const [index, group] of groupList(groups).entries()) {
      if (!isGroup(group)) continue
      if (group.id === id) return { path, index, group }
      const inner = walk(group.groups, [...path, index, 'groups'])
      if (inner) return inner
    }
    return null
  }
  const found = isObject(map.wiki) ? walk(map.wiki.groups, ['wiki', 'groups']) : null
  if (!found) throw new EditError('editor.unknownGroup', { id })
  return found
}

function groupIds(group) {
  const ids = [group.id]
  for (const inner of groupList(group.groups)) if (isGroup(inner)) ids.push(...groupIds(inner))
  return ids
}

export function addGroup(text, { title, parent = null }) {
  const map = read(text)
  const name = String(title ?? '').trim()
  if (!name) throw new EditError('editor.emptyGroupTitle')
  const groups = wikiGroups(map)
  const owner = parent ? groups.find(group => group.id === parent) : null
  if (owner && owner.depth + 2 > MAX_GROUP_DEPTH) throw new EditError('editor.groupTooDeep', { max: MAX_GROUP_DEPTH })
  const taken = new Set(groups.map(group => group.id.trim()))
  const id = uniqueId(idOf(name, 'group'), taken)
  const group = { id, title: name }
  let next
  if (parent) {
    const owner = findGroup(map, parent)
    const at = [...owner.path, owner.index]
    next = Array.isArray(owner.group.groups) ? appendItem(text, [...at, 'groups'], group) : setKey(text, at, 'groups', [group])
  } else if (!isObject(map.wiki)) next = setKey(text, [], 'wiki', { groups: [group] })
  else if (!Array.isArray(map.wiki.groups)) next = setKey(text, ['wiki'], 'groups', [group])
  else next = appendItem(text, ['wiki', 'groups'], group)
  return { text: next, id }
}

export function setGroupField(text, id, field, value) {
  const { path, index } = findGroup(read(text), id)
  const empty = value === null || value === undefined || (typeof value === 'string' && !value.trim())
  return empty ? removeKey(text, [...path, index], field) : setKey(text, [...path, index], field, typeof value === 'string' ? value.trim() : value)
}

export function moveGroup(text, id, step) {
  const map = read(text)
  const { path, index } = findGroup(map, id)
  const list = path.reduce((value, key) => value[key], map)
  let other = index + step
  // Skip non-group entries: the wiki ignores them.
  while (other >= 0 && other < list.length && !isGroup(list[other])) other += step
  return other >= 0 && other < list.length ? swapItems(text, path, index, other) : text
}

export function moveGroupInto(text, id, parent) {
  const map = read(text)
  const { group, inside, targets } = placing(map, id)
  if (!targets.includes(parent)) {
    if (parent === group.parent) return text
    if (parent !== null) findGroup(map, parent)
    throw new EditError(inside.has(parent) ? 'editor.groupInsideItself' : 'editor.groupTooDeep', { max: MAX_GROUP_DEPTH })
  }
  const from = findGroup(map, id)
  // Append at the destination first, so from.path is still valid for the removal.
  let next
  if (parent === null) next = appendItem(text, ['wiki', 'groups'], from.group)
  else {
    const owner = findGroup(map, parent)
    const at = [...owner.path, owner.index]
    next = Array.isArray(owner.group.groups) ? appendItem(text, [...at, 'groups'], from.group) : setKey(text, at, 'groups', [from.group])
  }
  // Moving out the last subgroup: drop the now-empty "groups" key.
  const list = from.path.reduce((value, key) => value[key], map)
  if (list.length === 1 && from.path.length > 2) return removeKey(next, from.path.slice(0, -1), 'groups')
  return removeItem(next, from.path, from.index)
}

export function removeGroup(text, id) {
  const map = read(text)
  const { path, index, group } = findGroup(map, id)
  const gone = new Set(groupIds(group).map(each => each.trim()))
  let next = text
  articles(map).forEach((article, at) => {
    if (isObject(article) && typeof article.group === 'string' && gone.has(article.group.trim())) next = removeKey(next, ['wiki', 'articles', at], 'group')
  })
  if (typeof map.wiki.worldGroup === 'string' && gone.has(map.wiki.worldGroup.trim())) next = removeKey(next, ['wiki'], 'worldGroup')
  return removeItem(next, path, index)
}

export function setWorldGroup(text, id) {
  const map = read(text)
  if (!id) return isObject(map.wiki) ? removeKey(text, ['wiki'], 'worldGroup') : text
  findGroup(map, id)
  return setKey(text, ['wiki'], 'worldGroup', id)
}

// Emptied, the world's text goes: the site then has no Galaxy page, as with no text at all.
export function setWorldLore(text, value) {
  const lore = String(value ?? '')
  if (lore.trim()) return setKey(text, [], 'worldLore', lore)
  return Object.hasOwn(read(text), 'worldLore') ? removeKey(text, [], 'worldLore') : text
}
