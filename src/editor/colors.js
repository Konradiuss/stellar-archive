import { cssColor } from '../utils/color'

export { cssColor }

export const factionColor = faction => cssColor(faction?.borderColor) ?? cssColor(faction?.fillColor)

export function fileColor(css, before) {
  const hex = String(css).replace(/^#/, '').toLowerCase()
  return typeof before === 'string' && /^0x/i.test(before.trim()) ? `0x${hex}` : `#${hex}`
}
