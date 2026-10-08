import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EditError } from '../starEdits'
import { addRoute, addRouteType, removeRoute, removeRouteType, routeList, routeTypes, routesOf, setRouteEnd, setRouteField, setRouteTypeField } from '../routeEdits'
import { addArticle, addGroup, articleFile, groupTargets, moveGroup, moveGroupInto, removeArticle, removeGroup, renameArticle, setArticleField, setArticleList, setGroupField, setHome, setWorldGroup, setWorldLore, splitList, wikiGroups } from '../articleEdits'
import { mapPlaces } from '../places'

const MAP = readFileSync('test-world/map.json', 'utf8')
const read = text => JSON.parse(text)
const failure = run => {
  try {
    run()
  } catch (error) {
    return error instanceof EditError ? [error.key, error.params] : error
  }
  return null
}

describe('the form of routes', () => {
  it('joins two stars by their ids, with an id of its own', () => {
    const { text, index } = addRoute(MAP, { from: 'sol', to: 'pelagos', type: 'military' })
    const lines = read(MAP).hyperlines
    expect(index).toBe(lines.length)
    expect(read(text).hyperlines.at(-1)).toEqual({ id: 'military-sol-pelagos', type: 'military', from: 'sol', to: 'pelagos' })
    expect(read(addRoute(text, { from: 'sol', to: 'pelagos', type: 'military' }).text).hyperlines.at(-1).id).toBe('military-sol-pelagos-2')
    expect(failure(() => addRoute(MAP, { from: 'sol', to: 'sol' }))).toEqual(['editor.sameStar', {}])
    expect(failure(() => addRoute(MAP, { from: 'sol', to: 'nowhere' }))).toEqual(['editor.noStar', { id: 'nowhere' }])
    expect(read(addRoute('{ "stars": [{ "id": "a" }, { "id": "b" }] }', { from: 'a', to: 'b' }).text).hyperlines).toEqual([{ id: 'trade-a-b', type: 'trade', from: 'a', to: 'b' }])
  })

  it('finds the routes of a star by its id or its sector, with their look', () => {
    const map = read(MAP)
    const own = routesOf(map, 'sol')
    expect(own.length).toBeGreaterThan(0)
    const list = routeList(map)
    expect(list[own[0]].from.id === 'sol' || list[own[0]].to.id === 'sol').toBe(true)
    expect(typeof list[0].color).toBe('number')
  })

  it('sets the fields and the ends of a route', () => {
    let text = setRouteField(MAP, 0, 'description', 'Новая подпись')
    text = setRouteField(text, 0, 'pulse', false)
    text = setRouteField(text, 0, 'color', '#ff00ff')
    text = setRouteEnd(text, 0, 'to', 'pelagos')
    expect(read(text).hyperlines[0]).toMatchObject({ description: 'Новая подпись', pulse: false, color: '#ff00ff', to: 'pelagos' })
    expect(read(setRouteField(text, 0, 'color', '')).hyperlines[0]).not.toHaveProperty('color')
    const from = read(MAP).hyperlines[0].from
    const fromStar = read(MAP).stars.find(star => star.sectorX === from.sectorX && star.sectorY === from.sectorY)
    expect(failure(() => setRouteEnd(MAP, 0, 'to', fromStar.id))).toEqual(['editor.sameStar', {}])
    expect(read(removeRoute(MAP, 0)).hyperlines).toEqual(read(MAP).hyperlines.slice(1))
    expect(failure(() => removeRoute(MAP, 999))).toEqual(['editor.noRoute', {}])
  })

  it('describes types: the built-in ones, and those of the map', () => {
    const types = routeTypes(read(MAP))
    expect(types.slice(0, 5).map(type => type.id)).toEqual(['gate', 'trade', 'military', 'supply', 'industrial'])
    expect(types.every(type => typeof type.color === 'number')).toBe(true)
    const { text, id } = addRouteType(MAP, { name: 'Smuggling' })
    expect(id).toBe('smuggling')
    expect(read(text).hyperlineTypes.smuggling).toEqual({ name: 'Smuggling', color: '#aaaaaa', width: 2 })
    expect(routeTypes(read(text)).at(-1)).toMatchObject({ id: 'smuggling', builtIn: false, name: 'Smuggling', width: 2 })
  })

  it('keeps a type written as its name a name, until it gets more', () => {
    const named = '{ "hyperlineTypes": { "smuggling": "Smugglers" }, "hyperlines": [{ "type": "smuggling" }, { "type": "trade" }] }'
    expect(read(setRouteTypeField(named, 'smuggling', 'name', 'Контрабанда')).hyperlineTypes.smuggling).toBe('Контрабанда')
    expect(read(setRouteTypeField(named, 'smuggling', 'color', '#ff0000')).hyperlineTypes.smuggling).toEqual({ name: 'Smugglers', color: '#ff0000' })
    expect(read(setRouteTypeField(named, 'trade', 'width', 4)).hyperlineTypes.trade).toEqual({ width: 4 })
    expect(read(setRouteTypeField('{}', 'gate', 'color', '#00ff00')).hyperlineTypes).toEqual({ gate: { color: '#00ff00' } })
    expect(failure(() => setRouteTypeField(named, 'nothing', 'name', 'X'))).toEqual(['editor.noRouteType', { id: 'nothing' }])
  })

  it('deletes a type of the map with it from its routes', () => {
    const named = '{ "hyperlineTypes": { "smuggling": "Smugglers", "trade": { "width": 4 } }, "hyperlines": [{ "type": "smuggling" }, { "type": "trade" }] }'
    expect(read(removeRouteType(named, 'smuggling'))).toEqual({ hyperlineTypes: { trade: { width: 4 } }, hyperlines: [{}, { type: 'trade' }] })
    expect(read(removeRouteType(named, 'trade'))).toEqual({ hyperlineTypes: { smuggling: 'Smugglers' }, hyperlines: [{ type: 'smuggling' }, { type: 'trade' }] })
    expect(removeRouteType(named, 'gate')).toBe(named)
  })
})

