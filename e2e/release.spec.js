import { expect, test } from '@playwright/test'
import { openHash, waitForView, watchConsole } from './helpers.js'

async function capture(page, name) {
  for (const screen of await page.locator('.retro-screen').all()) {
    await expect(screen).toHaveClass(/state-on/)
    await expect(screen).not.toHaveClass(/is-interfering/)
  }
  const lore = page.locator('.lore-panel .paged-lore')
  if (await lore.count() && await lore.getAttribute('data-state') === 'typing') {
    await lore.locator('.lore-area').click({ position: { x: 20, y: 20 } })
  }
  await page.mouse.move(2, 2)
  await page.screenshot({ path: `test-results/${name}.png`, animations: 'disabled' })
}

// Published content, deliberately without the historical regression fixture.
test('the release galaxy and main page show the new world', async ({ page }) => {
  const clean = watchConsole(page)
  await openHash(page, '')
  await expect(page.locator('.galaxy-star-container')).toHaveCount(8)
  await expect(page.locator('.legend')).toContainText('Solar Concord')
  await capture(page, 'release-galaxy')
  await page.locator('.legend-dock .mode-breaker').click()
  await waitForView(page, 'wiki')
  await expect(page.locator('.wiki-view .pixel-logo')).toHaveCount(1)
  await expect(page.locator('.wiki-view .wiki-text')).toContainText('Eight stars. Three rival powers.')
  await expect(page.locator('.wiki-view .wiki-text')).toContainText('Free Tide')
  await capture(page, 'release-main')
  clean()
})

