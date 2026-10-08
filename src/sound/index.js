import { ref } from 'vue'
import breakerUrl from '../assets/sounds/breaker.wav?url'
import { createSoundEngine } from './engine'
import { draftFileFetch } from '../editor/draft'
import { MAP_FILE } from '../utils/mapCheck'

export { SOUND_NAMES } from './synth'
export { DEFAULT_SOUND_VOLUME, normalizeSoundConfig } from './soundConfig'

// A sound file of an editor draft being previewed comes from the draft.
const fetchFile = draftFileFetch(url => fetch(url), () => new URL(MAP_FILE, document.baseURI).href)

// false until the first press lets the page sound.
export const soundReady = ref(false)

// The mode breaker is a recording: Kenney, "UI Audio" (CC0), switch2.
export const soundEngine = createSoundEngine({
  files: { breaker: breakerUrl },
  fetchFile,
  onStateChange: running => { soundReady.value = running }
})

export const playSound = name => soundEngine.play(name)
