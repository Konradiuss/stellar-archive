import { expect, test } from '@playwright/test'
import { openHash, waitForView, watchConsole, withStores } from './helpers.js'

test('the galaxy lore prints page by page like more', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const lore = page.locator('.lore-panel .paged-lore')
  await expect(page.locator('.lore-panel .panel-file')).toHaveText('MAIN.TXT')

  await expect(lore).toHaveAttribute('data-state', 'paused', { timeout: 20_000 })
  await expect(lore).toHaveAttribute('data-page', '1')
  await expect(lore.locator('.panel-status')).toContainText('-- MORE --')
  const viewport = lore.locator('.lore-viewport')
  expect(await viewport.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true)

  await lore.locator('.lore-area').click({ position: { x: 30, y: 30 } })
  await expect(lore).toHaveAttribute('data-page', '2')
  await expect(lore).not.toHaveAttribute('data-state', 'paused')
  await expect(lore.locator('.panel-status')).toContainText('PG 2')

  await page.waitForTimeout(300)
  await lore.locator('.lore-area').hover()
  await page.mouse.wheel(0, -100)
  await expect(lore).toHaveAttribute('data-page', '1')
  consoleIsClean()
})

// Was: the page buttons were hidden from the keyboard and screen readers, so nothing past page 1 could be read.
test('the lore turns its pages from the keyboard', async ({ page }) => {
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const lore = page.locator('.lore-panel .paged-lore')
  await expect(lore).toHaveAttribute('data-state', 'paused', { timeout: 20_000 })

  await lore.locator('.lore-area').focus()
  await page.keyboard.press('PageDown')
  await expect(lore).toHaveAttribute('data-page', '2')
  await page.keyboard.press('ArrowUp')
  await expect(lore).toHaveAttribute('data-page', '1')
  await expect(lore.locator('.pagebar-button').last()).toHaveAttribute('aria-label', /.+/)
})

test('the galaxy map shows the main page of the wiki, made plain for the narrow screen', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const panel = page.locator('.lore-panel')
  await expect(panel.locator('.panel-file')).toHaveText('MAIN.TXT')
  await expect(panel.locator('.panel-title')).toHaveText('Main Page')
  const text = panel.locator('.lore-text')
  await expect(text.locator('.rt-h1')).toHaveText('GALAXY ARCHIVE', { timeout: 20_000 })
  await withStores(page, ({ systemSettings }) => systemSettings.set('data', 'typing', false))
  await expect(panel.locator('.paged-lore')).toHaveAttribute('data-state', 'done')
  await expect(panel.locator('.rt-banner, .rt-box, .rt-links, .rt-tiles, .pixel-logo, .wiki-portal')).toHaveCount(0)
  const newcomer = text.locator('.rt-h2', { hasText: 'New to the archive' })
  await expect(newcomer.locator('.rt-heading-mark')).toHaveCSS('background-color', 'rgb(47, 143, 70)')
  await expect(text.locator('.rt-h2')).toHaveText(['New to the archive', 'Factions', 'Technology', 'Chronicle'])
  await expect(text.locator('.rt-list').filter({ hasText: 'Crucible Combine' }).locator('li')).toHaveText(['Solar Concord', 'Crucible Combine', 'Free Tide'])

  await page.evaluate(() => { location.hash = '#/system/sol' })
  await waitForView(page, 'system')
  await expect(panel.locator('.panel-file')).toHaveText('SOL.TXT')
  await page.evaluate(() => { location.hash = '#/' })
  await waitForView(page, 'galaxy')
  await expect(panel.locator('.panel-file')).toHaveText('MAIN.TXT')

  const link = text.locator('.rt-link', { hasText: 'About the world' })
  await expect(link).toBeVisible({ timeout: 20_000 })
  await link.click()
  await waitForView(page, 'wiki')
  await expect(page.locator('.wiki-view .wiki-title')).toHaveText('Galaxy')
  consoleIsClean()
})

