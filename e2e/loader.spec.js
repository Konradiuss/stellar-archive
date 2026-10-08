import { expect, test } from '@playwright/test'
import { releaseMap, waitForView, watchConsole, withStores } from './helpers'

const MAP = releaseMap()
const solPlanets = MAP.systems.sol.planets
const solOrbits = solPlanets.reduce((count, planet) => count + 1 + (planet.satellites?.length ?? 0), 0)

// [[lines of the first loader], [lines of the second], …], each line as last seen on the screen.
async function recordLoaders(page) {
  await page.addInitScript(() => {
    window.__loaders = []
    let current = null
    new MutationObserver(() => {
      const loader = document.querySelector('.loader')
      if (!loader) {
        current = null
        return
      }
      if (!current) {
        current = []
        window.__loaders.push(current)
      }
      const lines = [...loader.querySelectorAll('.loader-line')].map(line => line.textContent.replace(/\s+/g, ' ').trim())
      current.splice(0, current.length, ...lines)
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
}
const loaders = page => page.evaluate(() => window.__loaders)
// "> LOADING MAP FILE ...... OK" → "LOADING MAP FILE".
const textOf = line => line.replace(/^> /, '').replace(/ \.+ /, ' ').replace(/ (OK|[|/\\-])$/, '').trim()

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-started')) {
      localStorage.clear()
      sessionStorage.setItem('e2e-started', '1')
    }
  })
})

test('the site starts with the lines of what it loads, with the numbers of the map', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await recordLoaders(page)
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const [boot] = await loaders(page)
  expect(boot.map(textOf)).toEqual([
    'LOADING MAP FILE',
    `CHECKING STAR SYSTEMS: ${MAP.stars.length}`,
    expect.stringMatching(/^LOADING ARTICLE TEXTS: \d+$/),
    'BUILDING FACTION BORDERS',
    'STARTING GRAPHICS',
    'DRAWING GALAXY MAP',
    expect.stringMatching(/^DRAWING HYPERLINES: \d+$/),
    'STARTING ANIMATIONS'
  ])
  expect(boot.every(line => line.endsWith(' OK'))).toBe(true)
  await expect(page.locator('.loader-title')).toHaveCount(0)
  consoleIsClean()
})

// Was: the loader came only for a screen not ready in 150 ms, so a fast computer showed none.
test('every switch of screens shows its own short loader', async ({ page }) => {
  await recordLoaders(page)
  await page.goto('/')
  await waitForView(page, 'galaxy')

  await withStores(page, ({ ui }) => ui.selectStar('sol'))
  await waitForView(page, 'system')
  await withStores(page, ({ ui }) => ui.closeSystemView())
  await waitForView(page, 'galaxy')
  await withStores(page, ({ ui }) => ui.openWiki('Earth'))
  await waitForView(page, 'wiki')

  const [, system, galaxy, wiki] = (await loaders(page)).map(lines => lines.map(textOf))
  expect(system).toEqual(['OPENING SYSTEM SOL', `CALCULATING ORBITS: ${solOrbits}`, `DRAWING PLANETS: ${solPlanets.length}`])
  expect(galaxy).toEqual(['OPENING GALAXY MAP', 'RESUMING ANIMATIONS'])
  expect(wiki).toEqual(['OPENING ARTICLE EARTH', 'LAYING OUT PAGE'])
})

test('a link to a system starts the site with the lines of the map and then of the system', async ({ page }) => {
  await recordLoaders(page)
  await page.goto('/#/system/sol')
  await waitForView(page, 'system')
  const [boot] = (await loaders(page)).map(lines => lines.map(textOf))
  expect(boot.slice(0, 2)).toEqual(['LOADING MAP FILE', `CHECKING STAR SYSTEMS: ${MAP.stars.length}`])
  expect(boot.slice(-3)).toEqual(['OPENING SYSTEM SOL', `CALCULATING ORBITS: ${solOrbits}`, `DRAWING PLANETS: ${solPlanets.length}`])
})

// Was: the line showed on every start, even a fast one, and on a white page on the dev server.
test('a slow start says it loads the program, on a black page, after a moment', async ({ page }) => {
  await page.route(/\/src\/main\.js$/, async route => {
    await new Promise(resolve => setTimeout(resolve, 2000))
    await route.continue()
  })
  await page.goto('/', { waitUntil: 'commit' })
  const preboot = page.locator('#app .preboot')
  await expect(preboot).toHaveCount(1)
  await expect(preboot).toBeHidden()
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)')
  await expect(preboot).toBeVisible()
  await expect(preboot).toHaveText('> LOADING PROGRAM _')
  await waitForView(page, 'galaxy')
  await expect(page.locator('.preboot')).toHaveCount(0)
})
