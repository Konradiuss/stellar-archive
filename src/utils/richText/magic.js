// Shared by RichText.vue and link previews (src/social), so both show the same numbers.
// map: { wikiIndex, stars, siteConfig }, as mapStore has them.

const PLACE_KINDS = new Set(['star', 'planet', 'satellite'])

export function magicValue(name, map) {
  const pages = map.wikiIndex?.pages ?? []
  switch (name) {
    case 'pages':
      return String(pages.length)
    case 'articles':
      return String(pages.filter(page => page.kind === 'article').length)
    case 'places':
      return String(pages.filter(page => PLACE_KINDS.has(page.kind)).length)
    case 'systems':
      return String(map.stars?.length ?? 0)
    case 'sitename':
      return map.siteConfig?.title ?? ''
    default:
      return ''
  }
}
