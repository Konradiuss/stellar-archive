import { expect, test } from '@playwright/test'
import { openHash, waitForView, watchConsole } from './helpers.js'

const articles = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Moon', 'Phobos', 'Deimos', 'Io', 'Europa', 'Titan', 'Triton']
const canvasSelector = '.wiki-view .rt-figure .pixel-image-canvas'

async function illustrationsReady(page, selector = canvasSelector) {
  const canvases = page.locator(selector)
  await expect(canvases).toHaveCount(3)
  await expect.poll(() => canvases.evaluateAll(elements => elements.every(canvas => canvas.width > 1 && canvas.style.width && canvas.parentElement.style.display !== 'none'))).toBe(true)
  return canvases
}

// Real published images; the historic geometry/content fixture is not intercepted here.
for (const name of articles) {
  test(`${name} loads three locally hosted, pixelated illustrations`, async ({ page }) => {
    const clean = watchConsole(page)
    const images = []
    const failed = []
    page.on('request', request => { if (request.resourceType() === 'image') images.push(request.url()) })
    page.on('requestfailed', request => failed.push(request.url()))
    page.on('response', response => { if (response.status() >= 400) failed.push(response.url()) })
    await openHash(page, `#/wiki/${name}`)
    const canvases = await illustrationsReady(page)
    const samples = await canvases.evaluateAll(elements => elements.map(canvas => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
      const colors = new Set()
      const levels = new Set([0, 64, 128, 191, 255])
      let quantized = true
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] === 0) continue
        colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`)
        if (!levels.has(data[index]) || !levels.has(data[index + 1]) || !levels.has(data[index + 2])) quantized = false
      }
      return { colors: colors.size, quantized, scale: parseFloat(canvas.style.width) / canvas.width }
    }))
    for (const sample of samples) {
      expect(sample.quantized).toBe(true)
      expect(sample.colors).toBeGreaterThan(1)
      expect(sample.colors).toBeLessThanOrEqual(125)
      expect(sample.scale).toBe(3)
    }
    const local = images.filter(url => /\/lore\/images\/(?:solar\/|earth\.jpg)/.test(url))
    expect(new Set(local).size).toBe(3)
    expect(images.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true)
    await expect(page.locator('.wiki-view .rt-figure .rt-caption')).toHaveCount(3)
    await expect(page.locator('.wiki-view .pixel-image-note')).toHaveCount(0)
    expect(failed).toEqual([])
    clean()
  })
}

for (const [device, viewport] of [['desktop', { width: 1400, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  for (const [name, address] of [['Mercury', '1'], ['Earth', '3'], ['Saturn', '6'], ['Europa', '5/2'], ['Titan', '6/1']]) {
    test(`${name} illustrations fit the article and preserve navigation on ${device}`, async ({ page }) => {
      const clean = watchConsole(page)
      await page.setViewportSize(viewport)
      await openHash(page, `#/wiki/${name}`)
      const canvases = await illustrationsReady(page)
      const scroll = page.locator('.wiki-view .wiki-body .scroll-area-body')
      const overflow = async () => {
        expect(await scroll.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      }
      await overflow()
      await page.screenshot({ path: `test-results/solar-${name.toLowerCase()}-overview-${device}.png`, animations: 'disabled' })
      for (let index = 1; index < 3; index++) {
        await canvases.nth(index).scrollIntoViewIfNeeded()
        await expect(canvases.nth(index)).toBeVisible()
        await overflow()
        await page.screenshot({ path: `test-results/solar-${name.toLowerCase()}-figure-${index}-${device}.png`, animations: 'disabled' })
      }
      if (device === 'phone') await page.locator('.wiki-open-contents').click()
      const contents = page.locator(device === 'phone' ? '.wiki-sheet' : '.lore-panel')
      await contents.locator('.contents-link', { hasText: 'Sources' }).click()
      await expect(page).toHaveURL(/#Sources$/)
      const note = page.locator('.wiki-view .rt-note[data-note="1"]')
      await note.locator('.rt-note-back').click()
      await expect(page.locator('.wiki-view button.rt-ref-link').first()).toHaveClass(/is-target/)
      if (device === 'phone') {
        await page.locator('.wiki-menu-button').click()
        await page.getByRole('menuitem', { name: 'Show on map', exact: true }).click()
      } else await page.locator('.wiki-action', { hasText: 'SHOW ON MAP' }).click()
      await waitForView(page, 'system')
      await expect(page).toHaveURL(new RegExp(`#/system/sol/${address}$`))
      await page.locator('.mode-breaker').click()
      await waitForView(page, 'wiki')
      await expect(page.locator('.wiki-title')).toHaveText(name)
      await illustrationsReady(page)
      clean()
    })
  }
}
