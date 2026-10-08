import { expect, test } from '@playwright/test'
import { center, releaseMap, serveMap, waitForView, watchConsole, withStores } from './helpers'

let checkConsole
test.beforeEach(({ page }) => { checkConsole = watchConsole(page) })
test.afterEach(() => checkConsole())

const farStar = {
  id: 'far-reach',
  name: 'Far Reach',
  sectorX: 19,
  sectorY: 11,
  faction: 'tide',
  starVisualization: { size: 60, color1: '0xaaffaa', color2: '0x88ff88', color3: '0xccffcc' }
}

test('a bigger galaxy from the map file is drawn and its far star opens', async ({ page }) => {
  const data = releaseMap()
  data.galaxy = { columns: 20, rows: 12 }
  data.stars.push(farStar)
  await serveMap(page, data)
  // Start zoomed in on the far corner, outside the published 8x8 map.
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('spacemap:v1:galaxy-camera', JSON.stringify({ x: 1950, y: 1150, scale: 1 }))
  })
  await page.goto('/')
  await waitForView(page, 'galaxy')

  expect(await withStores(page, ({ map }) => ({ columns: map.galaxy.columns, rows: map.galaxy.rows, width: map.galaxy.width })))
    .toEqual({ columns: 20, rows: 12, width: 2000 })

  const galaxyView = await page.locator('.galaxy-view').boundingBox()
  const stars = page.locator('.galaxy-star-container')
  await expect(stars).toHaveCount(await withStores(page, ({ map }) => map.stars.length))

  const spots = await stars.evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }))
  const visible = spots.filter(spot => (
    spot.x > galaxyView.x && spot.x < galaxyView.x + galaxyView.width &&
    spot.y > galaxyView.y && spot.y < galaxyView.y + galaxyView.height
  ))
  // The far star is in sector 19,11, the bottom-right corner of the map.
  const target = visible.sort((a, b) => (b.x + b.y) - (a.x + a.y))[0]
  expect(target).toBeDefined()
  await page.mouse.click(target.x, target.y)
  await waitForView(page, 'system')
  expect(await withStores(page, ({ ui }) => ui.selectedStar)).toBe('far-reach')
})

test('a star outside the given size widens the map instead of getting lost', async ({ page }) => {
  const data = releaseMap()
  data.galaxy = { columns: 16, rows: 9 }
  data.stars.push(farStar)
  await serveMap(page, data)
  const warnings = []
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()) })
  await page.goto('/')
  await waitForView(page, 'galaxy')
  expect(await withStores(page, ({ map }) => [map.galaxy.columns, map.galaxy.rows])).toEqual([20, 12])
  expect(warnings.some(text => text.includes('Far Reach'))).toBe(true)
})

test('the uncharted space keeps the map clickable', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const star = page.locator('.galaxy-star-container').first()
  const spot = await center(star)
  await page.mouse.click(spot.x, spot.y)
  await waitForView(page, 'system')
})

// [{ id, x, y, sectorX, sectorY }], x and y on screen.
async function starSpots(page) {
  const sectors = await withStores(page, ({ map }) => Object.fromEntries(map.stars.map(star => [star.id, [star.sectorX, star.sectorY]])))
  const spots = await page.locator('.galaxy-star-container').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect()
    return { id: node.dataset.starId, x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }))
  return spots.map(spot => ({ ...spot, sectorX: sectors[spot.id][0], sectorY: sectors[spot.id][1] }))
}

async function openGalaxy(page) {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await waitForView(page, 'galaxy')
}

const zoomLevel = async page => Number((await page.locator('.galaxy-zoom-level').textContent()).match(/[\d.]+/)[0])

