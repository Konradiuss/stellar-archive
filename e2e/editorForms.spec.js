import { expect, test } from '@playwright/test'
import { worldMap, serveMap, waitForView, withStores } from './helpers'

const MAP = worldMap()

const area = page => page.locator('.editor-area')
const mapNow = async page => {
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="map.json"]').click()
  return JSON.parse(await area(page).inputValue())
}
const color = (page, input) => page.locator('.editor-color').filter({ has: page.locator(input) })

async function openEditor(page) {
  await page.goto('/#/edit')
  await expect(area(page)).toBeVisible()
  await expect(page.locator('.no-problems')).toBeVisible()
}

async function openBody(page, starId, ...names) {
  await page.locator('.tab-system').click()
  await page.locator('.system-star-select').selectOption(starId)
  await page.locator('.planet-item', { hasText: names[0] }).click()
  if (names[1]) await page.locator('.satellite-item', { hasText: names[1] }).click()
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

test('a planet shows what the map sets as its own, and the rest as what the site takes', async ({ page }) => {
  const map = worldMap()
  // Every planet of the release map names its seed; this one takes it from its name.
  delete map.systems.cinder.planets[0].visualization.seed
  await serveMap(page, map)
  await openEditor(page)
  await openBody(page, 'cinder', 'Forge')
  await expect(page.locator('.body-speed')).toHaveValue('0.0016')
  await expect(page.locator('.body-orbit')).toHaveValue('45')
  await expect(page.locator('.look-seed')).toHaveValue('')
  await expect(page.locator('.look-seed')).toHaveAttribute('placeholder', 'from the name: Forge')
  const land = color(page, '.look-land')
  await expect(land.locator('.editor-color-code')).toHaveText('#b95b3e')
  await expect(land.locator('.color-reset')).toHaveText('Reset')
  await expect(page.locator('.look-liquid')).toHaveValue('lava')
  await expect(page.locator('.amount-reset')).toBeVisible()
  await land.locator('.color-reset').click()
  await expect(land).toHaveClass(/is-auto/)
  await expect(land.locator('.color-reset')).toHaveCount(0)
  await expect(land.locator('.editor-color-auto')).toHaveText('Auto')
  const forge = (await mapNow(page)).systems.cinder.planets[0].visualization
  expect(forge).not.toHaveProperty('landColor')
  expect(forge.waterColor).toBe('0x6d342b')

  await page.locator('.tab-system').click()
  await page.locator('.add-planet').click()
  await expect(page.locator('.look-seed')).toHaveValue('new-planet')
  await expect(page.locator('.look-liquid')).toHaveValue('')
  await expect(page.locator('.look-liquid option').first()).toHaveText('Auto (water)')
  await expect(page.locator('.amount-reset')).toHaveCount(0)
  await expect(page.locator('.body-orbit')).not.toHaveValue('')
  await expect(page.locator('.body-angle')).toHaveAttribute('placeholder', 'Auto')
  await page.locator('.look-ring').selectOption('thin')
  await expect(page.locator('.look-ring-color')).toHaveValue('#aaaaaa')
  await expect(color(page, '.look-ring-color')).toHaveClass(/is-auto/)
})

test('a ready planet sets its colours and liquid: they are shown as its, not to be changed', async ({ page }) => {
  await openEditor(page)
  await openBody(page, 'sol', 'Earth')
  await expect(page.locator('.look-preset')).toHaveValue('earth')
  await expect(page.locator('.look-seed')).toHaveValue('earth')
  await expect(page.locator('.look-locked')).toContainText('Earth')
  for (const field of ['.look-seed', '.look-land', '.look-water', '.look-liquid', '.look-amount']) await expect(page.locator(field), field).toBeDisabled()
  await expect(page.locator('.body-look .color-reset')).toHaveCount(0)
  await expect(page.locator('.look-size')).toBeEnabled()
  await expect(page.locator('.look-ring')).toBeEnabled()
  await page.locator('.look-preset').selectOption('')
  await expect(page.locator('.look-land')).toBeEnabled()
  await expect(page.locator('.look-locked')).toHaveCount(0)
  expect((await mapNow(page)).systems.sol.planets[2].visualization).toEqual({ size: 65 })
})

// The half-width of the disc on the middle row of a canvas, as a share of its smaller side.
const discShare = canvas => canvas.evaluate(element => {
  const row = Math.floor(element.height / 2)
  const data = element.getContext('2d').getImageData(0, row, element.width, 1).data
  let left = element.width
  let right = -1
  for (let x = 0; x < element.width; x++) {
    if (data[x * 4 + 3] === 0) continue
    left = Math.min(left, x)
    right = Math.max(right, x)
  }
  return (right - left + 1) / 2 / Math.min(element.width, element.height)
})
const slide = (input, value) => input.evaluate((element, to) => {
  element.value = String(to)
  element.dispatchEvent(new Event('change', { bubbles: true }))
}, value)

// Was: a text stayed where it was written: nothing moved it into a file or back, set its format, or wrote a legend of a system.
test('a text goes into a file of its own and back, takes a format, and a system gets a legend', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-system').click()
  await page.locator('.system-star-select').selectOption('sol')
  await page.locator('.orbit-sketch .orbit-star').click()
  const lore = page.locator('.editor-lore')
  await expect(lore.locator('.source-where')).toHaveValue('map')
  await lore.locator('.source-where').selectOption('file')
  await expect(lore.locator('.source-file')).toHaveValue('lore/sol.wiki')
  await expect(lore.locator('.lore-text .editor-area')).toHaveValue(/^'''Sol''' is the real Solar/)
  let star = (await mapNow(page)).stars.find(each => each.id === 'sol')
  expect(star.loreFile).toBe('lore/sol.wiki')
  expect(star.lore).toBeUndefined()
  await expect(page.locator('.file-item[data-path="lore/sol.wiki"]')).toHaveCount(1)

  await page.locator('.tab-system').click()
  await lore.locator('.lore-text .editor-area').fill('# Sol\n\nIn **markdown** now.')
  await lore.locator('.source-format').selectOption('markdown')
  await expect(lore.locator('.editor-preview-page strong')).toHaveText('markdown')
  await lore.locator('.source-file').fill('lore/sun.md')
  await lore.locator('.source-file').press('Enter')
  await expect(lore.locator('.lore-text .editor-area')).toHaveValue('# Sol\n\nIn **markdown** now.')
  await lore.locator('.source-where').selectOption('map')
  star = (await mapNow(page)).stars.find(each => each.id === 'sol')
  expect(star).toMatchObject({ lore: '# Sol\n\nIn **markdown** now.', loreFormat: 'markdown' })
  expect(star.loreFile).toBeUndefined()
  // The files the text left are no files of the draft any more.
  await expect(page.locator('.file-item[data-path="lore/sol.wiki"]')).toHaveCount(0)
  await expect(page.locator('.file-item[data-path="lore/sun.md"]')).toHaveCount(0)

  await page.locator('.tab-system').click()
  await page.locator('.system-legend .system-legend-text .editor-area').fill('Mind the rocks.')
  await page.locator('.system-legend .system-legend-text .editor-area').blur()
  await expect.poll(async () => (await mapNow(page)).systems.sol.legend).toBe('Mind the rocks.')
  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await page.goto('/#/system/sol')
  await expect(page.locator('.map-legend')).toContainText('Mind the rocks.')
})

