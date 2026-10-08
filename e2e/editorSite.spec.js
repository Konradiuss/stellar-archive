import { expect, test } from '@playwright/test'
import { waitForView } from './helpers'

const area = page => page.locator('.editor-area')
const mapNow = async page => {
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="map.json"]').click()
  return JSON.parse(await area(page).inputValue())
}

async function openSite(page) {
  await page.goto('/#/edit')
  await expect(page.locator('.no-problems')).toBeVisible()
  await page.locator('.tab-site').click()
  await expect(page.locator('.site-panel')).toBeVisible()
}

const type = async (locator, value) => {
  await locator.fill(value)
  await locator.press('Enter')
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

// Was: the name, the tab title, the description and the address of the site were set in map.json by hand only.
test('the site: its name, tab title and description, with the link preview they make', async ({ page }) => {
  await openSite(page)
  const before = (await mapNow(page)).site
  await page.locator('.tab-site').click()
  const share = page.locator('.site-share')
  await expect(share.locator('.share-title')).toHaveText(before.title)
  await expect(share.locator('svg')).toBeVisible()

  await type(page.locator('.site-title'), 'Atlas of Stars')
  await expect(share.locator('.share-title')).toHaveText('Atlas of Stars')
  await expect(share.locator('svg')).toContainText('Atlas of Stars')
  await page.locator('.site-description').fill('Every star of the atlas, and the lanes between.')
  await page.locator('.site-description').blur()
  await expect(share.locator('.share-description')).toHaveText('Every star of the atlas, and the lanes between.')
  await expect(page.locator('.site-description-count')).toContainText('47 of 300')

  // Refused, said why, and the field shows the map's value again.
  await type(page.locator('.site-template'), '{site} only')
  await expect(page.locator('.form-error')).toContainText('{page}')
  await expect(page.locator('.site-template')).toHaveValue(before.titleTemplate ?? '')
  await type(page.locator('.site-template'), '{site} · {page}')
  await expect(page.locator('.site-template-example')).toContainText('Atlas of Stars · ')
  await type(page.locator('.site-language'), 'not a language')
  await expect(page.locator('.form-error')).toContainText('no language tag')
  await type(page.locator('.site-url'), 'https://owner.github.io/atlas')
  await expect(share.locator('.share-domain')).toHaveText('owner.github.io')

  let site = (await mapNow(page)).site
  expect(site).toMatchObject({ title: 'Atlas of Stars', titleTemplate: '{site} · {page}', description: 'Every star of the atlas, and the lanes between.', url: 'https://owner.github.io/atlas' })

  // Cleared: the key goes, the field shows what the site uses.
  await page.locator('.tab-site').click()
  await type(page.locator('.site-url'), '')
  site = (await mapNow(page)).site
  expect(site.url).toBeUndefined()

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await page.goto('/#/system/sol')
  await waitForView(page, 'system')
  await expect(page).toHaveTitle(/^Atlas of Stars · /)
})

test('the terminal: its script made from the built-in one, its files added, renamed and removed with their texts', async ({ page }) => {
  await openSite(page)
  await type(page.locator('.terminal-script'), 'terminal.txt')
  await page.locator('.terminal-create').click()
  await expect(page.locator('.terminal-open')).toBeVisible()
  await page.locator('.terminal-new-name').fill('notes.txt')
  await page.locator('.terminal-new-path').fill('terminal/notes.txt')
  await page.locator('.terminal-add').click()
  await expect(page.locator('.terminal-file[data-name="NOTES.TXT"] .terminal-file-path')).toHaveValue('terminal/notes.txt')
  await page.locator('.terminal-new-name').fill('NOTES.TXT')
  await page.locator('.terminal-new-path').fill('terminal/other.txt')
  await page.locator('.terminal-add').click()
  await expect(page.locator('.form-error')).toContainText('already has a file NOTES.TXT')
  await type(page.locator('.terminal-file[data-name="NOTES.TXT"] .terminal-file-name'), 'log.txt')
  await page.locator('.terminal-syndicate').uncheck()

  let map = await mapNow(page)
  expect(map.terminal).toEqual({ script: 'terminal.txt', files: { 'LOG.TXT': 'terminal/notes.txt' }, syndicate: false })
  await page.locator('.file-item[data-path="terminal.txt"]').click()
  await expect(area(page)).toHaveValue(/C:\\>/)
  await expect(page.locator('.file-item[data-path="terminal/notes.txt"]')).toHaveCount(1)

  // Through a reload: the switch stays off.
  await page.reload()
  await page.locator('.tab-site').click()
  await expect(page.locator('.terminal-syndicate')).not.toBeChecked()
  await page.locator('.terminal-file[data-name="LOG.TXT"] .terminal-file-remove').click()
  await type(page.locator('.terminal-script'), '')
  await page.locator('.terminal-syndicate').check()
  map = await mapNow(page)
  expect(map.terminal).toBeUndefined()
  await expect(page.locator('.file-item[data-path="terminal/notes.txt"]')).toHaveCount(0)
  await expect(page.locator('.file-item[data-path="terminal.txt"]')).toHaveCount(0)
})

// A red pixel.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

// Was: the icon of the tab and the picture of link previews could only be put on the site by hand.
test('the icon and the picture of the site are uploaded, kept through a reload, and the preview shows the icon of the draft', async ({ page }) => {
  const problems = []
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()) })
  await openSite(page)
  const icon = page.locator('.site-picture[data-field="favicon"]')
  await icon.locator('.site-favicon-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(icon.locator('.site-picture-error')).toHaveText('notes.txt is no PNG, GIF, JPG, WebP or ICO picture.')
  await icon.locator('.site-favicon-file').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') })
  await expect(icon.locator('.site-picture-error')).toHaveText('The browser cannot show fake.png as a picture.')
  await icon.locator('.site-favicon-file').setInputFiles({ name: 'Star.PNG', mimeType: 'image/png', buffer: PNG })
  await expect(icon.locator('.site-picture-error')).toHaveCount(0)
  await expect(page.locator('.site-favicon')).toHaveValue('favicon.png')
  await expect(icon.locator('img.site-picture-image')).toHaveAttribute('src', /^blob:/)
  await page.locator('.site-picture[data-field="preview"] .site-preview-file').setInputFiles({ name: 'card.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('.share-own')).toHaveText('Its own picture: preview.png')

  await page.reload()
  await expect(page.locator('.no-problems')).toBeVisible()
  await page.locator('.file-item[data-path="favicon.png"]').click()
  await expect(page.locator('.file-picture')).toContainText('A picture, 1 KB.')
  await expect(page.locator('.file-picture-image')).toHaveAttribute('src', /^blob:/)
  const site = (await mapNow(page)).site
  expect(site).toMatchObject({ favicon: 'favicon.png', preview: 'preview.png' })

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  await expect.poll(() => page.locator('link[rel~="icon"]').getAttribute('href')).toMatch(/^(blob|data):/)
  expect(problems.filter(text => /Content Security Policy/i.test(text))).toEqual([])
})

test('the wiki: the markup, a server wiki said for what it takes over, the portal, and the legend of the galaxy on the map', async ({ page }) => {
  await openSite(page)
  await page.locator('.wiki-format').selectOption('markdown')
  await expect(page.locator('.wiki-url-note')).toHaveCount(0)
  await type(page.locator('.wiki-url'), 'wiki.example.org')
  await expect(page.locator('.form-error')).toContainText('no address')
  await type(page.locator('.wiki-url'), 'https://wiki.example.org/wiki/')
  await expect(page.locator('.wiki-url-note')).toBeVisible()
  await page.locator('.wiki-portal').uncheck()
  const legend = page.locator('.legend-card .galaxy-legend-text .editor-area')
  await legend.fill('Blue: the Concord. Mind the rocks.')
  await legend.blur()

  await expect.poll(async () => (await mapNow(page)).legend).toBe('Blue: the Concord. Mind the rocks.')
  const map = await mapNow(page)
  expect(map.loreConfig).toEqual({ format: 'markdown', wikiUrl: 'https://wiki.example.org/wiki/' })
  expect(map.wiki.portal).toBe(false)

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  await expect(page.locator('.map-legend')).toContainText('Mind the rocks.')
})