test('the farthest zoom shows the whole map and one sector around it', async ({ page }) => {
  // Was: the map could be zoomed out to a few pixels in a sea of empty space.
  await openGalaxy(page)
  const view = await page.locator('.galaxy-view').boundingBox()
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2)
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 400)
  await expect.poll(() => zoomLevel(page)).toBe(1)
  await page.waitForTimeout(400)

  const spots = await starSpots(page)
  const left = spots.reduce((a, b) => (b.sectorX < a.sectorX ? b : a))
  const right = spots.reduce((a, b) => (b.sectorX > a.sectorX ? b : a))
  const top = spots.reduce((a, b) => (b.sectorY < a.sectorY ? b : a))
  const sector = (right.x - left.x) / (right.sectorX - left.sectorX)
  const galaxy = await withStores(page, ({ map }) => ({ width: map.galaxy.width, height: map.galaxy.height }))
  const mapLeft = left.x - (left.sectorX + 0.5) * sector
  const mapTop = top.y - (top.sectorY + 0.5) * sector
  const mapRight = mapLeft + galaxy.width / 100 * sector
  const mapBottom = mapTop + galaxy.height / 100 * sector
  const margins = [mapLeft - view.x, mapTop - view.y, view.x + view.width - mapRight, view.y + view.height - mapBottom]
  for (const margin of margins) expect(margin).toBeGreaterThan(sector - 2)
  expect(Math.min(...margins)).toBeLessThan(sector + 2)
})

test('every corner of the map can be reached when zoomed in, also after a system', async ({ page }) => {
  // Was: at some zoom levels the camera would not scroll to parts of the map.
  await openGalaxy(page)
  const view = await page.locator('.galaxy-view').boundingBox()
  const inside = spot => spot.x > view.x && spot.x < view.x + view.width && spot.y > view.y && spot.y < view.y + view.height
  const dragMany = async (from, to) => {
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 10 })
      await page.waitForTimeout(120)
      await page.mouse.up()
    }
    await page.waitForTimeout(500)
  }
  const nearBottomRight = { x: view.x + view.width - 60, y: view.y + view.height - 60 }
  const nearTopLeft = { x: view.x + 60, y: view.y + 60 }

  await page.mouse.move(nearTopLeft.x, nearTopLeft.y)
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -300)
  await page.waitForTimeout(600)
  expect(await zoomLevel(page)).toBeGreaterThan(3)

  await dragMany(nearBottomRight, nearTopLeft)
  let spots = await starSpots(page)
  const farthest = spots.reduce((a, b) => (b.sectorX + b.sectorY > a.sectorX + a.sectorY ? b : a))
  expect(inside(farthest)).toBe(true)

  await withStores(page, ({ ui }) => ui.selectStar('sol'))
  await waitForView(page, 'system')
  await withStores(page, ({ ui }) => ui.closeSystemView())
  await waitForView(page, 'galaxy')
  await dragMany(nearTopLeft, nearBottomRight)
  spots = await starSpots(page)
  const nearest = spots.reduce((a, b) => (b.sectorX + b.sectorY < a.sectorX + a.sectorY ? b : a))
  expect(inside(nearest)).toBe(true)
})

test('keys and the zoom buttons move the camera without picking a star', async ({ page }) => {
  await openGalaxy(page)
  await expect(page.locator('.galaxy-zoom-level')).toHaveText('ZOOM 1.0x')
  await expect(page.locator('.galaxy-zoom-btn')).toHaveText(['[+]', '[-]'])
  const [zoomIn, zoomOut] = await page.locator('.galaxy-zoom-btn').all()
  await expect(zoomOut).toBeDisabled()

  await page.keyboard.press('Equal')
  await expect.poll(() => zoomLevel(page)).toBeGreaterThan(1.2)
  const before = (await starSpots(page))[0]
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(300)
  await page.keyboard.up('ArrowRight')
  await page.waitForTimeout(300)
  expect((await starSpots(page))[0].x).toBeLessThan(before.x - 20)
  await page.keyboard.press('Home')
  await expect.poll(() => zoomLevel(page)).toBe(1)

  const level = await zoomLevel(page)
  await zoomIn.click()
  await expect.poll(() => zoomLevel(page)).toBeGreaterThan(level)
  await expect(zoomOut).toBeEnabled()
  await zoomOut.click()
  await expect.poll(() => zoomLevel(page)).toBe(1)
  await expect(zoomOut).toBeDisabled()
  expect(await withStores(page, ({ ui }) => [ui.currentView, ui.transitionPhase])).toEqual(['galaxy', 'idle'])
})

