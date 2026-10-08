// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frameDelay, startAnimatedFavicon } from '../animatedFavicon'

const GIF_URL = 'http://localhost/favicon.gif'

// A GIF of `durations` frames (microseconds, as ImageDecoder reports them).
function fakeDecoder(durations) {
  return class FakeDecoder {
    static isTypeSupported = type => Promise.resolve(type === 'image/gif')
    constructor({ type }) {
      this.type = type
      this.tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: durations.length } }
      this.completed = Promise.resolve()
    }

    decode({ frameIndex }) {
      return Promise.resolve({
        image: { displayWidth: 32, displayHeight: 32, duration: durations[frameIndex], frame: frameIndex, close() {} }
      })
    }

    close() {}
  }
}

const fakeFetch = () => vi.fn(() => Promise.resolve({
  ok: true,
  headers: { get: () => 'image/gif' },
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
}))

const iconHref = () => document.querySelector('link[rel="icon"]').getAttribute('href')

describe('startAnimatedFavicon', () => {
  let drawn
  beforeEach(() => {
    vi.useFakeTimers()
    document.head.innerHTML = '<link rel="icon" type="image/gif" href="/favicon.gif">'
    // Each canvas remembers the frame drawn on it and "encodes" it as its number.
    drawn = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      const canvas = this
      return {
        imageSmoothingEnabled: true,
        drawImage(image) {
          drawn.push({ smoothing: this.imageSmoothingEnabled })
          canvas.dataset.frame = image.frame
        }
      }
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function () {
      return `data:image/png;frame=${this.dataset.frame}`
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('swaps the decoded frames with their own delays and loops', async () => {
    const stop = startAnimatedFavicon(GIF_URL, { Decoder: fakeDecoder([100_000, 300_000]), fetchImpl: fakeFetch(), reducedMotion: false })
    expect(iconHref()).toBe(GIF_URL)

    await vi.advanceTimersByTimeAsync(0)
    expect(iconHref()).toBe('data:image/png;frame=0')
    expect(drawn.every(call => call.smoothing === false)).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(iconHref()).toBe('data:image/png;frame=1')
    await vi.advanceTimersByTimeAsync(299)
    expect(iconHref()).toBe('data:image/png;frame=1')
    await vi.advanceTimersByTimeAsync(1)
    expect(iconHref()).toBe('data:image/png;frame=0')

    stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(iconHref()).toBe('data:image/png;frame=0')
  })

  it('keeps the file itself where frames cannot be decoded', async () => {
    startAnimatedFavicon(GIF_URL, { Decoder: undefined, fetchImpl: fakeFetch() })
    await vi.advanceTimersByTimeAsync(0)
    expect(iconHref()).toBe(GIF_URL)
    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1)
  })

  it('shows only the first frame when motion is reduced', async () => {
    startAnimatedFavicon(GIF_URL, { Decoder: fakeDecoder([100_000, 100_000]), fetchImpl: fakeFetch(), reducedMotion: true })
    await vi.advanceTimersByTimeAsync(1000)
    expect(iconHref()).toBe('data:image/png;frame=0')
  })

  it('does nothing after stop() while the frames were still loading', async () => {
    const stop = startAnimatedFavicon(GIF_URL, { Decoder: fakeDecoder([100_000, 100_000]), fetchImpl: fakeFetch(), reducedMotion: false })
    stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(iconHref()).toBe(GIF_URL)
  })
})

describe('frameDelay', () => {
  it('plays tiny and missing GIF delays as 100 ms like browsers do', () => {
    expect(frameDelay(80_000)).toBe(80)
    expect(frameDelay(10_000)).toBe(100)
    expect(frameDelay(null)).toBe(100)
  })
})
