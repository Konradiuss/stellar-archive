// Only Firefox animates a GIF favicon itself, so frames are decoded (ImageDecoder) and swapped
// in <link rel="icon">. Background tabs throttle timers to 1 s: a browser limit.

import { prefersReducedMotion } from './reducedMotion'

// Browsers play GIF delays of 10 ms and less as 100 ms.
const MIN_DELAY_MS = 20
const DEFAULT_DELAY_MS = 100

function iconLink(doc) {
  let link = doc.querySelector('link[rel~="icon"]')
  if (!link) {
    link = doc.createElement('link')
    link.rel = 'icon'
    doc.head.appendChild(link)
  }
  return link
}

function setIcon(link, href, type) {
  if (type) link.type = type
  else link.removeAttribute('type')
  link.href = href
}

// ImageDecoder durations are in microseconds.
export function frameDelay(durationUs) {
  const ms = Number(durationUs) / 1000
  return Number.isFinite(ms) && ms >= MIN_DELAY_MS ? ms : DEFAULT_DELAY_MS
}

function guessType(url, headerType) {
  const type = String(headerType ?? '').split(';')[0].trim().toLowerCase()
  if (type.startsWith('image/')) return type
  return /\.gif(?:[?#]|$)/i.test(url) ? 'image/gif' : type
}

function frameToDataUrl(doc, image, size) {
  const canvas = doc.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  context.imageSmoothingEnabled = false
  const width = image.displayWidth ?? image.width
  const height = image.displayHeight ?? image.height
  const scale = Math.min(size / width, size / height)
  const drawWidth = Math.round(width * scale)
  const drawHeight = Math.round(height * scale)
  context.drawImage(image, Math.floor((size - drawWidth) / 2), Math.floor((size - drawHeight) / 2), drawWidth, drawHeight)
  return canvas.toDataURL('image/png')
}

async function decodeFrames(data, type, { Decoder, doc, size, isStopped, firstOnly }) {
  const decoder = new Decoder({ data, type })
  try {
    await decoder.tracks.ready
    await decoder.completed
    const count = firstOnly ? 1 : decoder.tracks.selectedTrack?.frameCount ?? 1
    const frames = []
    for (let frameIndex = 0; frameIndex < count && !isStopped(); frameIndex++) {
      const { image } = await decoder.decode({ frameIndex })
      try {
        frames.push({ href: frameToDataUrl(doc, image, size), delay: frameDelay(image.duration) })
      } finally {
        image.close?.()
      }
    }
    return frames
  } finally {
    decoder.close?.()
  }
}

/** Returns stop(); the last frame stays. */
export function startAnimatedFavicon(url, {
  size = 32,
  doc = globalThis.document,
  fetchImpl = globalThis.fetch,
  Decoder = globalThis.ImageDecoder,
  reducedMotion = prefersReducedMotion()
} = {}) {
  const link = iconLink(doc)
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let stopped = false
  let timer = null

  function play(frames, index) {
    if (stopped) return
    const frame = frames[index]
    setIcon(link, frame.href, 'image/png')
    if (frames.length > 1) timer = setTimeout(play, frame.delay, frames, (index + 1) % frames.length)
  }

  async function load() {
    const response = await fetchImpl(url, { signal: controller?.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const type = guessType(url, response.headers?.get?.('content-type'))
    if (!(await Decoder.isTypeSupported(type))) throw new Error(`${type} is not decodable`)
    const data = await response.arrayBuffer()
    if (stopped) return
    const frames = await decodeFrames(data, type, {
      Decoder, doc, size, firstOnly: reducedMotion, isStopped: () => stopped
    })
    if (stopped) return
    // One frame: the file itself is sharper than a re-encoded copy.
    if (frames.length > 1 || reducedMotion) play(frames, 0)
    else setIcon(link, url)
  }

  // The file first: an icon while the frames decode, and Firefox animates it if nothing below works.
  setIcon(link, url)
  if (typeof Decoder === 'function' && typeof fetchImpl === 'function') {
    load().catch(error => {
      if (stopped) return
      console.warn('Favicon stays static:', error?.message ?? error)
      setIcon(link, url)
    })
  }

  return function stop() {
    stopped = true
    clearTimeout(timer)
    controller?.abort()
  }
}
