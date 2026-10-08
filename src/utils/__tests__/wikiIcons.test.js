import { describe, expect, it } from 'vitest'
import { ICON_DEFS, ICON_NAMES, ICON_SIZE, iconSprite, iconUri } from '../wikiIcons.js'

describe('wiki icons', () => {
  it('has signs for many subjects, the ones the map and the wiki name among them', () => {
    expect(ICON_SIZE).toBe(16)
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(50)
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length)
    for (const name of ['book', 'flag', 'gear', 'question', 'planet', 'document', 'search']) expect(ICON_NAMES).toContain(name)
    expect(ICON_NAMES[0]).toBe('star')
  })

  it('has sixteen rows of sixteen letters, each letter a colour of the sign', () => {
    for (const [name, { colors, rows }] of Object.entries(ICON_DEFS)) {
      expect(rows, name).toHaveLength(ICON_SIZE)
      for (const row of rows) {
        expect(row.length, `${name}: ${row}`).toBe(ICON_SIZE)
        for (const char of row) if (char !== '.') expect(colors[char], `${name}: ${char}`).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it('leaves an empty pixel round every sign, so that signs never touch', () => {
    for (const [name, { rows }] of Object.entries(ICON_DEFS)) {
      const edge = [rows[0], rows[ICON_SIZE - 1], ...rows.map(row => row[0] + row[ICON_SIZE - 1])].join('')
      expect(edge.replace(/\./g, ''), name).toBe('')
    }
  })

  it('draws every sign with body and shading: many pixels, several colours, no two alike', () => {
    const seen = new Set()
    for (const name of ICON_NAMES) {
      const sprite = iconSprite(name)
      expect(sprite.w).toBe(ICON_SIZE)
      expect(sprite.pixels).toHaveLength(ICON_SIZE * ICON_SIZE)
      expect(sprite.pixels.filter(Boolean).length, name).toBeGreaterThan(40)
      expect(new Set(sprite.pixels.filter(Boolean)).size, name).toBeGreaterThanOrEqual(3)
      const key = sprite.pixels.join(',')
      expect(seen.has(key), name).toBe(false)
      seen.add(key)
    }
  })

  it('gives an unknown name the book', () => {
    expect(iconUri('no such icon')).toBe(iconUri('book'))
    expect(iconUri('star')).not.toBe(iconUri('book'))
    expect(iconUri('star')).toMatch(/^data:image\/svg\+xml,/)
  })

  // Was: an icon "toString" or "constructor" was found among a plain object's keys, and drawing it threw on the main page of the wiki.
  it('gives the names of Object\'s properties the book too', () => {
    for (const name of ['toString', 'constructor', '__proto__']) {
      expect(iconUri(name)).toBe(iconUri('book'))
      expect(iconSprite(name)).toEqual(iconSprite('book'))
    }
  })
})
