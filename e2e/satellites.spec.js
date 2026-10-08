import { expect, test } from '@playwright/test'
import { openHash, worldMap, serveMap, watchConsole, withStores } from './helpers.js'

test.use({ viewport: { width: 1600, height: 900 } })

const crownOf = map => map.systems.asterion.planets.find(planet => planet.name === 'Crown')
const moon = (name, distance, size, angle, landColor) => ({
  name, distance, size, angle, visualization: { seed: name.toLowerCase(), landColor, waterAmount: 0 }
})

// Crown with ten bodies: two moons and two stations share orbits, all four station types.
function crowdedCrown() {
  const map = worldMap()
  const crown = crownOf(map)
  crown.visualization.ring.size = 'large'
  crown.satellites = [
    { ...crown.satellites[0], distance: 2.4, size: 0.2, angle: 30 },
    { name: 'Crown Ring', kind: 'station', type: 'ring', distance: 2.1, size: 0.35, angle: 200 },
    moon('Tiara', 3, 0.15, undefined, '0x9a8fb0'),
    moon('Circlet', 3, 0.12, undefined, '0xb8b0c8'),
    { name: 'Crown Yard', kind: 'station', type: 'shipyard', distance: 3.6, size: 0.35, angle: 90, speed: 0.015 },
    { name: 'Crown Spindle', kind: 'station', type: 'spindle', distance: 3.6, size: 0.35, angle: 270 },
    moon('Diadem', 4.2, 0.18, 250, '0x8c84a8'),
    { name: 'Regent Post', kind: 'station', type: 'outpost', distance: 4.6, angle: 330 },
    moon('Coronet', 5, 0.1, 120, '0x4a4658'),
    { name: 'Sceptre Post', kind: 'station', type: 'outpost', distance: 5.6 }
  ]
  return map
}

const dataTitle = page => page.locator('.window-data .planet-lore-title')

test('a satellite has its own address, screen and tab title', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/system/sol/3/1')
  await expect(dataTitle(page)).toHaveText('MOON')
  await expect(page.locator('.window-data .planet-lore-orbit')).toContainText('MOON OF EARTH')
  await expect(page).toHaveTitle('Moon · Sol — SpaceMap')
  await expect(page.locator('.window-visual .planet-params')).toContainText('Moon:')
  await expect(page.locator('.window-visual .satellite-body')).toHaveCount(0)
  await openHash(page, '#/system/sol/3')
  await expect(dataTitle(page)).toHaveText('EARTH')
  consoleIsClean()
})

