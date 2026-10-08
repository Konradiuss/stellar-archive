import { expect, test } from '@playwright/test'
import { center, openHash, worldMap, serveMap, waitForView, watchConsole, withStores } from './helpers'

let checkConsole
test.beforeEach(({ page }) => { checkConsole = watchConsole(page) })
test.afterEach(() => checkConsole())

const selectedPlanetIndex = page => withStores(page, ({ ui }) => ui.selectedPlanetIndex)

test('the cursor locks onto a planet that has moved along its orbit', async ({ page }) => {
  // Was: every re-render of SystemView put the planets back at their start for a frame, and the lock-on measured that spot.
  await openHash(page, '#/system/vesper')
  await page.waitForTimeout(3000) // let the planets travel away from the start
  await withStores(page, ({ systemSettings }) => systemSettings.set('system', 'speed', 0))
  await page.waitForTimeout(100)

  const planet = page.locator('.system-planet').first()
  const target = await center(planet)
  // Approach from aside, so pointerover/mouseenter fire as for a real user.
  await page.mouse.move(target.x + 90, target.y + 90)
  await page.mouse.move(target.x, target.y, { steps: 8 })
  await page.waitForTimeout(300)

  const lock = await withStores(page, ({ ui }) => ui.cursorTarget && { x: ui.cursorTarget.x, y: ui.cursorTarget.y })
  expect(lock).not.toBeNull()
  expect(Math.abs(lock.x - target.x)).toBeLessThan(3)
  expect(Math.abs(lock.y - target.y)).toBeLessThan(3)
  const after = await center(planet)
  expect(Math.abs(after.x - target.x)).toBeLessThan(1)
  expect(Math.abs(after.y - target.y)).toBeLessThan(1)
})

test('a planet picked from the list does not stay frozen on its orbit', async ({ page }) => {
  // Was: the hovered row vanished on selection without mouseleave, so the planet stayed stopped and enlarged.
  await openHash(page, '#/system/sol')
  await page.evaluate(() => {
    const row = document.querySelectorAll('.planet-list-item')[1]
    row.dispatchEvent(new MouseEvent('mouseenter'))
    row.click()
  })
  await expect.poll(() => selectedPlanetIndex(page)).toBe(1)
  await expect(page.locator('.system-planet.is-hovered')).toHaveCount(0)
})

test('the menu button and the jump button close their own menus', async ({ page }) => {
  // Was: the press closed the menu as "outside", the click opened it again.
  await openHash(page, '#/system/sol')
  const menuButton = page.locator('.window-data .button-menu')
  await menuButton.click()
  await expect(page.locator('.window-data .dos-menu')).toBeVisible()
  await menuButton.click()
  await expect(page.locator('.dos-menu')).toHaveCount(0)

  const jump = page.locator('.jump-anchor .back-btn')
  await jump.click()
  await expect(page.locator('.jump-anchor .dos-menu')).toBeVisible()
  await jump.click()
  await expect(page.locator('.dos-menu')).toHaveCount(0)
})

test('a double click inside an open menu does not maximize the window', async ({ page }) => {
  await openHash(page, '#/system/sol')
  await page.locator('.window-data .button-menu').click()
  await page.locator('.window-data .dos-menu-title').dblclick()
  await page.waitForTimeout(300)
  await expect(page.locator('.terminal-window.is-maximized')).toHaveCount(0)
})

test('a minimized window goes to the taskbar and comes back with its menu closed', async ({ page }) => {
  await openHash(page, '#/system/sol')
  await page.locator('.window-data .button-menu').click()
  await page.locator('.window-data .button-minimize').click()
  await expect(page.locator('.taskbar-item')).toHaveText('[ PLANET-DATA.EXE ]')
  await expect(page.locator('.window-data')).toBeHidden()

  await page.locator('.taskbar-item').click()
  await expect(page.locator('.window-data')).toBeVisible()
  await expect(page.locator('.dos-menu')).toHaveCount(0)
})

test('a window left alone offers to restore the windows and brings all three back', async ({ page }) => {
  await openHash(page, '#/system/sol')
  const maximize = id => page.locator(`.window-${id} .button-maximize`)
  const allShown = async () => {
    for (const id of ['system', 'data', 'visual']) await expect(page.locator(`.window-${id}`)).toBeVisible()
    await expect(page.locator('.taskbar-item')).toHaveCount(0)
  }
  await expect(maximize('system')).toHaveAttribute('aria-label', 'Maximize SYSTEM-VIEW.EXE')
  await page.locator('.window-data .button-minimize').click()
  await expect(page.locator('.window-data')).toBeHidden()
  await page.locator('.window-visual .button-minimize').click()
  await expect(page.locator('.window-visual')).toBeHidden()
  await expect(maximize('system')).toHaveText('RESTORE WINDOWS')
  await page.mouse.move(5, 5)
  await expect(page.locator('.taskbar-hint')).toContainText('ESC:WINDOWS')
  await maximize('system').click()
  await allShown()
  await expect(maximize('system')).toHaveAttribute('aria-label', 'Maximize SYSTEM-VIEW.EXE')

})

