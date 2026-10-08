// Lore comes from map files written by server admins: links, colours and image sources are checked
// here, and whatever fails a check is shown as plain text.

const SAFE_LINK = /^(https?:\/\/|mailto:)/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNCTION_COLOR = /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.\s,%deg/]+\)$/i
const NAMED_COLOR = /^[a-z]{3,20}$/i

export function safeHref(url) {
  const value = String(url ?? '').trim()
  return SAFE_LINK.test(value) ? value : null
}

export function safeColor(color) {
  const value = String(color ?? '').trim()
  if (HEX_COLOR.test(value) || FUNCTION_COLOR.test(value) || NAMED_COLOR.test(value)) return value
  return null
}

// http(s) or a path relative to the map; protocol-relative and other schemes (javascript:, data:) are refused.
export function safeImageSrc(src) {
  const value = String(src ?? '').trim()
  if (!value || value.startsWith('//')) return null
  if (/^https?:\/\//i.test(value)) return value
  return HAS_SCHEME.test(value) ? null : value
}
