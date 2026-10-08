import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PREVIEW_URL } from '../playwright.config.js'

// Runs against `npm run build` served by `vite preview --base /spacemap/` (playwright.config.js), as on GitHub Pages.

const idle = page => expect(page.locator('.crt-screen.phase-idle')).toBeVisible({ timeout: 30_000 })

test('the built site works from a folder of the host', async ({ page }) => {
  const missing = []
  page.on('response', response => {
    if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', request => missing.push(`failed ${request.url()}`))

  await page.goto(PREVIEW_URL)
  await idle(page)
  await expect(page.locator('.loader-error')).toHaveCount(0)
  await expect(page.locator('.galaxy-view canvas').first()).toBeVisible()
  await expect(page.locator('.lore-panel')).toContainText('GALAXY ARCHIVE')

  const favicon = await page.locator('link[rel="icon"]').getAttribute('href')
  expect(new URL(favicon, PREVIEW_URL).href).toMatch(/\/spacemap\/favicon\.gif$|^data:/)
  expect(await page.evaluate(async () => {
    await document.fonts.load('16px "Ark Pixel 10"')
    return document.fonts.check('16px "Ark Pixel 10"')
  })).toBe(true)

  const picture = page.waitForResponse(response => response.url().endsWith('/spacemap/lore/images/earth.jpg'))
  await page.goto(`${PREVIEW_URL}#/wiki/Earth`)
  await idle(page)
  await expect(page.locator('.wiki-view .wiki-text')).toContainText('the only world presently known to support life')
  expect((await picture).status()).toBeLessThan(400)
  await expect(page.locator('.wiki-view .pixel-image-canvas').first()).toBeVisible()
  await expect(page.locator('.wiki-view .rt-figure .pixel-image-canvas')).toHaveCount(3)

  const solarPictures = []
  page.on('response', response => {
    if (/\/spacemap\/lore\/images\/solar\/mercury-[^/]+\.(?:jpg|png)$/.test(response.url())) solarPictures.push(response.url())
  })
  await page.goto(`${PREVIEW_URL}#/wiki/Mercury#Sources`)
  await idle(page)
  await expect(page.locator('.wiki-view .rt-table')).toHaveCount(1)
  await expect(page.locator('.wiki-view .wiki-text')).toContainText('Formation and open questions')
  await expect(page.locator('.wiki-view a', { hasText: 'Mercury (planet)' })).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Mercury_(planet)')
  await expect.poll(() => new Set(solarPictures).size).toBe(3)
  await expect(page.locator('.wiki-view .rt-figure .pixel-image-canvas')).toHaveCount(3)
  await expect.poll(() => page.locator('.wiki-view .rt-figure .pixel-image-canvas').evaluateAll(elements => elements.every(canvas => canvas.width > 1 && canvas.style.width))).toBe(true)
  await expect(page.locator('.wiki-view .pixel-image-note')).toHaveCount(0)

  await page.goto(PREVIEW_URL)
  await idle(page)
  const track = page.waitForResponse(response => /\/spacemap\/music\/.+\.mp3/.test(response.url()))
  await page.locator('.music-player .button-play').click()
  expect((await track).status()).toBeLessThan(400)

  expect(missing).toEqual([])
})

// Was: a tab opened before a deploy asked for a SystemView-<hash>.js the host had deleted: "SCREEN PROGRAM UNAVAILABLE".
test('a screen file of an older build gone from the host: the page reloads once and opens it', async ({ page }) => {
  let refused = 0
  await page.route(/\/assets\/SystemView-[^/]+\.js$/, route => {
    if (refused++ === 0) return route.fulfill({ status: 404, body: 'Not Found' })
    return route.continue()
  })
  await page.goto(`${PREVIEW_URL}#/system/sol`)
  await idle(page)
  await expect(page.locator('.system-view')).toBeVisible()
  await expect(page.locator('.loader-error')).toHaveCount(0)
  expect(refused).toBe(2)
  expect(page.url()).toMatch(/#\/system\/sol$/)
})

test('a screen file missing from the new build too: one reload, then the loader says so', async ({ page }) => {
  let requests = 0
  await page.route(/\/assets\/SystemView-[^/]+\.js$/, route => {
    requests++
    return route.fulfill({ status: 404, body: 'Not Found' })
  })
  let loads = 0
  page.on('load', () => { loads++ })
  await page.goto(`${PREVIEW_URL}#/system/sol`)
  await expect(page.locator('.loader-error')).toBeVisible({ timeout: 30_000 })
  expect(loads).toBe(2)
  expect(requests).toBe(2)
})

// Was: an error while a screen was built left the shutters closed for good, with no word of what happened.
test('an error while a screen is built is told in the loader, with the way back to the galaxy', async ({ page }) => {
  await page.route(/\/assets\/SystemView-[^/]+\.js$/, route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'export default { setup() { throw new Error("orbits are NaN") } }'
  }))
  await page.goto(`${PREVIEW_URL}#/system/sol`)
  const loaderError = page.locator('.loader-error')
  await expect(loaderError).toContainText('UNEXPECTED PROGRAM ERROR', { timeout: 30_000 })
  await expect(page.locator('.loader')).toContainText('orbits are NaN')
  await expect(page.getByText('[ OPEN THE GALAXY MAP ]')).toBeVisible()
})

// Was: the pixel fonts came from Google Fonts, which saw the address of every visitor.
test('the pixel fonts come from the folder of the site, never from Google', async ({ page }) => {
  const external = []
  const fonts = []
  page.on('request', request => {
    const url = request.url()
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) external.push(url)
    if (url.endsWith('.woff2')) fonts.push(url)
  })
  await page.goto(PREVIEW_URL)
  await idle(page)
  const loaded = await page.evaluate(async () => {
    // A Cyrillic letter makes the browser load the Cyrillic file of the font.
    await Promise.all(['8px "Press Start 2P"', '24px "Tiny5"'].map(font => document.fonts.load(font, 'AЖ')))
    return ['8px "Press Start 2P"', '24px "Tiny5"'].map(font => document.fonts.check(font, 'AЖ'))
  })
  expect(loaded).toEqual([true, true])
  expect(external).toEqual([])
  for (const file of ['PressStart2P-latin', 'PressStart2P-cyrillic', 'Tiny5-latin', 'Tiny5-cyrillic']) {
    expect(fonts.some(url => url.includes('/spacemap/') && url.includes(`/${file}.woff2`)), file).toBe(true)
  }
})

