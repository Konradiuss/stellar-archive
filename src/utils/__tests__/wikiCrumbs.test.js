import { describe, expect, it } from 'vitest'
import { fileName, folderLabel, pathCrumbs, pushRecent, recentPages } from '../wikiCrumbs'

const home = { slug: 'Main_Page', title: 'Main Page', path: [] }
const sol = { slug: 'Sol', title: 'Sol', path: ['Places'] }
const earth = { slug: 'Earth', title: 'Earth', path: ['Places', 'Sol'] }
const concord = { slug: 'Solar_Concord', title: 'Solar Concord', path: ['Factions'] }
const pages = [home, sol, earth, concord]
const index = {
  home,
  find: name => pages.find(page => page.title === name) ?? null,
  get: slug => pages.find(page => page.slug === slug) ?? null
}
const graph = { category: name => (name === 'Factions' ? { name, slug: 'Category:Factions', pages: [concord] } : null) }

describe('the path line of a wiki page as breadcrumbs', () => {
  it('leads from a folder to its page; C:\\WIKI is text (the main page has its button)', () => {
    expect(pathCrumbs(earth, { index, graph })).toEqual([
      { label: 'C:\\WIKI', slug: null, command: 'CD \\' },
      { label: 'PLACES', slug: null, command: 'CD \\PLACES' },
      { label: 'SOL', slug: 'Sol', command: 'CD \\PLACES\\SOL' }
    ])
  })

  it('is only the root on the main page itself', () => {
    expect(pathCrumbs(home, { index, graph })).toEqual([{ label: 'C:\\WIKI', slug: null, command: 'CD \\' }])
  })

  it('leads to the category of a folder that has no page of its own', () => {
    expect(pathCrumbs(concord, { index, graph })[1]).toEqual({ label: 'FACTIONS', slug: 'Category:Factions', command: 'CD \\FACTIONS' })
  })

  it('has only the root on a service page, and on a page that does not exist', () => {
    const search = { slug: 'Special:Search/mars', kind: 'special', special: { kind: 'search' }, path: [] }
    expect(pathCrumbs(search, { index, graph })).toEqual([{ label: 'C:\\WIKI', slug: null, command: 'CD \\' }])
    expect(pathCrumbs(null, { index, graph })).toEqual([{ label: 'C:\\WIKI', slug: null, command: 'CD \\' }])
  })

  it('writes folders and files as the DOS line does', () => {
    expect(folderLabel('Solar Concord')).toBe('SOLAR_CONCORD')
    expect(fileName('Crucible_Combine')).toBe('CRUCIBLE_COMBINE.TXT')
  })
})

describe('the pages read lately', () => {
  it('puts the opened page first, once, and keeps a few', () => {
    expect(pushRecent([], 'Sol')).toEqual(['Sol'])
    expect(pushRecent(['Sol', 'Mars'], 'Mars')).toEqual(['Mars', 'Sol'])
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
    expect(pushRecent(['a'], '')).toEqual(['a'])
    expect(pushRecent(null, 'a')).toEqual(['a'])
  })

  it('shows the two before the open one, not the main page, not a page that is gone', () => {
    const list = ['Earth', 'Main_Page', 'Deleted', 'Sol', 'Solar_Concord']
    expect(recentPages(list, { index, current: earth }).map(page => page.slug)).toEqual(['Sol', 'Solar_Concord'])
    expect(recentPages(list, { index, current: sol, count: 1 }).map(page => page.slug)).toEqual(['Earth'])
    expect(recentPages([], { index, current: earth })).toEqual([])
  })
})
