import { onScopeDispose, ref, watch } from 'vue'
import { CRT_ON_MS } from '../utils/crtTiming'
import { prefersReducedMotion } from '../utils/reducedMotion'

export const PANEL_POWER_ON_MS = CRT_ON_MS
export const PANEL_SWITCH_MS = 300
export const PANEL_INTERFERENCE_MS = 150

// 'off' -> 'powering' -> 'receiving' (no data yet) -> 'switching' -> 'on'
export function usePanelScreen({ title, text, interferenceKey = null }, options = {}) {
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion()
  const duration = value => (reducedMotion ? 0 : value)
  const powerOnDelay = duration(options.powerOnDelay ?? 0)
  const powerOnMs = duration(options.powerOnMs ?? PANEL_POWER_ON_MS)
  const switchMs = duration(options.switchMs ?? PANEL_SWITCH_MS)
  const interferenceMs = duration(options.interferenceMs ?? PANEL_INTERFERENCE_MS)

  const state = ref('off')
  const shownTitle = ref('')
  const shownText = ref('')
  const interferenceTick = ref(0)
  const interfering = ref(false)
  let stateTimer = null
  let interferenceTimer = null

  function schedule(callback, delay) {
    clearTimeout(stateTimer)
    stateTimer = setTimeout(callback, delay)
  }

  function finishPowerOn() {
    shownTitle.value = title()
    if (text()) {
      startSwitch()
    } else {
      state.value = 'receiving'
    }
  }

  function startSwitch() {
    state.value = 'switching'
    schedule(finishSwitch, switchMs)
  }

  // Shows whatever is current now, even if it changed again during the switch.
  function finishSwitch() {
    shownTitle.value = title()
    shownText.value = text()
    state.value = shownText.value ? 'on' : 'receiving'
  }

  watch(() => [title(), text()], ([nextTitle, nextText]) => {
    if (state.value === 'receiving') {
      if (nextText) startSwitch()
      else shownTitle.value = nextTitle
    } else if (state.value === 'on' &&
      (nextTitle !== shownTitle.value || nextText !== shownText.value)) {
      startSwitch()
    }
  })

  if (interferenceKey) {
    watch(interferenceKey, () => {
      if (state.value !== 'on') return
      interferenceTick.value++
      interfering.value = true
      clearTimeout(interferenceTimer)
      interferenceTimer = setTimeout(() => { interfering.value = false }, interferenceMs)
    })
  }

  schedule(() => {
    state.value = 'powering'
    schedule(finishPowerOn, powerOnMs)
  }, powerOnDelay)

  onScopeDispose(() => {
    clearTimeout(stateTimer)
    clearTimeout(interferenceTimer)
  })

  return { state, shownTitle, shownText, interferenceTick, interfering }
}