// Was: no Content-Security-Policy. Under it Pixi needs pixi.js/unsafe-eval, and inline styles and scripts are refused.
test('every screen works under the Content-Security-Policy of the build, with no violation', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', event => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })
  const refused = []
  page.on('console', message => {
    if (/Content Security Policy|Refused to/i.test(message.text())) refused.push(message.text())
  })
  page.on('pageerror', error => refused.push(`pageerror: ${error.message}`))

  await page.goto(PREVIEW_URL)
  await idle(page)
  expect(await page.evaluate(() => document.head.querySelector('meta[charset] + meta')?.httpEquiv)).toBe('Content-Security-Policy')
  await expect(page.locator('.galaxy-view canvas').first()).toBeVisible()
  await expect(page.locator('.loader-error')).toHaveCount(0)

  await page.goto(`${PREVIEW_URL}#/system/sol/3`)
  await idle(page)
  await expect(page.locator('.system-orbit-canvas')).toBeVisible()
  await expect(page.locator('.window-visual .planet-canvas-wrapper canvas').first()).toBeVisible()

  await page.goto(`${PREVIEW_URL}#/wiki/Earth`)
  await idle(page)
  await expect(page.locator('.wiki-view .pixel-image-canvas').first()).toBeVisible()
  await page.goto(`${PREVIEW_URL}#/wiki/Main_Page`)
  await idle(page)
  await expect(page.locator('.wiki-view .pixel-logo').first()).toBeVisible()

  // A press lets the page sound, so the recording of the breaker loads.
  const breaker = page.waitForResponse(response => /\/spacemap\/assets\/breaker-[\w-]+\.wav$/.test(response.url()))
  await page.locator('.music-player .button-play').click()
  await expect(page.locator('.music-player .button-play')).toHaveClass(/is-active/)
  expect((await breaker).status()).toBe(200)

  await page.goto(`${PREVIEW_URL}#/edit`)
  await expect(page.locator('.editor-view')).toBeVisible({ timeout: 30_000 })

  expect(await page.evaluate(() => window.__cspViolations)).toEqual([])
  expect(refused).toEqual([])
})

