import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useTrackLengths } from '../useTrackLengths'

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

// Was: a track the map gave no `duration` showed --:-- in the list until it was played.
describe('the lengths of tracks the map does not give', () => {
  it('are read from the files wanted, once each, and the map\'s own stay', async () => {
    const files = { 'a.mp3': 168, 'b.mp3': null }
    const read = vi.fn(async src => files[src])
    const a = { src: 'a.mp3', duration: null }
    const b = { src: 'b.mp3', duration: null }
    const c = { src: 'c.mp3', duration: 200 }
    const wanted = ref([a])
    const scope = effectScope()
    const lengths = scope.run(() => useTrackLengths(wanted, read))
    await settle()
    expect(lengths.lengthOf(a)).toBe(168)
    expect(read).toHaveBeenCalledTimes(1)

    wanted.value = [a, b, c]
    await nextTick()
    await settle()
    expect(read.mock.calls.map(([src]) => src)).toEqual(['a.mp3', 'b.mp3'])
    expect(lengths.lengthOf(b)).toBeNull()
    expect(lengths.lengthOf(c)).toBe(200)
    expect(lengths.lengthOf(null)).toBeNull()

    // Known for the page: another player asks no more.
    const again = scope.run(() => useTrackLengths(() => [a, b], read))
    await settle()
    expect(read).toHaveBeenCalledTimes(2)
    expect(again.lengthOf(a)).toBe(168)
    scope.stop()
  })
})
