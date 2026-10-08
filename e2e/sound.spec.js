import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openHash, worldMap, serveMap, waitForView, watchConsole, withStores } from './helpers.js'

const journal = page => withStores(page, ({ sound }) => ({ names: sound.recent(), count: sound.playedCount() }))
const AMBIENT = new Set(['typing', 'static', 'hover'])
// `before` is a count of the journal.
async function heardSince(page, before, { all = false } = {}) {
  const { names, count } = await journal(page)
  const since = count - before ? names.slice(-(count - before)) : []
  return all ? since : since.filter(name => !AMBIENT.has(name))
}
// `all` keeps the ambient sounds too.
async function soundsOf(page, action, options) {
  const { count } = await journal(page)
  await action()
  return heardSince(page, count, options)
}
// A browser lets a page sound only after a press.
const press = page => page.keyboard.press('Shift')

test('a menu of a window opens, is walked, ticks an option and closes with its own sounds, not the click', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/system/sol')
  await press(page)
  const opened = await soundsOf(page, () => page.locator('.window-system .button-menu').click())
  expect(opened).toContain('menuOpen')
  expect(opened).not.toContain('click')
  await expect(page.locator('.window-system .dos-menu')).toBeVisible()

  expect(await soundsOf(page, () => page.keyboard.press('ArrowDown'))).toEqual(['menuMove'])
  const option = page.locator('.window-system .dos-menu [role="menuitemcheckbox"]').first()
  const ticked = (await option.getAttribute('aria-checked')) === 'true'
  const toggled = await soundsOf(page, () => option.click())
  expect(toggled).toEqual([ticked ? 'toggleOff' : 'toggleOn'])
  await option.click()

  expect(await soundsOf(page, () => page.keyboard.press('Escape'))).toContain('menuClose')
  consoleIsClean()
})

test('the sights lock onto a star, the jump into its system and the way back are heard', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/')
  await press(page)
  const sol = page.locator('.galaxy-star-container[data-star-id="sol"]')
  const box = await sol.boundingBox()
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  expect(await soundsOf(page, () => page.mouse.move(center.x, center.y, { steps: 4 }))).toContain('starLock')

  const jump = await soundsOf(page, async () => {
    await page.mouse.click(center.x, center.y)
    await waitForView(page, 'system')
  })
  expect(jump).toEqual(expect.arrayContaining(['warp', 'screenOn']))
  expect(jump).not.toContain('screenOff')

  const back = await soundsOf(page, async () => {
    await withStores(page, ({ ui }) => ui.closeSystemView())
    await waitForView(page, 'galaxy')
  })
  expect(back).toEqual(expect.arrayContaining(['screenOff', 'screenOn']))
  consoleIsClean()
})

test('the breaker, a planet chosen, its lore printed and a bad DOS command sound', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/system/sol')
  await press(page)

  const earth = page.locator('.planet-list-item', { has: page.locator('.planet-list-name', { hasText: /^EARTH$/ }) })
  const chosen = await soundsOf(page, async () => {
    await earth.click()
    await page.waitForTimeout(1000)
  }, { all: true })
  expect(chosen).toContain('planetSelect')
  const typing = chosen.filter(name => name === 'typing').length
  expect(typing).toBeGreaterThan(3)
  // At most one in 45 ms (sound/engine.js), not one a letter.
  expect(typing).toBeLessThanOrEqual(1000 / 45 + 2)

  const closed = await soundsOf(page, () => withStores(page, ({ ui }) => ['system', 'data', 'visual'].forEach(id => ui.minimizeWindow(id))))
  expect(closed).toContain('windowClose')
  await expect(page.locator('.ms-dos-background .dos-input')).toBeFocused()
  const { count } = await journal(page)
  await page.keyboard.type('foo')
  await page.keyboard.press('Enter')
  await expect.poll(() => heardSince(page, count)).toContain('badCommand')
  consoleIsClean()
})

test('the mode breaker clicks as a switch, not as a button', async ({ page }) => {
  await openHash(page, '#/')
  await press(page)
  const thrown = await soundsOf(page, () => page.locator('.legend-dock .mode-breaker').click())
  expect(thrown).toContain('breaker')
  expect(thrown).not.toContain('click')
})

const listButton = page => page.locator('.music-player .panel-titlebar .button-list')
const sfxLabel = page => page.locator('.music-player .player-volume .sfx-control .volume-label')

