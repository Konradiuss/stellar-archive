// Each screen draws its own moments and kind of jump, so no two consoles glitch together.

import { onMounted, onUnmounted, ref } from 'vue'
import { prefersReducedMotion } from '../utils/reducedMotion'

const between = (min, max) => min + Math.random() * (max - min)
const pick = list => list[Math.floor(Math.random() * list.length)]
const px = (limit, strength) => `${Math.round(between(-limit, limit) * strength)}px`

const GLITCHES = [
  strength => ({ transform: `translate(${px(5, strength)}, ${px(2, strength)}) skewX(${between(-3, 3) * strength}deg)` }),
  strength => ({ transform: `translateX(${px(7, strength)}) scaleY(1.02)` }),
  strength => ({ transform: `translateY(${px(6, strength)})`, filter: 'sepia(0.85) saturate(1.2) brightness(0.8) contrast(1.35)' }),
  () => ({ filter: 'sepia(0.7) brightness(1.15) contrast(1.3)' })
]

// pause, length: [min, max] in ms; strength scales the distances.
export function useScreenGlitch({ pause = [250, 2000], length = [40, 180], strength = 1 } = {}) {
  const blink = { '--blink-duration': `${between(0.65, 1.2).toFixed(2)}s`, '--blink-delay': `${(-between(0, 1.2)).toFixed(2)}s` }
  const style = ref({ ...blink })
  let timer = null

  function calm() {
    style.value = { ...blink }
    timer = setTimeout(glitch, between(...pause))
  }

  function glitch() {
    style.value = { ...blink, ...pick(GLITCHES)(strength) }
    timer = setTimeout(calm, between(...length))
  }

  onMounted(() => {
    if (prefersReducedMotion()) return
    timer = setTimeout(glitch, between(...pause))
  })
  onUnmounted(() => clearTimeout(timer))

  return { style }
}
