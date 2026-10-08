import { t } from '../i18n'
import { computed } from 'vue'
import { useSystemSettings } from '../stores/systemSettings'

export const TEXT_SIZES = [16, 20, 24]
export const LINE_RATIO = 1.5
// ms per letter
export const TYPING_SPEED = 15
// The lore beside the map and PLANET-DATA retype at every switch: a long text is done in seconds, not ten.
export const TYPING_PACE = 3

export function useReadingText() {
  const settings = useSystemSettings()

  const size = computed(() => (TEXT_SIZES.includes(settings.text.size) ? settings.text.size : TEXT_SIZES[0]))
  const line = computed(() => Math.round(size.value * LINE_RATIO))
  const style = computed(() => ({ '--reading-size': `${size.value}px`, '--reading-line': `${line.value}px` }))

  const sizeItem = computed(() => ({
    type: 'choice',
    label: t('windows.textSize'),
    value: size.value,
    options: TEXT_SIZES.map(value => ({ label: String(value), value })),
    onChange: value => settings.set('text', 'size', value)
  }))

  return { size, line, style, sizeItem }
}
