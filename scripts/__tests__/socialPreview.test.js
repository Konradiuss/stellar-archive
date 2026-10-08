import { describe, expect, it } from 'vitest'
import { renderCard, siteUrlFrom, socialPreview } from '../socialPreview'
import { cardSvg } from '../../src/social/card'

const MAP = {
  galaxy: { width: 1600, height: 900, columns: 16, rows: 9, sectorSize: 100 },
  territories: [],
  routedHyperlines: [],
  stars: [{ id: 'sol', name: 'Sol', sectorX: 2, sectorY: 2 }],
  factions: {}
}

const pngSize = png => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) })

// Was: the previews had no picture.
describe('the picture of a link preview', () => {
  it('is a PNG of 1200 × 630, light enough for a chat', () => {
    const png = renderCard(cardSvg({ map: MAP, colors: null, title: 'Sol', subtitle: 'Sector 02:02', highlight: 'sol' }))
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
    expect(png.length).toBeLessThan(300 * 1024)
  })

  it('is none, not an error, when the card cannot be drawn', () => {
    expect(renderCard('<svg')).toBeNull()
  })
})

describe('the address of the site for the previews', () => {
  it('takes SITE_URL as the folder of the site', () => {
    expect(siteUrlFrom('https://owner.github.io/reach')).toBe('https://owner.github.io/reach/')
    expect(siteUrlFrom('https://owner.github.io/reach/')).toBe('https://owner.github.io/reach/')
    // The workflow appends a slash to base_url, which may already end in one.
    expect(siteUrlFrom('https://owner.github.io/reach//')).toBe('https://owner.github.io/reach/')
    expect(siteUrlFrom('https://owner.github.io/')).toBe('https://owner.github.io/')
    expect(siteUrlFrom('ftp://x')).toBeNull()
    expect(siteUrlFrom('')).toBeNull()
    expect(siteUrlFrom(undefined)).toBeNull()
  })

  it('is a plugin of the build only, which leaves a page as it is without previews', () => {
    const plugin = socialPreview()
    expect(plugin.apply).toBe('build')
    expect(plugin.transformIndexHtml('<html lang="en"><head><title>x</title></head><body></body></html>')).toBe('<html lang="en"><head><title>x</title></head><body></body></html>')
  })
})
