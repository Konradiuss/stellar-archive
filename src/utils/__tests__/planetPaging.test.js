import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, clampPage, hotkeyRange, pageCount, pageOf, pageRange, planetForKey } from '../planetPaging'

describe('planetPaging', () => {
  it('splits the planets into pages of nine', () => {
    expect(PAGE_SIZE).toBe(9)
    expect([0, 4, 9, 10, 12, 18, 19].map(pageCount)).toEqual([1, 1, 1, 2, 2, 2, 3])
    expect([0, 8, 9, 11].map(pageOf)).toEqual([0, 0, 1, 1])
    expect(pageOf(null)).toBe(0)
  })

  it('gives the planets of a page and keeps the page in range', () => {
    expect(pageRange(0, 12)).toEqual({ start: 0, end: 9 })
    expect(pageRange(1, 12)).toEqual({ start: 9, end: 12 })
    expect(pageRange(5, 12)).toEqual({ start: 9, end: 12 })
    expect(pageRange(0, 0)).toEqual({ start: 0, end: 0 })
    expect(clampPage(-1, 12)).toBe(0)
    expect(clampPage(3, 4)).toBe(0)
  })

  it('maps keys 1-9 to planets of the current page', () => {
    expect(planetForKey('1', 0, 4)).toBe(0)
    expect(planetForKey('4', 0, 4)).toBe(3)
    expect(planetForKey('5', 0, 4)).toBeNull()
    expect(planetForKey('3', 1, 12)).toBe(11)
    expect(planetForKey('4', 1, 12)).toBeNull()
    expect(planetForKey('0', 0, 12)).toBeNull()
    expect(planetForKey('1', 0, 0)).toBeNull()
  })

  it('describes the keys of the page for the hints', () => {
    expect(hotkeyRange(0, 4)).toBe('1-4')
    expect(hotkeyRange(0, 12)).toBe('1-9')
    expect(hotkeyRange(1, 12)).toBe('1-3')
    expect(hotkeyRange(1, 10)).toBe('1')
    expect(hotkeyRange(0, 0)).toBeNull()
  })
})
