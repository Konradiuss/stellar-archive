import { expect, test } from '@playwright/test'
import { center, openHash, waitForView, watchConsole, withStores } from './helpers.js'

const box = locator => locator.boundingBox()
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const buttonsOnScreen = (page, selector) => page.evaluate(selector => [...document.querySelectorAll(`${selector} button`)]
  .map(button => button.getBoundingClientRect())
  .filter(rect => rect.width > 0)
  .every(rect => rect.left >= 0 && rect.right <= window.innerWidth + 0.5), selector)

test.describe('a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  // Was: the text sat over a map of a hundred pixels, the legend under it.
  test('shows the main screen alone, the breaker and a one-line player under it', async ({ page }) => {
    const consoleIsClean = watchConsole(page)
    await openHash(page, '#/')
    await expect(page.locator('.lore-panel')).toHaveCount(0)
    await expect(page.locator('.map-legend')).toHaveCount(0)
    await expect(page.locator('.legend-dock .mode-breaker')).toBeVisible()
    await expect(page.locator('.music-player')).toHaveClass(/is-compact/)
    const screen = await box(page.locator('.canvas-area'))
    expect(screen.height).toBeGreaterThan(844 * 0.7)
    const [breaker, player] = await Promise.all([box(page.locator('.legend-dock')), box(page.locator('.music-player'))])
    expect(breaker.y).toBeGreaterThan(screen.y + screen.height - 1)
    expect(player.x).toBeGreaterThan(breaker.x + breaker.width - 1)
    // A thinner casing: one pixel of the sprite is one pixel of the screen.
    await expect(page.locator('.canvas-area')).toHaveCSS('border-left-width', '12px')
    expect(await noSideScroll(page)).toBe(true)
    consoleIsClean()
  })

  // Was: three windows of a third of a phone each.
  test('opens a system one window at a time, the taskbar switching between them', async ({ page }) => {
    await openHash(page, '#/system/sol')
    await expect(page.locator('.window-system')).toBeVisible()
    await expect(page.locator('.window-data')).toBeHidden()
    await expect(page.locator('.window-visual')).toBeHidden()
    await expect(page.locator('.window-system .button-minimize')).toHaveCount(0)
    // Was: two long .EXE names on two rows and the hints of keys, cut.
    const tabs = page.locator('.taskbar-tab')
    await expect(tabs).toHaveText(['[ SYSTEM ]', '[ DATA ]', '[ VISUAL ]'])
    await expect(page.locator('.taskbar-tab.is-current')).toHaveText('[ SYSTEM ]')
    await expect(page.locator('.taskbar-hint')).toHaveCount(0)
    const [first, last] = await Promise.all([box(tabs.first()), box(tabs.last())])
    expect(Math.abs(first.y - last.y)).toBeLessThan(2)
    await page.locator('.taskbar-tab[data-window="visual"]').click()
    await expect(page.locator('.window-visual')).toBeVisible()
    await expect(page.locator('.window-system')).toBeHidden()
    await expect(page.locator('.taskbar-tab.is-current')).toHaveText('[ VISUAL ]')
    await page.locator('.taskbar-tab[data-window="system"]').click()
    await expect(page.locator('.window-system')).toBeVisible()

    await page.keyboard.press('3')
    await expect(page).toHaveURL(/#\/system\/sol\/3$/)
    await expect(page.locator('.window-data')).toBeVisible()
    await expect(page.locator('.window-system')).toBeHidden()
  })

  test('reads the lore of a place in the wiki: the breaker opens its page', async ({ page }) => {
    await openHash(page, '#/system/sol')
    await page.locator('.legend-dock .mode-breaker').click()
    await waitForView(page, 'wiki')
    await expect(page.locator('.wiki-view .wiki-title')).toHaveText('Sol')
  })

  // Was: the contents and the navigation were in panels a phone has no room for.
  test('opens the contents and the navigation over the article', async ({ page }) => {
    const consoleIsClean = watchConsole(page)
    await openHash(page, '#/wiki/Solar_Concord')
    const sheet = page.locator('.wiki-sheet')
    await expect(sheet).toHaveCount(0)

    // Was: three rows of buttons on a small phone; the rest went to the menu.
    await expect(page.locator('.wiki-actions .wiki-action')).toHaveText(['[ CONTENTS ]', '[ NAV ]', /MENU/])

    await page.locator('.wiki-open-contents').click()
    await expect(sheet.locator('.wiki-sheet-file')).toHaveText('CONTENTS.TXT')
    await sheet.locator('.contents-link', { hasText: 'Neighbours' }).click()
    await expect(sheet).toHaveCount(0)

    await page.locator('.wiki-open-nav').click()
    await expect(sheet.locator('.wiki-sheet-file')).toHaveText('NAVBOX.DAT')
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await waitForView(page, 'wiki')

    await page.locator('.wiki-open-nav').click()
    await sheet.locator('.navbox-link', { hasText: 'Crucible Combine' }).first().click()
    await expect(page).toHaveURL(/#\/wiki\/Crucible_Combine$/)
    await expect(sheet).toHaveCount(0)
    expect(await noSideScroll(page)).toBe(true)
    consoleIsClean()
  })
})

test.describe('a small phone', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test('still gives the map most of the screen, with nothing to scroll sideways', async ({ page }) => {
    await openHash(page, '#/')
    const screen = await box(page.locator('.canvas-area'))
    expect(screen.height).toBeGreaterThan(568 * 0.7)
    expect(await noSideScroll(page)).toBe(true)
  })

  // Was: the buttons of the player went off the left edge, only the track showed.
  test('keeps every button of the player, the system and the wiki on the screen', async ({ page }) => {
    await openHash(page, '#/system/sol/3')
    await expect(page.locator('.music-player .button-play')).toBeVisible()
    expect(await buttonsOnScreen(page, '.music-player')).toBe(true)
    expect(await buttonsOnScreen(page, '.system-view')).toBe(true)

    await openHash(page, '#/wiki/Earth')
    expect(await buttonsOnScreen(page, '.wiki-header')).toBe(true)
    const [contents, menu] = await Promise.all([box(page.locator('.wiki-open-contents')), box(page.locator('.wiki-menu-button'))])
    expect(Math.abs(contents.y - menu.y)).toBeLessThan(2)
    await expect(page.locator('.wiki-view .rt-infobox .rt-link').first()).toHaveCSS('text-align', 'left')
    await page.locator('.wiki-menu-button').click()
    await page.locator('.dos-menu').getByText('Search', { exact: true }).click()
    await expect(page.locator('.wiki-search input')).toBeVisible()
    expect(await noSideScroll(page)).toBe(true)
  })
})

