import { describe, expect, it } from 'vitest'
import { pageAt, pageCount, pageHeight, pageThumb } from '../panelPages.js'

describe('panel pages', () => {
  it('keeps whole lines on a page', () => {
    expect(pageHeight(100, 15)).toBe(90)
    expect(pageHeight(90, 15)).toBe(90)
    expect(pageHeight(10, 15)).toBe(15)
  })

  it('counts the columns of the text as pages', () => {
    // Columns 280 wide with a gap of 20: a page every 300 px.
    expect(pageCount(280, 300, 20)).toBe(1)
    expect(pageCount(580, 300, 20)).toBe(2)
    expect(pageCount(582, 300, 20)).toBe(2)
    expect(pageCount(880, 300, 20)).toBe(3)
    expect(pageCount(0, 300, 20)).toBe(1)
  })

  it('finds the page of the cursor', () => {
    expect(pageAt(0, 300)).toBe(0)
    expect(pageAt(299, 300)).toBe(0)
    expect(pageAt(300, 300)).toBe(1)
    expect(pageAt(910, 300)).toBe(3)
  })

  it('places the thumb of the page bar', () => {
    expect(pageThumb(0, 1)).toEqual({ top: 0, size: 1 })
    expect(pageThumb(0, 4)).toEqual({ top: 0, size: 0.25 })
    expect(pageThumb(3, 4)).toEqual({ top: 0.75, size: 0.25 })
    expect(pageThumb(9, 4)).toEqual({ top: 0.75, size: 0.25 })
  })
})
