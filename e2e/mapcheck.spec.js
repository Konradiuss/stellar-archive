import { expect, test } from '@playwright/test'
import { openHash, worldMap, waitForView } from './helpers.js'

const serveText = (page, body, status = 200) => page.route('**/map.json', route => route.fulfill({ status, contentType: 'application/json', body }))

test('a broken map file is shown with its line, a ^ under the place and the reason', async ({ page }) => {
  const text = JSON.stringify(worldMap(), null, 2).replace('"name": "Sol",', '"name": "Sol",,')
  const rows = text.split('\n')
  const line = rows.findIndex(row => row.includes('"name": "Sol",,')) + 1
  const column = rows[line - 1].indexOf(',,') + 2
  await serveText(page, text)
  await page.goto('/')
  await expect(page.locator('.loader-error')).toHaveText(`ERROR: MAP.JSON: LINE ${line}, COLUMN ${column}`)
  const details = page.locator('.loader-details .loader-detail')
  await expect(details.nth(1)).toHaveText(`${line} | ${rows[line - 1]}`)
  await expect(details.nth(2)).toHaveText(/^\s+\|\s+\^$/)
  await expect(details.last()).toHaveText('A name in double quotes is expected here, found ",".')
  const [shown, pointer] = await details.evaluateAll(rows => rows.slice(1, 3).map(row => row.textContent))
  expect(shown[pointer.indexOf('^')]).toBe(',')
})

test('a missing map file says where it is looked for', async ({ page }) => {
  await serveText(page, 'Not found', 404)
  await page.goto('/')
  await expect(page.locator('.loader-error')).toHaveText('ERROR: MAP FILE NOT FOUND')
  await expect(page.locator('.loader-details')).toContainText('map.json must lie next to index.html.')
})

test('broken parts are left out, the map opens, and Special:Map check lists them', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const map = worldMap()
  delete map.stars.find(star => star.id === 'halcyon').id
  delete map.systems.sol.planets[0].name
  // Was: a colour written as the web writes it broke the whole galaxy.
  map.factions.concord.fillColor = '#0088ff'
  map.factions.concord.borderColor = '#00aaff'
  map.hyperlines[0].from = 'sol'
  await serveText(page, JSON.stringify(map))

  await openHash(page, '#/')
  await expect(page.locator('.loader-error')).toHaveCount(0)
  await openHash(page, '#/system/sol')
  await expect(page.locator('.planet-list')).toContainText('VENUS')

  await openHash(page, '#/wiki/Special:Map_check')
  const issues = page.locator('.wiki-view .map-issue')
  await expect(page.locator('.wiki-view .special-note')).toContainText(/The map file has \d+ errors \(the part is left out\) and/)
  await expect(issues.filter({ hasText: 'Has no "id": left out.' })).toHaveAttribute('data-level', 'error')
  await expect(issues.filter({ hasText: 'systems.sol.planets[0]' })).toContainText('Has no "name": left out.')
  await expect(issues.first().locator('.map-issue-level')).toHaveText('ERROR')
  expect(errors).toEqual([])
})

test('a map without problems: Special:Map check says so', async ({ page }) => {
  await openHash(page, '#/wiki/Special:Map_check')
  await expect(page.locator('.wiki-view .special-note')).toHaveText('No problems found in map.json.')
  await expect(page.locator('.wiki-view .map-issue')).toHaveCount(0)
  await waitForView(page, 'wiki')
})

// Was: the map check said nothing of a picture from another site, whose owner sees every reader of the page.
test('pictures of another site are a note of the map check, not a problem', async ({ page }) => {
  await page.route('https://img.example/**', route => route.fulfill({ status: 404, body: '' }))
  const map = worldMap()
  Object.assign(map.stars.find(star => star.id === 'halcyon'), { lore: '![Halcyon](https://img.example/halcyon.png)', loreFormat: 'markdown' })
  await serveText(page, JSON.stringify(map))
  const warnings = []
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()) })

  await openHash(page, '#/wiki/Special:Map_check')
  expect(warnings.filter(text => /problem|img\.example/.test(text))).toEqual([])
  await expect(page.locator('.wiki-view .special-note')).toHaveText('No problems found in map.json. The note below is no problem: it only tells what the map does.')
  const note = page.locator('.wiki-view .map-issue')
  await expect(note).toHaveCount(1)
  await expect(note).toHaveAttribute('data-level', 'info')
  await expect(note.locator('.map-issue-level')).toHaveText('NOTE')
  await expect(note.locator('.map-issue-where')).toHaveText('pictures from img.example')
})
