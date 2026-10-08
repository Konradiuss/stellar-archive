import { warnMap } from './mapJournal'

// `previous` restarts the track instead once this much of it has played.
export const RESTART_AFTER_SECONDS = 3

const isHttpUrl = value => typeof value === 'string' && /^https?:\/\//i.test(value.trim())

/** music: { tracks: [{ title, author, file, url, license, duration }] }; `file` is relative to baseUrl and becomes `src`. */
export function normalizeMusicConfig(raw, baseUrl) {
  const tracks = Array.isArray(raw?.tracks) ? raw.tracks : []
  return tracks.flatMap((track, index) => {
    const file = typeof track?.file === 'string' ? track.file.trim() : ''
    if (!file) {
      warnMap(`music.tracks[${index}]`, 'Has no "file": left out.')
      return []
    }
    let src
    try {
      src = new URL(file, baseUrl).href
    } catch {
      warnMap(`music.tracks[${index}]`, `Bad file path "${file}": left out.`)
      return []
    }
    const duration = Number(track.duration)
    return [{
      title: typeof track.title === 'string' && track.title.trim() ? track.title.trim() : file.split('/').pop(),
      author: typeof track.author === 'string' ? track.author.trim() : '',
      src,
      url: isHttpUrl(track.url) ? track.url.trim() : null,
      license: typeof track.license === 'string' ? track.license.trim() : '',
      duration: Number.isFinite(duration) && duration > 0 ? duration : null
    }]
  })
}

/** 225 -> '3:45'; unknown -> '--:--'. */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function nextIndex(index, count) {
  return count > 0 ? (index + 1) % count : 0
}

export function previousIndex(index, count, currentTime = 0) {
  if (count <= 0) return 0
  if (currentTime > RESTART_AFTER_SECONDS) return index
  return (index - 1 + count) % count
}

/** Bar heights (0..rows) from analyser bytes (0..255 per bin, low to high); bins grouped on a log scale. */
export function spectrumBars(bytes, bars, rows) {
  const bins = bytes?.length ?? 0
  if (!bins || bars <= 0) return new Array(Math.max(0, bars)).fill(0)
  const edges = [0]
  for (let bar = 1; bar <= bars; bar++) {
    const edge = Math.floor(bins ** (bar / bars))
    edges.push(Math.min(bins, Math.max(edges[bar - 1] + 1, edge)))
  }
  return Array.from({ length: bars }, (_, bar) => {
    let peak = 0
    for (let bin = edges[bar]; bin < edges[bar + 1]; bin++) peak = Math.max(peak, bytes[bin])
    return Math.min(rows, Math.round(peak / 255 * rows))
  })
}
