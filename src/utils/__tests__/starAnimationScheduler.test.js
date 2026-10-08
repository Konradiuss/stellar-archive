// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeStarAnimation } from '../starAnimationScheduler'

describe('the animation of the stars', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // Was: a star whose frame threw stopped every star for good: the next frame was never asked for.
  it('goes on for the other stars when one of them fails', () => {
    const frames = []
    vi.stubGlobal('requestAnimationFrame', callback => frames.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const good = vi.fn()
    const stopBroken = subscribeStarAnimation(() => { throw new Error('a broken star') })
    const stopGood = subscribeStarAnimation(good)

    frames.shift()(16)
    frames.shift()(32)
    expect(good).toHaveBeenCalledTimes(2)
    expect(frames).toHaveLength(1)
    expect(error).toHaveBeenCalledTimes(1)
    stopBroken()
    stopGood()
  })
})