describe('the look of routes and of their types', () => {
  it('tells the look a route has from the look its type gives it', () => {
    const map = read(MAP)
    const gate = map.hyperlines.findIndex(line => line.type === 'gate')
    let route = routeList(map)[gate]
    expect(route).toMatchObject({ color: 0x00ffff, width: 3, opacity: 0.7, ofType: { color: 0x00ffff, width: 3, opacity: 0.7 } })
    const own = read(setRouteField(setRouteField(MAP, gate, 'width', 5), gate, 'opacity', 0.3))
    route = routeList(own)[gate]
    expect(route).toMatchObject({ width: 5, opacity: 0.3, ofType: { width: 3, opacity: 0.7 } })
    expect(own.hyperlines[gate]).toMatchObject({ width: 5, opacity: 0.3 })
    const back = read(setRouteField(setRouteField(JSON.stringify(own), gate, 'width', ''), gate, 'opacity', ''))
    expect(back.hyperlines[gate]).not.toHaveProperty('width')
    expect(back.hyperlines[gate]).not.toHaveProperty('opacity')
  })

  it('gives a type its opacity, and knows what it is when the map says nothing of it', () => {
    const types = routeTypes(read(MAP))
    expect(types.find(type => type.id === 'gate')).toMatchObject({ opacity: 0.7, builtInStyle: { width: expect.any(Number), opacity: expect.any(Number) } })
    const text = setRouteTypeField(MAP, 'trade', 'opacity', 0.9)
    expect(read(text).hyperlineTypes.trade.opacity).toBe(0.9)
    expect(routeTypes(read(text)).find(type => type.id === 'trade').opacity).toBe(0.9)
    expect(read(setRouteTypeField(text, 'trade', 'opacity', '')).hyperlineTypes.trade).not.toHaveProperty('opacity')
  })
})