test('satellites hang under their planet in the list and lead back to it', async ({ page }) => {
  await openHash(page, '#/system/sol')
  const moonRow = page.locator('.satellite-list-item', { has: page.locator('.planet-list-name', { hasText: /^MOON$/ }) })
  await expect(moonRow).toBeVisible()
  await moonRow.click()
  await expect(page).toHaveURL(/#\/system\/sol\/3\/1$/)
  await expect(dataTitle(page)).toHaveText('MOON')
  await page.locator('.terminal-link', { hasText: '<- EARTH' }).click()
  await expect(page).toHaveURL(/#\/system\/sol\/3$/)
  await expect(dataTitle(page)).toHaveText('EARTH')
})

// The default colour is the Moon's grey (0x9a9a9a).
async function pixelsNear(page, center, reach = 30, color = [154, 154, 154]) {
  const clip = { x: center.x - reach, y: center.y - reach, width: reach * 2, height: reach * 2 }
  const shot = await page.screenshot({ clip })
  return page.evaluate(async ([data, [r, g, b]]) => {
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
      const [red, green, blue] = [pixels[index], pixels[index + 1], pixels[index + 2]]
      if (Math.abs(red - r) < 10 && Math.abs(green - g) < 10 && Math.abs(blue - b) < 10) count++
    }
    return count
  }, [shot.toString('base64'), color])
}

test('the Moon goes round Earth on the system screen, wherever Earth is', async ({ page }) => {
  await openHash(page, '#/system/sol')
  await page.mouse.move(5, 5)
  const earth = page.locator('.system-planet').nth(2)
  const centerOf = async () => {
    const box = await earth.boundingBox()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  expect(await pixelsNear(page, await centerOf())).toBeGreaterThan(1)
  // Let Earth move on: its Moon must move with it.
  await page.waitForTimeout(3000)
  expect(await pixelsNear(page, await centerOf())).toBeGreaterThan(1)
  // The station glyph in the default hull colour (0x9aa3ad).
  expect(await pixelsNear(page, await centerOf(), 30, [154, 163, 173])).toBeGreaterThan(3)
})

test('the Moon circles the big Earth and opens with a click', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  const moon = page.locator('.window-visual .satellite-body[aria-label="Moon: Moon"]')
  await expect(moon).toHaveCount(1)
  await page.mouse.move(5, 5)
  const before = await moon.boundingBox()
  await page.waitForTimeout(600)
  const after = await moon.boundingBox()
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(2)
  const spot = await moon.boundingBox()
  await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2)
  await expect(moon).toHaveClass(/is-hovered/)
  expect(await withStores(page, ({ ui }) => ui.cursorTarget)).not.toBeNull()
  const waiting = await moon.boundingBox()
  await page.mouse.click(waiting.x + waiting.width / 2, waiting.y + waiting.height / 2)
  await expect(page).toHaveURL(/#\/system\/sol\/3\/1$/)
  await expect(dataTitle(page)).toHaveText('MOON')
})

test('a [[Moon]] link in the lore of Earth opens the Moon', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  // A click skips the typing of the lore.
  const lore = page.locator('.window-data .planet-lore-text')
  await lore.click()
  const link = lore.locator('.rt-link', { hasText: 'Moon' }).first()
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(/#\/system\/sol\/3\/1$/)
})

test('arrows go through planets, their moons and stations in order', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  await page.mouse.move(5, 5)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/#\/system\/sol\/3\/1$/)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/#\/system\/sol\/3\/2$/)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/#\/system\/sol\/4$/)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/#\/system\/sol\/4\/1$/)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(/#\/system\/sol\/3\/2$/)
})

function canvasPrint(locator) {
  return locator.evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let drawn = 0
    let sum = 0
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] === 0) continue
      drawn++
      sum = (sum + data[index] * 3 + data[index + 1] * 5 + data[index + 2] * 7 + index) % 1000000007
    }
    return { drawn, sum }
  })
}

test('a station has its own screen, drawn big and moving', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/system/sol/3/2')
  await expect(dataTitle(page)).toHaveText('EXODUS STATION')
  await expect(page.locator('.window-data .planet-lore-orbit')).toHaveText('STATION AT EARTH · RING')
  await expect(page).toHaveTitle('Exodus Station · Sol — SpaceMap')
  await expect(page.locator('.window-visual .planet-params')).toContainText('RING')
  await expect(page.locator('.window-visual .planet-params')).toContainText('18% OF PLANET')
  const canvas = page.locator('.window-visual .planet-canvas-wrapper > .station-visualization canvas')
  await expect(canvas).toHaveCount(1)
  await page.mouse.move(5, 5)
  await page.waitForTimeout(500)
  const before = await canvasPrint(canvas)
  expect(before.drawn).toBeGreaterThan(2000)
  await page.waitForTimeout(700)
  expect((await canvasPrint(canvas)).sum).not.toBe(before.sum)
  await withStores(page, ({ systemSettings }) => systemSettings.set('visual', 'rotate', false))
  await page.waitForTimeout(200)
  const stopped = await canvasPrint(canvas)
  await page.waitForTimeout(700)
  expect(await canvasPrint(canvas)).toEqual(stopped)
  await withStores(page, ({ systemSettings }) => systemSettings.set('visual', 'rotate', true))
  consoleIsClean()
})

