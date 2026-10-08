// The main page has its own [ ⌂ HOME ] button: visitors did not take C:\WIKI for one.

export const WIKI_ROOT = 'C:\\WIKI'

export const folderLabel = title => String(title ?? '').toUpperCase().replace(/\s+/g, '_')
export const fileName = slug => `${String(slug ?? '').toUpperCase()}.TXT`

/** [{ label, slug, command }], the root first; slug null leads nowhere (the root, or a folder with no page or category). */
export function pathCrumbs(page, { index, graph = null }) {
  const crumbs = [{ label: WIKI_ROOT, slug: null, command: 'CD \\' }]
  if (!page || page.special) return crumbs
  const folders = []
  for (const title of page.path ?? []) {
    folders.push(folderLabel(title))
    const target = index?.find(title)
    const slug = target && target !== page ? target.slug : graph?.category(title)?.slug ?? null
    crumbs.push({ label: folderLabel(title), slug, command: `CD \\${folders.join('\\')}` })
  }
  return crumbs
}

export const RECENT_LIMIT = 8

export function pushRecent(list, slug, max = RECENT_LIMIT) {
  if (!slug) return list
  return [slug, ...(Array.isArray(list) ? list : []).filter(item => item !== slug)].slice(0, max)
}

/** Excludes the open page and the main page (C:\WIKI leads there). */
export function recentPages(list, { index, current = null, count = 2 }) {
  const pages = []
  for (const slug of Array.isArray(list) ? list : []) {
    const page = index?.get(slug)
    if (!page || page === current || page === index.home || pages.includes(page)) continue
    pages.push(page)
    if (pages.length === count) break
  }
  return pages
}
