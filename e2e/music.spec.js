import { expect, test } from '@playwright/test'
import { waitForView, watchConsole } from './helpers.js'

async function openPlayer(page) {
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const player = page.locator('.music-player .player')
  await expect(player).toBeVisible({ timeout: 20_000 })
  return player
}

const box = locator => locator.evaluate(node => {
  const rect = node.getBoundingClientRect()
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
})

test.describe('desktop', () => {
  test.use({ viewport: { width: 1600, height: 900 } })

  test('the player sits under the lore, from the bottom of the map to the bottom of the legend', async ({ page }) => {
    await openPlayer(page)
    const map = await box(page.locator('.canvas-area'))
    const lore = await box(page.locator('.lore-panel'))
    const player = await box(page.locator('.music-player'))
    const legend = await box(page.locator('.legend'))
    expect(Math.abs(player.top - map.bottom)).toBeLessThanOrEqual(1)
    expect(Math.abs(player.top - lore.bottom)).toBeLessThanOrEqual(1)
    expect(Math.abs(player.bottom - legend.bottom)).toBeLessThanOrEqual(1)
    expect(Math.abs(player.left - lore.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(player.right - lore.right)).toBeLessThanOrEqual(1)
  })

  test('plays on ▶ only, turns tracks, seeks and plays from the list', async ({ page }) => {
    const consoleIsClean = watchConsole(page)
    await page.addInitScript(() => localStorage.clear())
    const player = await openPlayer(page)
    await expect(player).toHaveAttribute('data-state', 'paused')
    await expect(player).toHaveAttribute('data-track', '0')
    await expect(player.locator('.now-time')).toHaveText('0:00 / 0:12')

    await player.locator('.button-play').click()
    await expect(player).toHaveAttribute('data-state', 'playing')
    await expect(player.locator('.now-time')).not.toHaveText(/^0:00 /, { timeout: 5_000 })

    await player.getByRole('button', { name: 'Next track' }).click()
    await expect(player).toHaveAttribute('data-track', '1')
    await expect(player).toHaveAttribute('data-state', 'playing')

    // The middle of the seek bar: about half of Get Set (0:13 in the test world).
    await player.locator('.player-seek').click()
    await expect(player.locator('.now-time')).toHaveText(/^0:0[5-8] /)

    await page.locator('.music-player .panel-titlebar .button-list').click()
    await player.locator('.list-row').nth(4).click()
    await expect(player).toHaveAttribute('data-track', '4')
    await expect(player.locator('.list-row.is-current')).toContainText('Night at the Citadel')
    await expect(player).toHaveAttribute('data-state', 'playing')
    await expect(player.locator('.player-credit')).toHaveAttribute('href', 'https://soundcloud.com/dukegneiss/night-at-the-citadel')
    consoleIsClean()
  })

  test('remembers the track and the volume, and waits on pause after a reload', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('cleared')) {
        localStorage.clear()
        sessionStorage.setItem('cleared', '1')
      }
    })
    let player = await openPlayer(page)
    const slider = player.locator('.music-control .volume-bar')
    const bar = await slider.boundingBox()
    await slider.click({ position: { x: bar.width * 0.25, y: bar.height / 2 } })
    const volume = Number(await slider.getAttribute('aria-valuenow'))
    expect(Math.abs(volume - 25)).toBeLessThanOrEqual(2)
    await player.locator('.button-play').click()
    await expect(player).toHaveAttribute('data-state', 'playing')
    await player.getByRole('button', { name: 'Next track' }).click()
    await expect(player).toHaveAttribute('data-track', '1')
    await player.locator('.button-play').click()
    await expect(player).toHaveAttribute('data-state', 'paused')

    await page.reload()
    player = await openPlayer(page)
    await expect(player).toHaveAttribute('data-track', '1')
    await expect(player).toHaveAttribute('data-state', 'paused')
    await expect(player.locator('.music-control .volume-bar')).toHaveAttribute('aria-valuenow', String(volume))
  })

  test('volume in percent, told in the status line, and a struck-through MUS when muted', async ({ page }) => {
    const consoleIsClean = watchConsole(page)
    await page.addInitScript(() => localStorage.clear())
    const player = await openPlayer(page)
    const control = player.locator('.music-control')
    const slider = control.locator('.volume-bar')
    const label = control.locator('.volume-label')
    const status = player.locator('.panel-status-left')

    await slider.focus()
    await page.keyboard.press('End')
    await expect(status).toHaveText('MUS 100%')
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
    await expect(slider).toHaveAttribute('aria-valuenow', '97')
    await page.keyboard.press('PageDown')
    await expect(status).toHaveText('MUS 87%')
    await slider.hover()
    await page.mouse.wheel(0, -100)
    await expect(status).toHaveText('MUS 92%')
    await expect(status).toHaveText('PAUSED', { timeout: 3_000 })

    await label.click()
    await expect(control).toHaveClass(/is-off/)
    // Under the pointer the label is lit to be pressed: the stroke shows once it leaves.
    await page.mouse.move(5, 5)
    await expect(label).toHaveCSS('text-decoration-line', 'line-through')
    await expect(slider).toHaveAttribute('aria-valuenow', '92')
    await label.click()
    await expect(control).not.toHaveClass(/is-off/)

    await label.click()
    const bar = await slider.boundingBox()
    await page.mouse.move(bar.x + bar.width * 0.8, bar.y + bar.height / 2)
    await page.mouse.down()
    await page.mouse.move(bar.x + bar.width * 0.3, bar.y + bar.height / 2, { steps: 4 })
    await page.mouse.up()
    await expect(control).not.toHaveClass(/is-off/)
    expect(Math.abs(Number(await slider.getAttribute('aria-valuenow')) - 30)).toBeLessThanOrEqual(3)
    await slider.focus()
    await page.keyboard.press('Home')
    await expect(status).toHaveText('MUS 0%')
    await expect(control).toHaveClass(/is-off/)
    consoleIsClean()
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('a one-line player beside the breaker, under the screen', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear())
    const player = await openPlayer(page)
    const screen = await box(page.locator('.canvas-area'))
    const breaker = await box(page.locator('.legend'))
    const casing = await box(page.locator('.music-player'))
    expect(casing.top).toBeGreaterThan(screen.bottom)
    expect(casing.left).toBeGreaterThanOrEqual(breaker.right)
    expect(casing.bottom - casing.top).toBeLessThanOrEqual(80)
    await expect(page.locator('.music-player .player-spectrum')).toBeHidden()
    await player.locator('.button-play').click()
    await expect(player).toHaveAttribute('data-state', 'playing')
  })
})