test('Sol draws eight planets and opens its real moons and articles', async ({ page }) => {
  const clean = watchConsole(page)
  await openHash(page, '#/system/sol')
  await expect(page.locator('.system-planet')).toHaveCount(8)
  await capture(page, 'release-sol')
  await openHash(page, '#/system/sol/6')
  await expect(page.locator('.window-data .planet-lore-title')).toHaveText('SATURN')
  await expect(page.locator('.window-visual .planet-canvas').first()).toBeVisible()
  await openHash(page, '#/system/sol/5/2')
  await expect(page.locator('.window-data .planet-lore-title')).toHaveText('EUROPA')
  await page.locator('.legend-dock .mode-breaker').click()
  await waitForView(page, 'wiki')
  await expect(page.locator('.wiki-title')).toHaveText('Europa')
  await expect(page.locator('.wiki-view .wiki-text')).toContainText('CC BY-SA 4.0')
  await page.locator('.wiki-action', { hasText: 'SHOW ON MAP' }).click()
  await waitForView(page, 'system')
  await expect(page).toHaveURL(/#\/system\/sol\/5\/2$/)
  clean()
})

for (const [device, viewport] of [['desktop', { width: 1400, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  test(`Exodus Station orbits Earth and links to its wiki on ${device}`, async ({ page }) => {
    const clean = watchConsole(page)
    await page.setViewportSize(viewport)
    await openHash(page, '#/system/sol/3')
    await expect(page.locator('.window-data .planet-lore-title')).toHaveText('EARTH')
    if (device === 'phone') await page.locator('.taskbar-tab[data-window="visual"]').click()
    const visual = page.locator('.window-visual')
    await expect(visual.locator('.satellite-body, .satellite-tile')).toHaveCount(2)
    await expect(visual.getByRole('button', { name: 'Moon: Moon', exact: true })).toBeVisible()
    await expect(visual.getByRole('button', { name: 'Station: Exodus Station', exact: true }).locator('canvas')).toBeVisible()
    await capture(page, `release-earth-exodus-${device}`)
    if (device === 'phone') await page.locator('.taskbar-tab[data-window="data"]').click()
    await page.locator('.window-data .is-moons .satellite-link', { hasText: 'MOON' }).click()
    await expect(page).toHaveURL(/#\/system\/sol\/3\/1$/)
    await expect(page.locator('.window-data .planet-lore-title')).toHaveText('MOON')
    await page.locator('.terminal-link', { hasText: '<- EARTH' }).click()
    await page.locator('.window-data .is-stations .satellite-link', { hasText: 'EXODUS STATION' }).click()
    await expect(page).toHaveURL(/#\/system\/sol\/3\/2$/)
    await expect(page.locator('.window-data .planet-lore-title')).toHaveText('EXODUS STATION')
    await expect(page.locator('.window-data .planet-lore-orbit')).toContainText('STATION AT EARTH')
    if (device === 'phone') await page.locator('.taskbar-tab[data-window="visual"]').click()
    await expect(page.locator('.window-visual .station-visualization canvas')).toBeVisible()
    await capture(page, `release-exodus-${device}`)
    await page.locator('.mode-breaker').click()
    await waitForView(page, 'wiki')
    await expect(page.locator('.wiki-title')).toHaveText('Exodus Station')
    await expect(page.locator('.wiki-view .wiki-text')).toContainText('hydroponic gardens')
    if (device === 'phone') {
      await page.locator('.wiki-menu-button').click()
      await page.getByRole('menuitem', { name: 'Show on map', exact: true }).click()
    } else {
      await page.locator('.wiki-action', { hasText: 'SHOW ON MAP' }).click()
    }
    await waitForView(page, 'system')
    await expect(page).toHaveURL(/#\/system\/sol\/3\/2$/)
    clean()
  })
}

test('the four station examples and the empty star are usable', async ({ page }) => {
  const clean = watchConsole(page)
  for (const [id, name] of [['asterion', 'CONCORD RING'], ['cinder', 'CRUCIBLE YARD'], ['pelagos', 'TIDE SPINDLE'], ['nacre', 'BEACON WATCH']]) {
    await openHash(page, `#/system/${id}/1/1`)
    await expect(page.locator('.window-data .planet-lore-title')).toHaveText(name)
    await expect(page.locator('.window-visual .station-visualization canvas')).toBeVisible()
  }
  await openHash(page, '#/system/silent-reach')
  await expect(page.locator('.system-planet')).toHaveCount(0)
  await expect(page.locator('.window-data')).toContainText('No known planets in this system.')
  await openHash(page, '#/wiki/Special:Map_check', 'wiki')
  await expect(page.locator('.special-note')).toContainText('No problems')
  clean()
})

test('the release editor changes a new planet and previews the new articles', async ({ page }) => {
  await page.goto('/#/edit')
  await expect(page.locator('.editor-area')).toBeVisible()
  await expect(page.locator('.no-problems')).toBeVisible()
  await page.locator('.tab-system').click()
  await page.locator('.system-star-select').selectOption('asterion')
  await page.locator('.planet-item', { hasText: 'Daybreak' }).click()
  await page.locator('.body-name').fill('New Daybreak')
  await page.locator('.body-name').press('Enter')
  await expect(page.locator('.planet-item', { hasText: 'New Daybreak' })).toBeVisible()
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="map.json"]').click()
  const changed = JSON.parse(await page.locator('.editor-area').inputValue())
  expect(changed.systems.asterion.planets[0].name).toBe('New Daybreak')
  expect(changed.systems.sol.planets).toHaveLength(8)
  await page.locator('.file-item[data-path="wiki/markdown-example.md"]').click()
  await expect(page.locator('.editor-area')).toHaveValue(/Markdown Example/)
  await expect(page.locator('.file-preview')).toBeVisible()
  await page.locator('.action-preview-file').click()
  await expect(page.locator('.file-preview')).toHaveCount(0)
  await page.locator('.action-preview-file').click()
  await expect(page.locator('.file-preview')).toContainText('Paragraphs and emphasis')
  await expect(page.locator('.file-preview .pixel-image-canvas')).toBeVisible()
})

test('the phone can read the main page, Sol and the long example', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHash(page, '#/wiki')
  await expect(page.locator('.wiki-view .wiki-text')).toContainText('Eight stars.')
  await capture(page, 'release-phone-main')
  await openHash(page, '#/system/sol/8')
  await expect(page.locator('.system-view')).toHaveClass(/is-phone/)
  await openHash(page, '#/wiki/Long_Article_Example')
  await page.locator('.wiki-open-contents').click()
  await expect(page.locator('.wiki-sheet')).toBeVisible()
  await page.locator('.wiki-sheet .contents-link', { hasText: '8. Return' }).click()
  await expect(page).toHaveURL(/#8\._Return$/)
})
