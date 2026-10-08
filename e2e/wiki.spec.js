import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openHash, waitForView, watchConsole, withStores } from './helpers.js'

test.use({ viewport: { width: 1600, height: 900 } })

const hashOf = page => decodeURIComponent(new URL(page.url()).hash)
const title = page => page.locator('.wiki-view .wiki-title')

// Serves an article of the site with `edit` applied, for a feature its text lacks.
const editArticle = (page, file, edit) => page.route(`**/wiki/${file}`, route => route.fulfill({
  contentType: 'text/plain; charset=utf-8',
  body: edit(readFileSync(new URL(`../public/wiki/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'))
}))
const after = (line, added) => text => {
  if (!text.includes(line)) throw new Error(`No line "${line}" in the article`)
  return text.replace(line, `${line}\n${added}`)
}
const append = added => text => `${text.trimEnd()}\n${added}\n`

test('the breaker switches to the page of the planet and back to it on the map', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/system/sol/3')
  const breaker = page.locator('.legend-dock .mode-breaker')
  await expect(breaker).toHaveAttribute('aria-pressed', 'false')
  const [breakerBox, legendBox] = await Promise.all([breaker.boundingBox(), page.locator('.map-legend').boundingBox()])
  expect(Math.abs(breakerBox.x + breakerBox.width - legendBox.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(breakerBox.height - legendBox.height)).toBeLessThanOrEqual(1)
  await breaker.click()
  await waitForView(page, 'wiki')
  await expect(page).toHaveURL(/#\/wiki\//)
  expect(hashOf(page)).toBe('#/wiki/Earth')
  await expect(title(page)).toHaveText('Earth')
  await expect(page).toHaveTitle(/^Earth/)
  await expect(breaker).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.lore-panel .panel-file')).toHaveText('CONTENTS.TXT')
  await expect(page.locator('.map-legend .panel-file')).toHaveText('NAVBOX.DAT')

  await breaker.click()
  await waitForView(page, 'system')
  expect(hashOf(page)).toBe('#/system/sol/3')
  await expect(page.locator('.window-data .planet-lore-title')).toHaveText('EARTH')
  consoleIsClean()
})

test('the breaker leads to the same place in the other mode, and back to the page left', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  const breaker = page.locator('.legend-dock .mode-breaker')
  const throwBreaker = async view => {
    await breaker.click()
    await waitForView(page, view)
  }

  await openHash(page, '')
  await throwBreaker('wiki')
  expect(hashOf(page)).toBe('#/wiki/Main_Page')

  await withStores(page, ({ ui }) => ui.openWiki('Earth'))
  await cardRows(page).nth(6).locator('.rt-link').click()
  await expect(title(page)).toHaveText('Exodus Station')
  await throwBreaker('system')
  expect(hashOf(page)).toBe('#/system/sol/3/2')

  await throwBreaker('wiki')
  await expect(title(page)).toHaveText('Exodus Station')
  await page.keyboard.press('Escape')
  await waitForView(page, 'system')
  expect(hashOf(page)).toBe('#/system/sol/3/2')

  await withStores(page, ({ ui }) => ui.openWiki('Nacre_Beacon'))
  await expect(page.locator('.wiki-action', { hasText: 'SHOW ON MAP' })).toBeVisible()
  await throwBreaker('system')
  expect(hashOf(page)).toBe('#/system/nacre/1')
  await throwBreaker('wiki')
  await expect(title(page)).toHaveText('Nacre Beacon')

  await page.locator('.wiki-view .rt-link', { hasText: 'passage generator' }).first().click()
  await expect(title(page)).toHaveText('Gate Drive')
  await throwBreaker('system')
  expect(hashOf(page)).toBe('#/system/nacre/1')
  await throwBreaker('wiki')
  await expect(title(page)).toHaveText('Gate Drive')
  consoleIsClean()
})

test('the breaker shows both modes, leans under the mouse and twitches until thrown', async ({ page }) => {
  await page.clock.install()
  await openHash(page, '#/system/sol/3')
  const breaker = page.locator('.legend-dock .mode-breaker')
  await expect(breaker.locator('.breaker-label.is-map')).toHaveClass(/is-lit/)
  await expect(breaker.locator('.breaker-label.is-wiki')).not.toHaveClass(/is-lit/)
  await breaker.evaluate(node => {
    window.breakerFrames = []
    new MutationObserver(() => window.breakerFrames.push(node.className)).observe(node, { attributes: true, attributeFilter: ['class'] })
  })
  const frames = () => page.evaluate(() => window.breakerFrames.join(' '))

  await page.clock.fastForward(16000)
  await expect.poll(frames).toContain('is-up-half')
  await expect(breaker).toHaveClass(/is-up(?!-)/)

  await breaker.hover()
  await expect(breaker).toHaveClass(/is-up-half/)
  await expect(breaker.locator('.breaker-label.is-wiki')).toHaveClass(/is-hint/)

  await breaker.click()
  await waitForView(page, 'wiki')
  expect(await page.evaluate(() => localStorage.getItem('spacemap:v1:/breaker-used'))).toBe('true')
  await page.mouse.move(5, 5)
  await page.evaluate(() => { window.breakerFrames = [] })
  await page.clock.fastForward(40000)
  expect(await frames()).not.toContain('is-down-half')
  await page.reload()
  await waitForView(page, 'wiki')
  await breaker.evaluate(node => {
    window.breakerFrames = []
    new MutationObserver(() => window.breakerFrames.push(node.className)).observe(node, { attributes: true, attributeFilter: ['class'] })
  })
  await page.clock.fastForward(40000)
  expect(await frames()).not.toContain('is-down-half')
})

test('the circuit board runs in the gaps around the legend and the breaker', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  const colours = () => page.evaluate(() => {
    const canvas = document.querySelector('.circuit-board')
    const box = canvas.getBoundingClientRect()
    const scale = canvas.width / box.width
    const dock = document.querySelector('.legend-dock').getBoundingClientRect()
    const context = canvas.getContext('2d')
    const count = (x, y, w, h) => {
      const data = context.getImageData(Math.floor(x * scale), Math.floor(y * scale), Math.max(1, Math.floor(w * scale)), Math.max(1, Math.floor(h * scale))).data
      const seen = new Set()
      for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
      return seen.size
    }
    return { above: count(dock.left, dock.top - 12, dock.width, 10), right: count(dock.right + 2, dock.top, 10, dock.height) }
  })
  // The board redraws a moment after the layout settles.
  await expect.poll(async () => Math.min(...Object.values(await colours())), { timeout: 5_000 }).toBeGreaterThanOrEqual(3)
})

test('an article opens from its address with its contents and navbox', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/wiki/Crucible_Combine')
  await expect(title(page)).toHaveText('Crucible Combine')
  await expect(page).toHaveTitle('Crucible Combine — SpaceMap')
  await expect(page.locator('.wiki-path')).toContainText('C:\\WIKI\\FACTIONS>')
  await expect(page.locator('.lore-panel .contents-list')).toContainText('The Nacre contract')
  await expect(page.locator('.map-legend .navbox-list .navbox-link.is-current')).toHaveText('Crucible Combine')
  await page.locator('.map-legend .navbox-link', { hasText: 'Quantum Gates' }).click()
  await expect(title(page)).toHaveText('Quantum Gates')
  expect(hashOf(page)).toBe('#/wiki/Quantum_Gates')
  await page.goBack()
  await expect(title(page)).toHaveText('Crucible Combine')
  consoleIsClean()
})

test('the buttons of the wiki header stand in one row, MENU too', async ({ page }) => {
  // Was: MENU sat on the baseline of the text around it, 3px lower.
  await openHash(page, '#/wiki/Mars')
  const buttons = page.locator('.wiki-actions .wiki-action')
  await expect(buttons.filter({ hasText: 'MENU' })).toBeVisible()
  const boxes = await buttons.evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect()
    return { top: box.top, bottom: box.bottom }
  }))
  expect(boxes.length).toBeGreaterThan(3)
  for (const box of boxes) expect(box).toEqual(boxes[0])
})

test('a link in the lore of a star opens the article, Back returns to the map', async ({ page }) => {
  await openHash(page, '#/system/nacre')
  const link = page.locator('.lore-panel .lore-text .rt-link', { hasText: 'unexplained signal' })
  await expect(link).toBeVisible({ timeout: 15_000 })
  await link.click()
  await waitForView(page, 'wiki')
  await expect(title(page)).toHaveText('Nacre Beacon')
  await page.goBack()
  await waitForView(page, 'system')
  expect(hashOf(page)).toBe('#/system/nacre')
})

test('a place of the map is a page too, with a way back to the map', async ({ page }) => {
  await openHash(page, '#/wiki/Earth')
  await expect(page.locator('.wiki-path')).toContainText('\\PLACES\\SOL>')
  const toMap = page.locator('.wiki-action', { hasText: 'SHOW ON MAP' })
  await toMap.click()
  await waitForView(page, 'system')
  expect(hashOf(page)).toBe('#/system/sol/3')
})

// Records every text of the path line, as the typed command shows only briefly.
async function recordPathLine(page) {
  await page.evaluate(() => {
    window.__pathTexts = []
    const header = document.querySelector('.wiki-header')
    const read = () => {
      const text = document.querySelector('.wiki-path')?.textContent
      if (text && window.__pathTexts.at(-1) !== text) window.__pathTexts.push(text)
    }
    new MutationObserver(read).observe(header, { childList: true, subtree: true, characterData: true })
  })
  return () => page.evaluate(() => window.__pathTexts)
}

const crumb = (page, text) => page.locator('.wiki-path .wiki-crumb', { hasText: text })
const onMainPage = page => withStores(page, ({ ui, map }) => ui.wikiPage === map.wikiIndex.home)

const homeButton = page => page.locator('.wiki-header .wiki-home')
const isDotted = locator => locator.evaluate(element => getComputedStyle(element).textDecorationStyle === 'dotted')

test('[ HOME ] at the top left leads to the main page; the folders of the path are links', async ({ page }) => {
  // Was: visitors took C:\WIKI for no button at all, let alone one to the main page.
  await openHash(page, '#/wiki/Earth')
  const home = homeButton(page)
  await expect(home).toHaveText(/HOME/)
  await expect(home.locator('svg.wiki-home-icon')).toBeVisible()
  const [button, path] = await Promise.all([home.boundingBox(), page.locator('.wiki-path').boundingBox()])
  expect(button.x + button.width).toBeLessThanOrEqual(path.x)
  expect(Math.abs((button.y + button.height / 2) - (path.y + path.height / 2))).toBeLessThan(4)
  await expect(page.locator('.wiki-actions .wiki-action', { hasText: 'HOME' })).toHaveCount(0)
  await expect(crumb(page, 'C:\\WIKI')).toHaveCount(0)
  expect(await isDotted(crumb(page, 'SOL'))).toBe(true)

  let typed = await recordPathLine(page)
  await crumb(page, 'SOL').click()
  await expect(title(page)).toHaveText('Sol')
  expect(hashOf(page)).toBe('#/wiki/Sol')
  expect((await typed()).some(text => text.includes('C:\\WIKI\\PLACES\\SOL> CD \\PLACES\\SOL'))).toBe(true)

  typed = await recordPathLine(page)
  await home.click()
  await expect.poll(() => onMainPage(page)).toBe(true)
  expect((await typed()).some(text => text.endsWith('> CD \\_'))).toBe(true)
  await expect(home).toHaveClass(/is-current/)
  await expect(home).toHaveAttribute('aria-current', 'page')
  typed = await recordPathLine(page)
  await home.click()
  await page.waitForTimeout(300)
  expect((await typed()).some(text => text.includes('> CD '))).toBe(false)

  await openHash(page, '#/wiki/Mars')
  await page.keyboard.press('/')
  await expect(page.locator('.wiki-search')).toBeVisible()
  await expect(homeButton(page)).toBeVisible()
  await expect(homeButton(page)).not.toHaveClass(/is-current/)
})

test('the two pages read before stand beside the path, a click away', async ({ page }) => {
  await openHash(page, '#/wiki/')
  await expect(page.locator('.wiki-recent')).toHaveCount(0)
  for (const name of ['Mars', 'Sol', 'Earth']) await openHash(page, `#/wiki/${name}`)
  const recent = page.locator('.wiki-recent')
  await expect(recent).toContainText('RECENT:')
  await expect(recent.locator('.wiki-crumb')).toHaveText(['SOL', 'MARS'])
  expect(await isDotted(recent.locator('.wiki-crumb').first())).toBe(true)

  const typed = await recordPathLine(page)
  await recent.locator('.wiki-crumb', { hasText: 'MARS' }).click()
  await expect(title(page)).toHaveText('Mars')
  expect((await typed()).some(text => text.endsWith('TYPE MARS.TXT_'))).toBe(true)
  await expect(recent.locator('.wiki-crumb')).toHaveText(['EARTH', 'SOL'])
})

test('with less motion asked for, the path line goes at once, typing nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openHash(page, '#/wiki/Earth')
  const typed = await recordPathLine(page)
  await crumb(page, 'SOL').click()
  await expect(title(page)).toHaveText('Sol')
  expect((await typed()).some(text => text.includes('> CD '))).toBe(false)
})

test('the contents panel scrolls the article to a section', async ({ page }) => {
  await openHash(page, '#/wiki/Long_Article_Example')
  const scroll = page.locator('.wiki-view .scroll-area-body')
  expect(await scroll.evaluate(element => element.scrollTop)).toBe(0)
  await page.locator('.lore-panel .contents-link', { hasText: '3. Transit' }).click()
  const heading = page.locator('.wiki-view .rt-heading', { hasText: '3. Transit' })
  await expect.poll(async () => {
    const [box, area] = await Promise.all([heading.boundingBox(), scroll.boundingBox()])
    return Math.abs(box.y - area.y)
  }).toBeLessThan(24)
  await page.locator('.lore-panel .contents-top').click()
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(0)
})

const scroller = page => page.locator('.wiki-view .scroll-area-body')
const current = page => page.locator('.lore-panel .contents-row.is-current .contents-text')
const historyLength = page => page.evaluate(() => history.length)

test('an address with a section opens the article there', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/wiki/Long_Article_Example#3._Transit')
  const heading = page.locator('.wiki-view .rt-heading', { hasText: '3. Transit' })
  await expect.poll(async () => {
    const [box, area] = await Promise.all([heading.boundingBox(), scroller(page).boundingBox()])
    return Math.abs(box.y - area.y)
  }).toBeLessThan(24)
  await expect(current(page)).toHaveText('3. Transit')
  await expect(page.locator('.lore-panel .contents-number')).toHaveText(['1', '1.1', '2', '2.1', '3', '3.1', '4', '4.1', '5', '5.1', '6', '6.1', '7', '7.1', '8', '8.1'])
  await expect(page.locator('.lore-panel .panel-status')).toContainText('SECTION 3')
  expect(hashOf(page)).toBe('#/wiki/Long_Article_Example#3._Transit')

  await openHash(page, '#/wiki/Quantum_Gates#No_such_section')
  await expect.poll(() => hashOf(page)).toBe('#/wiki/Quantum_Gates')
  expect(await scroller(page).evaluate(node => node.scrollTop)).toBe(0)
  consoleIsClean()
})

test.describe('a tall screen', () => {
  test.use({ viewport: { width: 1920, height: 905 } })

  test('keeps the section asked for when it cannot reach the top', async ({ page }) => {
    await openHash(page, '#/wiki/Solar_Concord#Systems')
    await expect(current(page)).toHaveText('Systems')
    await page.waitForTimeout(500)
    await expect(current(page)).toHaveText('Systems')
    expect(hashOf(page)).toBe('#/wiki/Solar_Concord#Systems')
    await scroller(page).hover()
    await page.mouse.wheel(0, -2000)
    await expect.poll(() => hashOf(page)).toBe('#/wiki/Solar_Concord')
  })
})

test('reading on moves the lit section and the address, not the history', async ({ page }) => {
  await openHash(page, '#/wiki/Long_Article_Example')
  const entries = await historyLength(page)
  await expect(page.locator('.lore-panel .contents-row.is-current')).toHaveCount(0)
  await scroller(page).hover()
  await page.mouse.wheel(0, 350)
  await expect(current(page)).toHaveText('Departure details')
  await expect.poll(() => hashOf(page)).toBe('#/wiki/Long_Article_Example#Departure_details')
  await page.mouse.wheel(0, 400)
  await expect(current(page)).not.toHaveText('Departure details')
  expect(await historyLength(page)).toBe(entries)
  await page.locator('.lore-panel .contents-top').click()
  await expect.poll(() => hashOf(page)).toBe('#/wiki/Long_Article_Example')
})

// Section links and notes over sections, which the faction articles of the site do not have.
async function linkFactionSections(page) {
  await editArticle(page, 'solar-concord.wiki', after('== Neighbours ==', '{{Main|Crucible Combine|Free Tide}}'))
  await editArticle(page, 'crucible-combine.wiki', text => append('Its envoys recall [[Solar Concord#The price of peace|the price of peace]] paid by the Concord, and the [[#Directorate|shareholders of the directorate]] still argue over the offer.')(
    after('== The Nacre contract ==', '{{Main|Solar Concord#The price of peace}}')(text)))
}

test('a link to a section of another page opens it there, Back returns', async ({ page }) => {
  await linkFactionSections(page)
  await openHash(page, '#/wiki/Crucible_Combine')
  await page.locator('.wiki-view .rt-p .rt-link', { hasText: 'the price of peace' }).click()
  await expect(title(page)).toHaveText('Solar Concord')
  await expect(current(page)).toHaveText('The price of peace')
  await expect(page.locator('.lore-panel .contents-row.is-ancestor .contents-text')).toHaveText('Charter')
  expect(hashOf(page)).toBe('#/wiki/Solar_Concord#The_price_of_peace')
  await page.goBack()
  await expect(title(page)).toHaveText('Crucible Combine')

  await page.locator('.wiki-view .rt-link', { hasText: 'shareholders' }).click()
  await expect(current(page)).toHaveText('Directorate')
  await expect(title(page)).toHaveText('Crucible Combine')
})

test('subsections fold in the contents and open when read', async ({ page }) => {
  await openHash(page, '#/wiki/Solar_Concord')
  const toggle = page.locator('.lore-panel button.contents-toggle')
  await expect(toggle).toHaveText('[-]')
  await toggle.click()
  await expect(toggle).toHaveText('[+]')
  await expect(page.locator('.lore-panel .contents-text')).toHaveText(['Charter', 'Neighbours', 'Systems'])
  await page.evaluate(() => {
    const ui = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui')
    ui.openWiki('Solar_Concord', 'The price of peace')
  })
  await expect(current(page)).toHaveText('The price of peace')
  await expect(toggle).toHaveText('[-]')
})

const navbox = page => page.locator('.map-legend .wiki-navbox')
const navboxRow = (page, group) => navbox(page).locator(`.navbox-row[data-group="${group}"]`)

test('the navbox lists the pages by group and shows where the open one is', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/wiki/Moon')
  await expect(navbox(page).locator('.navbox-row.is-top .navbox-group .navbox-title'))
    .toHaveText(['History', 'Factions', 'Technology', 'Examples', 'Places', 'Other pages', 'Service pages'])
  const current = navbox(page).locator('.navbox-list .navbox-link.is-current')
  await expect(current).toHaveText('Moon')
  await expect(current).toBeInViewport()
  const scroller = navbox(page).locator('.scroll-area-body')
  const [box, area] = await Promise.all([current.boundingBox(), scroller.boundingBox()])
  expect(box.y).toBeGreaterThanOrEqual(area.y)
  expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height)
  await expect(navboxRow(page, 'faction:concord').locator('.navbox-list')).toContainText('Sol (Mercury, Venus, Earth [Moon, Exodus Station], Mars [Phobos, Deimos], Jupiter [Io, Europa], Saturn [Titan], Uranus, Neptune [Triton])')
  await expect(navbox(page).locator('.navbox-row.is-inside')).toHaveCount(2)
  await expect(page.locator('.map-legend .panel-status')).toContainText('PLACES › SOLAR CONCORD')

  await navboxRow(page, 'faction:combine').locator('.navbox-title').click()
  await expect(title(page)).toHaveText('Crucible Combine')
  await expect(navboxRow(page, 'group:factions').locator('.navbox-link.is-current')).toHaveText('Crucible Combine')
  await scroller.evaluate(node => { node.scrollTop = 0 })
  await navbox(page).locator('.navbox-home').click()
  await expect(title(page)).toHaveText('Main Page')
  consoleIsClean()
})

