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
