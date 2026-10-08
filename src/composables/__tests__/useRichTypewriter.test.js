import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useRichTypewriter } from '../useRichTypewriter'
import { parseWikitext } from '../../utils/richText/wikitextParser'
import { IMAGE_COST, measureDocument } from '../../utils/richText/measure'

describe('useRichTypewriter', () => {
  let scope

  beforeEach(() => {
    vi.useFakeTimers()
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('prints a short document one step per tick', () => {
    const doc = parseWikitext("'''ab'''c")
    const { visibleCount, isTyping } = scope.run(() => useRichTypewriter(() => doc, { speed: 10 }))

    expect(visibleCount.value).toBe(0)
    expect(isTyping.value).toBe(true)
    vi.advanceTimersByTime(10)
    expect(visibleCount.value).toBe(1)
    vi.advanceTimersByTime(20)
    expect(visibleCount.value).toBe(Infinity)
    expect(isTyping.value).toBe(false)
  })

  it('counts images as a fixed number of steps', () => {
    expect(measureDocument(parseWikitext('ab [[File:x.png]]'))).toBe(3 + IMAGE_COST)
    expect(measureDocument(parseWikitext('[[File:x.png|thumb|Cap]]'))).toBe(IMAGE_COST + 3)
  })

  it('speeds up long documents so they finish in about 700 ticks', () => {
    const doc = parseWikitext('x'.repeat(7000))
    const { isTyping } = scope.run(() => useRichTypewriter(() => doc, { speed: 10 }))
    vi.advanceTimersByTime(10 * 690)
    expect(isTyping.value).toBe(true)
    vi.advanceTimersByTime(10 * 20)
    expect(isTyping.value).toBe(false)
  })

  it('shows everything at once when instant, or on finish()', async () => {
    const instant = ref(true)
    const doc = parseWikitext('hello')
    const first = scope.run(() => useRichTypewriter(() => doc, { instant }))
    expect(first.visibleCount.value).toBe(Infinity)

    const second = scope.run(() => useRichTypewriter(() => doc, { speed: 10 }))
    vi.advanceTimersByTime(10)
    second.finish()
    expect(second.visibleCount.value).toBe(Infinity)
    expect(second.isTyping.value).toBe(false)
  })

  it('restarts for a new document and stays idle without one', async () => {
    const source = ref(null)
    const { visibleCount, isTyping } = scope.run(() => useRichTypewriter(() => source.value, { speed: 10 }))
    expect(isTyping.value).toBe(false)
    source.value = parseWikitext('abc')
    await nextTick()
    expect(visibleCount.value).toBe(0)
    expect(isTyping.value).toBe(true)
  })

  it('pauses where shouldPause says, then resumes', () => {
    const doc = parseWikitext('x'.repeat(40))
    let pageEnd = 10
    const typer = scope.run(() => useRichTypewriter(() => doc, { speed: 10, shouldPause: () => typer?.visibleCount.value >= pageEnd }))
    vi.advanceTimersByTime(10 * 30)
    expect(typer.visibleCount.value).toBe(10)
    expect(typer.isPaused.value).toBe(true)
    expect(typer.isTyping.value).toBe(true)

    pageEnd = 20
    typer.resume()
    expect(typer.isPaused.value).toBe(false)
    vi.advanceTimersByTime(10 * 5)
    expect(typer.visibleCount.value).toBe(15)
    vi.advanceTimersByTime(10 * 30)
    expect(typer.visibleCount.value).toBe(20)
    expect(typer.isPaused.value).toBe(true)
  })

  it('fast-forwards to the next pause, or to the end without one', () => {
    const doc = parseWikitext('x'.repeat(400))
    let pageEnd = 200
    const typer = scope.run(() => useRichTypewriter(() => doc, { speed: 10, shouldPause: () => typer?.visibleCount.value >= pageEnd }))
    vi.advanceTimersByTime(10 * 2)
    typer.fastForward()
    vi.advanceTimersByTime(10 * 20)
    expect(typer.visibleCount.value).toBeGreaterThanOrEqual(200)
    expect(typer.isPaused.value).toBe(true)
    pageEnd = Infinity
    const before = typer.visibleCount.value
    typer.resume()
    vi.advanceTimersByTime(10 * 3)
    expect(typer.visibleCount.value - before).toBe(3)

    const plain = scope.run(() => useRichTypewriter(() => doc, { speed: 10 }))
    vi.advanceTimersByTime(10)
    plain.fastForward()
    expect(plain.visibleCount.value).toBe(Infinity)
  })

  // Was: the lore panel printed a long text for some ten seconds at every screen switch and beeped long after the site loaded.
  it('prints three times as fast with pace 3, short documents and long', () => {
    const long = parseWikitext('x'.repeat(7000))
    const fast = scope.run(() => useRichTypewriter(() => long, { speed: 10, pace: 3 }))
    vi.advanceTimersByTime(10 * 225)
    expect(fast.isTyping.value).toBe(true)
    vi.advanceTimersByTime(10 * 15)
    expect(fast.isTyping.value).toBe(false)

    const short = parseWikitext('x'.repeat(30))
    const quick = scope.run(() => useRichTypewriter(() => short, { speed: 10, pace: 3 }))
    vi.advanceTimersByTime(10)
    expect(quick.visibleCount.value).toBe(3)
    vi.advanceTimersByTime(10 * 10)
    expect(quick.isTyping.value).toBe(false)
  })

  it('still stops at the end of a page with pace', () => {
    const doc = parseWikitext('x'.repeat(60))
    const typer = scope.run(() => useRichTypewriter(() => doc, { speed: 10, pace: 3, shouldPause: () => typer?.visibleCount.value >= 12 }))
    vi.advanceTimersByTime(10 * 30)
    expect(typer.visibleCount.value).toBe(12)
    expect(typer.isPaused.value).toBe(true)
  })
})
