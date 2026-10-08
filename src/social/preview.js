// Link previews: og:* tags, cards and stub pages, built with the site (scripts/socialPreview.js).
// No DOM here: the build runs it in Node.
import { checkMap, parseMapJson } from '../utils/mapCheck'
import { buildMapData } from '../utils/mapData'
import { setStrings, t } from '../i18n'
import { buildRoute } from '../utils/hashRoute'
import { buildTabTitle } from '../utils/tabTitle'
import { forEachInline } from '../utils/richText/walk'
import { leadFirst, simplifyPage } from '../utils/richText/simplify'
import { magicValue } from '../utils/richText/magic'
import { formatSector } from '../config/mapGeometry'
import { stubName, stubPath } from './stubPath'

// Longer is cut by the social networks anyway.
export const DESCRIPTION_MAX = 200
// A paragraph shorter than this is a caption, not a description, while a longer one follows.
const DESCRIPTION_MIN = 80
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

// { built, checked }, or null when the map file cannot be read.
export async function loadSocialSite({ mapText, baseUrl, readText }) {
  const parsed = parseMapJson(mapText)
  if (parsed.error) return null
  const checked = checkMap(parsed.data)
  if (checked.fatal) return null
  setStrings(checked.strings, checked.language)
  const built = await buildMapData(checked.data, { baseUrl, fetchText: readText })
  return { built, checked }
}

const squeeze = text => String(text ?? '').replace(/\s+/g, ' ').trim()

export function clip(text, max = DESCRIPTION_MAX) {
  const value = squeeze(text)
  if (value.length <= max) return value
  const cut = value.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, '')}…`
}

function paragraphs(doc, map) {
  const out = []
  let current = ''
  const blocks = leadFirst(doc)?.blocks ?? []
  forEachInline(blocks.filter(block => block.type === 'paragraph'), node => {
    if (node.type === 'text') current += node.value
    else if (node.type === 'magic') current += magicValue(node.name, map)
    else if (node.type === 'br') current += ' '
  }, () => {
    if (squeeze(current)) out.push(squeeze(current))
    current = ''
  })
  return out
}

export function describe(doc, map) {
  const found = paragraphs(doc, map)
  return clip(found.find(text => text.length >= DESCRIPTION_MIN) ?? found[0] ?? '')
}

const highlightOf = page => page.mapTarget?.starId ?? null

// [{ path ('' for the root), hash, title, description, card: { title, eyebrow, subtitle, highlight }, image }]
export function socialPages(built) {
  const site = built.siteConfig
  const index = built.wikiIndex
  const home = index.home?.doc ? simplifyPage(index.home.doc) : null
  const siteText = clip(site.description) ||
    describe(home, built) ||
    describe(built.worldLoreDoc, built)

  const pages = [{
    path: '',
    hash: '#/',
    title: site.title,
    description: siteText,
    image: 'og/site.png',
    card: { title: site.title, eyebrow: '', subtitle: siteText, highlight: null }
  }]

  for (const page of index.pages) {
    const description = describe(page.doc, built) || siteText
    pages.push({
      path: stubPath('wiki', page.slug),
      hash: buildRoute({ wiki: page.slug }),
      title: buildTabTitle({ site, article: page }),
      description,
      image: `og/wiki-${imageName(page.slug)}.png`,
      card: { title: page.title, eyebrow: site.title, subtitle: description, highlight: highlightOf(page) }
    })
  }

  const systems = built.systems ?? {}
  for (const star of built.stars) {
    const planets = systems[star.id]?.planets?.length ?? 0
    const sector = Number.isFinite(star.sectorX) && Number.isFinite(star.sectorY)
      ? t('galaxy.sector', { sector: formatSector(star.sectorX, star.sectorY), planets: planets ? t('galaxy.planets', { count: planets }) : t('galaxy.noPlanets') })
      : ''
    const description = describe(star.loreDoc, built) || clip(sector) || siteText
    pages.push({
      path: stubPath('system', star.id),
      hash: buildRoute({ starId: star.id }),
      title: buildTabTitle({ site, star }),
      description,
      image: `og/system-${imageName(star.id)}.png`,
      card: { title: star.name, eyebrow: site.title, subtitle: sector || description, highlight: star.id }
    })
  }
  return pages
}

// The file of a card: ASCII only, the same for the same page.
const imageName = key => {
  const readable = String(key).normalize('NFKD').replace(/[^\w-]+/g, '').slice(0, 40)
  const unique = stubName(`${key}\u0000`).slice(1)
  return readable ? `${readable}-${unique}` : unique
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ESCAPES[char])

const meta = (key, name, content) => (content ? `<meta ${key}="${name}" content="${escapeHtml(content)}" />` : null)

// Without `url` there is no og:url and no image: both must be absolute.
export function socialTags({ title, description, url = null, image = null, imageAlt = '', siteName = '', locale = '', themeColor = '', type = 'website' }) {
  return [
    meta('name', 'description', description),
    meta('property', 'og:type', type),
    meta('property', 'og:site_name', siteName),
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:locale', locale),
    url && meta('property', 'og:url', url),
    url && image && meta('property', 'og:image', image),
    url && image && meta('property', 'og:image:width', String(CARD_WIDTH)),
    url && image && meta('property', 'og:image:height', String(CARD_HEIGHT)),
    url && image && meta('property', 'og:image:alt', imageAlt || title),
    meta('name', 'twitter:card', url && image ? 'summary_large_image' : 'summary'),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', description),
    url && image && meta('name', 'twitter:image', image),
    meta('name', 'theme-color', themeColor)
  ].filter(Boolean).join('\n    ')
}

export const absolute = (path, siteUrl) => (siteUrl ? new URL(path, siteUrl).href : null)

const upTo = path => '../'.repeat(path.split('/').filter(Boolean).length)

// No script: the site's CSP allows none inline, and a meta refresh needs none.
export function stubHtml(page, { siteUrl = null, siteName = '', language = 'en', themeColor = '', csp = '', imageUrl = null }) {
  const target = `${upTo(page.path)}${page.hash}`
  const url = absolute(page.path, siteUrl)
  return `<!doctype html>
<html lang="${escapeHtml(language)}">
  <head>
    <meta charset="UTF-8" />
    ${csp}
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(page.title)}</title>
    ${socialTags({ title: page.title, description: page.description, url, image: imageUrl, siteName, locale: language, themeColor, type: 'article' })}
    ${url ? `<link rel="canonical" href="${escapeHtml(url)}" />` : ''}
    <meta http-equiv="refresh" content="0; url=${escapeHtml(target)}" />
  </head>
  <body>
    <p><a href="${escapeHtml(target)}">${escapeHtml(page.title)}</a></p>
  </body>
</html>
`
}

export const noScriptText = page => [`${page.title}.`, page.description, t('share.noScript')].filter(Boolean).join(' ')

export function robotsTxt(siteUrl = null) {
  return ['User-agent: *', 'Allow: /', siteUrl ? `Sitemap: ${absolute('sitemap.xml', siteUrl)}` : null].filter(Boolean).join('\n') + '\n'
}

export function sitemapXml(pages, siteUrl = null) {
  if (!siteUrl) return null
  const urls = pages.map(page => `  <url><loc>${escapeHtml(absolute(page.path, siteUrl))}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
}