const pickColor = (locator, value) => locator.evaluate((input, color) => {
  input.value = color
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}, value)

// Was: the tab title of a moon, the colour of a faction's names and the loudness of one sound were set in map.json by hand only.
test('a moon has its tab title, a faction the colour of its names, a sound its own loudness', async ({ page }) => {
  await openEditor(page)
  await openBody(page, 'sol', 'Earth', 'Moon')
  await page.locator('.body-tab').fill('Luna')
  await page.locator('.body-tab').press('Enter')

  await page.locator('.tab-stars').click()
  const tide = page.locator('.faction-row[data-faction="tide"]')
  await expect(tide.locator('.faction-label')).toHaveValue('#66ff66')
  await pickColor(tide.locator('.faction-label'), '#ff00ff')
  const concord = page.locator('.faction-row[data-faction="concord"]')
  await concord.locator('.editor-color').filter({ has: page.locator('.faction-label') }).locator('.color-reset').click()

  await page.locator('.tab-sounds').click()
  const volume = page.locator('.sound-row[data-sound="hover"] .sound-volume')
  await expect(volume).toHaveAttribute('placeholder', '100, as the rest')
  await volume.fill('40')
  await volume.press('Enter')
  await volume.fill('140')
  await volume.press('Enter')
  await expect(volume).toHaveClass(/is-invalid/)

  const map = await mapNow(page)
  expect(map.systems.sol.planets[2].satellites[0].tabTitle).toBe('Luna')
  // Written as the map writes its colours.
  expect(map.planetTextColors).toEqual({ combine: '0xff6666', tide: '0xff00ff', neutral: '0xffff00' })
  expect(map.sounds).toEqual({ hover: { volume: 0.4 } })

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  expect(await withStores(page, ({ map: site }) => ({ ...site.planetTextColors }))).toEqual(map.planetTextColors)
  await page.goto('/#/system/sol/3/1')
  await waitForView(page, 'system')
  await expect(page).toHaveTitle(/^Luna/)
})

