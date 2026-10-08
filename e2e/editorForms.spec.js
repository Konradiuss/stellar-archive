import { expect, test } from '@playwright/test'
import { releaseMap, serveMap } from './helpers'

const MAP = releaseMap()

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
  const map = releaseMap()
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
