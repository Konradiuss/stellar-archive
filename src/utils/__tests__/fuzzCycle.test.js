import { describe, expect, it } from 'vitest'
import { FUZZ_OFF_SECONDS, FUZZ_ON_SECONDS, fillFuzzLevels, fuzzAmount } from '../fuzzCycle.js'

const CYCLE = FUZZ_ON_SECONDS + FUZZ_OFF_SECONDS
const STEP = 0.05
const cells = []
for (let y = -4; y < 12; y++) for (let x = -4; x < 20; x++) cells.push([x, y])

// Seconds in [from, to) when the cell jitters.
function activeTime(x, y, from, to) {
  let time = 0
  for (let t = from; t < to; t += STEP) if (fuzzAmount(x, y, t, 42) > 0) time += STEP
  return time
}

describe('uncharted jitter flares', () => {
  // Was: every cell jittered all the time.
  it('lets every cell jitter about 3 seconds of every 9', () => {
    for (const [x, y] of cells.slice(0, 40)) {
      const share = activeTime(x, y, 0, CYCLE * 20) / (CYCLE * 20)
      expect(share, `${x},${y}`).toBeCloseTo(FUZZ_ON_SECONDS / CYCLE, 1)
    }
  })

  it('rises and fades along a sine', () => {
    const [x, y] = [3, -2]
    let start = 0
    while (fuzzAmount(x, y, start, 42) === 0) start += 0.001
    expect(fuzzAmount(x, y, start + 0.01, 42)).toBeLessThan(0.05)
    expect(fuzzAmount(x, y, start + FUZZ_ON_SECONDS / 2, 42)).toBeCloseTo(1, 2)
    expect(fuzzAmount(x, y, start + FUZZ_ON_SECONDS - 0.02, 42)).toBeLessThan(0.05)
    expect(fuzzAmount(x, y, start + FUZZ_ON_SECONDS + 0.01, 42)).toBe(0)
  })

  it('makes about a third of the cells jitter at any moment, at different times', () => {
    for (const time of [0, 1.7, 5, 13.3, 100]) {
      const active = cells.filter(([x, y]) => fuzzAmount(x, y, time, 42) > 0).length
      expect(active / cells.length, `t=${time}`).toBeGreaterThan(0.2)
      expect(active / cells.length, `t=${time}`).toBeLessThan(0.47)
    }
    const together = cells.filter(([x, y]) => [0, 2, 4, 6, 8].every(t => (fuzzAmount(x, y, t, 42) > 0) === (fuzzAmount(x + 1, y, t, 42) > 0)))
    expect(together.length).toBeLessThan(cells.length / 2)
  })

  it('writes the same levels for the same time', () => {
    const grid = { columns: 5, rows: 3, originX: -2, originY: -1 }
    const first = fillFuzzLevels(new Uint8ClampedArray(60), grid, 4.2, 7)
    expect(fillFuzzLevels(new Uint8ClampedArray(60), grid, 4.2, 7)).toEqual(first)
    expect(first[(1 * 5 + 3) * 4]).toBe(Math.round(fuzzAmount(1, 0, 4.2, 7) * 255))
    expect(first.filter((value, index) => index % 4 === 3).every(alpha => alpha === 255)).toBe(true)
  })
})
