import { beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { clip, escapeHtml, loadSocialSite, robotsTxt, sitemapXml, socialPages, socialTags, stubHtml } from '../preview'
import { stubPath } from '../stubPath'

const MAP_URL = new URL('../../../public/map.json', import.meta.url).href
const readText = async url => fs.readFileSync(fileURLToPath(url), 'utf8')
const SITE = 'https://owner.github.io/reach/'

let built
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const site = await loadSocialSite({ mapText: await readText(MAP_URL), baseUrl: MAP_URL, readText })
  built = site.built
})

// Was: every link of the site showed an empty card, its title "SpaceMap".
describe('the pages of the link previews', () => {
  it('describes the site with the text of its main page, its magic words counted', () => {
    const [root] = socialPages(built)
    expect(root).toMatchObject({ path: '', hash: '#/', title: 'SpaceMap', image: 'og/site.png' })
    expect(root.description).toMatch(/^Eight stars\. Three rival powers\./)
    expect(root.description.length).toBeLessThanOrEqual(200)
    expect(root.description).not.toMatch(/\{\{|\[\[/)
  })

  it('gives each page of the wiki and each star a page of its own', () => {
    const pages = socialPages(built)
    const earth = pages.find(page => page.path === 'wiki/Earth/')
    expect(earth).toMatchObject({ hash: '#/wiki/Earth', title: 'Earth — SpaceMap', image: expect.stringMatching(/^og\/wiki-Earth-[0-9a-f]{8}\.png$/) })
    expect(earth.description).toMatch(/^Earth is the third planet from the Sun/)
    expect(earth.card).toMatchObject({ title: 'Earth', eyebrow: 'SpaceMap', highlight: 'sol' })

    const sol = pages.find(page => page.path === 'system/sol/')
    expect(sol).toMatchObject({ hash: '#/system/sol', title: 'Sol — SpaceMap' })
    expect(sol.card).toMatchObject({ title: 'Sol', subtitle: 'SECTOR 01:01 - 8 PLANETS', highlight: 'sol' })

    const paths = pages.map(page => page.path)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.filter(path => path.startsWith('wiki/'))).toHaveLength(built.wikiIndex.pages.length)
    expect(paths.filter(path => path.startsWith('system/'))).toHaveLength(built.stars.length)
    expect(new Set(pages.map(page => page.image)).size).toBe(pages.length)
  })

  it('takes the description the map gives, cut to fit a preview', () => {
    const own = { ...built, siteConfig: { ...built.siteConfig, description: 'The Reach, mapped.' } }
    expect(socialPages(own)[0].description).toBe('The Reach, mapped.')
    expect(clip('word '.repeat(80))).toMatch(/word…$/)
    expect(clip('word '.repeat(80)).length).toBeLessThanOrEqual(200)
  })
})

describe('the tags of a link preview', () => {
  it('escapes what the map writes, quotes and tags included', () => {
    const tags = socialTags({ title: 'A "quoted" <b>name</b> & co', description: "It's", url: SITE, image: `${SITE}og/site.png` })
    expect(tags).toContain('content="A &quot;quoted&quot; &lt;b&gt;name&lt;/b&gt; &amp; co"')
    expect(tags).toContain('content="It&#39;s"')
    expect(tags).not.toContain('<b>')
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('has the absolute picture and address when the site knows its address', () => {
    const tags = socialTags({ title: 'Sol', description: 'Star', url: SITE, image: `${SITE}og/site.png`, locale: 'ru', themeColor: '#000000' })
    expect(tags).toContain(`<meta property="og:image" content="${SITE}og/site.png" />`)
    expect(tags).toContain('<meta property="og:image:width" content="1200" />')
    expect(tags).toContain(`<meta property="og:url" content="${SITE}" />`)
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(tags).toContain('<meta property="og:locale" content="ru" />')
    expect(tags).toContain('<meta name="theme-color" content="#000000" />')
  })

  it('leaves out the picture and the address without the address of the site', () => {
    const tags = socialTags({ title: 'Sol', description: 'Star', image: 'og/site.png' })
    expect(tags).not.toContain('og:image')
    expect(tags).not.toContain('og:url')
    expect(tags).toContain('<meta property="og:title" content="Sol" />')
    expect(tags).toContain('<meta name="twitter:card" content="summary" />')
  })
})

describe('the preview page of a place', () => {
  const page = { path: stubPath('wiki', 'Earth'), hash: '#/wiki/Earth', title: 'Earth — "Reach"', description: 'Home <world>' }

  it('carries the tags for the bots and sends the visitor on to the site, with no script', () => {
    const html = stubHtml(page, { siteUrl: SITE, siteName: 'Reach', csp: '<meta http-equiv="Content-Security-Policy" content="x" />', imageUrl: `${SITE}og/wiki-earth.png` })
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=../../#/wiki/Earth" />')
    expect(html).toContain('<a href="../../#/wiki/Earth">')
    expect(html).toContain(`<link rel="canonical" href="${SITE}wiki/Earth/" />`)
    expect(html).toContain('<meta http-equiv="Content-Security-Policy" content="x" />')
    expect(html).toContain('<title>Earth — &quot;Reach&quot;</title>')
    expect(html).toContain(`content="${SITE}og/wiki-earth.png"`)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toContain('<world>')
  })

  it('has no canonical address and no picture without the address of the site', () => {
    const html = stubHtml(page, {})
    expect(html).not.toContain('canonical')
    expect(html).not.toContain('og:image')
  })
})

describe('the files for search engines', () => {
  it('opens the whole site, and lists its pages when the address is known', () => {
    expect(robotsTxt()).toBe('User-agent: *\nAllow: /\n')
    expect(robotsTxt(SITE)).toContain(`Sitemap: ${SITE}sitemap.xml`)
    const pages = [{ path: '' }, { path: 'wiki/Земля/' }]
    const xml = sitemapXml(pages, SITE)
    expect(xml).toContain(`<loc>${SITE}</loc>`)
    expect(xml).toContain(`<loc>${SITE}wiki/%D0%97%D0%B5%D0%BC%D0%BB%D1%8F/</loc>`)
    expect(sitemapXml(pages)).toBeNull()
  })
})

describe('the page of a browser without JavaScript', () => {
  it('names the site, describes it and says why the map is not there', async () => {
    const { noScriptText } = await import('../preview')
    expect(noScriptText({ title: 'SpaceMap', description: 'A galaxy.' })).toBe('SpaceMap. A galaxy. This site is a map that needs JavaScript: turn it on to open it.')
  })
})
