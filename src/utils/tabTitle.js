import { DEFAULT_SITE_CONFIG } from './siteConfig'
import { t } from '../i18n'

export const TAB_STATUS = Object.freeze({
  get loading() { return t('tab.loading') },
  get offline() { return t('tab.offline') },
  jump: name => t('tab.jump', { name })
})

const SEPARATOR = '[·—–|:/-]'
const EDGE_SEPARATORS = new RegExp(`^(?:\\s|${SEPARATOR})+|(?:\\s|${SEPARATOR})+$`, 'g')

// An empty placeholder goes with its separator: "{planet} / {star}" gives "Sol", not "/ Sol".
function dropPlaceholder(template, name) {
  const placeholder = `\\{${name}\\}`
  return template
    .replace(new RegExp(`${placeholder}\\s*${SEPARATOR}\\s*`, 'g'), ' ')
    .replace(new RegExp(`\\s*${SEPARATOR}\\s*${placeholder}`, 'g'), ' ')
    .replace(new RegExp(placeholder, 'g'), '')
}

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()

export function tabPage({ star = null, planet = null, article = null } = {}) {
  if (article) return clean(article.tabTitle) || clean(article.title)
  if (planet) return clean(planet.tabTitle) || [clean(planet.name), clean(star?.name)].filter(Boolean).join(' · ')
  if (star) return clean(star.tabTitle) || clean(star.name)
  return ''
}

export function buildTabTitle({ site = DEFAULT_SITE_CONFIG, star = null, planet = null, article = null, status = null } = {}) {
  const siteTitle = clean(site?.title) || DEFAULT_SITE_CONFIG.title
  const page = clean(status) || tabPage({ star, planet, article })
  if (!page) return siteTitle

  const values = { page, site: siteTitle, star: clean(star?.name), planet: clean(planet?.name) }
  const template = Object.keys(values)
    .filter(name => !values[name])
    .reduce(dropPlaceholder, site?.titleTemplate || DEFAULT_SITE_CONFIG.titleTemplate)
  const title = template
    .replace(/\{(page|site|star|planet)\}/g, (_, name) => values[name])
    .replace(EDGE_SEPARATORS, '')
  return clean(title) || siteTitle
}