test('stations are listed apart from moons and open from the planet', async ({ page }) => {
  await openHash(page, '#/system/sol')
  const row = page.locator('.satellite-list-item', { hasText: 'EXODUS STATION' })
  await expect(row.locator('.planet-list-orbit')).toHaveText('STATION')
  await openHash(page, '#/system/sol/3')
  await expect(page.locator('.window-data .planet-lore-satellites.is-moons')).toContainText('[ MOON ]')
  const stations = page.locator('.window-data .planet-lore-satellites.is-stations')
  await expect(stations).toHaveText(/STATIONS:\s*\[ EXODUS STATION \]/)
  await stations.locator('.satellite-link').click()
  await expect(page).toHaveURL(/#\/system\/sol\/3\/2$/)
  await expect(page.locator('.window-data .planet-lore-orbit')).toHaveText('STATION AT EARTH · RING')
})

test('a station circles the big planet with the moons', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  const station = page.locator('.window-visual .satellite-body[aria-label="Station: Exodus Station"]')
  await expect(station.locator('.station-visualization canvas')).toHaveCount(1)
  await page.mouse.move(5, 5)
  const before = await station.boundingBox()
  await page.waitForTimeout(600)
  const after = await station.boundingBox()
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(2)
})

// { x, y }: the centre of the big planet; reach: how far its ring reaches along the middle row.
function bigPlanet(page) {
  return page.locator('.window-visual .planet-canvas-wrapper > .planet-visualization canvas').evaluate(canvas => {
    const box = canvas.getBoundingClientRect()
    const row = Math.floor(canvas.height / 2)
    const data = canvas.getContext('2d').getImageData(0, row, canvas.width, 1).data
    let left = canvas.width
    let right = -1
    for (let x = 0; x < canvas.width; x++) {
      if (data[x * 4 + 3] === 0) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
    }
    const scale = box.width / canvas.width
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, reach: ((right - left + 1) / 2) * scale }
  })
}

function bodiesAround(page, center) {
  return page.locator('.window-visual .satellite-body').evaluateAll((elements, { x, y, tilt }) => elements.map(element => {
    const box = element.getBoundingClientRect()
    const dx = box.left + box.width / 2 - x
    const dy = (box.top + box.height / 2 - y) / tilt
    return { name: element.getAttribute('aria-label'), radius: Math.hypot(dx, dy), angle: Math.atan2(dy, dx), half: box.width / 2 }
  }), { x: center.x, y: center.y, tilt: 0.3 })
}

test('the satellites in sight slow down to a quarter while the pointer is over the planet or its orbits', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  await expect(page.locator('.window-visual .satellite-body')).toHaveCount(2)
  const planet = await bigPlanet(page)
  const moonAngle = async () => (await bodiesAround(page, planet)).find(body => body.name === 'Moon: Moon').angle
  // Radians the Moon turns in `ms`.
  const turn = async ms => {
    const start = await moonAngle()
    await page.waitForTimeout(ms)
    const gone = (await moonAngle()) - start
    return Math.abs(Math.atan2(Math.sin(gone), Math.cos(gone)))
  }
  // Screen y grows downwards: the near half of the orbit is below the centre.
  const waitForHalf = near => expect.poll(async () => Math.sin(await moonAngle()) * (near ? 1 : -1), { timeout: 15000, intervals: [100] }).toBeGreaterThan(0.5)
  await page.mouse.move(5, 5)
  await waitForHalf(true)
  const free = await turn(600)
  // The pointer on the planet (on no body), the Moon in sight: a quarter of the speed.
  await page.mouse.move(planet.x, planet.y)
  await page.waitForTimeout(350)
  expect(Math.sin(await moonAngle())).toBeGreaterThan(0)
  const aimed = await turn(600)
  expect(Math.sin(await moonAngle())).toBeGreaterThan(0)
  expect(aimed / free).toBeGreaterThan(0.15)
  expect(aimed / free).toBeLessThan(0.38)
  await page.mouse.move(5, 5)
  await waitForHalf(false)
  await page.mouse.move(planet.x, planet.y)
  await page.waitForTimeout(100)
  expect((await turn(600)) / free).toBeGreaterThan(0.8)
  await waitForHalf(true)
  await page.mouse.move(5, 5)
  await page.waitForTimeout(350)
  expect((await turn(600)) / free).toBeGreaterThan(0.8)
})