test('a folded group of the navbox opens again for a page in it', async ({ page }) => {
  await openHash(page, '#/wiki/Quantum_Gates')
  const places = navboxRow(page, 'places')
  await places.locator('.navbox-toggle').click()
  await expect(places.locator('.navbox-toggle')).toHaveText('[+]')
  await expect(navboxRow(page, 'faction:concord')).toHaveCount(0)
  await expect(places.locator('.navbox-count')).toHaveText(/PAGES: \d+/)
  await page.evaluate(() => {
    const ui = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui')
    ui.openWiki('Mars')
  })
  await expect(places.locator('.navbox-toggle')).toHaveText('[-]')
  await expect(navbox(page).locator('.navbox-list .navbox-link.is-current')).toHaveText('Mars')
})

test('a note over a section leads to the main article', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await linkFactionSections(page)
  await openHash(page, '#/wiki/Solar_Concord')
  const hatnote = page.locator('.wiki-view .rt-hatnote').first()
  await expect(hatnote).toHaveText('Main articles: Crucible Combine and Free Tide')
  await hatnote.locator('.rt-link', { hasText: 'Crucible Combine' }).click()
  await expect(title(page)).toHaveText('Crucible Combine')
  await page.locator('.wiki-view .rt-hatnote .rt-link', { hasText: 'Solar Concord § The price of peace' }).click()
  await expect(title(page)).toHaveText('Solar Concord')
  await expect(current(page)).toHaveText('The price of peace')
  consoleIsClean()
})