test('a maximized window gives the windows back as they were, the minimized ones stay down', async ({ page }) => {
  // Was: with one window minimized, maximize and restore brought all three back.
  await openHash(page, '#/system/sol')
  const maximize = id => page.locator(`.window-${id} .button-maximize`)
  const asBefore = async () => {
    await expect(page.locator('.window-system')).toBeVisible()
    await expect(page.locator('.window-visual')).toBeVisible()
    await expect(page.locator('.window-data')).toBeHidden()
    await expect(page.locator('.taskbar-item')).toHaveText(['[ PLANET-DATA.EXE ]'])
  }
  await page.locator('.window-data .button-minimize').click()
  await expect(page.locator('.window-data')).toBeHidden()

  await maximize('visual').click()
  await expect(maximize('visual')).toHaveText('RESTORE')
  await expect(maximize('visual')).toHaveAttribute('data-hint', 'Bring the windows back as they were')
  await maximize('visual').click()
  await asBefore()

  await maximize('visual').click()
  await expect(maximize('visual')).toHaveText('RESTORE')
  await page.mouse.move(5, 5)
  await expect(page.locator('.taskbar-hint')).toContainText('ESC:WINDOWS')
  await page.keyboard.press('Escape')
  await asBefore()
  await waitForView(page, 'system')
})

test('the button of a minimized window blinks in the taskbar, so the eye finds it', async ({ page }) => {
  await openHash(page, '#/system/sol')
  await page.mouse.move(5, 5)
  await page.locator('.window-data .button-minimize').click()
  const button = page.locator('.taskbar-item[data-window="data"]')
  await expect(button).toHaveClass(/is-arriving/)
  await expect(button).not.toHaveClass(/is-arriving/)
  const look = () => button.evaluate(element => getComputedStyle(element).backgroundColor)
  expect(await look()).toBe('rgba(0, 0, 0, 0)')
  await button.click()
  await expect(page.locator('.window-data')).toBeVisible()
  await expect(page.locator('.taskbar-item')).toHaveCount(0)
})

test('Back pressed during a jump returns without extra history entries', async ({ page }) => {
  // Was: the finished jump pushed its own address over the user's Back.
  await openHash(page, '#/', 'galaxy')
  await withStores(page, ({ ui }) => ui.selectStar('sol'))
  await waitForView(page, 'system')
  const lengthBefore = await page.evaluate(() => history.length)

  await withStores(page, ({ ui }) => ui.jumpToStar('asterion'))
  await page.evaluate(() => history.back())
  await waitForView(page, 'galaxy')
  await page.waitForTimeout(500)

  expect(await page.evaluate(() => location.hash)).toBe('')
  expect(await page.evaluate(() => history.length)).toBe(lengthBefore)
})

test('a star without planets opens from its URL and survives a reload', async ({ page }) => {
  // Was: a system without an entry in `systems` fell back to the galaxy.
  const data = worldMap()
  delete data.systems['silent-reach']
  await serveMap(page, data)
  await openHash(page, '#/system/silent-reach')
  expect(await withStores(page, ({ ui }) => ui.selectedStar)).toBe('silent-reach')
  await page.reload()
  await waitForView(page, 'system')
  expect(await page.evaluate(() => location.hash)).toBe('#/system/silent-reach')
})

test('planets after the ninth are reachable with pages and keys', async ({ page }) => {
  // Was: keys stopped at 9 and later planets were listed as [-].
  await openHash(page, '#/', 'galaxy')
  await withStores(page, ({ map, ui }) => {
    const planets = map.systems.sol.planets
    for (let index = planets.length + 1; index <= 12; index++) {
      planets.push({ name: `Test-${index}`, orbitRadius: 100 + index * 8, angle: index * 30, lore: 'x', visualization: { size: 50 } })
    }
    ui.selectStar('sol')
  })
  await waitForView(page, 'system')
  await expect(page.locator('.taskbar-hint')).toContainText('1-9:PLANET')

  await page.keyboard.press('PageDown')
  await expect(page.locator('.planet-list-page-label')).toHaveText('PG 2/2')
  await expect(page.locator('.taskbar-hint')).toContainText('1-3:PLANET')
  await page.keyboard.press('3')
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/system/sol/12')
})