test('orbits around a ringed planet start past the ring', async ({ page }) => {
  // Two of Crown's bodies would stand inside its ring.
  const map = worldMap()
  crownOf(map).satellites.push(
    moon('Tiara', 2.2, 0.14, 120, '0x9a8fb0'),
    { name: 'Crown Yard', kind: 'station', type: 'shipyard', distance: 1.6, size: 0.45, angle: 60 }
  )
  await serveMap(page, map)
  await openHash(page, '#/system/asterion/3')
  await page.mouse.move(5, 5)
  await expect(page.locator('.window-visual .satellite-body')).toHaveCount(3)
  await page.waitForTimeout(500)
  const planet = await bigPlanet(page)
  for (const body of await bodiesAround(page, planet)) {
    expect(body.radius, body.name).toBeGreaterThan(planet.reach)
  }
})

// Was: "size" was read and shown, but every planet was drawn as big.
test('a planet is drawn as big as its size says, its satellites in step and in the window', async ({ page }) => {
  const earthAt = async size => {
    const map = worldMap()
    map.systems.sol.planets.find(planet => planet.name === 'Earth').visualization.size = size
    await serveMap(page, map)
    // The same address again would only be a jump within the page.
    await page.goto('about:blank')
    await openHash(page, '#/system/sol/3')
    await page.mouse.move(5, 5)
    await expect(page.locator('.window-visual .satellite-body')).toHaveCount(2)
    await page.waitForTimeout(500)
    return bigPlanet(page)
  }
  const usual = await earthAt(100)
  const half = await earthAt(50)
  expect(half.reach / usual.reach).toBeGreaterThan(0.45)
  expect(half.reach / usual.reach).toBeLessThan(0.55)
  const big = await earthAt(150)
  expect(big.reach / usual.reach).toBeGreaterThan(1.2)
  const frame = await page.locator('.window-visual .planet-display-container').boundingBox()
  const bodies = await page.locator('.window-visual .satellite-body').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
  }))
  for (const body of bodies) {
    expect(body.left).toBeGreaterThanOrEqual(frame.x - 1)
    expect(body.right).toBeLessThanOrEqual(frame.x + frame.width + 1)
    expect(body.top).toBeGreaterThanOrEqual(frame.y - 1)
    expect(body.bottom).toBeLessThanOrEqual(frame.y + frame.height + 1)
  }
})

const gridRows = page => page.locator('.window-visual .satellite-row')
const rowTitles = page => gridRows(page).locator('.satellite-row-title')
const layoutToggle = page => page.locator('.window-visual .layout-toggle')