test('a footnote mark leads to its note and the note back to the text', async ({ page }) => {
  await openHash(page, '#/wiki/Wikitext_Example')
  const inView = async locator => {
    const [box, area] = await Promise.all([locator.boundingBox(), scroller(page).boundingBox()])
    return box.y >= area.y && box.y + box.height <= area.y + area.height
  }
  const mark = page.locator('.wiki-view button.rt-ref-link').first()
  await expect(mark).toHaveText('[1]')
  await expect(mark).toHaveAttribute('title', 'Note 1: Demonstration footnote: no factual claim is attached to this placeholder.')
  const note = page.locator('.wiki-view .rt-note[data-note="1"]')
  expect(await inView(note)).toBe(false)
  await mark.click()
  await expect.poll(() => inView(note)).toBe(true)
  await expect(note).toHaveClass(/is-target/)
  await expect(page.locator('.wiki-view .rt-note')).toHaveCount(1)
  await expect(page.locator('.wiki-view .rt-ref-link[data-note="1"]')).toHaveCount(2)
  await note.locator('.rt-note-back').click()
  await expect.poll(() => inView(mark)).toBe(true)
})

test('notice boxes, a gallery and a Markdown article with alerts and footnotes', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await editArticle(page, 'jump-ships.wiki', append('{{Stub}}'))
  await editArticle(page, 'settlement-chronicle.wiki', after('== First passage ==', '<gallery>\nFile:earth.jpg|[[Earth]] before the first passage\nFile:solar/moon-overview.jpg|The Moon, where the expedition gathered\n</gallery>'))
  await editArticle(page, 'free-tide.md', text => append('> [!WARNING]\n> No crew may follow the silent convoy without the approval of the port council.\n\n{{See also|Quantum Gates#Ownership}}\n\n[^charter]: Fictional source: the first port charter of Thalassa.\n[^log]: The log stops in 2411 and resumes eleven hours later.')(
    text.replace('distant assemblies.', 'distant assemblies.[^charter]').replace('empty navigation log.', 'empty navigation log.[^log]')))
  await openHash(page, '#/wiki/Quantum_Gates')
  await expect(page.locator('.wiki-view .rt-notice.is-warning .rt-notice-title')).toHaveText('[!] WARNING')
  await page.locator('.map-legend .navbox-list .navbox-link', { hasText: 'Jump Ships' }).click()
  await expect(page.locator('.wiki-view .rt-notice.is-stub')).toContainText('This article is a stub')

  await page.locator('.map-legend .navbox-list .navbox-link', { hasText: 'Settlement Chronicle' }).click()
  const items = page.locator('.wiki-view .rt-gallery-item')
  await expect(items).toHaveCount(2)
  await expect(items.first().locator('figcaption')).toHaveText('Earth before the first passage')

  await page.locator('.map-legend .navbox-list .navbox-link', { hasText: 'Free Tide' }).click()
  await expect(page.locator('.wiki-view .rt-notice.is-warning')).toContainText('without the approval of the port council')
  await expect(page.locator('.wiki-view .rt-hatnote')).toHaveText('See also: Quantum Gates § Ownership')
  await expect(page.locator('.wiki-view .rt-note')).toHaveText(['[1]Fictional source: the first port charter of Thalassa.', '[2]The log stops in 2411 and resumes eleven hours later.'])
  consoleIsClean()
})

