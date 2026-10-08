// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { cardSvg, cssColor, wrap } from '../card'

const MAP = {
  galaxy: { width: 1600, height: 900, columns: 16, rows: 9, sectorSize: 100 },
  territories: [{ color: '0x0088ff', borderColor: '0x00aaff', fillOpacity: 0.12, outer: [[0, 0], [400, 0], [400, 300], [0, 300]], holes: [] }],
  routedHyperlines: [{ hyperline: { color: 0x00ffff, opacity: 0.7, width: 3 }, path: [{ x: 2, y: 2 }, { x: 7, y: 3 }] }],
  stars: [
    { id: 'sol', name: 'Sol', sectorX: 2, sectorY: 2, faction: 'concord', starVisualization: { color1: '0xffdd00' } },
    { id: 'asterion', name: 'Asterion', sectorX: 9, sectorY: 5, faction: 'concord' }
  ],
  factions: { concord: { borderColor: '0x00aaff' } }
}
const COLORS = { screen: '#000000', text: '#ffffff', dim: '#9a9a9a', line: '#555555', accent: '#cfe0ff' }
const parse = svg => new DOMParser().parseFromString(svg, 'image/svg+xml')

// Was: a shared link of the site showed no picture at all.
describe('the card of a link preview', () => {
  it('draws the galaxy of the map and the name of the page', () => {
    const svg = cardSvg({ map: MAP, colors: COLORS, title: 'Earth', subtitle: 'The home world.', eyebrow: 'The Reach' })
    const doc = parse(svg)
    expect(doc.querySelector('svg').getAttribute('width')).toBe('1200')
    expect([...doc.querySelectorAll('text')].map(text => text.textContent)).toEqual(['The home world.', 'Earth', 'THE REACH'])
    expect(svg).toContain('fill="#0088ff"')
    expect(svg).toContain('stroke="#00ffff"')
    expect(svg).toContain('fill="#ffdd00"')
    expect(svg).toContain('fill="#00aaff"')
    expect(doc.querySelector('.sights')).toBeNull()
  })

  it('marks the star of the page in the sights', () => {
    const doc = parse(cardSvg({ map: MAP, colors: COLORS, title: 'Sol', highlight: 'sol' }))
    const ring = doc.querySelector('.sights circle')
    const sol = doc.querySelector('rect[fill="#ffdd00"]')
    expect(Number(ring.getAttribute('cx'))).toBeCloseTo(Number(sol.getAttribute('x')) + 4, 0)
    expect(Number(ring.getAttribute('cy'))).toBeCloseTo(Number(sol.getAttribute('y')) + 4, 0)
  })

  it('escapes what the map writes', () => {
    const svg = cardSvg({ map: MAP, colors: COLORS, title: 'A <b> & "c"', subtitle: "it's" })
    expect(svg).toContain('A &lt;b&gt; &amp; &quot;c&quot;')
    expect(svg).toContain('it&apos;s')
    expect(parse(svg).querySelector('parsererror')).toBeNull()
  })

  it('draws without a map or a theme', () => {
    const svg = cardSvg({ map: null, colors: null, title: 'Empty' })
    expect(svg).toContain('fill="#000000"')
    expect(svg).toContain('>Empty</text>')
  })
})

describe('the text of a card', () => {
  it('wraps at words and cuts the last line with "…"', () => {
    expect(wrap('one two three four', 9, 2)).toEqual(['one two', 'three…'])
    expect(wrap('one two', 9, 2)).toEqual(['one two'])
    expect(wrap('Supercalifragilistic', 8, 1)).toEqual(['Superca…'])
    expect(wrap('', 8, 2)).toEqual([])
  })

  it('reads every way a map writes a colour', () => {
    expect(cssColor('0x00AAFF')).toBe('#00aaff')
    expect(cssColor('#0af')).toBe('#00aaff')
    expect(cssColor(65535)).toBe('#00ffff')
    expect(cssColor('red', '#123456')).toBe('#123456')
  })
})