// Was: the size was a number that changed nothing on the site or in the picture.
test('the size of a planet scales its picture and the site, is cleared, and says what it draws', async ({ page }) => {
  await openEditor(page)
  await openBody(page, 'sol', 'Earth')
  const size = page.locator('.look-size')
  const picture = page.locator('.look-planet canvas')
  await expect(size).toHaveValue('65')
  await expect(page.locator('.look-size-field')).toContainText('Size: 65%')
  await expect.poll(() => discShare(picture)).toBeCloseTo(0.3 * 0.65, 1)
  await slide(size, 30)
  await expect.poll(() => discShare(picture)).toBeCloseTo(0.3 * 0.3, 1)
  expect((await mapNow(page)).systems.sol.planets[2].visualization).toEqual({ seed: 'earth', size: 30 })

  await page.locator('.tab-system').click()
  await page.locator('.size-reset').click()
  await expect(page.locator('.look-size-field')).toContainText('Size: 100%')
  await expect(page.locator('.look-size-field em')).toHaveText('Auto')
  expect((await mapNow(page)).systems.sol.planets[2].visualization).toEqual({ seed: 'earth' })

  // Written by hand past the range: shown as what the site draws.
  const text = (await area(page).inputValue()).replace('"seed": "earth"', '"seed": "earth", "size": 400')
  await area(page).fill(text)
  await page.locator('.tab-system').click()
  await expect(size).toHaveValue('150')
  await expect(page.locator('.size-clamped')).toHaveText('map.json says 400; the site draws 150%.')
  await slide(size, 30)
  await expect(page.locator('.size-clamped')).toHaveCount(0)

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await page.goto('/#/system/sol/3')
  await page.mouse.move(5, 5)
  const site = page.locator('.window-visual .planet-canvas-wrapper > .planet-visualization canvas')
  await expect(site).toBeVisible()
  // At 65 the disc would not go below 0.22 * 0.65 = 0.143 of the window.
  await expect.poll(() => discShare(site)).toBeLessThan(0.12)
})