// Was: while the text printed, the page count was guessed and flipped between two numbers, the thumb jumping with it.
test('the page bar of the lore keeps still while the text prints', async ({ page }) => {
  await page.addInitScript(() => {
    window.__thumbs = []
    new MutationObserver(() => {
      const lore = document.querySelector('.lore-panel .paged-lore')
      const thumb = lore?.querySelector('.pagebar-thumb')
      if (thumb) window.__thumbs.push(`${lore.dataset.page}/${lore.dataset.pages} ${thumb.style.top} ${thumb.style.height}`)
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'data-page', 'data-pages'] })
  })
  for (const hash of ['', '#/system/sol/3']) {
    // A fresh load each time: a new hash alone does not reload the page.
    await page.goto('about:blank')
    await page.goto(`/${hash}`)
    const lore = page.locator('.lore-panel .paged-lore')
    await expect(lore).toHaveAttribute('data-state', /paused|done/, { timeout: 20_000 })
    const states = [...new Set(await page.evaluate(() => window.__thumbs))]
    expect(states.filter(state => state.startsWith('1/')), hash || 'galaxy').toHaveLength(1)
  }
})

test('the legend lists the factions of the map and the open system', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const legend = page.locator('.map-legend')
  const factions = legend.locator('[data-section="factions"] .legend-row')
  await expect(factions).toHaveCount(4)
  await expect(factions.first()).toContainText('Solar Concord')
  const colours = await factions.locator('.sign-faction').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).borderTopColor))
  expect(new Set(colours).size).toBe(4)
  await expect(legend.locator('[data-section="lines"] .legend-row')).toHaveCount(5)

  await openHash(page, '#/system/sol')
  await expect(legend.locator('[data-section="system"]')).toContainText('Sol')
  await expect(legend.locator('[data-section="links"]')).toContainText('Asterion')
  await expect(legend.locator('.panel-title')).toHaveText('Sol')
  consoleIsClean()
})

// Was: the legend ran a few pixels past its screen and got the browser's scroll bar.
test.describe('the legend fits its screen', () => {
  test.use({ viewport: { width: 1920, height: 905 } })

  for (const hash of ['', '#/system/sol/3']) {
    test(`in columns, without scrolling ${hash || 'on the galaxy'}`, async ({ page }) => {
      await page.goto(`/${hash}`)
      await waitForView(page, hash ? 'system' : 'galaxy')
      const body = page.locator('.map-legend .legend-body')
      await expect(body).toHaveAttribute('data-layout', 'columns')
      await expect(page.locator('.map-legend .scroll-area-bar')).toHaveCount(0)
      const outside = await body.evaluate(node => {
        const box = node.getBoundingClientRect()
        return [...node.querySelectorAll('.legend-title, .legend-row, .legend-note')].filter(row => {
          const rect = row.getBoundingClientRect()
          return rect.right > box.right + 1 || rect.bottom > box.bottom + 1 || rect.left < box.left - 1
        }).length
      })
      expect(outside).toBe(0)
      expect(await body.evaluate(node => node.scrollHeight <= node.clientHeight && node.scrollWidth <= node.clientWidth)).toBe(true)
    })
  }
})

test.describe('a narrow legend', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('scrolls with the pixel bar of the text mode', async ({ page }) => {
    await page.goto('/')
    await waitForView(page, 'galaxy')
    const legend = page.locator('.map-legend')
    await expect(legend.locator('.legend-body')).toHaveAttribute('data-layout', 'scroll')
    const scroller = legend.locator('.scroll-area-body')
    expect(await scroller.evaluate(node => getComputedStyle(node).scrollbarWidth)).toBe('none')
    await expect(legend.locator('.scrollbar-thumb')).toBeVisible()
    await scroller.hover()
    await page.mouse.wheel(0, 200)
    await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(0)
    const top = await legend.locator('.scrollbar-thumb').evaluate(node => parseFloat(node.style.top))
    expect(top).toBeGreaterThan(0)
  })

  test('the wiki navbox and contents use the same bar', async ({ page }) => {
    await openHash(page, '#/wiki/Solar_Concord')
    for (const panel of ['.map-legend', '.lore-panel']) {
      const scroller = page.locator(`${panel} .scroll-area-body`)
      expect(await scroller.evaluate(node => getComputedStyle(node).scrollbarWidth)).toBe('none')
      await expect(page.locator(`${panel} .scroll-area-bar`)).toBeVisible()
    }
  })
})

