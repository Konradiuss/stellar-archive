import { hash2 } from './unchartedSpace'

export const FUZZ_ON_SECONDS = 3
export const FUZZ_OFF_SECONDS = 6
const CYCLE = FUZZ_ON_SECONDS + FUZZ_OFF_SECONDS

export function fuzzAmount(cellX, cellY, seconds, seed = 0) {
  const time = seconds + hash2(cellX, cellY, seed) * CYCLE
  const cycle = Math.floor(time / CYCLE)
  // Where in its cycle the jitter starts changes from cycle to cycle.
  const start = hash2(cellX, cellY, seed + 7919 * (cycle + 1)) * FUZZ_OFF_SECONDS
  const t = time - cycle * CYCLE - start
  return t > 0 && t < FUZZ_ON_SECONDS ? Math.sin(Math.PI * t / FUZZ_ON_SECONDS) : 0
}

/** One pixel per cell, strength in the red channel (0..255); originX/originY: sector of the first pixel. */
export function fillFuzzLevels(bytes, { columns, rows, originX = 0, originY = 0 }, seconds, seed = 0) {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const offset = (y * columns + x) * 4
      bytes[offset] = Math.round(fuzzAmount(originX + x, originY + y, seconds, seed) * 255)
      bytes[offset + 3] = 255
    }
  }
  return bytes
}