// Was: the sound effects hid behind a square-wave button nobody knew, on a screen of their own.
test('the label SFX turns the sound effects off and on, heard both ways, and remembered', async ({ page }) => {
  await openHash(page, '#/')
  await press(page)
  await page.locator('.player-controls').waitFor()
  expect(await soundsOf(page, () => listButton(page).click())).toContain('click')

  expect(await soundsOf(page, () => sfxLabel(page).click())).toEqual(['toggleOff'])
  await expect(page.locator('.music-player .player-volume .sfx-control')).toHaveClass(/is-off/)
  expect(await withStores(page, ({ sound }) => sound.on)).toBe(false)

  expect(await soundsOf(page, async () => {
    await listButton(page).click()
    await page.locator('.legend-dock .mode-breaker').click()
    await page.waitForTimeout(500)
  })).toEqual([])

  await page.reload()
  await waitForView(page, 'wiki')
  expect(await withStores(page, ({ sound }) => sound.on)).toBe(false)
  await press(page)
  expect(await soundsOf(page, () => sfxLabel(page).click())).toEqual(['toggleOn'])
})

test('the bar SFX has its own volume beside the music, tells it and lets it be heard', async ({ page }) => {
  await openHash(page, '#/')
  await press(page)
  const slider = page.locator('.music-player .player-volume .sfx-control .volume-bar')
  await expect(slider).toHaveAttribute('aria-valuenow', '35')
  await slider.focus()
  const sampled = await soundsOf(page, async () => {
    await page.keyboard.press('PageUp')
    await expect(slider).toHaveAttribute('aria-valuenow', '45')
  })
  expect(sampled).toContain('click')
  await expect(page.locator('.music-player .panel-status-left')).toHaveText('SFX 45%')
  expect(await withStores(page, ({ sound }) => sound.volume)).toBeCloseTo(0.45)
  await expect(page.locator('.music-player .music-control .volume-bar')).toHaveAttribute('aria-valuenow', '60')
})

test('a map replaces a sound with its own file and silences another; Special:Sounds lists them all', async ({ page }) => {
  const warnings = []
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()) })
  const map = worldMap()
  map.sounds = { volume: 0.5, click: 'sounds/beep.wav', hover: false }
  await serveMap(page, map)
  const wav = readFileSync(new URL('../src/assets/sounds/breaker.wav', import.meta.url))
  await page.route('**/sounds/beep.wav', route => route.fulfill({ contentType: 'audio/wav', body: wav }))

  await openHash(page, '#/wiki/Special:Sounds')
  const asked = page.waitForRequest(request => request.url().endsWith('/sounds/beep.wav'))
  await press(page)
  await asked
  expect(await withStores(page, ({ sound }) => sound.volume)).toBe(0.5)

  const rows = page.locator('.wiki-view .special-sound')
  await expect(rows).toHaveCount(28)
  await expect(rows.filter({ hasText: 'click' }).first().locator('.special-sound-tag')).toHaveText('FILE')
  await expect(page.locator('.wiki-view .special-sound[data-sound="hover"] .special-sound-tag')).toHaveText('SILENT')

  expect(await soundsOf(page, () => page.locator('.special-sound[data-sound="success"] .special-sound-play').click())).toEqual(['success'])
  expect(await soundsOf(page, () => page.locator('.special-sound[data-sound="hover"] .special-sound-play').click())).toEqual([])
  expect(await soundsOf(page, () => page.locator('.special-sound[data-sound="hover"] .special-sound-play').hover(), { all: true })).not.toContain('hover')
  expect(warnings.filter(text => text.includes('cannot be played'))).toEqual([])
})

// Was: with the sound effects turned off, ▶ of Special:Sounds was silent and said nothing.
test('▶ of Special:Sounds plays its sound though the visitor turned the sound effects off', async ({ page }) => {
  await openHash(page, '#/wiki/Special:Sounds')
  await press(page)
  await page.locator('.player-volume .sfx-control .volume-label').click()
  expect(await withStores(page, ({ sound }) => sound.on)).toBe(false)
  expect(await soundsOf(page, () => page.locator('.special-sound[data-sound="success"] .special-sound-play').click())).toEqual(['success'])
  expect(await withStores(page, ({ sound }) => sound.on)).toBe(false)
})

