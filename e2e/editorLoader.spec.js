import { expect, test } from '@playwright/test'
import { waitForView, watchConsole } from './helpers'

const area = page => page.locator('.editor-area')
const field = (page, key) => page.locator(`.loader-field[data-key="${key}"]`)
const mapJson = async page => {
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="map.json"]').click()
  return JSON.parse(await area(page).inputValue())
}

async function openLoaderTab(page) {
  await page.goto('/#/edit')
  await expect(area(page)).toBeVisible()
  await page.locator('.tab-loader').click()
  await expect(page.locator('.loader-panel')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  // Storage is cleared once per test, so reloads within a test keep the draft.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-started')) {
      localStorage.clear()
      sessionStorage.clear()
      sessionStorage.setItem('e2e-started', '1')
    }
  })
})

// Was: the texts of the loader could be changed only by hand in the map file.
test('a line of the loader in the author\'s words goes into the map and onto the site', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openLoaderTab(page)
  await expect(field(page, 'checkingMap')).toHaveAttribute('placeholder', 'CHECKING STAR SYSTEMS: {count}')
  const boot = page.locator('.loader-group[data-group="boot"] .loader-preview')
  await expect(boot).toContainText(/CHECKING STAR SYSTEMS: \d+/)

  await field(page, 'title').fill('SHIP-OS 2.0')
  await field(page, 'title').press('Enter')
  await field(page, 'checkingMap').fill('WAKING THE CREW')
  await field(page, 'checkingMap').press('Enter')
  await expect(boot).toContainText('SHIP-OS 2.0')
  await expect(boot).toContainText('WAKING THE CREW')
  expect((await mapJson(page)).strings).toEqual({ loader: { title: 'SHIP-OS 2.0', checkingMap: 'WAKING THE CREW' } })

  await page.addInitScript(() => {
    window.__lines = new Set()
    new MutationObserver(() => {
      for (const line of document.querySelectorAll('.loader-line, .loader-title')) window.__lines.add(line.textContent.replace(/\s+/g, ' ').trim())
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  const lines = await page.evaluate(() => [...window.__lines])
  expect(lines).toContain('SHIP-OS 2.0')
  expect(lines.some(line => line.startsWith('> WAKING THE CREW'))).toBe(true)
  consoleIsClean()
})

test('an emptied field is the line of the site again, and the map is left as it was', async ({ page }) => {
  await openLoaderTab(page)
  await field(page, 'openingSystem').fill('COURSE SET: {star}')
  await field(page, 'openingSystem').press('Enter')
  await expect(page.locator('.editor-changed')).not.toHaveText('No changes')
  await field(page, 'openingSystem').fill('')
  await field(page, 'openingSystem').press('Enter')
  await expect(page.locator('.editor-changed')).toHaveText('No changes')
  expect((await mapJson(page)).strings).toBeUndefined()
})

test('▶ prints the lines of a group one by one', async ({ page }) => {
  await openLoaderTab(page)
  const system = page.locator('.loader-group[data-group="system"]')
  await system.locator('.loader-play').click()
  await expect(system.locator('.loader-preview-line')).toHaveCount(1)
  await expect(system.locator('.loader-preview-line')).toHaveCount(3)
  await expect(system.locator('.loader-preview-line').last()).toContainText('OK')
})

// Was: the tab had no scroll of its own, so the wheel could not reach the groups below the fold.
test('the tab scrolls with the wheel down to its last group', async ({ page }) => {
  await openLoaderTab(page)
  const last = page.locator('.loader-group').last()
  await expect(last).not.toBeInViewport()
  const box = await page.locator('.loader-panel').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.wheel(0, 20000)
  await expect(last).toBeInViewport()
})

// Was: a line longer than a phone shows was cut off there, and the editor said nothing.
test('a line of the author longer than a phone shows is told so under its field', async ({ page }) => {
  await openLoaderTab(page)
  const hint = page.locator('label:has(.loader-field[data-key="openingSystem"]) .loader-too-long')
  await expect(hint).toHaveCount(0)
  await field(page, 'openingSystem').fill('PLOTTING A LONG AND WINDING COURSE TO {star}')
  await field(page, 'openingSystem').press('Enter')
  await expect(hint).toHaveText('Longer than 40 letters: a phone may cut it off.')
  await field(page, 'openingSystem').fill('COURSE SET: {star}')
  await field(page, 'openingSystem').press('Enter')
  await expect(hint).toHaveCount(0)
})
