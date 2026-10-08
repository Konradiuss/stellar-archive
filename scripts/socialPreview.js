// Vite plugin: link previews (og:* tags, a stub page per wiki page and star, cards, robots.txt, sitemap.xml).
// Stub pages exist because bots drop everything after "#". Cards need the absolute address (SITE_URL or `site.url`).
// A problem here never stops the build: the site works without previews.

import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runnerImport } from 'vite'
import { Resvg } from '@resvg/resvg-js'
import { cspTag } from './contentSecurityPolicy.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const CARD_FONTS = [path.join(HERE, 'fonts', 'PressStart2P-Regular.ttf'), path.join(HERE, 'fonts', 'Tiny5-Regular.ttf')]
// Bigger cards are slow to load in a chat; the whole set weighs on the deploy.
const CARD_BUDGET = 300 * 1024
const CARDS_BUDGET = 20 * 1024 * 1024

export function renderCard(svg, fontFiles = CARD_FONTS) {
  try {
    // No smoothing, as the site draws: the pixel fonts stay sharp and the PNG is a third of the size.
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      shapeRendering: 0,
      textRendering: 0,
      font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Press Start 2P' }
    })
    return resvg.render().asPng()
  } catch {
    return null
  }
}

// Absolute, with one slash at the end; null otherwise.
export function siteUrlFrom(value) {
  try {
    const url = new URL(String(value ?? '').trim())
    if (!/^https?:$/.test(url.protocol)) return null
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/`
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

const IMAGE_TYPES = { '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.gif': 'gif', '.webp': 'webp' }

export function socialPreview({ env = process.env } = {}) {
  let root = process.cwd()
  let publicDir = path.join(root, 'public')
  let logger = console
  // { tags, lang, title, noScript, files: [{ fileName, source }] } once built; null to leave the build as it is.
  let result = null

  async function prepare() {
    const mapFile = path.join(publicDir, 'map.json')
    if (!existsSync(mapFile)) return null
    const { module: social } = await runnerImport(path.join(root, 'src/social/index.js'), { root, configFile: false, logLevel: 'error' })
    const mapUrl = pathToFileURL(mapFile).href
    const site = await social.loadSocialSite({
      mapText: readFileSync(mapFile, 'utf8'),
      baseUrl: mapUrl,
      readText: async url => readFile(fileURLToPath(url), 'utf8')
    })
    if (!site) {
      logger.warn('[social-preview] map.json cannot be read: no link previews in this build.')
      return null
    }
    const { built, checked } = site
    const config = built.siteConfig
    const siteUrl = siteUrlFrom(env.SITE_URL) ?? config.url
    if (!siteUrl) logger.warn('[social-preview] the address of the site is not known: link previews have no picture. Set `site.url` in map.json or SITE_URL.')

    const colors = checked.theme.colors
    const language = checked.language
    const pages = social.socialPages(built)
    const files = []
    let cardsSize = 0

    const root0 = pages[0]
    if (config.preview?.startsWith('file:')) {
      const file = fileURLToPath(config.preview)
      const type = IMAGE_TYPES[path.extname(file).toLowerCase()]
      if (type && existsSync(file)) {
        root0.image = `og/site.${type}`
        files.push({ fileName: root0.image, source: readFileSync(file) })
        root0.ownPicture = true
      } else {
        logger.warn(`[social-preview] site.preview "${file}" is not a picture of the site: the drawn card is used.`)
      }
    } else if (config.preview) {
      root0.image = config.preview
      root0.ownPicture = true
    }

    for (const page of pages) {
      if (page.ownPicture) continue
      const png = renderCard(social.cardSvg({ map: built, colors, ...page.card }))
      if (!png) {
        logger.warn(`[social-preview] the card of "${page.title}" could not be drawn: it has none.`)
        page.image = null
        continue
      }
      if (page.path === '' && png.length > CARD_BUDGET) logger.warn(`[social-preview] the card of the site weighs ${Math.round(png.length / 1024)} KB: some chats skip pictures over 300 KB.`)
      cardsSize += png.length
      files.push({ fileName: page.image, source: png })
    }
    if (cardsSize > CARDS_BUDGET) logger.warn(`[social-preview] the cards weigh ${Math.round(cardsSize / 1024 / 1024)} MB together.`)

    const imageUrl = page => (page.image ? (/^https?:/.test(page.image) ? page.image : social.absolute(page.image, siteUrl)) : null)
    const common = { siteUrl, siteName: config.title, language, themeColor: colors.screen, csp: cspTag() }
    for (const page of pages.slice(1)) {
      files.push({ fileName: `${page.path}index.html`, source: social.stubHtml(page, { ...common, imageUrl: imageUrl(page) }) })
    }
    files.push({ fileName: 'robots.txt', source: social.robotsTxt(siteUrl) })
    const sitemap = social.sitemapXml(pages, siteUrl)
    if (sitemap) files.push({ fileName: 'sitemap.xml', source: sitemap })

    return {
      title: root0.title,
      lang: language,
      noScript: social.noScriptText(root0),
      tags: social.socialTags({
        title: root0.title,
        description: root0.description,
        url: social.absolute('', siteUrl),
        image: imageUrl(root0),
        siteName: config.title,
        locale: language,
        themeColor: colors.screen
      }),
      escape: social.escapeHtml,
      files,
      pages: pages.length
    }
  }

  return {
    name: 'social-preview',
    apply: 'build',
    configResolved(config) {
      root = config.root
      publicDir = config.publicDir || path.join(root, 'public')
      logger = config.logger
    },
    async buildStart() {
      try {
        result = await prepare()
      } catch (error) {
        result = null
        logger.warn(`[social-preview] link previews were not built: ${error?.message ?? error}`)
      }
    },
    transformIndexHtml(html) {
      if (!result) return html
      const { escape } = result
      return html
        .replace(/<html lang="[^"]*">/i, `<html lang="${escape(result.lang)}">`)
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(result.title)}</title>\n    ${result.tags}`)
        .replace(/<body>/i, `<body>\n    <noscript><p>${escape(result.noScript)}</p></noscript>`)
    },
    generateBundle() {
      if (!result) return
      for (const file of result.files) this.emitFile({ type: 'asset', fileName: file.fileName, source: file.source })
      logger.info(`[social-preview] ${result.pages} link previews, ${result.files.filter(file => file.fileName.endsWith('.png')).length} cards.`)
    }
  }
}