test('another name of an article opens it and says so', async ({ page }) => {
  await editArticle(page, 'settlement-chronicle.wiki', append('The [[Tide|port councils]] keep their own copy of this record.'))
  await openHash(page, '#/wiki/Combine')
  await expect(title(page)).toHaveText('Crucible Combine')
  await expect(page.locator('.wiki-redirect')).toHaveText('(redirected from “Combine”)')
  await expect.poll(() => hashOf(page)).toBe('#/wiki/Crucible_Combine')
  await page.locator('.map-legend .navbox-list .navbox-link', { hasText: 'Settlement Chronicle' }).click()
  await expect(page.locator('.wiki-redirect')).toHaveCount(0)
  await page.locator('.wiki-view .rt-link', { hasText: 'port councils' }).click()
  await expect(title(page)).toHaveText('Free Tide')
  await expect(page.locator('.wiki-redirect')).toHaveText('(redirected from “Tide”)')
  expect(hashOf(page)).toBe('#/wiki/Free_Tide')
  await page.goBack()
  await expect(title(page)).toHaveText('Settlement Chronicle')
})

test.describe('reading on a wide screen', () => {
  test.use({ viewport: { width: 1920, height: 905 } })

  const fontOf = locator => locator.evaluate(node => {
    const { fontFamily, fontSize } = getComputedStyle(node)
    return `${fontFamily.split(',')[0].replace(/"/g, '')} ${fontSize}`
  })

  test('an article is set in a pixel font for reading, across the whole screen', async ({ page }) => {
    await openHash(page, '#/wiki/Solar_Concord')
    const text = page.locator('.wiki-view .wiki-text')
    const paragraph = text.locator('> .rt-p').first()
    expect(await fontOf(paragraph)).toBe('Ark Pixel 10 16px')
    await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Ark Pixel 10"', 'Aa'))).toBe(true)
    await expect(paragraph).toHaveCSS('text-align', 'justify')
    await expect(paragraph).toHaveCSS('text-indent', '32px')
    await expect(paragraph).toHaveCSS('line-height', '24px')
    expect(await fontOf(text.locator('.rt-h2').first())).toBe('Tiny5 24px')
    const [body, article] = await Promise.all([page.locator('.wiki-view .wiki-body').boundingBox(), text.boundingBox()])
    expect(body.x + body.width - (article.x + article.width)).toBeLessThanOrEqual(48)
  })

  test('the menu of the wiki sets the size of the text, kept in the browser', async ({ page }) => {
    await openHash(page, '#/wiki/Solar_Concord')
    const paragraph = page.locator('.wiki-view .wiki-text > .rt-p').first()
    const button = page.locator('.wiki-view .wiki-menu-button')
    await button.click()
    const menu = page.locator('.wiki-view .dos-menu')
    await expect(menu.locator('.dos-menu-title')).toHaveText('WIKI.EXE')
    await menu.locator('.dos-menu-option', { hasText: '20' }).click()
    expect(await fontOf(paragraph)).toBe('Ark Pixel 10 20px')
    await expect(paragraph).toHaveCSS('line-height', '30px')
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(page.locator('.wiki-view')).toBeVisible()

    await page.reload()
    await waitForView(page, 'wiki')
    expect(await fontOf(paragraph)).toBe('Ark Pixel 10 20px')
    await button.click()
    await menu.locator('.dos-menu-item', { hasText: 'Reset' }).click()
    expect(await fontOf(paragraph)).toBe('Ark Pixel 10 16px')
    await expect(menu).toHaveCount(0)
  })

  test('the text is one on the map and in the wiki: one font, one size for all', async ({ page }) => {
    await openHash(page, '#/system/sol/3')
    const data = page.locator('.window-data .planet-lore-text .rt-p').first()
    const lore = page.locator('.lore-panel .lore-text .rt-p').first()
    await expect(data).toBeVisible({ timeout: 20_000 })
    await expect(lore).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => fontOf(data)).toBe('Ark Pixel 10 16px')
    await expect(data).toHaveCSS('text-align', 'justify')
    await expect(data).toHaveCSS('text-indent', '32px')
    await expect.poll(() => fontOf(lore)).toBe('Ark Pixel 10 16px')
    await expect(lore).toHaveCSS('text-align', 'left')

    await page.locator('.window-data .button-menu').click()
    await page.locator('.window-data .dos-menu-option', { hasText: '24' }).click()
    await expect.poll(() => fontOf(data)).toBe('Ark Pixel 10 24px')
    await expect(data).toHaveCSS('line-height', '36px')
    await expect.poll(() => fontOf(lore)).toBe('Ark Pixel 10 24px')
    await openHash(page, '#/wiki/Solar_Concord')
    const article = page.locator('.wiki-view .wiki-text > .rt-p').first()
    await expect.poll(() => fontOf(article)).toBe('Ark Pixel 10 24px')
    await page.locator('.wiki-view .wiki-menu-button').click()
    await page.locator('.wiki-view .dos-menu-item', { hasText: 'Reset settings' }).click()
    await expect.poll(() => fontOf(article)).toBe('Ark Pixel 10 16px')
  })
})