test('the satellites can stand in rows by orbit instead of flying round the planet', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  await expect(page.locator('.window-visual .satellite-body')).toHaveCount(2)
  const [toggle, minimize] = await Promise.all([
    layoutToggle(page).boundingBox(),
    page.locator('.window-visual .button-minimize').boundingBox()
  ])
  expect(toggle.x + toggle.width).toBeLessThanOrEqual(minimize.x)
  expect(minimize.x - (toggle.x + toggle.width)).toBeLessThan(24)
  await expect(layoutToggle(page)).toHaveText('[ GRID ]')
  await layoutToggle(page).click()
  await expect(layoutToggle(page)).toHaveText('[ ORBITS ]')

  await expect(page.locator('.window-visual .satellite-orbits')).toHaveCount(0)
  await expect(rowTitles(page)).toHaveText(['ORBIT I · 2.4 R', 'ORBIT II · 3.2 R'])
  await expect(gridRows(page).nth(0).locator('.satellite-tile')).toHaveText(['MoonMOON'])
  await expect(gridRows(page).nth(1).locator('.satellite-tile')).toHaveText(['Exodus StationSTATION'])
  await expect(gridRows(page).locator('.satellite-row-arc')).toHaveCount(2)
  const boxes = async () => {
    await expect(page.locator('.window-visual .visual-satellite-grid')).not.toHaveClass(/satellites-tube/)
    const [planet, params, grid] = await Promise.all([
      page.locator('.window-visual .planet-canvas-wrapper').boundingBox(),
      page.locator('.window-visual .planet-params').boundingBox(),
      page.locator('.window-visual .visual-satellite-grid').boundingBox()
    ])
    expect(grid.x).toBeGreaterThanOrEqual(Math.max(planet.x + planet.width, params.x + params.width) - 1)
    return { planet, params }
  }
  const low = await boxes()
  expect(low.params.x).toBeGreaterThanOrEqual(low.planet.x + low.planet.width - 1)
  const moon = page.locator('.window-visual .satellite-tile[aria-label="Moon: Moon"]')
  const before = await moon.boundingBox()
  await page.waitForTimeout(600)
  expect(await moon.boundingBox()).toEqual(before)
  await withStores(page, ({ ui }) => ui.toggleMaximizeWindow('visual'))
  await page.waitForTimeout(400)
  const tall = await boxes()
  expect(tall.params.y).toBeGreaterThanOrEqual(tall.planet.y + tall.planet.height - 1)
  await withStores(page, ({ ui }) => ui.toggleMaximizeWindow('visual'))

  await moon.hover()
  await expect(moon).toHaveClass(/is-hovered/)
  expect(await withStores(page, ({ ui }) => ui.cursorTarget)).toBeNull()
  await moon.click()
  await expect(page).toHaveURL(/#\/system\/sol\/3\/1$/)
  await expect(dataTitle(page)).toHaveText('MOON')
  await page.goto('/#/system/sol/3')
  await expect(rowTitles(page)).toHaveCount(2)
  await layoutToggle(page).click()
  await expect(page.locator('.window-visual .satellite-body')).toHaveCount(2)
  await expect(gridRows(page)).toHaveCount(0)
})