test('uncharted sectors jitter like a weak signal', async ({ page }) => {
  // A shader that fails to compile shows up as a console error.
  await openGalaxy(page)
  await expect(page.locator('.galaxy-view')).toHaveAttribute('data-fuzz', 'on')
  await page.waitForTimeout(500)
})

test('the jitter and the hyperline pulses stay off when motion is reduced', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await openGalaxy(page)
  await expect(page.locator('.galaxy-view')).toHaveAttribute('data-fuzz', 'off')
  await expect(page.locator('.galaxy-view')).toHaveAttribute('data-pulses', 'off')
  await context.close()
})

// Was: static lines with a random flicker, hard to read as routes.
test('pulses run along the hyperlines', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('spacemap:v1:galaxy-camera', JSON.stringify({ x: 500, y: 380, scale: 1.8 }))
  })
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const view = page.locator('.galaxy-view')
  await expect(view).toHaveAttribute('data-pulses', 'on')
  await page.mouse.move(5, 5)
  // The stars animate too: hidden, they do not count as pulses.
  await page.addStyleTag({ content: '.galaxy-star-container { visibility: hidden !important; }' })
  const box = await view.boundingBox()
  const clip = { x: box.x + box.width * 0.1, y: box.y + box.height * 0.2, width: box.width * 0.5, height: box.height * 0.6 }
  const first = await page.screenshot({ clip })
  await page.waitForTimeout(400)
  const second = await page.screenshot({ clip })
  const pulsePixels = await page.evaluate(async images => {
    const pixels = await Promise.all(images.map(async data => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, image.width, image.height).data
    }))
    // A pulse head is bright and tinted; stars are white, the glow of the lines is dim.
    const pulseLike = (data, index) => {
      const high = Math.max(data[index], data[index + 1], data[index + 2])
      const low = Math.min(data[index], data[index + 1], data[index + 2])
      return high > 215 && high - low > 30
    }
    let count = 0
    for (let index = 0; index < pixels[0].length; index += 4) {
      if (pulseLike(pixels[0], index) !== pulseLike(pixels[1], index)) count++
    }
    return count
  }, [first.toString('base64'), second.toString('base64')])
  // About 600 with the pulses, a handful without them.
  expect(pulsePixels).toBeGreaterThan(60)
})

test('a star name without room waits under "..." and shows on hover', async ({ page }) => {
  // Fort Perseverance sits in a ring of its own territory inside the Free Tide: no room for its name.
  const data = releaseMap()
  const star = (id, name, sectorX, sectorY, faction) => ({
    id, name, sectorX, sectorY, faction, starVisualization: { size: 60, color1: '0x9ad5ef', color2: '0x9ad5ef', color3: '0xfff0d4' }
  })
  data.stars.push(
    star('undertow', 'Undertow', 4, 6, 'tide'),
    star('riptide', 'Riptide', 5, 7, 'tide'),
    star('fort-perseverance', 'Fort Perseverance', 5, 6, 'concord')
  )
  await serveMap(page, data)
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('spacemap:v1:galaxy-camera', JSON.stringify({ x: 600, y: 620, scale: 1.8 }))
  })
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const fort = page.locator('.galaxy-star-container[data-star-id="fort-perseverance"]')
  await expect(fort).toHaveAttribute('data-label', 'hidden')
  await expect(fort).not.toHaveAttribute('data-label-open', 'true')
  const shown = await page.locator('.galaxy-star-container[data-label="shown"]').count()
  expect(shown).toBeGreaterThan(await page.locator('.galaxy-star-container').count() / 2)

  await expect(fort).toHaveAttribute('data-label-typed', 'none')
  await fort.evaluate(node => {
    window.typedStates = []
    new MutationObserver(() => window.typedStates.push(node.dataset.labelTyped))
      .observe(node, { attributes: true, attributeFilter: ['data-label-typed'] })
  })

  const spot = await center(fort)
  await page.mouse.move(spot.x + 120, spot.y + 120)
  await page.mouse.move(spot.x, spot.y, { steps: 6 })
  await expect(fort).toHaveAttribute('data-label-open', 'true')
  await expect(fort).toHaveAttribute('data-label-typed', 'full')
  await page.mouse.move(spot.x + 200, spot.y - 200, { steps: 6 })
  await expect(fort).not.toHaveAttribute('data-label-open', 'true')
  await expect(fort).toHaveAttribute('data-label-typed', 'none')
  expect(await page.evaluate(() => window.typedStates)).toEqual(['partial', 'full', 'partial', 'none'])
})

