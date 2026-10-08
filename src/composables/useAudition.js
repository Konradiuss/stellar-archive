import { ref } from 'vue'

// One recording at a time in the whole editor, at the player's default volume.
const VOLUME = 0.6

/** The key of the recording playing, or null. */
export const auditioning = ref(null)

let audio = null
let address = null

function release() {
  if (address) URL.revokeObjectURL(address)
  address = null
}

export function stopAudition() {
  audio?.pause()
  auditioning.value = null
  release()
}

/** source: async () => an address or a Blob. Pressed again, it stops. → false when it would not play. */
export async function audition(key, source) {
  if (auditioning.value === key) {
    stopAudition()
    return true
  }
  stopAudition()
  auditioning.value = key
  try {
    const found = await source()
    if (auditioning.value !== key) return true
    audio ??= new Audio()
    audio.volume = VOLUME
    if (found instanceof Blob) address = URL.createObjectURL(found)
    audio.src = address ?? found
    audio.onended = () => {
      if (auditioning.value === key) stopAudition()
    }
    await audio.play()
    return true
  } catch (failure) {
    // Stopped or switched before it started: not a failure.
    if (auditioning.value !== key || failure?.name === 'AbortError') return true
    stopAudition()
    return false
  }
}