test('planets are equally round on the left and on the right', async ({ page }) => {
  // Was: the pixel grid was tied to the canvas corner, so planets shifted a cell and their left edge looked cut flat.
  await openHash(page, '#/system/sol/3') // Earth: no rings around it
  const rows = selector => page.evaluate(selector => {
    const canvas = document.querySelector(selector)
    const { width, height } = canvas
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
    const origin = Math.round(width / 2)
    const result = []
    for (let y = 0; y < height; y++) {
      let min = -1
      let max = -1
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] === 0) continue
        if (min < 0) min = x
        max = x
      }
      if (min >= 0) result.push({ y, left: origin - min, right: max + 1 - origin })
    }
    return result
  }, selector)

  for (const selector of ['.planet-canvas.is-draggable', '.system-planet .planet-canvas']) {
    const silhouette = await rows(selector)
    expect(silhouette.length, selector).toBeGreaterThan(10)
    for (const row of silhouette) expect(row.left, `${selector} y=${row.y}`).toBe(row.right)
  }
})

test('the cursor follows the mouse while the planet is turned, and stays put after the release', async ({ page }) => {
  // Was: the press on the planet stopped mousemove, so the cursor froze while the planet turned and jumped on release.
  await openHash(page, '#/system/sol/3')
  const canvas = page.locator('.planet-canvas.is-draggable')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const dot = async () => {
    const spot = await page.locator('.center-dot').boundingBox()
    return { x: spot.x + spot.width / 2, y: spot.y + spot.height / 2 }
  }
  const near = async (point, label) => {
    await expect.poll(async () => {
      const at = await dot()
      return Math.hypot(at.x - point.x, at.y - point.y)
    }, { message: label }).toBeLessThan(3)
  }
  await page.mouse.move(start.x, start.y)
  await near(start, 'before the press')
  await page.mouse.down()
  const end = { x: start.x + 120, y: start.y + 10 }
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await near(end, 'while turning')
  await page.mouse.up()
  await page.waitForTimeout(400)
  await near(end, 'after the release')
})

test('the empty planet outline has evenly spaced dashes', async ({ page }) => {
  // Was: the dash pattern did not fit the circle a whole number of times, and two dashes merged where it closed.
  await openHash(page, '#/system/sol')
  const outline = page.locator('.planet-outline circle')
  const pathLength = Number(await outline.getAttribute('pathLength'))
  const period = (await outline.getAttribute('stroke-dasharray')).split(/[\s,]+/).map(Number).reduce((a, b) => a + b, 0)
  expect(pathLength).toBeGreaterThan(0)
  expect(pathLength % period).toBe(0)
})

test('each window menu holds only its own options, and STOP halts the orbits', async ({ page }) => {
  await openHash(page, '#/system/sol/3')
  const labels = async id => {
    await page.locator(`.window-${id} .button-menu`).click()
    const menu = page.locator(`.window-${id} .dos-menu`)
    await expect(menu).toBeVisible()
    return menu.locator('.dos-menu-label').allTextContents()
  }
  const resets = ['Reset window', 'Reset all']
  expect(await labels('system')).toEqual(['Orbits', 'Planet labels', 'Orbit lines', 'Background grid', 'Copy link', ...resets])
  const speeds = page.locator('.window-system .dos-menu-option')
  expect((await speeds.allTextContents()).map(text => text.trim())).toEqual(['STOP', 'x0.5', '(x1)', 'x2'])

  await speeds.filter({ hasText: 'STOP' }).click()
  const planet = page.locator('.system-planet').first()
  const before = await center(planet)
  await page.waitForTimeout(700)
  const after = await center(planet)
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.5)
  await withStores(page, ({ systemSettings }) => systemSettings.set('visual', 'params', false))
  await page.locator('.window-system .dos-menu-item', { hasText: 'Reset window' }).click()
  expect(await withStores(page, ({ systemSettings }) => systemSettings.system.speed)).toBe(1)
  expect(await withStores(page, ({ systemSettings }) => systemSettings.visual.params)).toBe(false)
  await page.waitForTimeout(700)
  const moved = await center(planet)
  expect(Math.hypot(moved.x - after.x, moved.y - after.y)).toBeGreaterThan(0.5)

  expect(await labels('data')).toEqual(['Text size', 'Letter-by-letter typing', ...resets])
  await page.locator('.window-data .button-menu').click()
  expect(await labels('visual')).toEqual(['Planet rotation', 'Parameters', 'Background grid', ...resets])

  await page.locator('.window-visual .button-menu').click()
  await withStores(page, ({ systemSettings }) => {
    systemSettings.set('system', 'labels', false)
    systemSettings.set('data', 'typing', false)
    systemSettings.set('text', 'size', 24)
  })
  await page.locator('.window-data .button-menu').click()
  await page.locator('.window-data .dos-menu-item', { hasText: 'Reset all' }).click()
  expect(await withStores(page, ({ systemSettings }) => ({
    system: systemSettings.system.labels,
    data: systemSettings.data.typing,
    visual: systemSettings.visual.params,
    text: systemSettings.text.size
  }))).toEqual({ system: true, data: true, visual: true, text: 16 })
})

