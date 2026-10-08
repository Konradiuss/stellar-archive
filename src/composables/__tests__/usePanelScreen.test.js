import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { usePanelScreen } from '../usePanelScreen'

const TIMINGS = { powerOnDelay: 100, powerOnMs: 400, switchMs: 300, interferenceMs: 150 }

describe('usePanelScreen', () => {
  let scope
  let title
  let text
  let interference

  function createScreen() {
    return scope.run(() => usePanelScreen({
      title: () => title.value,
      text: () => text.value,
      interferenceKey: () => interference.value
    }, TIMINGS))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    scope = effectScope()
    title = ref('Galaxy')
    text = ref('')
    interference = ref(0)
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('powers on, waits for data and then switches to it', async () => {
    const screen = createScreen()
    expect(screen.state.value).toBe('off')

    vi.advanceTimersByTime(100)
    expect(screen.state.value).toBe('powering')

    vi.advanceTimersByTime(400)
    expect(screen.state.value).toBe('receiving')
    expect(screen.shownTitle.value).toBe('Galaxy')

    text.value = 'World lore'
    await nextTick()
    expect(screen.state.value).toBe('switching')
    expect(screen.shownText.value).toBe('')

    vi.advanceTimersByTime(300)
    expect(screen.state.value).toBe('on')
    expect(screen.shownText.value).toBe('World lore')
  })

  it('switches straight to the content when the data is already there', () => {
    text.value = 'Legend'
    const screen = createScreen()

    vi.advanceTimersByTime(500)
    expect(screen.state.value).toBe('switching')
    vi.advanceTimersByTime(300)
    expect(screen.state.value).toBe('on')
    expect(screen.shownText.value).toBe('Legend')
  })

  it('keeps the old content during a channel switch and shows the latest one', async () => {
    text.value = 'Galaxy lore'
    const screen = createScreen()
    vi.advanceTimersByTime(800)
    expect(screen.state.value).toBe('on')

    title.value = 'Sol'
    text.value = 'Sol lore'
    await nextTick()
    expect(screen.state.value).toBe('switching')
    expect(screen.shownText.value).toBe('Galaxy lore')

    vi.advanceTimersByTime(100)
    text.value = 'Sol lore, updated'
    await nextTick()
    vi.advanceTimersByTime(200)

    expect(screen.state.value).toBe('on')
    expect(screen.shownTitle.value).toBe('Sol')
    expect(screen.shownText.value).toBe('Sol lore, updated')
  })

  it('plays interference only while the screen is on', async () => {
    text.value = 'Legend'
    const screen = createScreen()

    interference.value++
    await nextTick()
    expect(screen.interferenceTick.value).toBe(0)

    vi.advanceTimersByTime(800)
    interference.value++
    await nextTick()
    expect(screen.interferenceTick.value).toBe(1)
    expect(screen.interfering.value).toBe(true)

    vi.advanceTimersByTime(150)
    expect(screen.interfering.value).toBe(false)
    expect(screen.shownText.value).toBe('Legend')
  })

  it('clears its timers when disposed', () => {
    createScreen()
    vi.advanceTimersByTime(100)

    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
