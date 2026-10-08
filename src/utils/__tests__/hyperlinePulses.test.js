import { describe, expect, it } from 'vitest'
import { measurePath, pointAt, pulsePositions, pulseSquares } from '../hyperlinePulses.js'

describe('hyperline pulses', () => {
  const path = measurePath([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }])

  it('measures a polyline and finds points along it', () => {
    expect(path.total).toBe(70)
    expect(pointAt(path, -5)).toEqual({ x: 0, y: 0 })
    expect(pointAt(path, 15)).toEqual({ x: 15, y: 0 })
    expect(pointAt(path, 30)).toEqual({ x: 30, y: 0 })
    expect(pointAt(path, 50)).toEqual({ x: 30, y: 20 })
    expect(pointAt(path, 99)).toEqual({ x: 30, y: 40 })
  })

  const line = { total: 100, speed: 50, interval: 1 }

  it('sends a pulse every interval at the given speed, all on the line', () => {
    // 2 s to cross, a pulse a second: two forward pulses on the way.
    const forward = pulsePositions(0.4, { ...line, direction: 'forward' })
    expect(forward.map(pulse => pulse.distance)).toEqual([20, 70])
    expect(forward.every(pulse => pulse.forward)).toBe(true)
    // Half a second later each pulse is 25 px further.
    expect(pulsePositions(0.9, { ...line, direction: 'forward' }).map(pulse => pulse.distance)).toEqual([45, 95])
    for (let time = 0; time < 5; time += 0.13) {
      for (const pulse of pulsePositions(time, line)) {
        expect(pulse.distance).toBeGreaterThanOrEqual(0)
        expect(pulse.distance).toBeLessThanOrEqual(100)
      }
    }
  })

  it('runs both ways unless the line goes forward only', () => {
    const both = pulsePositions(0.4, line)
    expect(both.filter(pulse => pulse.forward)).toHaveLength(2)
    const back = both.filter(pulse => !pulse.forward)
    expect(back).toHaveLength(2)
    expect(back.map(pulse => pulse.distance)).toEqual([55, 5])
  })

  it('shifts the timetable of each line by its phase', () => {
    const one = pulsePositions(3, { ...line, phase: 0.1 }).map(pulse => pulse.distance)
    const other = pulsePositions(3, { ...line, phase: 0.6 }).map(pulse => pulse.distance)
    expect(one).not.toEqual(other)
  })

  it('has no pulses on an empty line', () => {
    expect(pulsePositions(1, { ...line, total: 0 })).toEqual([])
    expect(pulsePositions(1, { ...line, speed: 0 })).toEqual([])
  })

  const straight = measurePath([{ x: 0, y: 0 }, { x: 100, y: 0 }])
  const look = { pulse: { speed: 50, interval: 1, length: 12 }, direction: 'forward', width: 2 }

  it('draws a pulse as a glowing head with a fading tail behind it', () => {
    // At 0.4 s the forward pulses stand at 20 and 70 px.
    const squares = pulseSquares(straight, look, 0.4)
    const heads = squares.filter(square => square.tone === 'head')
    expect(heads.map(square => square.x + square.size / 2)).toEqual([20, 70])
    expect(heads.every(square => square.size === 4 && square.alpha === 1)).toBe(true)
    expect(squares.filter(square => square.tone === 'glow').map(square => square.size)).toEqual([8, 8])
    // Four tail squares 3 px apart (length 12), behind the head at 70.
    const tail = squares.filter(square => square.tone === 'tail' && square.x > 40)
    expect(tail).toHaveLength(4)
    // Squares sit on whole pixels: within one of the exact spot.
    tail.forEach((square, index) => expect(Math.abs(square.x + square.size / 2 - (58 + index * 3))).toBeLessThanOrEqual(1))
    expect(tail.map(square => square.alpha)).toEqual([...tail.map(square => square.alpha)].sort((a, b) => a - b))
    // The head is last of its pulse, drawn over the tail.
    expect(squares.at(-1).tone).toBe('head')
  })

  it('fades a pulse in as it leaves the star and out as it reaches the other', () => {
    const leaving = pulseSquares(straight, look, 0.1).find(square => square.tone === 'head')
    expect(leaving.alpha).toBeCloseTo(5 / 14)
    const arriving = pulseSquares(straight, look, 1.96).find(square => square.tone === 'head' && square.x > 90)
    expect(arriving.alpha).toBeLessThan(0.2)
    expect(pulseSquares(straight, { ...look, direction: 'both' }, 0.4).filter(square => square.tone === 'head')).toHaveLength(4)
  })
})