const card = page => page.locator('.wiki-view .rt-infobox')
const cardRows = page => card(page).locator('.rt-infobox-row')

test('the main page is laid out with templates: a banner, boxes, tiles and the sections', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/wiki')
  await expect(title(page)).toHaveText('Main Page')
  const text = page.locator('.wiki-view .wiki-text')
  const logo = text.locator('.rt-banner img.pixel-logo')
  await expect(logo).toHaveAttribute('alt', 'GALAXY ARCHIVE')
  await expect(logo).toHaveCSS('image-rendering', 'pixelated')
  expect((await logo.boundingBox()).width).toBeGreaterThan(300)
  await expect(text.locator('.rt-banner-caption')).toHaveText('Welcome to the archive: 12 articles and 42 places on the map')
  await expect(text.locator('.rt-links .rt-links-item')).toHaveCount(6)
  const boxes = text.locator('.rt-boxes .rt-box')
  await expect(boxes.locator('.rt-box-name')).toHaveText(['New to the archive', 'Factions', 'Technology', 'Chronicle'])
  await expect(boxes.locator('.rt-box-icon')).toHaveCount(4)
  // Signs of 16 x 16 at a whole scale keep every pixel square: x2 in a box, x3 on the portal.
  expect(await boxes.locator('.rt-box-icon').first().boundingBox()).toMatchObject({ width: 32, height: 32 })
  await expect(boxes.first()).toHaveCSS('border-top-color', 'rgb(47, 143, 70)')
  await expect(page.locator('.wiki-view .wiki-article > .wiki-portal')).toHaveCount(0)
  const portal = text.locator('.wiki-portal')
  await expect(portal.locator('.portal-welcome')).toHaveCount(0)
  await expect(portal.locator('.portal-box > .portal-head .portal-title')).toHaveText(['History', 'Factions', 'Technology', 'Examples', 'Places', 'Other pages', 'Service pages'])
  await expect(portal.locator('.portal-box[data-group="places"] .portal-row-title').first()).toHaveText('Solar Concord · 2 systems')
  expect(await portal.locator('.portal-icon').first().boundingBox()).toMatchObject({ width: 48, height: 48 })
  await text.locator('.rt-tile', { hasText: 'Crucible Combine' }).locator('.rt-link').click()
  await expect(title(page)).toHaveText('Crucible Combine')
  consoleIsClean()
})

