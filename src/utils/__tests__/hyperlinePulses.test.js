import { describe, expect, it } from 'vitest'
import { measurePath, pointAt, pulsePositions } from '../hyperlinePulses.js'

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
})
