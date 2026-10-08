export const PIXEL_FONT = '"Press Start 2P"'
const FONT_LOAD_TIMEOUT_MS = 3000
// The font is split by unicode-range (styles/fonts.css): only the parts covering the sample are downloaded.
export const PIXEL_FONT_SAMPLE = 'Aa'
const MAX_SAMPLE_LETTERS = 300
let sample = PIXEL_FONT_SAMPLE

export function setFontSample(text) {
  const extra = [...new Set([...String(text ?? '')].filter(char => char.codePointAt(0) > 0x7f && char.trim()))]
  sample = PIXEL_FONT_SAMPLE + extra.slice(0, MAX_SAMPLE_LETTERS).join('')
}

// PIXI.Text keeps the font it was measured with: load the pixel font before Pixi labels are created.
export function loadPixelFont(font = `10px ${PIXEL_FONT}`, timeoutMs = FONT_LOAD_TIMEOUT_MS) {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve()
  let timer
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, timeoutMs) })
  return Promise.race([document.fonts.load(font, sample).catch(() => {}), timeout])
    .finally(() => clearTimeout(timer))
}