test('the page of the signs shows every sign with its name', async ({ page }) => {
  await openHash(page, '#/wiki/Special:Icons')
  await expect(title(page)).toHaveText('Icons')
  const icons = page.locator('.wiki-view .special-icon')
  const count = await icons.count()
  expect(count).toBeGreaterThanOrEqual(50)
  await expect(page.locator('.wiki-view .special-note')).toContainText(`Icons: ${count}.`)
  await expect(icons.first().locator('.special-icon-name')).toHaveText('star')
  for (const name of ['planet', 'gate', 'map', 'people', 'wrench', 'blackhole', 'scroll', 'robot']) {
    await expect(page.locator(`.wiki-view .special-icon[data-icon="${name}"] img`)).toHaveAttribute('src', /^data:image\/svg\+xml,/)
  }
  expect(await icons.first().locator('img').boundingBox()).toMatchObject({ width: 64, height: 64 })
  for (const name of ['blackhole', 'telescope', 'satellite']) {
    const fits = await page.locator(`.wiki-view .special-icon[data-icon="${name}"]`).evaluate(cell => {
      const label = cell.querySelector('.special-icon-name')
      return label.scrollWidth <= cell.clientWidth
    })
    expect(fits, name).toBe(true)
  }
})

test('a place has a card from the map that leads to its neighbours', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/wiki/Sol')
  await expect(card(page).locator('.rt-infobox-title')).toHaveText('Sol')
  await expect(cardRows(page).locator('.rt-infobox-key')).toHaveText(['Type', 'Faction', 'Sector', 'Planets', 'Hyperlines'])
  await expect(cardRows(page).nth(3)).toContainText('Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune')
  await cardRows(page).nth(3).locator('.rt-link', { hasText: 'Earth' }).click()
  await expect(title(page)).toHaveText('Earth')
  await expect(card(page)).toHaveCount(1)
  await expect(cardRows(page).locator('.rt-infobox-key')).toHaveText(['name', 'class', 'System', 'Faction', 'Orbit', 'Moons', 'Stations'])
  await cardRows(page).nth(6).locator('.rt-link').click()
  await expect(title(page)).toHaveText('Exodus Station')
  await expect(cardRows(page).first()).toHaveText(/station · ring/)
  consoleIsClean()
})