// Was: white text with a triple glow, cheap next to the crisp sector windows.
test('the side terminals draw text without a glow', async ({ page }) => {
  await page.goto('/')
  await waitForView(page, 'galaxy')
  await expect(page.locator('.lore-panel .lore-text')).toBeVisible({ timeout: 20_000 })
  const shadows = await page.locator('.lore-panel, .map-legend').evaluateAll(panels => panels.flatMap(panel => (
    [...panel.querySelectorAll('.retro-screen *')].map(node => getComputedStyle(node).textShadow)
  )))
  // A glow is a blurred shadow; the pixel bold (1px 0, no blur) is not one.
  const blurs = shadow => [...shadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/g)].map(match => Number(match[3]))
  expect(shadows.filter(shadow => shadow !== 'none' && blurs(shadow).some(blur => blur > 0))).toEqual([])
  expect(shadows).toContain('rgb(255, 255, 255) 1px 0px 0px')
})

// Was: the side screens came on as a dim grey line under weaker glass, and only the legend caught a switch of the view.
test('a side screen comes on as the main one does: a white line, then the picture out of a flash', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  // The lore screen powers on 150 ms after the page.
  await page.clock.runFor(200)
  const screen = page.locator('.lore-panel .retro-screen')
  await expect(screen).toHaveClass(/state-powering/)
  const animationOf = selector => page.locator(`.lore-panel ${selector}`).evaluate(node => {
    const style = getComputedStyle(node)
    return `${style.animationName} ${style.animationDuration}`
  })
  // The keyframes and the length of the main screen (CrtScreen.vue).
  expect(await animationOf('.retro-picture')).toBe('crt-on 0.52s')
  expect(await animationOf('.crt-bloom')).toBe('bloom-on 0.52s')
  expect(await animationOf('.crt-beam')).toBe('beam-on 0.52s')

  const glassOf = selector => page.locator(selector).evaluate(node => {
    const style = getComputedStyle(node)
    return [style.getPropertyValue('--crt-scanline-alpha').trim(), style.getPropertyValue('--crt-vignette-alpha').trim()]
  })
  const main = await glassOf('.crt-screen > .crt-glass')
  expect(main).toEqual(['0.16', '0.35'])
  for (const panel of ['.lore-panel', '.music-player', '.map-legend']) {
    expect(await glassOf(`${panel} .retro-screen > .crt-glass`)).toEqual(main)
  }
  await expect(screen).toHaveCSS('background-color', 'rgb(0, 0, 0)')
})

test('every side screen catches the interference when the view switches', async ({ page }) => {
  await page.goto('/')
  await waitForView(page, 'galaxy')
  await expect(page.locator('.retro-screen.state-on')).toHaveCount(3, { timeout: 20_000 })
  await page.evaluate(() => {
    window.interfered = new Set()
    document.querySelectorAll('.retro-screen').forEach((screen, index) => {
      new MutationObserver(() => {
        if (screen.classList.contains('is-interfering')) window.interfered.add(index)
      }).observe(screen, { attributes: true, attributeFilter: ['class'] })
    })
  })
  await page.evaluate(() => { location.hash = '#/wiki/Earth' })
  await waitForView(page, 'wiki')
  expect(await page.evaluate(() => window.interfered.size)).toBe(3)
})