// Was: six bodies of ten on the orbits, the rest behind "+4 MORE" in PLANET-DATA.
test('a planet with more satellites than the orbits hold shows them all in the grid', async ({ page }) => {
  await serveMap(page, crowdedCrown())
  await openHash(page, '#/system/asterion/3')
  expect(await withStores(page, ({ systemSettings }) => systemSettings.visual.layout)).toBe('orbits')
  await expect(page.locator('.window-visual .satellite-tile')).toHaveCount(10)
  await expect(page.locator('.window-visual .satellite-body, .window-visual .satellite-more')).toHaveCount(0)
  await expect(rowTitles(page)).toHaveText([
    'ORBIT I · 2.1 R', 'ORBIT II · 2.4 R', 'ORBIT III · 3.0 R', 'ORBIT IV · 3.6 R',
    'ORBIT V · 4.2 R', 'ORBIT VI · 4.6 R', 'ORBIT VII · 5.0 R', 'ORBIT VIII · 5.6 R'
  ])
  await expect(gridRows(page).nth(3).locator('.satellite-tile-name')).toHaveText(['Crown Yard', 'Crown Spindle'])
  // Was: the stations were cut square and the ring of the planet was cut off.
  await expect(page.locator('.window-visual .visual-satellite-grid')).not.toHaveClass(/satellites-tube/)
  await page.waitForTimeout(300)
  const edgePixels = selector => page.locator(selector).evaluateAll(canvases => canvases.map(canvas => {
    const { width, height } = canvas
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
    const lit = (x, y) => data[(y * width + x) * 4 + 3] > 0
    let count = 0
    for (let x = 0; x < width; x++) count += lit(x, 0) + lit(x, height - 1)
    for (let y = 0; y < height; y++) count += lit(0, y) + lit(width - 1, y)
    return count
  }))
  const stations = await edgePixels('.window-visual .satellite-tile .station-visualization canvas')
  expect(stations).toHaveLength(5)
  expect(stations).toEqual([0, 0, 0, 0, 0])
  expect(await edgePixels('.window-visual .planet-canvas-wrapper > .planet-visualization canvas')).toEqual([0])
  // Was: the name and kind of a tile stood under the picture, out past the frame of the hover.
  const tiles = await page.locator('.window-visual .satellite-tile').evaluateAll(elements => elements.map(tile => {
    const box = tile.getBoundingClientRect()
    const [picture, name] = ['.satellite-tile-picture', '.satellite-tile-name'].map(selector => tile.querySelector(selector).getBoundingClientRect())
    const outside = [...tile.children].some(child => {
      const part = child.getBoundingClientRect()
      return part.left < box.left - 0.5 || part.right > box.right + 0.5 || part.top < box.top - 0.5 || part.bottom > box.bottom + 0.5
    })
    return { outside, beside: name.left >= picture.right }
  }))
  expect(tiles).toHaveLength(10)
  expect(tiles.filter(tile => tile.outside || !tile.beside)).toEqual([])
  await expect(layoutToggle(page)).toHaveText('[ ORBITS ]')
  await expect(layoutToggle(page)).toBeDisabled()
  await expect(layoutToggle(page)).toHaveAttribute('data-hint', 'Too many moons for orbits')
  const last = page.locator('.window-visual .satellite-tile[aria-label="Station: Sceptre Post"]')
  await last.scrollIntoViewIfNeeded()
  await last.click()
  await expect(page).toHaveURL(/#\/system\/asterion\/3\/10$/)
})

test('more than three bodies fold in the list and stand on one halo', async ({ page }) => {
  await serveMap(page, crowdedCrown())
  await openHash(page, '#/system/asterion')
  const toggle = page.locator('.satellite-list-toggle')
  await expect(toggle).toHaveCount(1)
  await expect(toggle.locator('.planet-list-name')).toHaveText('5 MOONS AND 5 STATIONS')
  // Only Concord Ring of Daybreak is listed.
  const listed = page.locator('.satellite-list-item:not(.satellite-list-toggle)')
  await expect(listed).toHaveCount(1)
  await expect(listed.locator('.planet-list-name')).toHaveText('CONCORD RING')
  await toggle.click()
  await expect(listed).toHaveCount(11)
  // The pixel-dashed halo of the swarm: 0x777777 at 0.8.
  await page.mouse.move(5, 5)
  const crown = await page.locator('.system-planet').nth(2).boundingBox()
  const center = { x: crown.x + crown.width / 2, y: crown.y + crown.height / 2 }
  // The bodies go round on the halo and hide some of its dashes, so poll until enough show.
  await expect.poll(() => pixelsNear(page, center, 28, [95, 95, 95])).toBeGreaterThan(15)
})

test('a satellite dims smoothly behind the planet, not at once', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  await page.mouse.move(5, 5)
  const moon = page.locator('.window-visual .satellite-body[aria-label="Moon: Moon"]')
  await expect(moon).toHaveCount(1)
  // Light of the Moon frame by frame for a whole turn (about 13 s).
  const lights = await moon.evaluate(element => new Promise(resolve => {
    const seen = []
    const started = performance.now()
    const read = () => {
      const match = /brightness\(([\d.]+)\)/.exec(element.style.filter)
      seen.push(match ? Number(match[1]) : 1)
      if (performance.now() - started < 13500) requestAnimationFrame(read)
      else resolve(seen)
    }
    read()
  }))
  const between = lights.filter(light => light > 0.62 && light < 0.98)
  expect(between.length).toBeGreaterThan(20)
  const jumps = lights.slice(1).map((light, index) => Math.abs(light - lights[index]))
  expect(Math.max(...jumps)).toBeLessThan(0.05)
})