// Was: "no ring" removed the key, so the ready planet's ring came back, and the form said there was none.
test('a ready planet keeps its ring, has none, or takes a size of its own with its colour', async ({ page }) => {
  await openEditor(page)
  await openBody(page, 'sol', 'Saturn')
  const saturn = () => mapNow(page).then(map => map.systems.sol.planets.find(planet => planet.name === 'Saturn').visualization)
  const ring = page.locator('.look-ring')
  await expect(ring).toHaveValue('medium')
  await ring.selectOption('none')
  expect(await saturn()).toEqual({ seed: 'saturn', size: 80, ring: null })
  await page.locator('.tab-system').click()
  await expect(ring).toHaveValue('none')
  await expect(page.locator('.look-ring-color')).toHaveCount(0)
  await ring.selectOption('')
  expect(await saturn()).toEqual({ seed: 'saturn', size: 80 })
  await page.locator('.tab-system').click()
  await expect(ring.locator('option:checked')).toHaveText('as the ready planet (large)')
  await expect(color(page, '.look-ring-color').locator('.editor-color-auto')).toBeVisible()
  await ring.selectOption('thin')
  expect(await saturn()).toEqual({ seed: 'saturn', size: 80, ring: { size: 'thin' } })
})

test('numbers take a comma, and what is not a number is not written', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-stars').click()
  const opacity = page.locator('.faction-row[data-faction="concord"] .faction-fill-opacity')
  await expect(opacity).toHaveValue(String(MAP.factions.concord.fillOpacity))
  await opacity.fill('0,3')
  await opacity.press('Enter')
  await expect(opacity).toHaveValue('0.3')
  await opacity.fill('much')
  await opacity.press('Enter')
  await expect(opacity).toHaveClass(/is-invalid/)
  expect((await mapNow(page)).factions.concord.fillOpacity).toBe(0.3)
  await page.locator('.tab-stars').click()
  await opacity.fill('')
  await opacity.press('Enter')
  await expect(opacity).toHaveAttribute('placeholder', 'default: 0.15')
  expect((await mapNow(page)).factions.concord).not.toHaveProperty('fillOpacity')
})

test('a route shows the look of its type as its type, and a look of its own as its own', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-stars').click()
  await page.getByRole('button', { name: 'Sector 1, 1: Sol' }).click()
  await page.locator('.star-route', { hasText: 'Asterion' }).click()
  const gate = MAP.hyperlines.findIndex(line => line.id === 'gate-sol-asterion')
  const line = page.locator(`.route-line[data-route="${gate}"]`)
  await expect(page.locator('.route-width')).toHaveValue('')
  await expect(page.locator('.route-width')).toHaveAttribute('placeholder', '3, as its type')
  await expect(page.locator('.route-opacity')).toHaveAttribute('placeholder', '0.7, as its type')
  await expect(color(page, '.route-color')).toHaveClass(/is-auto/)
  await expect(color(page, '.route-color').locator('.editor-color-auto')).toHaveText('As its type')
  await page.locator('.route-width').fill('5')
  await page.locator('.route-width').press('Enter')
  await expect(line).toHaveAttribute('stroke-width', '7')
  expect((await mapNow(page)).hyperlines[gate].width).toBe(5)
  await page.locator('.tab-stars').click()
  await page.locator('.route-width').fill('')
  await page.locator('.route-width').press('Enter')
  await expect(line).toHaveAttribute('stroke-width', '5')
  expect((await mapNow(page)).hyperlines[gate]).not.toHaveProperty('width')

  await page.locator('.tab-stars').click()
  const typeOpacity = page.locator('.route-type-row[data-type="trade"] .type-opacity')
  await expect(typeOpacity).toHaveValue('0.6')
  await typeOpacity.fill('0.25')
  await typeOpacity.press('Enter')
  const trade = MAP.hyperlines.findIndex(each => each.type === 'trade')
  await expect(page.locator(`.route-line[data-route="${trade}"]`)).toHaveAttribute('stroke-opacity', '0.25')
  expect((await mapNow(page)).hyperlineTypes.trade.opacity).toBe(0.25)
})

async function pixel(page, x, y) {
  const shot = await page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } })
  return page.evaluate(async data => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    return [...context.getImageData(1, 1, 1, 1).data.slice(0, 3)]
  }, shot.toString('base64'))
}

