export const PAGE_SIZE = 9

export function pageCount(total) {
  return Math.max(1, Math.ceil(Math.max(0, total) / PAGE_SIZE))
}

export function pageOf(index) {
  return Number.isInteger(index) && index >= 0 ? Math.floor(index / PAGE_SIZE) : 0
}

export function clampPage(page, total) {
  return Math.max(0, Math.min(pageCount(total) - 1, Number.isInteger(page) ? page : 0))
}

export function pageRange(page, total) {
  const start = clampPage(page, total) * PAGE_SIZE
  return { start, end: Math.min(Math.max(0, total), start + PAGE_SIZE) }
}

export function planetForKey(key, page, total) {
  if (!/^[1-9]$/.test(key)) return null
  const { start, end } = pageRange(page, total)
  const index = start + Number(key) - 1
  return index < end ? index : null
}

export function hotkeyRange(page, total) {
  const { start, end } = pageRange(page, total)
  const count = end - start
  if (count <= 0) return null
  return count === 1 ? '1' : `1-${count}`
}
