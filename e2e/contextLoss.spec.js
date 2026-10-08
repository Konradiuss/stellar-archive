import { expect, test } from '@playwright/test'
import { openHash, waitForView, watchConsole, withStores } from './helpers.js'

test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })

async function drawnPixels(page, canvas) {
  const shot = await canvas.screenshot()
  return page.evaluate(async data => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height).data
    let count = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 120) count++
    }
    return count
  }, shot.toString('base64'))
}

// A lost context gives no extensions, so the one that lost it is kept on the canvas to restore it.
function loseContext(canvas) {
  return canvas.evaluate(element => {
    const gl = element.getContext('webgl2') ?? element.getContext('webgl')
    element.loseContextExtension = gl.getExtension('WEBGL_lose_context')
    element.loseContextExtension.loseContext()
  })
}

const restoreContext = canvas => canvas.evaluate(element => element.loseContextExtension.restoreContext())

for (const [name, hash, selector] of [
  ['galaxy map', '#/', '.galaxy-view > canvas'],
  ['system', '#/system/sol', '.system-orbit-canvas']
]) {
  // Was: Pixi came back with its shapes but without a single label.
  test(`the ${name} is drawn again, labels too, after the WebGL context comes back`, async ({ page }) => {
    const consoleIsClean = watchConsole(page)
    await openHash(page, hash)
    await page.mouse.move(5, 5)
    // The planets stand still, so the shots before and after can be compared.
    await withStores(page, ({ systemSettings }) => systemSettings?.set('system', 'speed', 0))
    await page.waitForTimeout(1500)
    const canvas = page.locator(selector)
    const before = await drawnPixels(page, canvas)
    expect(before).toBeGreaterThan(1000)

    await loseContext(canvas)
    await expect.poll(() => drawnPixels(page, canvas)).toBeLessThan(before * 0.5)
    await restoreContext(canvas)
    await page.waitForTimeout(1500)
    const after = await drawnPixels(page, canvas)
    expect(after).toBeGreaterThan(before * 0.97)
    consoleIsClean()
  })
}

test('the hidden galaxy map gets its labels back when the system closes', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/')
  await page.mouse.move(5, 5)
  await page.waitForTimeout(1500)
  const canvas = page.locator('.galaxy-view > canvas')
  const before = await drawnPixels(page, canvas)
  const hidden = await canvas.elementHandle()

  await withStores(page, ({ ui }) => ui.selectStar('sol'))
  await waitForView(page, 'system')
  await loseContext(hidden)
  await page.waitForTimeout(300)
  await restoreContext(hidden)
  await page.waitForTimeout(300)

  await withStores(page, ({ ui }) => ui.closeSystemView())
  await waitForView(page, 'galaxy')
  await page.mouse.move(5, 5)
  await page.waitForTimeout(1500)
  expect(await drawnPixels(page, canvas)).toBeGreaterThan(before * 0.97)
  consoleIsClean()
})