test('the article of a faction lists its systems', async ({ page }) => {
  await openHash(page, '#/wiki/Solar_Concord#Systems')
  await expect(current(page)).toHaveText('Systems')
  const list = page.locator('.wiki-view .rt-heading', { hasText: 'Systems' }).locator('xpath=following-sibling::ul[1]')
  await expect(list.locator('li')).toHaveCount(2)
  await expect(list).toContainText('Sol — Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune')
  await list.locator('.rt-link', { hasText: /^Asterion$/ }).click()
  await expect(title(page)).toHaveText('Asterion')
})

const special = page => page.locator('.wiki-view .wiki-special')

test('/ opens the line of search: a page by its name, or the results', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/wiki/Galaxy')
  await page.keyboard.press('/')
  const input = page.locator('.wiki-search input')
  await expect(input).toBeFocused()
  await input.pressSequentially('combine')
  await expect(page.locator('.search-suggestion').first()).toContainText('Crucible Combine')
  await page.keyboard.press('Escape')
  await expect(input).toHaveCount(0)
  await expect(page.locator('.wiki-path')).toBeVisible()
  expect(hashOf(page)).toBe('#/wiki/Galaxy')

  await page.keyboard.press('/')
  await input.pressSequentially('quantum gates')
  await page.keyboard.press('Enter')
  await expect(title(page)).toHaveText('Quantum Gates')

  await page.locator('.wiki-action', { hasText: 'SEARCH' }).click()
  await input.pressSequentially('recharge')
  await page.keyboard.press('Enter')
  expect(hashOf(page)).toBe('#/wiki/Special:Search/recharge')
  await expect(page.locator('.wiki-path')).toHaveText('C:\\WIKI> FIND "recharge" *.TXT')
  const results = special(page).locator('.search-result')
  await expect(results.locator('> div .special-link')).toHaveText(['Gate Drive', 'Jump Ships'])
  await expect(results.first().locator('.search-hit').first()).toHaveText('recharge')
  await results.first().locator('.special-link').first().click()
  await expect(title(page)).toHaveText('Gate Drive')
  await page.goBack()
  await expect(title(page)).toHaveText('Search: recharge')
  consoleIsClean()
})

