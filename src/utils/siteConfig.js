// Map files are written by server admins: every field is checked and falls back to the default.

import { safeImageSrc } from './richText/sanitize'
import { warnMap } from './mapJournal'

export const DEFAULT_SITE_CONFIG = Object.freeze({
  title: 'SpaceMap',
  // {page}: the place on the map; {site}: the title; {star}, {planet}: the open star and planet.
  titleTemplate: '{page} — {site}',
  // Relative to the map file.
  favicon: 'favicon.gif',
  // Absolute, ending in a slash; without it link previews have no picture.
  url: null,
  description: '',
  preview: null
})

// Previews cut longer text anyway; this keeps a pasted article out.
export const SITE_DESCRIPTION_MAX = 300

const text = value => (typeof value === 'string' ? value.trim() : '')

export function normalizeSiteConfig(raw = {}, baseUrl = null) {
  const config = { ...DEFAULT_SITE_CONFIG }
  if (text(raw?.title)) config.title = text(raw.title)
  if (text(raw?.titleTemplate).includes('{page}')) config.titleTemplate = text(raw.titleTemplate)

  const favicon = safeImageSrc(text(raw?.favicon))
  if (favicon) config.favicon = favicon
  if (baseUrl) config.favicon = resolveFavicon(config.favicon, baseUrl)

  if (raw?.url !== undefined) config.url = siteUrl(raw.url)
  if (text(raw?.description)) config.description = text(raw.description).slice(0, SITE_DESCRIPTION_MAX)
  if (raw?.preview !== undefined) config.preview = previewImage(raw.preview, baseUrl)
  return config
}

function siteUrl(value) {
  try {
    const url = new URL(text(value))
    if (!/^https?:$/.test(url.protocol)) throw new Error('not http')
    url.search = ''
    url.hash = ''
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    return url.href
  } catch {
    warnMap('site.url', `"${value}" is not the address of a site (https://…/): link previews have no picture.`)
    return null
  }
}

function previewImage(value, baseUrl) {
  const path = safeImageSrc(text(value))
  if (!path) {
    warnMap('site.preview', `"${value}" is not a picture: the drawn card is used for link previews.`)
    return null
  }
  if (!baseUrl) return path
  try {
    return new URL(path, baseUrl).href
  } catch {
    warnMap('site.preview', `"${path}" is not an address a browser can read: the drawn card is used for link previews.`)
    return null
  }
}

function resolveFavicon(path, baseUrl) {
  try {
    return new URL(path, baseUrl).href
  } catch {
    warnMap('site.favicon', `"${path}" is not an address a browser can read: the default icon is used.`)
    return new URL(DEFAULT_SITE_CONFIG.favicon, baseUrl).href
  }
}
