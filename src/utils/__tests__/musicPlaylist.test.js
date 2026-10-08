import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatTime, nextIndex, normalizeMusicConfig, previousIndex, spectrumBars } from '../musicPlaylist.js'

const BASE = 'https://example.org/maps/map.json'

describe('music playlist', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads the tracks of the map file, files relative to it', () => {
    const tracks = normalizeMusicConfig({
      tracks: [{ title: ' Quantum ', author: 'Duke Gneiss', file: 'music/quantum.mp3', url: 'https://soundcloud.com/x', license: 'CC BY-NC-SA 3.0', duration: 117 }]
    }, BASE)
    expect(tracks).toEqual([{
      title: 'Quantum',
      author: 'Duke Gneiss',
      src: 'https://example.org/maps/music/quantum.mp3',
      url: 'https://soundcloud.com/x',
      license: 'CC BY-NC-SA 3.0',
      duration: 117
    }])
  })

  it('skips tracks without a file and ignores links that are not web pages', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tracks = normalizeMusicConfig({ tracks: [{ title: 'Nothing' }, { file: 'a.mp3', url: 'javascript:alert(1)', duration: 'long' }] }, BASE)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(tracks).toEqual([expect.objectContaining({ title: 'a.mp3', url: null, duration: null })])
    expect(normalizeMusicConfig(undefined, BASE)).toEqual([])
    expect(normalizeMusicConfig({ tracks: 'x' }, BASE)).toEqual([])
  })

  it('formats times', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(220.7)).toBe('3:40')
    expect(formatTime(NaN)).toBe('--:--')
    expect(formatTime(Infinity)).toBe('--:--')
  })

  it('goes round the playlist, and back to the start of a track that has played a while', () => {
    expect(nextIndex(7, 8)).toBe(0)
    expect(nextIndex(2, 8)).toBe(3)
    expect(previousIndex(0, 8, 1)).toBe(7)
    expect(previousIndex(3, 8, 1)).toBe(2)
    expect(previousIndex(3, 8, 10)).toBe(3)
    expect(nextIndex(0, 0)).toBe(0)
  })

  it('turns analyser bytes into bar heights', () => {
    const silence = new Uint8Array(128)
    expect(spectrumBars(silence, 20, 10)).toEqual(new Array(20).fill(0))
    const bass = new Uint8Array(128)
    bass.fill(255, 0, 3)
    const bars = spectrumBars(bass, 20, 10)
    expect(bars.slice(0, 3)).toEqual([10, 10, 10])
    expect(bars.filter(height => height > 0)).toHaveLength(3)
    const full = spectrumBars(new Uint8Array(128).fill(255), 20, 10)
    expect(full.every(height => height === 10)).toBe(true)
    expect(spectrumBars(null, 4, 10)).toEqual([0, 0, 0, 0])
  })
})
