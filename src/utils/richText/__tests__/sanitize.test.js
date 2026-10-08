import { describe, expect, it } from 'vitest'
import { safeColor, safeHref, safeImageSrc } from '../sanitize'

// The border between the texts of a map and the page: what passes here becomes a link, a picture or a CSS colour.
describe('what the lore may put on the page', () => {
  it('links to the web and to mail only', () => {
    expect(safeHref('https://wiki.example/Mars')).toBe('https://wiki.example/Mars')
    expect(safeHref(' HTTP://x.org ')).toBe('HTTP://x.org')
    expect(safeHref('mailto:admin@x.org')).toBe('mailto:admin@x.org')
    for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>',
      'vbscript:x', 'file:///etc/passwd', '//evil.example', '/local/page', 'wiki/Mars', '', null, undefined]) {
      expect(safeHref(url), String(url)).toBeNull()
    }
  })

  it('pictures from the web or next to the map, never from another scheme', () => {
    expect(safeImageSrc('https://img.example/a.png')).toBe('https://img.example/a.png')
    expect(safeImageSrc('lore/images/earth.jpg')).toBe('lore/images/earth.jpg')
    expect(safeImageSrc('./a.png')).toBe('./a.png')
    for (const src of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'file:///c:/a.png',
      '//evil.example/a.png', 'blob:https://x/1', '', '   ', null]) {
      expect(safeImageSrc(src), String(src)).toBeNull()
    }
  })

  it('colours as CSS writes them, and nothing else', () => {
    for (const color of ['#abc', '#abcd', '#a1b2c3', '#a1b2c3d4', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'hsl(120deg 50% 50%)', 'teal']) {
      expect(safeColor(color), color).toBe(color)
    }
    for (const color of ['red; background: url(x)', 'url(javascript:x)', 'expression(alert(1))', '#ggg', 'rgb(1,2,3);x',
      'var(--ui-text)', '"red"', '', null]) {
      expect(safeColor(color), String(color)).toBeNull()
    }
  })
})