test('stars on the grid go by their whole names, over the routes', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openEditor(page)
  await page.locator('.tab-stars').click()
  // Was: names were cut to eight letters, so two names alike at the start read the same.
  for (const star of MAP.stars) {
    await expect(page.locator(`.star-cell[aria-label="Sector ${star.sectorX}, ${star.sectorY}: ${star.name}"] .star-label`), star.name).toHaveText(star.name)
  }
  // Was: the routes were drawn over the stars and their names (two routes start from the middle of Sol).
  const dot = await page.locator('.star-cell[aria-label="Sector 1, 1: Sol"] .star-dot').boundingBox()
  const [red, green, blue] = await pixel(page, dot.x + dot.width / 2, dot.y + dot.height / 2)
  expect([red, green, blue]).toEqual([0, 170, 255])
  const gate = MAP.hyperlines.findIndex(line => line.type === 'gate')
  await expect(page.locator(`.route-line[data-route="${gate}"]`)).toHaveAttribute('stroke-opacity', '0.7')
})

// Was: the column beside the grid stood empty and unexplained until something was chosen.
test('the column of the galaxy says what opens in it until a star is chosen', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-stars').click()
  const hint = page.locator('.galaxy-side .galaxy-side-hint')
  await expect(hint).toHaveText('Nothing chosen. Click a star, an empty sector or a route on the grid: its settings open here.')
  await page.locator('.star-cell[aria-label="Sector 1, 1: Sol"]').click()
  await expect(page.locator('.galaxy-side .star-panel')).toBeVisible()
  await expect(hint).toHaveCount(0)
})

const lookProblems = page => page.evaluate(() => {
  const found = []
  const view = document.querySelector('.editor-view')
  const inPreview = element => element.closest('.editor-preview-page')
  const seen = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
  for (const element of view.querySelectorAll('*')) {
    if (inPreview(element) || !seen(element)) continue
    const style = getComputedStyle(element)
    const name = `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`
    const hasText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)
    if (hasText && parseFloat(style.fontSize) < 12) found.push(`${name}: ${style.fontSize}`)
    if (hasText && /press start|tiny5|ark pixel/i.test(style.fontFamily)) found.push(`${name}: ${style.fontFamily}`)
    if (style.textShadow !== 'none') found.push(`${name}: text-shadow ${style.textShadow}`)
    if (/drop-shadow|blur/.test(style.filter)) found.push(`${name}: filter ${style.filter}`)
    if (/auto|scroll/.test(style.overflowY + style.overflowX) && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) && style.scrollbarColor === 'auto') found.push(`${name}: the bars of the browser`)
  }
  return found
})

const pageScrolls = page => page.evaluate(() => {
  const view = document.querySelector('.editor-view')
  return {
    down: view.scrollHeight > view.clientHeight + 1 || document.documentElement.scrollHeight > innerHeight + 1,
    across: view.scrollWidth > view.clientWidth + 1 || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }
})

