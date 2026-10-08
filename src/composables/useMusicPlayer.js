import { computed, onScopeDispose, ref, toValue, watch } from 'vue'
import { readStoredValue, writeStoredValue } from './usePersistentState'
import { nextIndex, previousIndex } from '../utils/musicPlaylist'

const STORAGE_KEY = 'music'
const SAVE_TIME_EVERY_MS = 2000
const DEFAULT_STATE = { index: 0, time: 0, volume: 0.6, muted: false }

const audioContextClass = () => globalThis.AudioContext ?? globalThis.webkitAudioContext

function isOtherOrigin(src) {
  try {
    const url = new URL(src, globalThis.document?.baseURI)
    return /^https?:$/.test(url.protocol) && url.origin !== globalThis.location?.origin
  } catch {
    return false
  }
}

// Never starts by itself; the analyser is set up on the first play, which is a click of the user.
export function useMusicPlayer(tracks) {
  const stored = readStoredValue(STORAGE_KEY, DEFAULT_STATE)
  const list = () => toValue(tracks) ?? []

  const index = ref(Math.max(0, Math.floor(Number(stored.index) || 0)))
  const playing = ref(false)
  const loading = ref(false)
  const error = ref(false)
  const currentTime = ref(Math.max(0, Number(stored.time) || 0))
  const duration = ref(null)
  const storedVolume = Number(stored.volume)
  const volume = ref(Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : DEFAULT_STATE.volume)
  const muted = ref(!!stored.muted)

  const track = computed(() => list()[index.value] ?? null)
  // Known length: from the file once it is loaded, else from the map file.
  const length = computed(() => duration.value ?? track.value?.duration ?? null)

  const audio = typeof Audio === 'function' ? new Audio() : null
  let loadedIndex = -1
  let pendingTime = null
  let context = null
  let analyser = null
  let spectrum = null
  let lastSavedAt = 0

  function save() {
    writeStoredValue(STORAGE_KEY, {
      index: index.value,
      time: Math.floor(currentTime.value),
      volume: volume.value,
      muted: muted.value
    })
  }

  function applyVolume() {
    if (!audio) return
    audio.volume = volume.value
    audio.muted = muted.value
  }

  // `time` in seconds, applied once the data of the track is known.
  function load(i, time = 0) {
    const item = list()[i]
    if (!audio || !item) return
    index.value = i
    loadedIndex = i
    error.value = false
    duration.value = null
    currentTime.value = time
    pendingTime = time > 0 ? time : null
    // Through the analyser, music of another site plays silent unless it allows CORS:
    // asked for openly, it fails with an error instead. Without Web Audio it plays as it is.
    audio.crossOrigin = audioContextClass() && isOtherOrigin(item.src) ? 'anonymous' : null
    audio.src = item.src
    audio.load()
    updateMediaSession()
  }

  function ensureLoaded() {
    if (loadedIndex !== index.value) load(index.value, currentTime.value)
  }

  function setupAnalyser() {
    if (!audio || context) return
    const AudioContextClass = audioContextClass()
    if (!AudioContextClass) return
    try {
      context = new AudioContextClass()
      const source = context.createMediaElementSource(audio)
      analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.72
      source.connect(analyser)
      analyser.connect(context.destination)
      spectrum = new Uint8Array(analyser.frequencyBinCount)
    } catch (failure) {
      console.warn('Music spectrum is unavailable:', failure)
      analyser = null
    }
  }

  async function play() {
    if (!audio || !track.value) return
    ensureLoaded()
    setupAnalyser()
    if (context?.state === 'suspended') context.resume().catch(() => {})
    loading.value = true
    try {
      await audio.play()
    } catch (failure) {
      // A newer load() interrupted this play(): not an error.
      if (failure?.name !== 'AbortError') {
        loading.value = false
        playing.value = false
        if (failure?.name !== 'NotAllowedError') error.value = true
      }
    }
  }

  function pause() {
    audio?.pause()
  }

  function toggle() {
    if (playing.value || loading.value) pause()
    else play()
  }

  function goTo(i) {
    const wasPlaying = playing.value || loading.value
    load(i, 0)
    if (wasPlaying) play()
    save()
  }

  function select(i) {
    load(i, 0)
    play()
    save()
  }

  function next() {
    const count = list().length
    if (count) goTo(nextIndex(index.value, count))
  }

  function previous() {
    const count = list().length
    if (!count) return
    const target = previousIndex(index.value, count, currentTime.value)
    if (target === index.value) seekTo(0)
    else goTo(target)
  }

  function seekTo(seconds) {
    if (!audio || !track.value) return
    ensureLoaded()
    const time = Math.max(0, length.value ? Math.min(seconds, length.value) : seconds)
    currentTime.value = time
    if (audio.readyState >= 1) audio.currentTime = time
    else pendingTime = time
    save()
  }

  // share: 0..1 of the track.
  function seek(share) {
    if (length.value) seekTo(share * length.value)
  }

  function setVolume(value) {
    volume.value = Math.min(1, Math.max(0, value))
    muted.value = false
  }

  function toggleMute() {
    muted.value = !muted.value
  }

  function getSpectrum() {
    if (!analyser || !spectrum) return null
    analyser.getByteFrequencyData(spectrum)
    return spectrum
  }

  function updateMediaSession() {
    const session = globalThis.navigator?.mediaSession
    const item = track.value
    if (!session || !item || typeof MediaMetadata !== 'function') return
    session.metadata = new MediaMetadata({ title: item.title, artist: item.author, album: 'SpaceMap' })
  }

  function setupMediaSession() {
    const session = globalThis.navigator?.mediaSession
    if (!session) return
    const handlers = { play, pause, nexttrack: next, previoustrack: previous }
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        session.setActionHandler(action, () => handler())
      } catch {
        // The browser does not know this action.
      }
    }
  }

  const listeners = {
    playing: () => { playing.value = true; loading.value = false; error.value = false },
    pause: () => { playing.value = false; loading.value = false; save() },
    waiting: () => { loading.value = true },
    canplay: () => { loading.value = false },
    loadedmetadata: () => {
      if (Number.isFinite(audio.duration)) duration.value = audio.duration
      if (pendingTime !== null) {
        audio.currentTime = Math.min(pendingTime, audio.duration || pendingTime)
        pendingTime = null
      }
    },
    timeupdate: () => {
      currentTime.value = audio.currentTime
      const now = Date.now()
      if (now - lastSavedAt > SAVE_TIME_EVERY_MS) {
        lastSavedAt = now
        save()
      }
    },
    ended: () => {
      const count = list().length
      if (!count) return
      load(nextIndex(index.value, count), 0)
      play()
      save()
    },
    error: () => {
      // An empty src (before the first play) is not a failure.
      if (!audio.getAttribute('src')) return
      error.value = true
      playing.value = false
      loading.value = false
    }
  }

  if (audio) {
    audio.preload = 'metadata'
    applyVolume()
    for (const [name, listener] of Object.entries(listeners)) audio.addEventListener(name, listener)
    setupMediaSession()
  }

  watch([volume, muted], () => {
    applyVolume()
    save()
  })

  watch(() => list().length, count => {
    if (count && index.value >= count) {
      index.value = 0
      currentTime.value = 0
    }
    updateMediaSession()
  }, { immediate: true })

  const onPageHide = () => save()
  globalThis.addEventListener?.('pagehide', onPageHide)

  onScopeDispose(() => {
    globalThis.removeEventListener?.('pagehide', onPageHide)
    if (audio) {
      for (const [name, listener] of Object.entries(listeners)) audio.removeEventListener(name, listener)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    context?.close().catch(() => {})
  })

  return {
    index,
    track,
    playing,
    loading,
    error,
    currentTime,
    length,
    volume,
    muted,
    play,
    pause,
    toggle,
    next,
    previous,
    select,
    seek,
    setVolume,
    toggleMute,
    getSpectrum
  }
}
