import { describe, expect, it, vi } from 'vitest'
import { mapLoaderCounts } from '../loaderCounts'
import { orbitCount } from '../satellites'
import { checkMap } from '../mapCheck'
import { buildMapData } from '../mapData'
import { startMapJournal } from '../mapJournal'

const MAP = {
  stars: [{ id: 'sol', name: 'Sol', sectorX: 0, sectorY: 0, lore: 'The Sun.' }],
  wiki: {
    articles: [
      { title: 'Mars', file: 'wiki/mars.md' },
      { title: 'Mars', file: 'wiki/mars-again.md' },
      { file: 'wiki/nameless.md' }
    ]
  }
}

describe('the numbers of the loader', () => {
  // Was: the Loading tab counted the map's texts as typed and the site its wiki as read, so an article left out was counted.
  it('count the texts of the editor as the site loads them', async () => {
    const editor = mapLoaderCounts(structuredClone(MAP))
    startMapJournal()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const steps = []
    await buildMapData(checkMap(structuredClone(MAP)).data, {
      baseUrl: 'http://localhost/map.json',
      fetchText: async () => '',
      step: (key, params) => { steps.push([key, params]) }
    })
    vi.restoreAllMocks()
    const site = steps.find(([key]) => key === 'loader.loadingArchives')[1].count
    expect(editor.texts).toBe(site)
    expect(site).toBe(2)
    expect(editor.articles.map(article => article.title)).toEqual(['Mars'])
  })

  it('count nothing of a map still being typed, and say nothing of it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(mapLoaderCounts(null)).toEqual({ texts: 0, articles: [] })
    mapLoaderCounts({ wiki: { articles: [{ file: 'x.md' }] } })
    expect(warn).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  // Was: every entry of "satellites" was an orbit, one the site leaves out too.
  it('count the orbits of the bodies the site shows', () => {
    const planets = [
      { name: 'Earth', satellites: [{ name: 'Moon' }, { name: 'Dock', kind: 'station' }, { name: 'Odd', kind: 'comet' }, 'broken'] },
      { name: 'Mars' },
      null
    ]
    expect(orbitCount(planets)).toBe(4)
    expect(orbitCount(undefined)).toBe(0)
  })
})