const middleOf = async locator => {
  const box = await locator.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function emptySpot(page, room = 70) {
  const view = await page.locator('.galaxy-view').boundingBox()
  const spots = await starSpots(page)
  for (let y = view.y + 120; y < view.y + view.height - 120; y += 23) {
    for (let x = view.x + 120; x < view.x + view.width - 120; x += 29) {
      if (spots.every(spot => Math.hypot(spot.x - x, spot.y - y) > room)) return { x: Math.round(x), y: Math.round(y) }
    }
  }
  throw new Error('no empty spot on the map')
}

async function recordCursorSpread(page) {
  await page.evaluate(() => {
    window.__spread = 0
    window.__spreadFrames = 0
    const middle = selector => {
      const box = document.querySelector(selector)?.getBoundingClientRect()
      return box && box.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null
    }
    const read = () => {
      const dot = middle('.center-dot')
      const square = middle('.cursor-square.outer')
      if (dot && square) {
        window.__spread = Math.max(window.__spread, Math.hypot(dot.x - square.x, dot.y - square.y))
        window.__spreadFrames++
      }
      if (!window.__stopSpread) requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  })
  return async () => page.evaluate(() => {
    window.__stopSpread = true
    return { spread: window.__spread, frames: window.__spreadFrames }
  })
}

test('the cursor goes with the mouse as one piece, and is on it within a moment', async ({ page }) => {
  // Was: the corners eased after the dot and the dot after the mouse, which made a visitor motion sick.
  await openGalaxy(page)
  const spot = await emptySpot(page)
  await page.mouse.move(spot.x - 60, spot.y - 30)
  await page.waitForTimeout(300)
  const stop = await recordCursorSpread(page)
  await page.mouse.move(spot.x, spot.y, { steps: 20 })
  const { spread, frames } = await stop()
  expect(frames).toBeGreaterThan(3)
  // Within a pixel: a 3px dot has no whole-pixel middle in a 40px square.
  expect(spread).toBeLessThan(1)
  await page.waitForTimeout(150)
  for (const selector of ['.center-dot', '.cursor-square.outer']) {
    const at = await middleOf(page.locator(selector))
    expect(Math.hypot(at.x - spot.x, at.y - spot.y), selector).toBeLessThan(1)
  }

  await withStores(page, ({ ui }) => ui.selectStar('sol'))
  await waitForView(page, 'system')
  const panel = await page.locator('.terminal-body-planets').boundingBox()
  const point = { x: Math.round(panel.x + 30), y: Math.round(panel.y + panel.height - 30) }
  await page.mouse.move(point.x + 50, point.y - 40)
  await page.waitForTimeout(300)
  await page.mouse.move(point.x, point.y)
  await page.waitForTimeout(150)
  const cross = await middleOf(page.locator('.crosshair'))
  expect(Math.hypot(cross.x - point.x, cross.y - point.y)).toBeLessThan(1)
})

test.describe('at a screen scale of 150%', () => {
  test.use({ deviceScaleFactor: 1.5 })

  test('the cursor moves with every step of the mouse, not every other one', async ({ page }) => {
    // Was: drawn on whole CSS pixels, at 150% the cursor stood still on one mouse step and jumped on the next.
    await openGalaxy(page)
    const spot = await emptySpot(page)
    // A real mouse stands on whole pixels of the screen.
    const start = Math.round(spot.x * 1.5) / 1.5
    await page.mouse.move(start, spot.y)
    await page.waitForTimeout(200)
    const places = []
    for (let step = 0; step < 6; step++) {
      // One screen pixel: two thirds of a CSS pixel.
      await page.mouse.move(start + (step * 2) / 3, spot.y)
      await page.waitForTimeout(150)
      places.push((await middleOf(page.locator('.center-dot'))).x)
    }
    for (let step = 1; step < places.length; step++) {
      expect(places[step] - places[step - 1], `step ${step}: ${places.join(', ')}`).toBeGreaterThan(0.3)
    }
  })
})

test('a press squeezes the corners until the button is let go', async ({ page }) => {
  await openGalaxy(page)
  const spot = await emptySpot(page)
  await page.mouse.move(spot.x, spot.y)
  const side = async () => (await page.locator('.cursor-square.outer').boundingBox()).width
  await expect.poll(side).toBeCloseTo(40, 0)
  await page.mouse.down()
  await expect.poll(side).toBeLessThan(36)
  await page.waitForTimeout(200)
  expect(await side()).toBeLessThan(36)
  await page.mouse.up()
  await expect.poll(side).toBeCloseTo(40, 0)
})

test('dragging the map spreads the corners with arrows, and no star holds the cursor', async ({ page }) => {
  await openGalaxy(page)
  // Zoomed in, the map is free to follow the mouse (at the farthest zoom it stops at its edges).
  let sol = (await starSpots(page)).find(spot => spot.id === 'sol')
  await page.mouse.move(sol.x, sol.y, { steps: 4 })
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -400)
  await page.waitForTimeout(800)
  sol = (await starSpots(page)).find(spot => spot.id === 'sol')
  await page.mouse.move(sol.x, sol.y, { steps: 4 })
  await expect.poll(() => withStores(page, ({ ui }) => ui.cursorTarget)).not.toBeNull()

  await page.mouse.down()
  await page.mouse.move(sol.x + 70, sol.y + 20, { steps: 8 })
  await expect(page.locator('.cursor-wrapper')).toHaveClass(/is-dragging/)
  await expect(page.locator('.drag-arrow.up')).toBeVisible()
  expect(await withStores(page, ({ ui }) => [ui.cursorMode, ui.cursorTarget])).toEqual(['drag', null])
  const side = (await page.locator('.cursor-square.outer').boundingBox()).width
  expect(side).toBeGreaterThan(50)

  // Held still first, so the map does not glide on after the release.
  await page.waitForTimeout(300)
  await page.mouse.up()
  await expect(page.locator('.cursor-wrapper')).not.toHaveClass(/is-dragging/)
  await expect(page.locator('.drag-arrow.up')).toBeHidden()
  await expect.poll(() => withStores(page, ({ ui }) => ui.cursorTarget)).not.toBeNull()
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true })

  // Was: on a phone the cursor dot stood mid-screen from the start and wherever a finger dragged the map.
  test('shows no cursor of its own until a mouse moves', async ({ page }) => {
    await page.goto('/')
    await waitForView(page, 'galaxy')
    const cursor = page.locator('.cursor-wrapper')
    await expect(cursor).toHaveCount(0)
    await page.touchscreen.tap(40, 40)
    await page.waitForTimeout(300)
    await expect(cursor).toHaveCount(0)
    await page.mouse.move(700, 450)
    await expect(cursor).toHaveCount(1)
  })
})

