import { parseColor } from './hyperlineStyle'

export function cssColor(value) {
  const color = parseColor(value)
  return color === null ? null : `#${color.toString(16).padStart(6, '0')}`
}

export function hexToRgb(hex) {
  return {
    r: (hex >> 16) & 255,
    g: (hex >> 8) & 255,
    b: hex & 255
  }
}

export function colorStyle(color) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

/** 0xrrggbb a `share` (0..1) of the way from `from` to `to`. */
export function mixColor(from, to, share) {
  const channel = shift => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return Math.round(a + (b - a) * share) << shift
  }
  return channel(16) | channel(8) | channel(0)
}
