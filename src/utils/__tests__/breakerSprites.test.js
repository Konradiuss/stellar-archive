import { describe, expect, it } from 'vitest'
import { STEEL_TINTS } from '../bezelSprites'
import {
  BREAKER_FRAMES, BREAKER_GLYPHS, BREAKER_MIN_HEIGHT, BREAKER_WIDTH, DEFAULT_WORDS, LABEL_LIGHTS, PLATE, TERMINAL_LEFTS, TOGGLE,
  breakerLayout, breakerWordProblem, breakerWords, buildBreaker, buildBreakerLabel, drumRibs, labelText, textWidth
} from '../breakerSprites'
import { getPixel } from '../pixelArt'

const TOGGLE_COLORS = new Set(Object.values(TOGGLE))
const INK = '#eef3ff'

function rowsWith(sprite, colors) {
  const rows = new Set()
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) if (colors.has(getPixel(sprite, x, y))) rows.add(y)
  }
  return [...rows]
}

const centre = rows => rows.reduce((sum, row) => sum + row, 0) / rows.length
const faceRows = (sprite, face) => rowsWith(sprite, new Set([face])).length

describe('mode breaker sprites', () => {
  const tint = STEEL_TINTS.blue
  const layout = breakerLayout()
  const frames = Object.fromEntries(BREAKER_FRAMES.map(frame => [frame, buildBreaker(tint, frame)]))

  it('turns the toggle about its axis from the top (map) to the bottom (wiki)', () => {
    const win = layout.window
    for (const sprite of Object.values(frames)) {
      expect([sprite.w, sprite.h]).toEqual([BREAKER_WIDTH, BREAKER_MIN_HEIGHT])
      for (const row of rowsWith(sprite, TOGGLE_COLORS)) {
        expect(row).toBeGreaterThanOrEqual(win.y)
        expect(row).toBeLessThan(win.y + win.h)
      }
    }
    const centres = BREAKER_FRAMES.map(frame => centre(rowsWith(frames[frame], TOGGLE_COLORS)))
    for (let i = 1; i < centres.length; i++) expect(centres[i]).toBeGreaterThan(centres[i - 1])
    expect(Math.abs(centre(rowsWith(frames.middle, TOGGLE_COLORS)) - (layout.pivot - 0.5))).toBeLessThan(1)
  })

  it('shows the word of the side turned to the viewer, folding it on the way', () => {
    const letters = frame => rowsWith(frames[frame], new Set([INK]))
    expect(letters('up').length).toBe(6)
    expect(Math.max(...letters('up'))).toBeLessThan(layout.pivot)
    expect(letters('down').length).toBe(6)
    expect(Math.min(...letters('down'))).toBeGreaterThanOrEqual(layout.pivot)
    expect(letters('up-half').length).toBeLessThan(6)
    expect(letters('down-half').length).toBeLessThan(6)
    expect(letters('middle')).toEqual([])
    expect(faceRows(frames['up-half'], TOGGLE.under)).toBeLessThan(faceRows(frames.up, TOGGLE.under))
    expect(faceRows(frames['down-half'], TOGGLE.body)).toBeLessThan(faceRows(frames.down, TOGGLE.body))
    expect(faceRows(frames.up, TOGGLE.under)).toBeGreaterThan(0)
    expect(faceRows(frames.down, TOGGLE.under)).toBe(0)
  })

  it('shows a ribbed drum behind the toggle that turns with it', () => {
    const win = layout.window
    const drumColors = new Set()
    for (let y = win.y; y < layout.pivot - 3; y++) drumColors.add(getPixel(frames.down, 12, y))
    expect(drumColors.size).toBeGreaterThanOrEqual(3)
    expect(drumColors.has(tint.recess)).toBe(true)
    expect(drumColors.has(tint.dark)).toBe(true)
    expect(getPixel(frames.up, 12, win.y + win.h - 2)).toBe(tint.rim)
    const ribs = drumRibs('middle')
    const gaps = ribs.slice(1).map((row, i) => row - ribs[i])
    expect(Math.min(gaps[0], gaps[gaps.length - 1])).toBeLessThan(Math.max(...gaps))
    const patterns = new Set(BREAKER_FRAMES.map(frame => drumRibs(frame).join()))
    expect(patterns.size).toBe(BREAKER_FRAMES.length)
    for (const rib of drumRibs('down')) expect(getPixel(frames.down, win.x + win.w - 1, rib)).toBe(tint.rim)
  })

  it('casts the shadow of the toggle on the drum just below it', () => {
    const levels = [tint.rim, tint.recess, tint.shade, tint.dark, tint.body]
    const bottom = Math.max(...rowsWith(frames.up, TOGGLE_COLORS))
    const level = y => levels.indexOf(getPixel(frames.up, 12, y))
    expect(bottom).toBe(layout.pivot + 2)
    expect(level(bottom + 1)).toBeLessThan(level(bottom + 2))
  })

  it('is made of the steel of its casing, with its plate and the terminals in place', () => {
    for (const [name, steel] of Object.entries(STEEL_TINTS)) {
      const sprite = buildBreaker(steel, 'up')
      expect(getPixel(sprite, 3, 16), name).toBe(steel.light)
      expect(getPixel(sprite, 0, 0), name).toBe(steel.outline)
    }
    for (const sprite of Object.values(frames)) {
      for (const left of TERMINAL_LEFTS) expect(getPixel(sprite, left + 4, layout.terminalTop + 4)).toBe(tint.rim)
      const plate = layout.plate
      expect(getPixel(sprite, plate.x + 1, plate.y + 1)).toBe(PLATE.face)
      expect(rowsWith(sprite, new Set([PLATE.ink]))).toEqual([5, 6, 7, 8, 9, 10])
    }
  })

  it('has both positions stamped on the casing, above and below the toggle', () => {
    const { map, wiki } = layout.labels
    const win = layout.window
    expect(layout.plate.y + layout.plate.h).toBeLessThan(map.y)
    expect(map.y + map.h).toBeLessThan(win.y)
    expect(win.y + win.h).toBeLessThan(wiki.y)
    expect(wiki.y + wiki.h).toBeLessThanOrEqual(layout.ridge)
    for (const box of [map, wiki]) {
      expect(box.x).toBeGreaterThan(1)
      expect(box.x + box.w).toBeLessThan(BREAKER_WIDTH - 1)
    }
    for (const sprite of Object.values(frames)) {
      for (const box of [map, wiki]) {
        const dark = rowsWith(sprite, new Set([tint.shade])).filter(row => row >= box.y && row < box.y + box.h)
        expect(dark.length).toBeGreaterThanOrEqual(5)
      }
    }
    for (const side of ['map', 'wiki']) {
      const light = buildBreakerLabel(side)
      expect([light.w, light.h]).toEqual([textWidth(labelText(side)), layout.labels[side].h])
      expect(new Set(light.pixels.filter(Boolean))).toEqual(new Set([LABEL_LIGHTS[side]]))
    }
  })

  it('grows to the height of the legend: plate on top, terminals at the bottom, the window in the middle', () => {
    for (const height of [93, 120]) {
      const tall = breakerLayout(height)
      const sprite = buildBreaker(tint, 'down', height)
      expect(sprite.h).toBe(height)
      expect(tall.terminalTop + 9).toBe(height - 3)
      expect(tall.plate.y).toBe(3)
      const middle = tall.window.y + tall.window.h / 2
      expect(Math.abs(middle - height / 2)).toBeLessThanOrEqual(1.5)
      expect(getPixel(sprite, TERMINAL_LEFTS[0] + 4, tall.terminalTop + 4)).toBe(tint.rim)
      expect(Math.min(...rowsWith(sprite, new Set([INK])))).toBeGreaterThanOrEqual(tall.pivot)
      expect(tall.window.y - (tall.labels.map.y + tall.labels.map.h)).toBe(1)
      expect(tall.labels.wiki.y - (tall.window.y + tall.window.h)).toBe(2)
    }
    expect(breakerLayout(40).height).toBe(BREAKER_MIN_HEIGHT)
  })

  it('is lettered in English by default, and has letters for Latin, Cyrillic and digits', () => {
    expect(DEFAULT_WORDS).toEqual({ plate: 'MODE', map: 'MAP', wiki: 'WIKI' })
    expect([labelText('map'), labelText('wiki')]).toEqual(['▲ MAP', '▼ WIKI'])
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ-. '
    for (const char of alphabet) expect(BREAKER_GLYPHS[char], char).toBeDefined()
  })

  it('takes its words from the texts of the map, in capitals, and keeps English where it cannot draw them', () => {
    const russian = { plate: 'режим', map: 'карта', wiki: 'вики' }
    expect(breakerWords(key => russian[key], 'ru')).toEqual({ plate: 'РЕЖИМ', map: 'КАРТА', wiki: 'ВИКИ' })
    expect(breakerWords(key => ({ plate: 'BETRIEBSMODUS', map: '地图', wiki: 'Wiki' })[key], 'de')).toEqual({ plate: 'MODE', map: 'MAP', wiki: 'WIKI' })
    expect(breakerWordProblem('map', '地图')).toContain('has letters the breaker cannot draw (地 图)')
    expect(breakerWordProblem('plate', 'BETRIEBSMODUS')).toContain('is too long for the breaker')
    expect(breakerWordProblem('wiki', 'ВИКИ')).toBeNull()

    const words = { plate: 'РЕЖИМ', map: 'КАРТА', wiki: 'ВИКИ' }
    const ru = breakerLayout(BREAKER_MIN_HEIGHT, words)
    expect(ru.labels.map.w).toBe(textWidth('▲ КАРТА'))
    expect(ru.labels.map.w).not.toBe(layout.labels.map.w)
    const up = buildBreaker(tint, 'up', BREAKER_MIN_HEIGHT, words)
    expect(rowsWith(up, new Set([INK])).length).toBe(6)
    expect(rowsWith(up, new Set([PLATE.ink]))).toEqual([5, 6, 7, 8, 9, 10])
    expect(up.pixels).not.toEqual(frames.up.pixels)
    expect(buildBreakerLabel('wiki', words).w).toBe(textWidth('▼ ВИКИ'))
  })

  it('has letters of six rows, each of one width', () => {
    for (const [char, rows] of Object.entries(BREAKER_GLYPHS)) {
      expect(rows.length, char).toBe(6)
      expect(new Set(rows.map(row => row.length)).size, char).toBe(1)
    }
  })
})
