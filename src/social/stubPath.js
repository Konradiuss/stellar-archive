// Bots drop all after "#": each place a preview should name needs an address of its own.

export const STUB_KINDS = ['wiki', 'system']

// Names a static host may not use as a folder, or that would change the address, become a short hash.
const UNSAFE = /[/\\?#%:*"<>|]/
const isControl = char => char.codePointAt(0) < 0x20 || char.codePointAt(0) === 0x7f

// FNV-1a: the same short name for the same page in the build and in the browser.
function hashName(text) {
  let hash = 0x811c9dc5
  for (const char of text) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function stubName(key) {
  const name = String(key ?? '').trim()
  if (!name || name === '.' || name === '..' || UNSAFE.test(name) || [...name].some(isControl)) return `_${hashName(name)}`
  return name
}

// 'wiki/Earth/', 'system/sol/'
export function stubPath(kind, key) {
  if (!STUB_KINDS.includes(kind)) throw new Error(`No preview pages of kind "${kind}"`)
  return `${kind}/${stubName(key)}/`
}

// `base`: the address of the site folder.
export function stubUrl(kind, key, base) {
  return new URL(`${kind}/${encodeURIComponent(stubName(key))}/`, base).href
}
