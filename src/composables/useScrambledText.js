import { onMounted, onUnmounted, ref } from 'vue'
import { prefersReducedMotion } from '../utils/reducedMotion'

const SYMBOLS = '#$%&@*+=<>/\\01'

export function useScrambledText(text, { pause = [500, 1800], length = 90 } = {}) {
  const shown = ref(text)
  let timer = null

  function scramble() {
    const letters = [...text]
    const count = 1 + Math.floor(Math.random() * 3)
    for (let step = 0; step < count; step++) {
      const at = Math.floor(Math.random() * letters.length)
      if (letters[at] !== ' ') letters[at] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
    }
    shown.value = letters.join('')
    timer = setTimeout(restore, length)
  }

  function restore() {
    shown.value = text
    timer = setTimeout(scramble, pause[0] + Math.random() * (pause[1] - pause[0]))
  }

  onMounted(() => {
    if (prefersReducedMotion()) return
    timer = setTimeout(scramble, pause[0] + Math.random() * (pause[1] - pause[0]))
  })
  onUnmounted(() => clearTimeout(timer))

  return shown
}
