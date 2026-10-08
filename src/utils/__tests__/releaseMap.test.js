import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadSocialSite, socialPages } from '../../social/preview'
import { mapJournal, startMapJournal } from '../mapJournal'
import { getSatellites } from '../satellites'
import { createPlanetVisualizationConfig } from '../planetRenderer'
import { parseLayout, bannerFields, boxFields, isGap } from '../../editor/pageLayout'
import { collectHeadings } from '../wikiToc'

const publicUrl = new URL('../../../public/', import.meta.url)
const baseUrl = new URL('map.json', publicUrl).href
const readText = url => readFileSync(fileURLToPath(url), 'utf8')
const raw = JSON.parse(readText(baseUrl))
let built

beforeAll(async () => {
  startMapJournal()
  const site = await loadSocialSite({ mapText: readText(baseUrl), baseUrl, readText })
  built = site.built
})

describe('the published demo map', () => {
  it('loads every article without map problems or unresolved internal links', () => {
    expect(mapJournal()).toEqual([])
    expect(built.wikiGraph.wanted).toEqual([])
    // Includes figure images, gallery emblems and inline images in either syntax.
    const inspect = value => {
      if (!value || typeof value !== 'object') return
      if (typeof value.src === 'string' && value.src.startsWith('file:')) {
        expect(value.src.startsWith(publicUrl.href), value.src).toBe(true)
        expect(existsSync(fileURLToPath(value.src)), value.src).toBe(true)
      }
      for (const item of Object.values(value)) inspect(item)
    }
    for (const page of built.wikiIndex.pages) inspect(page.doc)
  })

  it('has eight distinct stars inside an 8 by 8 grid and exactly one empty system', () => {
    expect(raw.galaxy).toEqual({ columns: 8, rows: 8 })
    expect(built.galaxy).toMatchObject({ columns: 8, rows: 8 })
    expect(raw.stars).toHaveLength(8)
    expect(new Set(raw.stars.map(star => star.id)).size).toBe(8)
    expect(new Set(raw.stars.map(star => `${star.sectorX},${star.sectorY}`)).size).toBe(8)
    expect(Object.keys(raw.systems).sort()).toEqual(raw.stars.map(star => star.id).sort())
    for (const star of raw.stars) {
      expect(star.starVisualization.size).toBeGreaterThan(0)
      expect(star.sectorX).toBeGreaterThanOrEqual(0)
      expect(star.sectorX).toBeLessThan(8)
      expect(star.sectorY).toBeGreaterThanOrEqual(0)
      expect(star.sectorY).toBeLessThan(8)
    }
    expect(raw.stars.filter(star => !raw.systems[star.id].planets.length).map(star => star.id)).toEqual(['silent-reach'])
  })

  it('connects every star, represents all five route types and has one outbound survey run', () => {
    expect(raw.hyperlines).toHaveLength(9)
    expect(new Set(raw.hyperlines.map(line => line.type))).toEqual(new Set(['gate', 'trade', 'military', 'industrial', 'supply']))
    const starAt = point => raw.stars.find(star => star.sectorX === point.sectorX && star.sectorY === point.sectorY)?.id
    const edges = raw.hyperlines.map(line => [starAt(line.from), starAt(line.to)])
    expect(edges.flat().every(Boolean)).toBe(true)
    const visited = new Set(['sol'])
    for (let pass = 0; pass < 8; pass++) for (const [from, to] of edges) {
      if (visited.has(from) || visited.has(to)) { visited.add(from); visited.add(to) }
    }
    expect(visited.size).toBe(8)
    const forward = raw.hyperlines.filter(line => line.direction === 'forward')
    expect(forward).toHaveLength(1)
    expect([starAt(forward[0].from), starAt(forward[0].to)]).toEqual(['pelagos', 'silent-reach'])
  })

  // Was: the JUMP menu hinted the raw type id ("gate") of a line without a description.
  it('describes every route for the JUMP menu', () => {
    for (const line of raw.hyperlines) expect(line.description?.trim(), line.id).toBeTruthy()
  })

  it('uses eight real planet presets, seven selected real moons and Exodus Station in Sol', () => {
    const names = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']
    const planets = raw.systems.sol.planets
    expect(planets.map(planet => planet.name)).toEqual(names)
    for (const planet of planets) {
      expect(createPlanetVisualizationConfig(planet).preset).toBe(planet.name.toLowerCase())
      expect(planet.loreFile).toMatch(/^lore\/solar\//)
      expect(readText(new URL(planet.loreFile, baseUrl))).toContain('CC BY-SA 4.0')
    }
    expect(planets[5].visualization.ring).toBeTruthy()
    const solBodies = planets.flatMap(getSatellites)
    const moons = solBodies.filter(body => body.kind === 'moon')
    expect(moons.map(moon => moon.data.name)).toEqual(['Moon', 'Phobos', 'Deimos', 'Io', 'Europa', 'Titan', 'Triton'])
    const solStations = solBodies.filter(body => body.kind === 'station')
    expect(solStations).toHaveLength(1)
    expect(getSatellites(planets[2]).map(body => body.data.name)).toEqual(['Moon', 'Exodus Station'])
    expect(solStations[0]).toMatchObject({ index: 1, type: 'ring', distance: 3.2, size: 0.18, speed: 0.006 })
    expect(built.wikiIndex.find('Exodus Station')).toBeTruthy()
    expect(raw.stars.find(star => star.id === 'sol').lore).toContain('not to scale')
    const stations = Object.entries(raw.systems).filter(([id]) => id !== 'sol').flatMap(([, system]) => system.planets.flatMap(getSatellites)).filter(body => body.kind === 'station')
    expect(stations.map(body => body.type).sort()).toEqual(['outpost', 'ring', 'shipyard', 'spindle'])
  })

  it('preserves audio, appearance defaults and the arrangement of the main page', () => {
    expect(raw.site).toEqual({ title: 'SpaceMap', titleTemplate: '{page} — {site}', favicon: 'favicon.gif' })
    expect(existsSync(fileURLToPath(new URL(raw.site.favicon, baseUrl)))).toBe(true)
    const tracks = raw.music.tracks
    expect(tracks.map(track => track.title)).toEqual(['Codebrain', 'Get Set', 'Gneiss', 'Intruder', 'Night at the Citadel', 'O.W.L', 'Oxygen Facility', 'Quantum'])
    for (const track of tracks) {
      expect(track, track.title).toMatchObject({ author: 'Duke Gneiss', license: 'CC BY-NC-SA 3.0' })
      expect(track.file, track.title).toMatch(/^music\/gneiss\/[a-z-]+\.mp3$/)
      expect(existsSync(fileURLToPath(new URL(track.file, baseUrl))), track.file).toBe(true)
      expect(track.url, track.title).toMatch(/^https:\/\/soundcloud\.com\/dukegneiss\//)
      expect(track.duration, track.title).toBeGreaterThan(0)
    }
    for (const key of ['sounds', 'terminal', 'theme', 'strings', 'loreConfig']) expect(raw[key], key).toBeUndefined()
    expect(raw.hyperlineTypes).toEqual({
      gate: { name: 'Quantum Gates', color: '0x00ffff', width: 3, opacity: 0.7 },
      trade: { name: 'Trade Route', color: '0xffaa00', width: 2, opacity: 0.6 },
      military: { name: 'Military Corridor', color: '0x4444ff', width: 2, opacity: 0.65 },
      industrial: { name: 'Industrial Line', color: '0xff6600', width: 2, opacity: 0.65 },
      supply: { name: 'Supply Line', color: '0xaa00aa', width: 2, opacity: 0.55 }
    })
    const cards = parseLayout(readText(new URL('wiki/main.wiki', publicUrl))).filter(block => !isGap(block))
    expect(cards.map(card => card.kind)).toEqual(['banner', 'links', 'box', 'box', 'box', 'box', 'portal'])
    expect(bannerFields(cards[0]).style).toBe('sunset')
    expect(cards.filter(card => card.kind === 'box').map(boxFields).map(box => [box.color, box.icon])).toEqual([
      ['green', 'question'], ['red', 'flag'], ['blue', 'gear'], ['purple', 'book']
    ])
    expect(collectHeadings(built.wikiIndex.find('Long Article Example').doc).filter(heading => heading.level === 2)).toHaveLength(8)
  })

  it('builds share pages for the new systems and all article pages', () => {
    const pages = socialPages(built)
    expect(pages.filter(page => page.path.startsWith('system/'))).toHaveLength(8)
    expect(pages.filter(page => page.path.startsWith('wiki/'))).toHaveLength(built.wikiIndex.pages.length)
    expect(pages.find(page => page.path === 'system/sol/').card.subtitle).toBe('SECTOR 01:01 - 8 PLANETS')
    expect(pages.find(page => page.path === 'wiki/Solar_Concord/')).toBeTruthy()
  })
})
