import { expect, test } from '@playwright/test'
import { openHash, withStores } from './helpers.js'

// Was: the letters of a bold word ran together into one blot.

// { gaps }: dark runs between lit columns (gaps between letters); { lit }: the count of lit pixels.
async function measure(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const shot = await page.screenshot({ clip: { x: Math.floor(box.x) - 2, y: Math.floor(box.y), width: Math.ceil(box.width) + 4, height: Math.ceil(box.height) } })
  return page.evaluate(async data => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const { data: pixels, width, height } = context.getImageData(0, 0, image.width, image.height)
    const brightness = at => (pixels[at] + pixels[at + 1] + pixels[at + 2]) / 3
    const columns = Array.from({ length: width }, (_, x) => Math.max(...Array.from({ length: height }, (_, y) => brightness((y * width + x) * 4))))
    const peak = Math.max(...columns)
    // Ark Pixel at 16px is scaled by 1.6, so a gap between letters is smoothed grey, not black.
    const isLit = columns.map(value => value > peak * 0.6)
    let gaps = 0
    for (let x = isLit.indexOf(true) + 1; x <= isLit.lastIndexOf(true); x++) if (!isLit[x] && isLit[x - 1]) gaps++
    let lit = 0
    for (let at = 0; at < pixels.length; at += 4) if (brightness(at) > peak * 0.5) lit++
    return { gaps, lit }
  }, shot.toString('base64'))
}

async function plainTwin(page, strong) {
  await strong.evaluate(element => {
    const twin = document.createElement('span')
    twin.className = 'bold-test-twin'
    twin.textContent = ` ${element.textContent}`
    element.after(twin)
  })
  return page.locator('.bold-test-twin')
}

test('a bold word in PLANET-DATA keeps its letters apart at every text size', async ({ page }) => {
  await openHash(page, '#/system/sol/4/1')
  const lore = page.locator('.window-data .planet-lore-text')
  // A click skips the typing of the lore.
  await lore.click()
  const strong = lore.locator('.rt-strong').first()
  await expect(strong).toHaveText('Phobos')
  for (const size of [16, 20, 24]) {
    await withStores(page, ({ systemSettings }, value) => systemSettings.set('text', 'size', value), size)
    await expect(lore.locator('.rich-text')).toHaveCSS('font-size', `${size}px`)
    const { gaps } = await measure(page, strong)
    expect(gaps, `Phobos at ${size}px`).toBeGreaterThanOrEqual('Phobos'.length - 1)
  }
  // At 24px a 1px copy adds to strokes 2.4px wide: about a sixth more light.
  const twin = await plainTwin(page, strong)
  const [bold, plain] = [await measure(page, strong), await measure(page, twin)]
  expect(bold.lit).toBeGreaterThan(plain.lit * 1.1)
})

test('a bold title in a wiki article keeps its letters apart', async ({ page }) => {
  await openHash(page, '#/wiki/Solar_Concord')
  const strong = page.locator('.wiki-article .rt-strong, .rich-text .rt-strong').first()
  await expect(strong).toHaveText('Solar Concord')
  const { gaps } = await measure(page, strong)
  expect(gaps).toBeGreaterThanOrEqual('SolarConcord'.length - 1)
})

test('headings in the pixel fonts are not given a fake bold', async ({ page }) => {
  await openHash(page, '#/system/sol/4/1')
  const title = page.locator('.window-data .planet-lore-title')
  await expect(title).toHaveText('PHOBOS')
  // An h3 is bold by default, and Press Start 2P has no bold face.
  await expect(title).toHaveCSS('font-weight', '400')
  await expect(page.locator('body')).toHaveCSS('font-synthesis-weight', 'none')
})
