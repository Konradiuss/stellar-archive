import { describe, expect, it, vi } from 'vitest'
import { audioLength } from '../audioLength'

// A stand-in for <audio>: `answer(audio)` plays out what the browser would do.
function fakeAudio(answer) {
  return () => {
    const listeners = {}
    const audio = {
      duration: NaN,
      addEventListener: (name, listener) => { listeners[name] = listener },
      removeEventListener: name => { delete listeners[name] },
      removeAttribute: vi.fn(),
      load: () => {},
      emit: name => listeners[name]?.()
    }
    let src = ''
    Object.defineProperty(audio, 'src', {
      get: () => src,
      set: value => {
        src = value
        queueMicrotask(() => answer(audio))
      }
    })
    return audio
  }
}

describe('the length of a recording from its metadata', () => {
  it('is the length the file tells', async () => {
    const createAudio = fakeAudio(audio => {
      audio.duration = 168.4
      audio.emit('loadedmetadata')
    })
    await expect(audioLength('music/a.mp3', { createAudio })).resolves.toBe(168.4)
  })

  it('is unknown for a stream, a file that does not play, or one that never answers', async () => {
    const stream = fakeAudio(audio => {
      audio.duration = Infinity
      audio.emit('loadedmetadata')
    })
    await expect(audioLength('radio', { createAudio: stream })).resolves.toBeNull()
    await expect(audioLength('a.txt', { createAudio: fakeAudio(audio => audio.emit('error')) })).resolves.toBeNull()
    await expect(audioLength('slow', { createAudio: fakeAudio(() => {}), waitMs: 5 })).resolves.toBeNull()
    await expect(audioLength('none', { createAudio: () => { throw new Error('No Audio') } })).resolves.toBeNull()
  })
})