test('categories: at the foot of an article, their pages and the list of them', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/wiki/Crucible_Combine')
  const footer = page.locator('.wiki-view .wiki-footer')
  await expect(footer.locator('.wiki-categories .wiki-footer-link')).toHaveText(['Factions'])
  await footer.locator('.wiki-footer-link', { hasText: 'Factions' }).click()
  await expect(title(page)).toHaveText('Category:Factions')
  await expect(special(page).locator('.special-letter .special-link')).toHaveText(['Crucible Combine', 'Free Tide', 'Solar Concord'])
  await special(page).locator('.special-note .special-link').click()
  await expect(title(page)).toHaveText('Categories')
  await expect(special(page).locator('.special-list .special-link')).toContainText(['Moons', 'Planets', 'Star systems', 'Stations'])
  consoleIsClean()
})

test('a red link opens the page nobody wrote, with who waits for it', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  // Every link of the site leads to a written page.
  await editArticle(page, 'quantum-gates.wiki', append('Departure slots are filed with the [[Passage Registry]].'))
  await editArticle(page, 'nacre-beacon.wiki', append('Copies of every recording go to the [[Passage Registry]].'))
  await openHash(page, '#/wiki/Quantum_Gates')
  await page.locator('.wiki-view .rt-link.is-missing', { hasText: 'Passage Registry' }).click()
  await expect(page.locator('.wiki-missing-title')).toHaveText('ARTICLE NOT FOUND')
  await expect(page.locator('.wiki-missing-links .wiki-footer-link')).toHaveText(['Nacre Beacon', 'Quantum Gates'])
  await page.locator('.map-legend .navbox-list .navbox-link', { hasText: 'Wanted pages' }).click()
  await expect(special(page).locator('.wanted-item .special-link.is-missing')).toHaveText(['Passage Registry'])
  consoleIsClean()
})

test('what links here, all pages and a random page', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/wiki/Earth')
  const backlinks = page.locator('.wiki-view .wiki-footer-link.is-backlinks')
  await expect(backlinks).toHaveText(/\[ LINKS HERE: \d+ \]/)
  await backlinks.click()
  await expect(title(page)).toHaveText('What links here: Earth')
  await expect(special(page).locator('.special-list .special-link')).toContainText(['Sol', 'Solar Concord'])

  await page.locator('.map-legend .navbox-list .navbox-link', { hasText: 'All pages' }).click()
  await expect(special(page).locator('.special-note')).toHaveText('Pages in archive: 55.')
  await expect(special(page).locator('.special-char').first()).toHaveText('[A]')

  await page.locator('.wiki-action', { hasText: 'RANDOM' }).click()
  await expect(special(page)).toHaveCount(0)
  const first = await title(page).textContent()
  await page.locator('.wiki-action', { hasText: 'RANDOM' }).click()
  await expect(title(page)).not.toHaveText(first)
  consoleIsClean()
})

// Was: the looks of a banner were names in the code.
test('Special:Banners shows every look of a banner; less motion keeps the logos still', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/wiki/Special:Banners')
  await expect(title(page)).toHaveText('Banners')
  const part = name => special(page).locator(`.special-banners[data-part="${name}"] .special-sample`)
  await expect(part('style')).toHaveCount(7)
  await expect(part('animation')).toHaveCount(6)
  await expect(part('frame')).toHaveCount(3)
  await expect(special(page).locator('.pixel-logo.is-bounce .pixel-logo-letter').first()).toBeVisible()
  await expect(special(page).locator('.pixel-logo.is-bounce .pixel-logo-letter').first()).toHaveCSS('animation-name', /pixel-logo-bounce/)
  consoleIsClean()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await waitForView(page, 'wiki')
  await expect(part('animation')).toHaveCount(6)
  await expect(special(page).locator('img.pixel-logo').first()).toBeVisible()
  await expect(special(page).locator('.pixel-logo.is-animated')).toHaveCount(0)
})

test('a page that does not exist says so, Esc goes back to the map', async ({ page }) => {
  await openHash(page, '#/wiki/No_such_page')
  await expect(page.locator('.wiki-missing')).toContainText('ARTICLE NOT FOUND')
  expect(hashOf(page)).toBe('#/wiki/No_such_page')
  await page.keyboard.press('Escape')
  await waitForView(page, 'galaxy')
  expect(hashOf(page)).toBe('')
})

// The dev server has no preview pages (the build makes them), so COPY LINK gives the address with "#".
test('COPY LINK of the dev server gives the address of the page that opens it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openHash(page, '#/wiki/Earth')
  await page.locator('.wiki-copy-link').click()
  await expect(page.locator('.wiki-copy-link')).toHaveText('[ COPIED ]')
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/^http:\/\/localhost:\d+\/#\/wiki\/Earth$/)
})
