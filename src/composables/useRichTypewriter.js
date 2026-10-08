import { onScopeDispose, ref, toValue, watch } from 'vue'
import { measureDocument } from '../utils/richText/measure'
import { playSound } from '../sound'

// Long articles speed up so that printing takes about this many ticks.
const TARGET_TICKS = 700
// fastForward() prints this many times faster, until the next pause.
const FAST_FORWARD_FACTOR = 12

// visibleCount: the budget RichText.vue renders, Infinity once all is shown. shouldPause() is checked before
// every step, like `more` at the end of a page. `pace` speeds up short documents too: the lore panel retypes at every switch.
export function useRichTypewriter(source, { speed = 15, instant = false, shouldPause = null, pace = 1 } = {}) {
  const visibleCount = ref(Infinity)
  const isTyping = ref(false)
  const isPaused = ref(false)
  let timer = null
  let total = 0
  let step = 1
  let fast = false

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function finish() {
    stop()
    visibleCount.value = Infinity
    isTyping.value = false
    isPaused.value = false
    fast = false
  }

  function tick() {
    if (shouldPause?.()) {
      stop()
      isPaused.value = true
      fast = false
      return
    }
    const next = visibleCount.value + step * (fast ? FAST_FORWARD_FACTOR : 1)
    // engine.js keeps the blips to one every few letters.
    playSound('typing')
    if (next >= total) finish()
    else visibleCount.value = next
  }

  function run() {
    stop()
    timer = setInterval(tick, speed)
  }

  function start(doc) {
    stop()
    total = measureDocument(doc)
    isPaused.value = false
    fast = false
    if (!total || toValue(instant)) {
      finish()
      return
    }

    step = Math.max(1, Math.ceil(total / TARGET_TICKS)) * Math.max(1, Math.round(pace))
    visibleCount.value = 0
    isTyping.value = true
    run()
  }

  function resume() {
    if (!isTyping.value || !isPaused.value) return
    isPaused.value = false
    run()
  }

  function fastForward() {
    if (!isTyping.value) return
    if (!shouldPause) {
      finish()
      return
    }
    fast = true
    if (isPaused.value) resume()
  }

  watch(source, start, { immediate: true })
  watch(() => toValue(instant), value => { if (value && isTyping.value) finish() })
  onScopeDispose(stop)

  return { visibleCount, isTyping, isPaused, finish, resume, fastForward }
}
