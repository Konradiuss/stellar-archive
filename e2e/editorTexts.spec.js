import { expect, test } from '@playwright/test'
import { serveMap, waitForView, worldMap } from './helpers'

const area = page => page.locator('.editor-area')
const mapNow = async page => {
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="map.json"]').click()
  return JSON.parse(await area(page).inputValue())
}
const row = (page, key) => page.locator(`.string-row[data-key="${key}"]`)

async function openTexts(page) {
  await page.goto('/#/edit')
  await expect(page.locator('.no-problems, .problem').first()).toBeVisible()
  await page.locator('.tab-texts').click()
  await expect(page.locator('.strings-card')).toBeVisible()
  // The loader has a tab of its own.
  await expect(page.locator('.loader-panel')).toHaveCount(0)
}

const type = async (locator, value) => {
  await locator.fill(value)
  await locator.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-started')) {
      localStorage.clear()
      sessionStorage.clear()
      sessionStorage.setItem('e2e-started', '1')
    }
  })
})

// Was: only the lines of the loader had a form; a text with forms by number was written in map.json by hand.
test('a text with a number has a field for each form of the language, and the site picks the right one', async ({ page }) => {
  const map = worldMap()
  map.site.language = 'ru'
  const moons = count => Array.from({ length: count }, (_, index) => ({ name: `Moon ${index + 1}`, distance: 2 + index * 0.5 }))
  map.systems.sol.planets[0].satellites = moons(4)
  map.systems.sol.planets[1].satellites = moons(5)
  await serveMap(page, map)
  await openTexts(page)
  await page.locator('.strings-search').fill('system.moonCount')
  const forms = row(page, 'system.moonCount').locator('.string-field')
  await expect(forms).toHaveCount(4)
  await expect(row(page, 'system.moonCount').locator('.string-form-name')).toHaveText(['one', 'few', 'many', 'other'])
  await type(forms.nth(1), '{count} СПУТНИКА')
  await type(forms.nth(2), '{count} СПУТНИКОВ')
  await type(forms.nth(0), 'СПУТНИК')
  await expect(row(page, 'system.moonCount').locator('.string-problem[data-form="one"]')).toContainText('Leaves out {count}: that part is not shown.')
  await type(forms.nth(0), '{count} СПУТНИК')
  await expect(row(page, 'system.moonCount').locator('.string-problem')).toHaveCount(0)
  expect((await mapNow(page)).strings).toEqual({ system: { moonCount: { few: '{count} СПУТНИКА', many: '{count} СПУТНИКОВ', one: '{count} СПУТНИК' } } })

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await page.goto('/#/system/sol')
  await waitForView(page, 'system')
  await expect(page.locator('.satellite-list-toggle .planet-list-name')).toHaveText(['4 СПУТНИКА', '5 СПУТНИКОВ'])
})

test('a text is found, written, kept through a reload, shown on the site and cleared; one written by hand stays where it is', async ({ page }) => {
  const map = worldMap()
  map.strings = { 'windows.minimize': 'СВЕРНУТЬ', tab: { lodaing: 'ЗАГРУЗКА' } }
  await serveMap(page, map)
  await openTexts(page)

  await page.locator('.strings-search').fill('legend.galaxy')
  await expect(page.locator('.strings-found')).toHaveText('1 text found')
  const galaxy = row(page, 'legend.galaxy').locator('.string-field')
  await expect(galaxy).toHaveAttribute('placeholder', 'GALAXY')
  await type(galaxy, 'ГАЛАКТИКА')

  // Written by hand with a dot: shown, and changed where it is.
  await page.locator('.strings-search').fill('')
  await page.locator('.strings-changed').check()
  await expect(page.locator('.string-row')).toHaveCount(2)
  await type(row(page, 'windows.minimize').locator('.string-field'), 'СВЕРНУТЬ ОКНО')
  await page.locator('.strings-changed').uncheck()

  // A word the mode switch cannot draw.
  await page.locator('.strings-search').fill('breaker.map')
  await type(row(page, 'breaker.map').locator('.string-field'), 'カード')
  await expect(row(page, 'breaker.map').locator('.string-problem[data-problem="breaker"]')).toBeVisible()
  await type(row(page, 'breaker.map').locator('.string-field'), '')

  // A key that is no text of the interface.
  await expect(page.locator('.string-foreign[data-key="tab.lodaing"]')).toBeVisible()
  await page.locator('.string-foreign[data-key="tab.lodaing"] .string-remove').click()
  await expect(page.locator('.strings-foreign')).toHaveCount(0)

  let strings = (await mapNow(page)).strings
  expect(strings).toEqual({ 'windows.minimize': 'СВЕРНУТЬ ОКНО', legend: { galaxy: 'ГАЛАКТИКА' } })

  await page.reload()
  await page.locator('.tab-texts').click()
  await page.locator('.strings-search').fill('legend.galaxy')
  await expect(row(page, 'legend.galaxy').locator('.string-field')).toHaveValue('ГАЛАКТИКА')

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  await expect(page.locator('.map-legend')).toContainText('ГАЛАКТИКА')

  await page.goto('/#/edit')
  await page.locator('.tab-texts').click()
  await page.locator('.strings-search').fill('legend.galaxy')
  await type(row(page, 'legend.galaxy').locator('.string-field'), '')
  await expect(row(page, 'legend.galaxy').locator('.string-field')).toHaveValue('')
  strings = (await mapNow(page)).strings
  expect(strings).toEqual({ 'windows.minimize': 'СВЕРНУТЬ ОКНО' })
})