test('a map without sound effects has no SFX bar and says so on Special:Sounds', async ({ page }) => {
  const map = worldMap()
  map.sounds = false
  await serveMap(page, map)
  await openHash(page, '#/')
  await press(page)
  await page.locator('.player-controls').waitFor()
  await expect(page.locator('.music-player .sfx-control')).toHaveCount(0)
  await expect(page.locator('.music-player .music-control')).toBeVisible()
  expect(await soundsOf(page, () => listButton(page).click())).toEqual([])
  await openHash(page, '#/wiki/Special:Sounds')
  await expect(page.locator('.wiki-view .special-note')).toHaveText('The map file turned the sound effects of this site off ("sounds": false).')
})

// Was: an alarm and the crackle of every glitch played over the music of the hack.
test('SYNDICATE.EXE is heard with its own music only', async ({ page }) => {
  await openHash(page, '#/system/sol')
  await press(page)
  // Let the lore of the star finish printing first: its blips are not the hack's.
  await expect(page.locator('.window-data .rt-cursor')).toHaveCount(0, { timeout: 10_000 })
  await page.waitForTimeout(300)
  const during = await soundsOf(page, async () => {
    await withStores(page, ({ ui }) => ui.startSyndicateHack())
    await page.waitForTimeout(2000)
    await page.keyboard.press('Shift')
    await page.mouse.click(10, 10)
  }, { all: true })
  expect(during).toEqual([])
  expect(await withStores(page, ({ sound }) => sound.on)).toBe(true)
})

// Was: the wiki contents hissed half a second on every page switch; then, with the hiss gone, pages opened silently.
test('the screens hiss when the map switches; an article of the wiki opens with a chirp', async ({ page }) => {
  await openHash(page, '#/wiki/Earth')
  await press(page)
  const turned = await soundsOf(page, async () => {
    await withStores(page, ({ ui }) => ui.openWiki('Mars'))
    await expect(page.locator('.lore-panel .panel-title')).toHaveText('Mars')
    await page.waitForTimeout(600)
  }, { all: true })
  expect(turned).not.toContain('static')
  expect(turned).toContain('wikiPage')

  const link = page.locator('.wiki-view .wiki-text .rt-link').first()
  const followed = await soundsOf(page, async () => {
    const before = page.url()
    await link.click()
    await expect.poll(() => page.url()).not.toBe(before)
  })
  expect(followed).toEqual(['wikiPage'])

  const back = await soundsOf(page, async () => {
    await withStores(page, ({ ui }) => ui.closeWiki())
    await waitForView(page, 'system')
    await page.waitForTimeout(600)
  }, { all: true })
  expect(back).toContain('static')
})

// Was: PLANET-DATA printed the lore of Earth for some ten seconds, and its command without a sound.
test('PLANET-DATA prints as fast as the lore panel, the command blipping too', async ({ page }) => {
  await openHash(page, '#/system/sol')
  await press(page)
  const earth = page.locator('.planet-list-item', { has: page.locator('.planet-list-name', { hasText: /^EARTH$/ }) })
  const lore = page.locator('.window-data .planet-lore-text')
  const command = await soundsOf(page, async () => {
    await earth.click()
    await expect(page.locator('.window-data')).toContainText('READ EARTH.txt')
  }, { all: true })
  expect(command).toContain('typing')
  // The lore of Earth is some 18,000 letters: done well before the old ten seconds.
  const started = Date.now()
  await expect(lore.locator('.rt-cursor')).toHaveCount(0, { timeout: 5_000 })
  expect(Date.now() - started).toBeLessThan(5_000)
  await expect(lore).toContainText('humanity')
})

// Was: nothing told the visitor that the sound waits for a press; the SFX label looked on while the page was silent.
test('the SFX label blinks until the first press lets the page sound', async ({ page }) => {
  await openHash(page, '#/')
  const control = page.locator('.player-volume .sfx-control')
  await expect(control).toHaveClass(/is-waiting/)
  await expect(control.locator('.volume-label')).toHaveAttribute('aria-label', 'Sound effects: press anywhere on the page to hear them')
  await press(page)
  await expect(control).not.toHaveClass(/is-waiting/)
  await expect(control.locator('.volume-label')).toHaveAttribute('aria-label', 'Turn the sound effects off')
})