describe('the form of articles', () => {
  it('adds an article with a file of its own', () => {
    const { text, file, create } = addArticle(MAP, { title: 'Новая колония', group: 'history' })
    expect(file).toBe('wiki/новая-колония.wiki')
    expect(create).toEqual({ path: file, text: "'''Новая колония'''\n" })
    expect(read(text).wiki.articles.at(-1)).toEqual({ title: 'Новая колония', file, group: 'history' })
    const markdown = addArticle(MAP, { title: 'Notes', format: 'markdown' })
    expect(markdown.file).toBe('wiki/notes.md')
    expect(markdown.create.text).toBe('**Notes**\n')
    expect(articleFile(read(MAP), 'Main', 'wikitext')).toBe('wiki/main-2.wiki')
    expect(failure(() => addArticle(MAP, { title: 'crucible  combine' }))).toEqual(['editor.titleTaken', { title: 'crucible  combine' }])
    expect(failure(() => addArticle(MAP, { title: ' ' }))).toEqual(['editor.emptyTitle', {}])
    expect(read(addArticle('{ "stars": [] }', { title: 'A' }).text).wiki).toEqual({ articles: [{ title: 'A', file: 'wiki/a.wiki' }] })
  })

  it('renames an article: its old title stays another name, the main page follows', () => {
    const home = read(MAP).wiki.home
    const text = renameArticle(MAP, home, 'Archive')
    const map = read(text)
    expect(map.wiki.home).toBe('Archive')
    expect(map.wiki.articles.find(article => article.title === 'Archive').aliases).toContain(home)
    const plain = renameArticle(MAP, 'Crucible Combine', 'Crucible Works', { keepAlias: false })
    expect(read(plain).wiki.articles.find(article => article.title === 'Crucible Works').aliases).toEqual(['Combine'])
    expect(renameArticle(MAP, 'Crucible Combine', 'Crucible Combine')).toBe(MAP)
    expect(failure(() => renameArticle(MAP, 'Crucible Combine', 'Free Tide'))).toEqual(['editor.titleTaken', { title: 'Free Tide' }])
  })

  it('sets the group, place, lists and main page of an article', () => {
    let text = setArticleField(MAP, 'Crucible Combine', 'place', 'Forge')
    text = setArticleList(text, 'Crucible Combine', 'categories', splitList(' Factions, Forge ,, '))
    text = setHome(text, 'Crucible Combine')
    const map = read(text)
    const article = map.wiki.articles.find(each => each.title === 'Crucible Combine')
    expect(article).toMatchObject({ place: 'Forge', categories: ['Factions', 'Forge'] })
    expect(map.wiki.home).toBe('Crucible Combine')
    expect(read(setArticleList(text, 'Crucible Combine', 'categories', [])).wiki.articles.find(each => each.title === 'Crucible Combine')).not.toHaveProperty('categories')
    expect(read(setArticleField(text, 'Crucible Combine', 'group', '')).wiki.articles.find(each => each.title === 'Crucible Combine')).not.toHaveProperty('group')
    expect(read(setHome(text, null)).wiki).not.toHaveProperty('home')
    expect(failure(() => setArticleField(MAP, 'Nowhere', 'place', 'X'))).toEqual(['editor.noArticle', { title: 'Nowhere' }])
  })

  it('deletes an article and gives back its file', () => {
    const { text, orphans } = removeArticle(MAP, 'Crucible Combine')
    expect(read(text).wiki.articles.some(article => article.title === 'Crucible Combine')).toBe(false)
    expect(orphans).toEqual(['wiki/crucible-combine.wiki'])
    const home = removeArticle(MAP, read(MAP).wiki.home)
    expect(read(home.text).wiki).not.toHaveProperty('home')
  })

  it('lists the groups of the wiki and the places of the map', () => {
    expect(wikiGroups(read(MAP)).map(group => `${'· '.repeat(group.depth)}${group.id}`)).toEqual(['history', 'factions', 'tech', '· ships', '· · drives', 'examples'])
    expect(wikiGroups({ wiki: { groups: [{ id: 'a', groups: [{ id: 'b', title: 'B', icon: 'flag' }] }, 'not a group', { id: 'c' }] } })).toEqual([
      { id: 'a', title: 'a', icon: null, depth: 0, height: 2, parent: null, first: true, last: false },
      { id: 'b', title: 'B', icon: 'flag', depth: 1, height: 1, parent: 'a', first: true, last: true },
      { id: 'c', title: 'c', icon: null, depth: 0, height: 1, parent: null, first: false, last: true }
    ])
    const places = mapPlaces(read(MAP))
    expect(places[0]).toEqual({ name: read(MAP).stars[0].name, depth: 0 })
    expect(places).toContainEqual({ name: 'Earth', depth: 1 })
    expect(places.some(place => place.depth === 2)).toBe(true)
  })
})