// Was: a shared link showed an empty card: no og:* tags, one title for every map, every page after a "#" bots drop.
test('a link of the site and of each of its places has a preview of its own', async ({ page, request }) => {
  await page.goto(PREVIEW_URL)
  const tag = selector => page.locator(selector).getAttribute('content')
  expect(await tag('meta[property="og:title"]')).toBe('SpaceMap')
  expect(await tag('meta[property="og:description"]')).toMatch(/^Eight stars\. Three rival powers\./)
  expect(await tag('meta[property="og:url"]')).toBe(PREVIEW_URL)
  expect(await tag('meta[name="twitter:card"]')).toBe('summary_large_image')
  const image = await tag('meta[property="og:image"]')
  expect(image).toBe(`${PREVIEW_URL}og/site.png`)
  const picture = await request.get(image)
  expect(picture.status()).toBe(200)
  expect(picture.headers()['content-type']).toBe('image/png')
  expect(await page.locator('html').getAttribute('lang')).toBe('en')
  await expect(page.locator('noscript')).toHaveCount(1)

  const stub = await request.get(`${PREVIEW_URL}wiki/Earth/`)
  expect(stub.status()).toBe(200)
  const html = await stub.text()
  expect(html).toContain('<meta property="og:title" content="Earth — SpaceMap" />')
  expect(html).toMatch(/<meta property="og:image" content="http:\/\/localhost:4173\/spacemap\/og\/wiki-Earth-[0-9a-f]{8}\.png" \/>/)
  expect(html).not.toMatch(/<script/i)
  await page.goto(`${PREVIEW_URL}wiki/Earth/`)
  await expect(page).toHaveURL(`${PREVIEW_URL}#/wiki/Earth`)
  await idle(page)
  await expect(page.locator('.wiki-view .wiki-title')).toHaveText('Earth')

  await page.goto(`${PREVIEW_URL}system/sol/`)
  await expect(page).toHaveURL(`${PREVIEW_URL}#/system/sol`)
  await idle(page)
  await expect(page.locator('.system-view')).toBeVisible()

  expect(await (await request.get(`${PREVIEW_URL}robots.txt`)).text()).toContain(`Sitemap: ${PREVIEW_URL}sitemap.xml`)
  expect(await (await request.get(`${PREVIEW_URL}sitemap.xml`)).text()).toContain(`<loc>${PREVIEW_URL}wiki/Earth/</loc>`)
})

