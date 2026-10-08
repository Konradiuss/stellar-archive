import { describe, expect, it } from 'vitest'
import { parseNumber } from '../numbers'

describe('numbers typed into the forms', () => {
  it('takes a point or a comma, and nothing for nothing', () => {
    expect(parseNumber('0.0011')).toBe(0.0011)
    expect(parseNumber('0,5')).toBe(0.5)
    expect(parseNumber(' 75 ')).toBe(75)
    expect(parseNumber('-12.5')).toBe(-12.5)
    expect(parseNumber('.25')).toBe(0.25)
    expect(parseNumber('1e-3')).toBe(0.001)
    expect(parseNumber('')).toBe('')
    expect(parseNumber('   ')).toBe('')
  })

  it('says what is not a number', () => {
    for (const text of ['abc', '1.2.3', '12px', '1,2,3', '--1', 'Infinity', 'NaN']) expect(parseNumber(text), text).toBeNull()
  })
})