test('satellites go out and come on with their planet', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  await expect(page.locator('.window-visual .satellite-orbits')).toHaveCount(1)
  // Per frame: the width and height (the scale of the tube animation) of the satellite layers and the planet.
  const frames = page.evaluate(() => new Promise(resolve => {
    const rows = []
    const started = performance.now()
    const scaleOf = element => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform)
      return { width: matrix.a, height: matrix.d }
    }
    const read = () => {
      const planet = document.querySelector('.window-visual .planet-canvas-wrapper > .planet-visualization')
      rows.push({
        planet: planet ? scaleOf(planet) : null,
        layers: [...document.querySelectorAll('.window-visual .satellite-orbits')].map(element => ({
          leaving: element.classList.contains('satellites-tube-leave-active'),
          entering: element.classList.contains('satellites-tube-enter-active'),
          ...scaleOf(element)
        }))
      })
      if (performance.now() - started < 900) requestAnimationFrame(read)
      else resolve(rows)
    }
    read()
  }))
  await withStores(page, ({ ui }) => ui.selectPlanet(3))
  const rows = await frames
  const layers = rows.flatMap(row => row.layers)
  expect(layers.some(layer => layer.leaving && layer.height < 0.5)).toBe(true)
  const entering = rows.filter(row => row.layers.some(layer => layer.entering))
  expect(entering.length).toBeGreaterThan(5)
  expect(entering[0].layers.find(layer => layer.entering).width).toBeLessThan(0.05)
  for (const row of entering) {
    const layer = row.layers.find(item => item.entering)
    if (row.planet !== null && row.planet.height < 0.05) expect(layer.height).toBeLessThan(0.5)
  }
  await expect(page.locator('.window-visual .satellite-orbits')).toHaveCount(1)
})

// Was: with PLANET-VISUAL the only window left, a satellite opened from it had no way back to its planet.
const visualBack = page => page.locator('.window-visual .visual-back-btn')

test('PLANET-VISUAL alone leads from a satellite back to its planet', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/system/sol/3')
  await withStores(page, ({ ui }) => ['system', 'data'].forEach(id => ui.minimizeWindow(id)))
  await expect(page.locator('.window-data')).toBeHidden()
  await expect(visualBack(page)).toHaveCount(0)

  const moon = page.locator('.window-visual .satellite-body[aria-label="Moon: Moon"]')
  const spot = await moon.boundingBox()
  await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2)
  await expect(moon).toHaveClass(/is-hovered/)
  const waiting = await moon.boundingBox()
  await page.mouse.click(waiting.x + waiting.width / 2, waiting.y + waiting.height / 2)
  await expect(page).toHaveURL(/#\/system\/sol\/3\/1$/)

  await expect(visualBack(page)).toHaveText('[ <- EARTH ]')
  await expect(visualBack(page)).toHaveAttribute('data-hint', 'Back to planet Earth')
  await expect(layoutToggle(page)).toHaveCount(0)
  const [back, minimize] = await Promise.all([visualBack(page).boundingBox(), page.locator('.window-visual .button-minimize').boundingBox()])
  expect(back.x + back.width).toBeLessThanOrEqual(minimize.x)

  await visualBack(page).click()
  await expect(page).toHaveURL(/#\/system\/sol\/3$/)
  await expect(visualBack(page)).toHaveCount(0)
  await expect(layoutToggle(page)).toHaveText('[ GRID ]')
  await expect(page.locator('.window-visual .satellite-body')).toHaveCount(2)
  await expect(page.locator('.window-data')).toBeHidden()

  await layoutToggle(page).click()
  await page.locator('.window-visual .satellite-tile[aria-label="Station: Exodus Station"]').click()
  await expect(page).toHaveURL(/#\/system\/sol\/3\/2$/)
  await visualBack(page).click()
  await expect(page).toHaveURL(/#\/system\/sol\/3$/)
  await expect(rowTitles(page)).toHaveCount(2)
  consoleIsClean()
})

test('in a narrow PLANET-VISUAL the way back to the planet is a short arrow', async ({ page }) => {
  // The smallest phone: its one window takes nearly the whole width.
  await page.setViewportSize({ width: 320, height: 568 })
  await openHash(page, '#/system/sol/4/1')
  await page.locator('.taskbar-item[data-window="visual"]').click()
  await expect(visualBack(page)).toHaveText('[ <- ]')
  await expect(visualBack(page)).toHaveAttribute('title', 'Back to planet Mars')
  await visualBack(page).click()
  await expect(page).toHaveURL(/#\/system\/sol\/4$/)
  await expect(visualBack(page)).toHaveCount(0)
})
