import { createRng } from './pixelArt'

// Match the crt-on / crt-off keyframes in src/styles/crt.css.
export const CRT_ON_MS = 520
export const CRT_OFF_MS = 420

export const SHUTTER_ON_MS = 400
export const SHUTTER_OFF_MS = 300

// Seeded per screen so no two screens sweep together.
export function crtScanTiming(seed) {
  const rng = createRng(seed, 'scan')
  return {
    '--crt-scan-period': `${rng.int(10, 18)}s`,
    '--crt-scan-delay': `${rng.int(2, 9)}s`
  }
}