// Was: the editor could only pick a group the map file already had; a new one had to be written into map.json by hand.
describe('the groups of articles', () => {
  const ids = text => wikiGroups(read(text)).map(group => group.id)

  it('adds a group with an id made of its title, at the top or inside another', () => {
    const top = addGroup(MAP, { title: 'Fleets' })
    expect(top.id).toBe('fleets')
    expect(read(top.text).wiki.groups.at(-1)).toEqual({ id: 'fleets', title: 'Fleets' })
    expect(addGroup(top.text, { title: 'fleets' }).id).toBe('fleets-2')

    const inner = addGroup(top.text, { title: 'Корабли Конкорда', parent: 'fleets' })
    expect(inner.id).toBe('корабли-конкорда')
    expect(read(inner.text).wiki.groups.at(-1).groups).toEqual([{ id: 'корабли-конкорда', title: 'Корабли Конкорда' }])
    const second = addGroup(inner.text, { title: 'Freighters', parent: 'fleets' })
    expect(read(second.text).wiki.groups.at(-1).groups.map(group => group.id)).toEqual(['корабли-конкорда', 'freighters'])
    expect(addGroup(second.text, { title: 'Freighters' }).id).toBe('freighters-2')

    expect(read(addGroup('{}', { title: 'A' }).text)).toEqual({ wiki: { groups: [{ id: 'a', title: 'A' }] } })
    expect(read(addGroup('{ "wiki": { "articles": [] } }', { title: 'A' }).text).wiki.groups).toEqual([{ id: 'a', title: 'A' }])
    expect(failure(() => addGroup(MAP, { title: '  ' }))).toEqual(['editor.emptyGroupTitle', {}])
    expect(failure(() => addGroup(MAP, { title: 'X', parent: 'nowhere' }))).toEqual(['editor.unknownGroup', { id: 'nowhere' }])
  })

  it('sets the title and the icon of a group, and empty takes them away', () => {
    const { text } = addGroup(MAP, { title: 'Inner', parent: 'history' })
    let next = setGroupField(text, 'inner', 'icon', 'ship')
    next = setGroupField(next, 'history', 'title', ' Old days ')
    const groups = read(next).wiki.groups
    expect(groups[0]).toMatchObject({ id: 'history', title: 'Old days' })
    expect(groups[0].groups).toEqual([{ id: 'inner', title: 'Inner', icon: 'ship' }])
    expect(read(setGroupField(next, 'history', 'icon', '')).wiki.groups[0]).not.toHaveProperty('icon')
    expect(failure(() => setGroupField(MAP, 'nowhere', 'title', 'X'))).toEqual(['editor.unknownGroup', { id: 'nowhere' }])
  })

  it('moves a group among the groups of its own list, past what is not a group', () => {
    const before = ids(MAP)
    expect(ids(moveGroup(MAP, before[1], -1))).toEqual([before[1], before[0], ...before.slice(2)])
    expect(moveGroup(MAP, before[0], -1)).toBe(MAP)
    expect(moveGroup(MAP, before.at(-1), 1)).toBe(MAP)

    const text = '{ "wiki": { "groups": [{ "id": "a" }, 7, { "id": "b", "groups": [{ "id": "c" }, { "id": "d" }] }] } }'
    expect(read(moveGroup(text, 'b', -1)).wiki.groups.map(group => group?.id ?? group)).toEqual(['b', 7, 'a'])
    expect(read(moveGroup(text, 'd', -1)).wiki.groups[2].groups.map(group => group.id)).toEqual(['d', 'c'])
  })

  it('deletes a group with its subgroups: their articles are left without a group', () => {
    let text = addGroup(MAP, { title: 'Inner', parent: 'factions' }).text
    text = setArticleField(text, 'Free Tide', 'group', 'inner')
    const { wiki } = read(removeGroup(text, 'factions'))
    expect(wiki.groups.map(group => group.id)).toEqual(read(MAP).wiki.groups.map(group => group.id).filter(id => id !== 'factions'))
    const left = wiki.articles.filter(article => ['Solar Concord', 'Crucible Combine', 'Free Tide'].includes(article.title))
    expect(left).toHaveLength(3)
    for (const article of left) expect(article, article.title).not.toHaveProperty('group')
    expect(wiki.articles.find(article => article.title === 'Quantum Gates').group).toBe('tech')
    expect(failure(() => removeGroup(MAP, 'nowhere'))).toEqual(['editor.unknownGroup', { id: 'nowhere' }])
  })

  const NESTED = JSON.stringify({ wiki: { groups: [
    { id: 'a', groups: [{ id: 'b', groups: [{ id: 'c' }] }] },
    { id: 'x', groups: [{ id: 'y' }] },
    { id: 'z' }
  ], articles: [{ title: 'In c', group: 'c' }] } }, null, 2)

  it('adds a group no deeper than three levels', () => {
    expect(read(addGroup(NESTED, { title: 'Under b', parent: 'b' }).text).wiki.groups[0].groups[0].groups.map(group => group.id)).toEqual(['c', 'under-b'])
    expect(failure(() => addGroup(NESTED, { title: 'Under c', parent: 'c' }))).toEqual(['editor.groupTooDeep', { max: 3 }])
  })

  it('knows where a group can go: not inside itself, not past the third level', () => {
    expect(groupTargets(read(NESTED), 'b')).toEqual([null, 'x', 'z'])
    expect(groupTargets(read(NESTED), 'a')).toEqual([])
    expect(groupTargets(read(NESTED), 'c')).toEqual([null, 'a', 'x', 'y', 'z'])
    expect(groupTargets(read(NESTED), 'z')).toEqual(['a', 'b', 'x', 'y'])
  })

  it('moves a group with its subgroups into another one, or to the top', () => {
    const intoX = read(moveGroupInto(NESTED, 'b', 'x')).wiki
    expect(intoX.groups[0]).toEqual({ id: 'a' })
    expect(intoX.groups[1]).toEqual({ id: 'x', groups: [{ id: 'y' }, { id: 'b', groups: [{ id: 'c' }] }] })
    expect(intoX.articles[0].group).toBe('c')

    const intoZ = read(moveGroupInto(NESTED, 'y', 'z')).wiki
    expect(intoZ.groups.slice(1)).toEqual([{ id: 'x' }, { id: 'z', groups: [{ id: 'y' }] }])

    const top = read(moveGroupInto(NESTED, 'c', null)).wiki
    expect(top.groups.map(group => group.id)).toEqual(['a', 'x', 'z', 'c'])
    expect(top.groups[0].groups[0]).toEqual({ id: 'b' })

    expect(moveGroupInto(NESTED, 'c', 'b')).toBe(NESTED)
    expect(failure(() => moveGroupInto(NESTED, 'a', 'c'))).toEqual(['editor.groupInsideItself', { max: 3 }])
    expect(failure(() => moveGroupInto(NESTED, 'b', 'y'))).toEqual(['editor.groupTooDeep', { max: 3 }])
    expect(failure(() => moveGroupInto(NESTED, 'b', 'nowhere'))).toEqual(['editor.unknownGroup', { id: 'nowhere' }])
  })

  // Was: the world page could not be put in a group, nor its text written, from the forms.
  it('puts the world page in a group, and out of it with the group', () => {
    const text = setWorldGroup(NESTED, 'b')
    expect(read(text).wiki.worldGroup).toBe('b')
    expect(read(setWorldGroup(text, null)).wiki).not.toHaveProperty('worldGroup')
    expect(failure(() => setWorldGroup(NESTED, 'nowhere'))).toEqual(['editor.unknownGroup', { id: 'nowhere' }])
    expect(read(removeGroup(text, 'a')).wiki).not.toHaveProperty('worldGroup')
    expect(read(removeGroup(text, 'z')).wiki.worldGroup).toBe('b')
    expect(read(setWorldLore(NESTED, 'The galaxy')).worldLore).toBe('The galaxy')
  })
})
