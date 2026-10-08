import { expect, test } from '@playwright/test'
import { serveMap, waitForView, worldMap } from './helpers'

const area = page => page.locator('.editor-area')
const mapNow = async page => {
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="map.json"]').click()
  return JSON.parse(await area(page).inputValue())
}
const pickColor = (locator, value) => locator.evaluate((input, color) => {
  input.value = color
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}, value)
const slide = (input, value) => input.evaluate((element, to) => {
  element.value = String(to)
  element.dispatchEvent(new Event('change', { bubbles: true }))
}, value)
const colorOf = (locator, property = 'color') => locator.evaluate((element, name) => getComputedStyle(element)[name], property)

async function openTheme(page) {
  await page.goto('/#/edit')
  await expect(page.locator('.no-problems, .problem').first()).toBeVisible()
  await page.locator('.tab-theme').click()
  await expect(page.locator('.theme-panel')).toBeVisible()
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

// Was: the theme was set in map.json by hand only, and nothing showed it before the site did.
test('a ready theme, a colour of its own and the effects show on the preview, in the map and on the site', async ({ page }) => {
  const map = worldMap()
  // Written by hand: no colour, and a steel the site does not have.
  map.theme = { colors: { text: 'red' }, casings: ['warm', 'bronze'] }
  await serveMap(page, map)
  await openTheme(page)
  const screen = page.locator('.theme-screen')
  const editorBackground = await colorOf(page.locator('.editor-view'), 'backgroundColor')
  await expect(page.locator('.theme-color[data-role="text"] .theme-bad-color')).toContainText('The map has red, which is no colour')
  // A pool written by hand: each frame picks of it by its name.
  await expect(page.locator('.theme-casings-list')).toContainText('(warm, bronze)')
  await expect(page.locator('.theme-casing-lore option[value=""]')).toHaveText('Auto (Warm)')

  await page.locator('.theme-preset').selectOption('amber')
  await expect.poll(() => colorOf(screen, 'backgroundColor')).toBe('rgb(12, 7, 0)')
  await pickColor(page.locator('.theme-color-accent'), '#ff0000')
  await expect.poll(() => colorOf(page.locator('.theme-line-link'))).toBe('rgb(255, 0, 0)')
  await slide(page.locator('.theme-vignette'), 0.5)
  await expect(page.locator('.theme-effect[data-effect="vignette"]')).toContainText('50%')
  await page.locator('.theme-casing-lore').selectOption('blue')
  await expect(page.locator('.theme-layout-frame.is-lore')).toHaveCSS('background-color', 'rgb(118, 126, 143)')
  // The editor keeps its own colours.
  expect(await colorOf(page.locator('.editor-view'), 'backgroundColor')).toBe(editorBackground)

  let theme = (await mapNow(page)).theme
  // The pool became the steel each frame wore, the lore's own besides.
  const casings = { map: 'warm', lore: 'blue', music: 'warm', legend: 'warm' }
  expect(theme).toEqual({ colors: { text: 'red', accent: '#ff0000' }, casings, preset: 'amber', crt: { vignette: 0.5 } })

  await page.reload()
  await page.locator('.tab-theme').click()
  await expect(page.locator('.theme-preset')).toHaveValue('amber')
  await expect(page.locator('.theme-casing-lore')).toHaveValue('blue')
  await page.locator('.theme-effect[data-effect="vignette"] .effect-reset').click()
  await page.locator('.theme-color[data-role="accent"] .color-reset').click()
  theme = (await mapNow(page)).theme
  expect(theme).toEqual({ colors: { text: 'red' }, casings, preset: 'amber' })

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  const root = name => page.evaluate(variable => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), name)
  expect(await root('--ui-screen')).toBe('#0c0700')
  expect(await root('--ui-accent')).toBe('#ffe2a8')
  await expect(page.locator('.lore-panel')).toHaveAttribute('data-tint', 'blue')
  await expect(page.locator('.canvas-area')).toHaveAttribute('data-tint', 'warm')
})

const FRAMES = { map: '.canvas-area', lore: '.lore-panel', music: '.music-player', legend: '.map-legend' }
const steelsOnSite = page => Promise.all(Object.values(FRAMES).map(frame => page.locator(frame).getAttribute('data-tint')))

// Was: the steels were ticked into a pool, and the name of each frame chose its own: one could not paint a frame.
test('every frame one steel, then each the steel it always had', async ({ page }) => {
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const own = await steelsOnSite(page)
  await openTheme(page)
  await page.locator('.theme-casing-all').selectOption('gunmetal')
  await expect(page.locator('.theme-casing-legend')).toHaveValue('gunmetal')
  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  expect(await steelsOnSite(page)).toEqual(['gunmetal', 'gunmetal', 'gunmetal', 'gunmetal'])

  await openTheme(page)
  await page.locator('.theme-casing-all').selectOption('')
  expect((await mapNow(page)).theme).toBeUndefined()
  await page.locator('.tab-theme').click()
  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  expect(await steelsOnSite(page)).toEqual(own)
})