// Was: v-show kept the last window a frame or two after it went out, and it flashed over the empty screen.
test('the last window minimized goes out without flashing back', async ({ page }) => {
  await openHash(page, '#/system/sol')
  for (const id of ['system', 'data']) {
    await page.locator(`.window-${id} .button-minimize`).click()
    await expect(page.locator(`.window-${id}`)).toBeHidden()
  }
  const frames = page.evaluate(() => new Promise(resolve => {
    const shown = []
    const read = () => {
      const window = document.querySelector('.window-visual')
      if (getComputedStyle(window).display === 'none') return resolve(shown)
      shown.push(window.classList.contains('is-powering-off'))
      requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  }))
  await page.locator('.window-visual .button-minimize').click()
  const shown = await frames
  const goingOut = shown.indexOf(true)
  expect(goingOut).toBeGreaterThanOrEqual(0)
  expect(shown.slice(goingOut).length).toBeGreaterThan(3)
  expect(shown.slice(goingOut)).not.toContain(false)
})

// Was: in a laptop window the orbits shrank but the star did not, and PLANET-DATA showed Earth's card above its text.
test('a narrow window shrinks the star with the orbits, and the planet text comes before its card', async ({ page }) => {
  await page.setViewportSize({ width: 1068, height: 864 })
  await openHash(page, '#/system/sol/3')
  await withStores(page, ({ systemSettings }) => systemSettings.set('system', 'speed', 0))
  const star = await center(page.locator('.star-container'))
  // The canvas holds the glow around the core: the core is half of it.
  const coreRadius = (await page.locator('.star-container .star-surface').boundingBox()).width / 4
  expect(coreRadius).toBeLessThan(50)
  for (const planet of await page.locator('.system-planet').all()) {
    const { x, y } = await center(planet)
    expect(Math.hypot(x - star.x, y - star.y)).toBeGreaterThan(coreRadius + 7)
  }

  const data = page.locator('.window-data')
  const text = await data.locator('.planet-lore-text .rt-p').first().boundingBox()
  const card = await data.locator('.planet-lore-text .rt-infobox').boundingBox()
  expect(text.y).toBeLessThan(card.y)
  await expect(data.locator('.planet-lore-text .rt-p').first()).toBeInViewport()

  // Sol reaches out to Neptune: even a wide window keeps its star below full size.
  const starWidth = async () => (await page.locator('.star-container .star-surface').boundingBox()).width
  await page.setViewportSize({ width: 1400, height: 900 })
  await expect.poll(starWidth).toBeGreaterThan(coreRadius * 4)
  const resized = await starWidth()
  await page.reload()
  await waitForView(page, 'system')
  expect(await starWidth()).toBe(resized)
})

// Was: the 200 px column of parameters left the empty outline a sliver: it stuck out on the left, the hint was cut.
test('a narrow PLANET-VISUAL keeps the empty outline and the planet inside their half', async ({ page }) => {
  await page.setViewportSize({ width: 1068, height: 864 })
  await openHash(page, '#/system/sol')
  const body = await page.locator('.window-visual .terminal-body-visual').boundingBox()
  const outline = await page.locator('.window-visual .planet-outline').boundingBox()
  const params = await page.locator('.window-visual .planet-params-placeholder').boundingBox()
  expect(outline.x).toBeGreaterThanOrEqual(body.x)
  expect(outline.x + outline.width).toBeLessThanOrEqual(params.x)
  expect(outline.width).toBeGreaterThan(100)

  await page.keyboard.press('1')
  const planet = page.locator('.window-visual .planet-canvas-wrapper')
  await expect(page.locator('.window-visual .planet-params')).toBeVisible()
  expect((await planet.boundingBox()).width).toBeGreaterThan(100)
})

test('each type of station is drawn, and a star without planets says so', async ({ page }) => {
  for (const [id, name] of [['asterion', 'CONCORD RING'], ['cinder', 'CRUCIBLE YARD'], ['pelagos', 'TIDE SPINDLE'], ['nacre', 'BEACON WATCH']]) {
    await openHash(page, `#/system/${id}/1/1`)
    await expect(page.locator('.window-data .planet-lore-title')).toHaveText(name)
    await expect(page.locator('.window-visual .station-visualization canvas')).toBeVisible()
  }
  await openHash(page, '#/system/silent-reach')
  await expect(page.locator('.system-planet')).toHaveCount(0)
  await expect(page.locator('.window-data')).toContainText('No known planets in this system.')
})
