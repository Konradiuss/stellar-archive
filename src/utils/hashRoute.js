// '#/system/<starId>[/<planet>[/<satellite>]]' (numbers from 1), '#/wiki[/<Page_Title>[#<Section>]]'
// or '#/edit'; anything else is the galaxy.

const SYSTEM_ROUTE = /^#?\/system\/([^/]+)(?:\/(\d+)(?:\/(\d+))?)?\/?$/
// The page ends at a second '#': the section of the page follows it.
const WIKI_ROUTE = /^#?\/wiki(?:\/([^#]*?))?\/?(?:#(.*))?$/
const EDITOR_ROUTE = /^#?\/edit(?:\/|$)/
const EMPTY = Object.freeze({ starId: null, planetIndex: null, satelliteIndex: null, wiki: null, wikiSection: null })

/** The site and the editor never share one page load. */
export const isEditorRoute = hash => EDITOR_ROUTE.test(hash || '')

// Stored zero-based; the URL shows numbers from 1.
function fromNumber(text) {
  const number = text ? Number(text) : null
  return number && number >= 1 ? number - 1 : null
}

const isIndex = value => Number.isInteger(value) && value >= 0

function decode(text) {
  try {
    return decodeURIComponent(text)
  } catch {
    return null
  }
}

/** `wiki`: null on the map, '' for the wiki main page, else the page slug. */
export function parseRoute(hash) {
  const wikiMatch = WIKI_ROUTE.exec(hash || '')
  if (wikiMatch) {
    const slug = decode(wikiMatch[1] ?? '')
    const section = decode(wikiMatch[2] ?? '')?.trim() || null
    return { ...EMPTY, wiki: slug === null ? '' : slug.trim(), wikiSection: section }
  }

  const match = SYSTEM_ROUTE.exec(hash || '')
  if (!match) return { ...EMPTY }

  const starId = decode(match[1])
  if (starId === null) return { ...EMPTY }
  const planetIndex = fromNumber(match[2])
  return {
    ...EMPTY,
    starId,
    planetIndex,
    satelliteIndex: planetIndex === null ? null : fromNumber(match[3])
  }
}

// Page slugs keep their letters readable; only what breaks a URL is escaped.
const encodeSlug = slug => encodeURIComponent(slug).replace(/%3A/gi, ':').replace(/%2F/gi, '/')

export function buildRoute({ starId, planetIndex = null, satelliteIndex = null, wiki = null, wikiSection = null } = {}) {
  if (typeof wiki === 'string') {
    const page = wiki ? `#/wiki/${encodeSlug(wiki)}` : '#/wiki'
    return wikiSection ? `${page}#${encodeSlug(wikiSection.replace(/\s+/g, '_'))}` : page
  }
  if (!starId) return ''
  const base = `#/system/${encodeURIComponent(starId)}`
  if (!isIndex(planetIndex)) return base
  const planet = `${base}/${planetIndex + 1}`
  return isIndex(satelliteIndex) ? `${planet}/${satelliteIndex + 1}` : planet
}