// Was: the only address to share had a "#" and showed the preview of the whole site.
test('COPY LINK gives the address of the preview page of the place', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`${PREVIEW_URL}#/wiki/Earth`)
  await idle(page)
  await page.locator('.wiki-copy-link').click()
  await expect(page.locator('.wiki-copy-link')).toHaveText('[ COPIED ]')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${PREVIEW_URL}wiki/Earth/`)
  await expect(page.locator('.wiki-copy-link')).toHaveText('[ COPY LINK ]')

  await page.goto(`${PREVIEW_URL}#/system/sol`)
  await idle(page)
  await page.locator('.window-system .button-menu').click()
  await page.locator('.dos-menu').getByText('Copy link', { exact: true }).click()
  await expect(page.locator('.system-taskbar')).toContainText('LINK OF THE SYSTEM COPIED')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${PREVIEW_URL}system/sol/`)
})

// Like GitHub Pages, caches every file for 10 minutes (max-age=600); serves the build in /spacemap/ and a map.json the test can republish.
async function cachingHost(mapText) {
  const root = fileURLToPath(new URL('../dist/', import.meta.url))
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.md': 'text/plain', '.wiki': 'text/plain' }
  const host = { mapText, reads: 0 }
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://host').pathname).replace(/^\/spacemap\//, '')
    const file = path === '' || path.endsWith('/') ? `${path}index.html` : path
    let body
    if (file === 'map.json') {
      host.reads++
      body = host.mapText
    } else {
      body = await readFile(join(root, file)).catch(() => null)
    }
    if (body === null) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' })
    response.end(body)
  })
  await new Promise(resolve => server.listen(0, 'localhost', resolve))
  host.url = `http://localhost:${server.address().port}/spacemap/`
  host.close = () => new Promise(resolve => server.close(resolve))
  return host
}

// Was: a newly published map stayed old for up to ten minutes: the browser took map.json from its cache.
test('a newly published map is read at once, though the host lets files be cached for 10 minutes', async ({ page }) => {
  const map = JSON.parse(await readFile(new URL('../public/map.json', import.meta.url), 'utf8'))
  const host = await cachingHost(JSON.stringify(map))
  try {
    await page.goto(host.url)
    await idle(page)
    await expect(page).toHaveTitle(map.site.title)

    host.mapText = JSON.stringify({ ...map, site: { ...map.site, title: 'Published Again' } })
    await page.goto('about:blank')
    await page.goto(host.url)
    await idle(page)
    await expect(page).toHaveTitle('Published Again')
    expect(host.reads).toBe(2)
  } finally {
    await host.close()
  }
})

// Was: a black screen while the program downloaded, seconds long on a slow network.
test('the built page says it loads the program only when its script is slow to come', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => { window.__violations = [...(window.__violations ?? []), event.violatedDirective] })
  })
  await page.route(/\/spacemap\/assets\/index-[\w-]+\.js$/, async route => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.goto(PREVIEW_URL, { waitUntil: 'commit' })
  const preboot = page.locator('#app .preboot')
  await expect(preboot).toHaveText('> LOADING PROGRAM _')
  await expect(preboot).toBeHidden()
  await expect(preboot).toHaveCSS('font-family', /Courier New/)
  await expect(preboot).toBeVisible()
  await expect(page.locator('.loader')).toBeVisible({ timeout: 15_000 })
  await expect(preboot).toHaveCount(0)
  expect(await page.evaluate(() => window.__violations ?? [])).toEqual([])
})

test('a fast start of the built site never shows the line before the program', async ({ page }) => {
  await page.addInitScript(() => {
    window.__prebootShown = false
    document.addEventListener('animationstart', event => {
      if (event.animationName === 'preboot-show') window.__prebootShown = true
    }, true)
  })
  await page.goto(PREVIEW_URL)
  await expect(page.locator('.loader')).toBeVisible()
  await page.waitForTimeout(800)
  expect(await page.evaluate(() => window.__prebootShown)).toBe(false)
})

test.describe('a browser without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  // Was: "> LOADING PROGRAM _" waited forever without JavaScript, and the <noscript> text was black on black.
  test('is told the site needs JavaScript, and is not shown a loading line', async ({ page }) => {
    await page.goto(PREVIEW_URL)
    const message = page.locator('noscript p')
    await expect(message).toBeVisible()
    await expect(message).toContainText('needs JavaScript')
    expect(await message.evaluate(element => getComputedStyle(element).color)).not.toBe('rgb(0, 0, 0)')
    const preboot = page.locator('.preboot')
    await expect(preboot).toBeHidden()
    // Past the 0.6 s after which the line shows for a slow start.
    await page.waitForTimeout(1000)
    await expect(preboot).toBeHidden()
  })
})
