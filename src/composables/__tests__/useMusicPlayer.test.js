// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useMusicPlayer } from '../useMusicPlayer'

const players = []
class FakeAudio {
  constructor() {
    this.crossOrigin = null
    this.readyState = 0
    players.push(this)
  }

  addEventListener() {}
  removeEventListener() {}
  removeAttribute() {}
  load() {}
  pause() {}
  play() {
    return Promise.resolve()
  }
}

class FakeAudioContext {
  constructor() {
    this.state = 'running'
    this.destination = {}
  }

  createMediaElementSource() {
    return { connect() {} }
  }

  createAnalyser() {
    return { connect() {}, frequencyBinCount: 8 }
  }

  resume() {
    return Promise.resolve()
  }

  close() {
    return Promise.resolve()
  }
}

describe('the music player', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    players.length = 0
    localStorage.clear()
  })

  // Was: a track of another site without CORS played silent through the spectrum analyser while the player showed it playing.
  it('asks another site for its music openly (CORS), and its own files plainly', () => {
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const scope = effectScope()
    const player = scope.run(() => useMusicPlayer([
      { src: 'https://cdn.example/a.mp3', title: 'A' },
      { src: new URL('music/b.mp3', document.baseURI).href, title: 'B' }
    ]))
    const [audio] = players

    player.select(0)
    expect(audio.src).toBe('https://cdn.example/a.mp3')
    expect(audio.crossOrigin).toBe('anonymous')

    player.select(1)
    expect(audio.src).toMatch(/\/music\/b\.mp3$/)
    expect(audio.crossOrigin).toBeNull()
    scope.stop()
  })

  // Without Web Audio there is no analyser: CORS is not asked for, as it would only make such a track fail.
  it('plays music of another site plainly when there is no Web Audio', () => {
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('AudioContext', undefined)
    const scope = effectScope()
    const player = scope.run(() => useMusicPlayer([{ src: 'https://cdn.example/a.mp3', title: 'A' }]))
    player.select(0)
    expect(players[0].crossOrigin).toBeNull()
    scope.stop()
  })
})
