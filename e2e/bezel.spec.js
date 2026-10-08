import { expect, test } from '@playwright/test'
import { waitForView, watchConsole } from './helpers.js'

test('the amber status light blinks out at its own pace on each screen', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await page.goto('/')
  await waitForView(page, 'galaxy')
  const bezels = page.locator('.screen-bezel')
  expect(await bezels.count()).toBeGreaterThan(1)

  // Every screen busy at once; the observer keeps it so should a panel change its status meanwhile.
  await expect(page.locator('.screen-bezel.led-busy')).toHaveCount(0, { timeout: 20_000 })
  await page.evaluate(() => {
    const busy = bezel => {
      if (bezel.classList.contains('led-busy')) return
      bezel.classList.remove('led-on', 'led-off', 'led-error')
      bezel.classList.add('led-busy')
    }
    for (const bezel of document.querySelectorAll('.screen-bezel')) {
      busy(bezel)
      new MutationObserver(() => busy(bezel)).observe(bezel, { attributes: true, attributeFilter: ['class'] })
    }
  })

  const samples = []
  for (let n = 0; n < 30; n++) {
    samples.push(await page.evaluate(() => [...document.querySelectorAll('.bezel-led')].map(led => {
      const style = getComputedStyle(led)
      return { opacity: style.opacity, color: style.backgroundColor, duration: style.animationDuration, delay: style.animationDelay }
    })))
    await page.waitForTimeout(50)
  }

  const lit = 'rgb(217, 154, 30)'
  const dark = 'rgb(90, 63, 15)'
  for (const leds of samples) {
    for (const led of leds) {
      expect(led.opacity).toBe('1')
      expect([lit, dark]).toContain(led.color)
    }
  }
  const first = samples[0]
  first.forEach((_, index) => {
    const colors = new Set(samples.map(leds => leds[index].color))
    expect(colors).toEqual(new Set([lit, dark]))
  })
  expect(new Set(first.map(led => `${led.duration} ${led.delay}`)).size).toBeGreaterThan(1)
  consoleIsClean()
})