for (const [device, viewport] of [['a desktop', { width: 1440, height: 900 }], ['a phone', { width: 390, height: 844 }]]) {
  test(`the editor reads as a tool on ${device}: plain letters, no glow, its own scroll bars`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(viewport)
    await openEditor(page)
    const screens = [
      ['files', async () => {}],
      ['an article file', async () => page.locator('.file-item[data-path="wiki/main.wiki"]').click()],
      ['the galaxy', async () => {
        await page.locator('.tab-stars').click()
        await page.getByRole('button', { name: 'Sector 1, 1: Sol' }).click()
        await page.locator('.star-route').first().click()
      }],
      ['a planet', async () => openBody(page, 'cinder', 'Forge')],
      ['a station', async () => openBody(page, 'sol', 'Earth', 'Exodus Station')],
      ['an article', async () => {
        await page.locator('.tab-articles').click()
        await page.locator('.article-item', { hasText: 'Crucible Combine' }).click()
      }],
      ['the groups', async () => page.locator('.open-groups').click()],
      ['the main page', async () => page.locator('.tab-main').click()],
      ['publishing', async () => {
        await page.locator('.file-item, .tab-files').first().click()
        await page.locator('.tab-files').click()
        await area(page).fill(`${await area(page).inputValue()}\n`)
        await page.locator('.action-publish').click()
        await expect(page.locator('.editor-publish')).toBeVisible()
      }]
    ]
    for (const [screen, open] of screens) {
      await open()
      await page.waitForTimeout(300)
      expect(await lookProblems(page), screen).toEqual([])
      const scrolls = await pageScrolls(page)
      expect(scrolls.across, `${screen}: the page scrolls across`).toBe(false)
      if (device === 'a desktop') expect(scrolls.down, `${screen}: the page scrolls down`).toBe(false)
    }
  })
}

// Was: the preview of a file began and ended lower than its text (its own caption; the caret line under the frame).
test('a text and its preview stand side by side, frame by frame', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openEditor(page)
  const frames = async (text, preview) => {
    const [a, b] = await Promise.all([page.locator(text).boundingBox(), page.locator(preview).boundingBox()])
    return { top: Math.abs(a.y - b.y), bottom: Math.abs(a.y + a.height - (b.y + b.height)), beside: b.x > a.x + a.width }
  }
  const sideBySide = { top: expect.closeTo(0, 0), bottom: expect.closeTo(0, 0), beside: true }

  await page.locator('.file-item[data-path="lore/solar/earth.wiki"]').click()
  expect(await frames('.file-pair .editor-text', '.file-preview .editor-preview-page'), 'a file').toEqual(sideBySide)

  await page.locator('.tab-articles').click()
  await page.locator('.article-item', { hasText: 'Crucible Combine' }).click()
  expect(await frames('.article-text .editor-text', '.article-preview .editor-preview-page'), 'an article').toEqual(sideBySide)

  await openBody(page, 'cinder', 'Forge')
  expect(await frames('.editor-lore .lore-text', '.editor-lore .editor-preview-page'), 'lore').toEqual(sideBySide)
})

// Was: only a checkbox turned pulses on and off, and turning them on again threw the route's own settings away.
test('pulses of a route and of a type are set with sliders over a live preview', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-stars').click()
  await page.getByRole('button', { name: 'Sector 1, 1: Sol' }).click()
  await page.locator('.star-route', { hasText: 'Asterion' }).click()
  const gate = MAP.hyperlines.findIndex(line => line.id === 'gate-sol-asterion')
  const pulses = page.locator('.route-panel .route-pulse')
  const interval = pulses.locator('.route-pulse-interval')
  await expect(interval).toHaveValue('2.6')
  await expect(pulses.locator('.pulse-auto').first()).toHaveText('As its type')

  // The preview moves: its picture changes from one moment to the next.
  const picture = () => pulses.locator('.route-pulse-preview').evaluate(canvas => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    let lit = 0
    let sum = 0
    for (let at = 0; at < data.length; at += 4) {
      if (data[at] + data[at + 1] + data[at + 2] > 200) { lit++; sum += at }
    }
    return `${lit}:${sum}`
  })
  const before = await picture()
  await expect.poll(picture).not.toBe(before)

  await interval.fill('0.8')
  await expect(pulses.locator('.pulse-value').first()).toHaveText('every 0.8 s')
  expect((await mapNow(page)).hyperlines[gate].pulse).toEqual({ interval: 0.8 })
  await page.locator('.tab-stars').click()
  await pulses.locator('.route-pulse-speed').fill('90')
  await pulses.locator('.pulse-reset').first().click()
  expect((await mapNow(page)).hyperlines[gate].pulse).toEqual({ speed: 90 })

  await page.locator('.tab-stars').click()
  await pulses.locator('.route-pulse-on').uncheck()
  await expect(pulses.locator('.route-pulse-speed')).toBeDisabled()
  await expect(pulses.locator('.route-pulse-speed')).toHaveValue('90')
  expect((await mapNow(page)).hyperlines[gate].pulse).toEqual({ speed: 90, off: true })
  // The settings live in the map: a reload and a new form find them.
  await page.reload()
  await expect(area(page)).toBeVisible()
  await page.locator('.tab-stars').click()
  await page.getByRole('button', { name: 'Sector 1, 1: Sol' }).click()
  await page.locator('.star-route', { hasText: 'Asterion' }).click()
  await expect(pulses.locator('.route-pulse-on')).not.toBeChecked()
  await pulses.locator('.route-pulse-on').check()
  await expect(pulses.locator('.route-pulse-speed')).toHaveValue('90')
  expect((await mapNow(page)).hyperlines[gate].pulse).toEqual({ speed: 90 })

  await page.locator('.tab-stars').click()
  const trade = page.locator('.route-type-row[data-type="trade"]')
  await expect(trade.locator('.type-pulse-speed')).toHaveValue('45')
  await trade.locator('.type-pulse-speed').fill('120')
  expect((await mapNow(page)).hyperlineTypes.trade.pulse).toEqual({ speed: 120 })
})

