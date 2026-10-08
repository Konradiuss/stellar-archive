const WAIT_MS = 15000

/** → the length in seconds of the recording at `src` from its metadata only, or null when it is unknown or unplayable. */
export function audioLength(src, { createAudio = () => new Audio(), waitMs = WAIT_MS } = {}) {
  return new Promise(resolve => {
    let audio
    try {
      audio = createAudio()
    } catch {
      resolve(null)
      return
    }
    let timer = null
    const finish = seconds => {
      clearTimeout(timer)
      audio.removeEventListener('loadedmetadata', loaded)
      audio.removeEventListener('error', failed)
      audio.removeAttribute?.('src')
      audio.load?.()
      resolve(seconds)
    }
    // A stream or a file without a length says Infinity.
    const loaded = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null)
    const failed = () => finish(null)
    audio.addEventListener('loadedmetadata', loaded)
    audio.addEventListener('error', failed)
    timer = setTimeout(failed, waitMs)
    audio.preload = 'metadata'
    audio.src = src
    audio.load?.()
  })
}
