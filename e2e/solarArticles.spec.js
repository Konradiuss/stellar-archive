import { expect, test } from '@playwright/test'
import { openHash, waitForView, watchConsole } from './helpers.js'

// Real published articles: these tests intentionally do not load the legacy fixture.
for (const [device, viewport] of [['desktop', { width: 1400, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  for (const [name, title, nested, mapAddress] of [
    ['Mercury', 'Mercury_(planet)', 'The advance of perihelion', '1'],
    ['Europa', 'Europa_(moon)', 'Tides beneath an icy surface', '5/2']
  ]) {
    test(`${name} has complete sources, nested contents and working notes on ${device}`, async ({ page }) => {
      const clean = watchConsole(page)
      await page.setViewportSize(viewport)
      await openHash(page, `#/wiki/${name}`)
      await expect(page.locator('.wiki-title')).toHaveText(name)
      await expect(page.locator('.wiki-view .rt-table')).toHaveCount(1)
      expect(await page.locator('.wiki-view .rt-heading').count()).toBeGreaterThanOrEqual(10)
      const scroll = page.locator('.wiki-view .wiki-body .scroll-area-body')
      const mark = page.locator('.wiki-view button.rt-ref-link').first()
      const note = page.locator('.wiki-view .rt-note[data-note="1"]')
      await mark.click()
      await expect(note).toHaveClass(/is-target/)
      await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(1000)
      await note.locator('.rt-note-back').click()
      await expect(mark).toHaveClass(/is-target/)
      await expect(mark).toBeInViewport()

      const goToSection = async section => {
        if (device === 'phone') await page.locator('.wiki-open-contents').click()
        const contents = page.locator(device === 'phone' ? '.wiki-sheet' : '.lore-panel')
        await contents.locator('.contents-link', { hasText: section }).click()
        if (device === 'phone') await expect(page.locator('.wiki-sheet')).toHaveCount(0)
      }
      await goToSection(nested)
      await expect(page).toHaveURL(new RegExp(`#${nested.replaceAll(' ', '_')}$`))
      await goToSection('Sources')
      await expect(page).toHaveURL(/#Sources$/)
      const source = page.locator('.wiki-view a', { hasText: `${name} (${name === 'Mercury' ? 'planet' : 'moon'})` })
      await expect(source).toHaveAttribute('href', `https://en.wikipedia.org/wiki/${title}`)
      await expect(source).toHaveText(`${name} (${name === 'Mercury' ? 'planet' : 'moon'})`)
      await expect(page.locator('.wiki-view a', { hasText: 'page history' })).toHaveAttribute('href', `https://en.wikipedia.org/w/index.php?title=${title}&action=history`)
      await page.screenshot({ path: `test-results/solar-${name.toLowerCase()}-sources-${device}.png`, animations: 'disabled' })

      if (device === 'phone') {
        await page.locator('.wiki-menu-button').click()
        await page.getByRole('menuitem', { name: 'Show on map', exact: true }).click()
      } else await page.locator('.wiki-action', { hasText: 'SHOW ON MAP' }).click()
      await waitForView(page, 'system')
      await expect(page).toHaveURL(new RegExp(`#/system/sol/${mapAddress}$`))
      await page.locator('.mode-breaker').click()
      await waitForView(page, 'wiki')
      await expect(page.locator('.wiki-title')).toHaveText(name)
      clean()
    })
  }
}

test('the editor previews and edits a full-length scientific article without truncating it', async ({ page }) => {
  const clean = watchConsole(page)
  await page.goto('/#/edit')
  await expect(page.locator('.editor-area')).toBeVisible()
  await page.locator('.file-item[data-path="lore/solar/mercury.wiki"]').click()
  const original = await page.locator('.editor-area').inputValue()
  expect(original.length).toBeGreaterThan(10000)
  await expect(page.locator('.file-preview')).toContainText('Formation and open questions')
  await expect(page.locator('.file-preview .pixel-image-canvas')).toHaveCount(3)
  await expect.poll(() => page.locator('.file-preview .pixel-image-canvas').evaluateAll(elements => elements.every(canvas => canvas.width > 1 && canvas.style.width))).toBe(true)
  await expect(page.locator('.file-preview .pixel-image-note')).toHaveCount(0)
  await expect(page.locator('.file-preview a', { hasText: 'Mercury (planet)' })).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Mercury_(planet)')
  const changed = `${original}\n== Editor review ==\nLocal preview of the complete scientific article.\n`
  await page.locator('.editor-area').fill(changed)
  await expect(page.locator('.file-preview')).toContainText('Local preview of the complete scientific article.')
  await expect(page.locator('.file-preview .pixel-image-canvas')).toHaveCount(3)
  await expect(page.locator('.editor-area')).toHaveValue(changed)
  await expect(page.locator('.no-problems')).toBeVisible()
  clean()
})
