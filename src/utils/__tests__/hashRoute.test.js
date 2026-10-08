import { describe, expect, it } from 'vitest'
import { buildRoute, parseRoute } from '../hashRoute'

const route = (starId, planetIndex = null, satelliteIndex = null) => ({ starId, planetIndex, satelliteIndex, wiki: null, wikiSection: null })
const wiki = (slug, wikiSection = null) => ({ starId: null, planetIndex: null, satelliteIndex: null, wiki: slug, wikiSection })

describe('hashRoute', () => {
  it('reads a system and a planet (numbered from 1 in the URL)', () => {
    expect(parseRoute('#/system/sol')).toEqual(route('sol'))
    expect(parseRoute('#/system/sol/3')).toEqual(route('sol', 2))
    expect(parseRoute('#/system/silent-reach/1/')).toEqual(route('silent-reach', 0))
  })

  it('reads a satellite of a planet', () => {
    expect(parseRoute('#/system/sol/3/1')).toEqual(route('sol', 2, 0))
    expect(parseRoute('#/system/sol/4/2/')).toEqual(route('sol', 3, 1))
    expect(parseRoute('#/system/sol/0/1')).toEqual(route('sol'))
    expect(parseRoute('#/system/sol/3/0')).toEqual(route('sol', 2))
  })

  it('reads the pages of the text wiki', () => {
    expect(parseRoute('#/wiki')).toEqual(wiki(''))
    expect(parseRoute('#/wiki/')).toEqual(wiki(''))
    expect(parseRoute('#/wiki/Crucible_Combine')).toEqual(wiki('Crucible_Combine'))
    expect(parseRoute('#/wiki/%D0%9B%D1%83%D0%BD%D0%B0')).toEqual(wiki('Луна'))
    expect(parseRoute('#/wiki/Earth#History')).toEqual(wiki('Earth', 'History'))
    expect(parseRoute('#/wiki/Solar_Concord#The%20schism')).toEqual(wiki('Solar_Concord', 'The schism'))
    expect(parseRoute('#/wiki/Earth#')).toEqual(wiki('Earth'))
    expect(parseRoute('#/wiki#Fleet')).toEqual(wiki('', 'Fleet'))
    expect(parseRoute('#/wiki/Category:Corporations')).toEqual(wiki('Category:Corporations'))
    expect(parseRoute('#/wiki/%E0%A4%A')).toEqual(wiki(''))
  })

  it('treats anything else as the galaxy map', () => {
    for (const hash of ['', '#', '#/', '#/galaxy', '#/system/', '#/system/sol/x', '#/system/sol/3/1/1', '#/system/%E0%A4%A', '#/wikipedia']) {
      expect(parseRoute(hash)).toEqual(route(null))
    }
    expect(parseRoute('#/system/sol/0')).toEqual(route('sol'))
  })

  it('builds the hash back', () => {
    expect(buildRoute({ starId: 'sol' })).toBe('#/system/sol')
    expect(buildRoute({ starId: 'sol', planetIndex: 2 })).toBe('#/system/sol/3')
    expect(buildRoute({ starId: 'sol', planetIndex: 2, satelliteIndex: 0 })).toBe('#/system/sol/3/1')
    expect(buildRoute({ starId: 'sol', planetIndex: null, satelliteIndex: 0 })).toBe('#/system/sol')
    expect(buildRoute({ starId: null, planetIndex: 2 })).toBe('')
    expect(buildRoute()).toBe('')
    expect(parseRoute(buildRoute({ starId: 'silent reach', planetIndex: 0, satelliteIndex: 1 }))).toEqual(route('silent reach', 0, 1))
  })

  it('builds wiki pages back', () => {
    expect(buildRoute({ wiki: '' })).toBe('#/wiki')
    expect(buildRoute({ wiki: 'Свободный_Прилив' })).toBe('#/wiki/%D0%A1%D0%B2%D0%BE%D0%B1%D0%BE%D0%B4%D0%BD%D1%8B%D0%B9_%D0%9F%D1%80%D0%B8%D0%BB%D0%B8%D0%B2')
    expect(buildRoute({ wiki: 'Category:X' })).toBe('#/wiki/Category:X')
    expect(buildRoute({ starId: 'sol', wiki: 'Earth' })).toBe(buildRoute({ wiki: 'Earth' }))
    for (const slug of ['Crucible_Combine', 'A&B?', 'Луна']) expect(parseRoute(buildRoute({ wiki: slug })).wiki).toBe(slug)
  })

  it('builds a section of a wiki page back', () => {
    expect(buildRoute({ wiki: 'Earth', wikiSection: 'History' })).toBe('#/wiki/Earth#History')
    expect(buildRoute({ wiki: 'X', wikiSection: 'See also' })).toBe('#/wiki/X#See_also')
    expect(buildRoute({ starId: 'sol', wikiSection: 'History' })).toBe('#/system/sol')
    const back = parseRoute(buildRoute({ wiki: 'Solar_Concord', wikiSection: 'Truce_2' }))
    expect([back.wiki, back.wikiSection]).toEqual(['Solar_Concord', 'Truce_2'])
  })
})
