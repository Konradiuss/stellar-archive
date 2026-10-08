/** Returns a number, '' (empty: unset) or null (invalid). A decimal comma counts as a point. */
export function parseNumber(raw) {
  const text = String(raw ?? '').trim().replace(/\s+/g, '').replace(',', '.')
  if (!text) return ''
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}
