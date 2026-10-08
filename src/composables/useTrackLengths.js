import { ref, toValue, watch } from 'vue'
import { audioLength } from '../utils/audioLength'

// Once per page for each recording: the list opens and closes many times.
const found = ref(new Map())
const asked = new Set()

/** Lengths of the tracks the map gives none, read from the files one by one. `wanted`: the tracks to know now. */
export function useTrackLengths(wanted, read = audioLength) {
  let running = false

  async function run() {
    if (running) return
    running = true
    try {
      for (;;) {
        const track = (toValue(wanted) ?? []).find(each => each && each.duration === null && !asked.has(each.src))
        if (!track) break
        asked.add(track.src)
        const seconds = await read(track.src)
        if (seconds !== null) found.value = new Map(found.value).set(track.src, seconds)
      }
    } finally {
      running = false
    }
  }

  watch(() => toValue(wanted), run, { immediate: true })

  return { lengthOf: track => track?.duration ?? found.value.get(track?.src) ?? null }
}