// Was: an 88 px strip of 390 under the screen, and a tiny system with its caption under the window edge.
test('a phone on its side keeps its strip at the side, and its system large', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await openHash(page, '#/')
  await expect(page.locator('.lore-panel')).toHaveCount(0)
  await expect(page.locator('.music-player')).toHaveClass(/is-vertical/)
  const [screen, breaker, player] = await Promise.all(['.canvas-area', '.legend-dock', '.music-player'].map(selector => box(page.locator(selector))))
  expect(screen.height).toBeGreaterThan(390 * 0.9)
  expect(breaker.x + breaker.width).toBeLessThanOrEqual(screen.x + 1)
  expect(player.x + player.width).toBeLessThanOrEqual(screen.x + 1)
  expect(await buttonsOnScreen(page, '.music-player')).toBe(true)

  await openHash(page, '#/system/sol')
  await withStores(page, ({ systemSettings }) => systemSettings.set('system', 'speed', 0))
  const star = await center(page.locator('.star-container'))
  const neptune = await center(page.locator('.system-planet').last())
  expect(Math.hypot(neptune.x - star.x, neptune.y - star.y)).toBeGreaterThan(60)
  const [canvas, windowBox] = await Promise.all([box(page.locator('.system-orbit-canvas')), box(page.locator('.window-system'))])
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(windowBox.y + windowBox.height + 1)
})

// Was: the text was taller than the map; then the legend stood squeezed on the right of the text.
test('a tablet held upright: the map on top, the legend and the text side by side under it', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await openHash(page, '#/')
  const [screen, lore, legend, player] = await Promise.all(['.canvas-area', '.lore-panel', '.legend-dock', '.music-player'].map(selector => box(page.locator(selector))))
  expect(screen.height).toBeGreaterThan(lore.height)
  expect(Math.abs(lore.y - legend.y)).toBeLessThan(2)
  expect(legend.x + legend.width).toBeLessThanOrEqual(lore.x)
  expect(Math.abs(lore.width - legend.width)).toBeLessThan(4)
  expect(player.y).toBeGreaterThan(lore.y + lore.height - 1)
  expect(player.width).toBeGreaterThan(700)
  await expect(page.locator('.music-player')).toHaveClass(/is-compact/)
})

test('a computer keeps the screens side by side', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openHash(page, '#/')
  const [screen, lore] = await Promise.all([box(page.locator('.canvas-area')), box(page.locator('.lore-panel'))])
  expect(lore.x).toBeGreaterThan(screen.x + screen.width)
  expect(Math.round(lore.width)).toBe(320)
  await expect(page.locator('.music-player')).not.toHaveClass(/is-compact/)
})

test('a phone copies the link of a page from the menu of the wiki', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openHash(page, '#/wiki/Earth')
  await expect(page.locator('.wiki-copy-link')).toHaveCount(0)
  await page.locator('.wiki-menu-button').click()
  await page.locator('.dos-menu').getByText('Copy link', { exact: true }).click()
  await expect(page.locator('.wiki-status')).toContainText('LINK COPIED')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/#\/wiki\/Earth$/)
})