// Was: an emptied name was removed, and the site left the planet out of its system.
test('a planet keeps its name when the field is emptied, and the form says why', async ({ page }) => {
  await openEditor(page)
  await openBody(page, 'sol', 'Earth')
  await page.locator('.body-name').fill('')
  await page.locator('.body-name').press('Enter')
  await expect(page.locator('.form-error')).toContainText('needs a name')
  await expect(page.locator('.body-name')).toHaveValue('Earth')
  expect((await mapNow(page)).systems.sol.planets[2].name).toBe('Earth')
})

// Was: the route showed "both ways" whatever its type said, and choosing it removed the field: a forward type could not be undone on one route.
test('a route runs as its type, or both ways or forward of its own; so does a type', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-stars').click()
  const gateType = page.locator('.route-type-row[data-type="gate"] .type-direction')
  await expect(gateType.locator('option:checked')).toHaveText('Auto (both ways)')
  await gateType.selectOption('forward')
  expect((await mapNow(page)).hyperlineTypes.gate.direction).toBe('forward')

  await page.locator('.tab-stars').click()
  await page.getByRole('button', { name: 'Sector 1, 1: Sol' }).click()
  await page.locator('.star-route', { hasText: 'Asterion' }).click()
  const gate = MAP.hyperlines.findIndex(line => line.id === 'gate-sol-asterion')
  const direction = page.locator('.route-direction')
  await expect(direction.locator('option:checked')).toHaveText('from → to only, as its type')
  await direction.selectOption('both')
  expect((await mapNow(page)).hyperlines[gate].direction).toBe('both')
  await page.locator('.tab-stars').click()
  await direction.selectOption('')
  expect((await mapNow(page)).hyperlines[gate]).not.toHaveProperty('direction')
})

// Was: any number was written, an opacity of 3 or a seed of 50 too, though the site cannot take them.
test('a number outside what the site takes is not written, and the field says what it takes', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-stars').click()
  const opacity = page.locator('.route-type-row[data-type="trade"] .type-opacity')
  await opacity.fill('3')
  await opacity.press('Enter')
  await expect(opacity).toHaveClass(/is-invalid/)
  await expect(opacity).toHaveAttribute('title', 'From 0 to 1: it is not written into the map.')
  expect((await mapNow(page)).hyperlineTypes.trade.opacity).toBe(MAP.hyperlineTypes.trade.opacity)
  await page.locator('.tab-stars').click()
  await opacity.fill('0,4')
  await opacity.press('Enter')
  await expect(opacity).not.toHaveClass(/is-invalid/)
  expect((await mapNow(page)).hyperlineTypes.trade.opacity).toBe(0.4)
})
