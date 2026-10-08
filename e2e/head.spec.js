import { expect, test } from '@playwright/test'
import { openHash, waitForView, watchConsole, withStores } from './helpers'

let checkConsole
test.beforeEach(({ page }) => { checkConsole = watchConsole(page) })
test.afterEach(() => checkConsole())

test('the tab title names the open place', async ({ page }) => {
  await openHash(page, '#/', 'galaxy')
  await expect(page).toHaveTitle('SpaceMap')

  await withStores(page, ({ ui }) => ui.selectStar('sol'))
  await expect(page).toHaveTitle('JUMP > Sol — SpaceMap')
  await waitForView(page, 'system')
  await expect(page).toHaveTitle('Sol — SpaceMap')

  await withStores(page, ({ ui }) => ui.selectPlanet(2))
  await expect(page).toHaveTitle('Earth · Sol — SpaceMap')
})

test('a reload keeps the title of the planet', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  await expect(page).toHaveTitle('Earth · Sol — SpaceMap')
})

test('the favicon plays the frames of the GIF', async ({ page }) => {
  await openHash(page, '#/', 'galaxy')
  const icon = page.locator('link[rel="icon"]')
  await expect(icon).toHaveCount(1)
  await expect.poll(() => icon.getAttribute('href')).toMatch(/^data:image\/png/)

  const seen = new Set()
  for (let sample = 0; sample < 12; sample++) {
    seen.add(await icon.getAttribute('href'))
    await page.waitForTimeout(100)
  }
  expect(seen.size).toBeGreaterThan(1)
})
