// A silent AudioContext that records the oscillators, noise and buffers started; enough for synth.js and engine.js.

const param = value => {
  const p = { value, events: [] }
  for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) {
    p[method] = (target, time) => {
      p.events.push({ method, target, time })
      return p
    }
  }
  return p
}

const node = extra => ({
  connect(target) {
    this.target = target
    return target
  },
  ...extra
})

export class FakeAudioContext {
  constructor() {
    this.currentTime = 0
    this.sampleRate = 8000
    this.state = 'running'
    this.destination = node({ kind: 'destination' })
    this.started = []
    this.decoded = []
    this.gains = []
    FakeAudioContext.made++
  }

  createGain() {
    const gain = node({ kind: 'gain', gain: param(1) })
    this.gains.push(gain)
    return gain
  }

  createBiquadFilter() {
    return node({ kind: 'filter', type: 'lowpass', frequency: param(350), Q: param(1) })
  }

  createOscillator() {
    const ctx = this
    return node({
      kind: 'oscillator',
      type: 'sine',
      frequency: param(440),
      start(at) {
        ctx.started.push({ kind: 'oscillator', type: this.type, frequency: this.frequency.events[0]?.target ?? this.frequency.value, at })
      },
      stop(at) {
        this.stoppedAt = at
      }
    })
  }

  createBufferSource() {
    const ctx = this
    return node({
      kind: 'source',
      buffer: null,
      loop: false,
      start(at = 0) {
        ctx.started.push({ kind: this.buffer?.recording ? 'recording' : 'noise', buffer: this.buffer, at })
      },
      stop() {}
    })
  }

  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length)
    return { numberOfChannels: channels, length, sampleRate, getChannelData: () => data }
  }

  decodeAudioData(data) {
    this.decoded.push(data)
    return Promise.resolve({ recording: true, from: data })
  }

  resume() {
    this.state = 'running'
    return Promise.resolve()
  }
}
FakeAudioContext.made = 0
