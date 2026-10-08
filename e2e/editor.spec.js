import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { waitForView, watchConsole, withStores } from './helpers'

const SITE_MAP = readFileSync(new URL('../test-world/map.json', import.meta.url), 'utf8')
// A text area reads every line end as LF, whatever the checkout wrote.
const MAP = SITE_MAP.replaceAll('\r\n', '\n')
const gitSha = text => {
  const body = Buffer.from(text, 'utf8')
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest('hex')
}

const area = page => page.locator('.editor-area')
const mapText = async page => {
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="map.json"]').click()
  return area(page).inputValue()
}

async function openEditor(page) {
  await page.goto('/#/edit')
  await expect(area(page)).toBeVisible()
  await expect(page.locator('.no-problems')).toBeVisible()
}

const withLantern = () => {
  const map = JSON.parse(MAP)
  map.stars.push({ id: 'lantern', name: 'Lantern', sectorX: 0, sectorY: 0, faction: 'concord' })
  return JSON.stringify(map, null, 2)
}

test.beforeEach(async ({ page }) => {
  // Storage is cleared once per test, so reloads within a test keep the draft.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-started')) {
      localStorage.clear()
      sessionStorage.clear()
      sessionStorage.setItem('e2e-started', '1')
    }
  })
})

test('the files of the site, and the problems of the map as it is typed', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openEditor(page)
  await expect(page.locator('.file-item')).toContainText(['map.json', 'lore/solar/earth.wiki'])
  await expect(page.locator('.file-item[data-path="wiki/main.wiki"]')).toHaveCount(1)
  await expect(page.locator('.editor-changed')).toHaveText('No changes')

  const broken = MAP.replace('"rows": 8', '"rows": 8,')
  await area(page).fill(broken)
  const syntax = page.locator('.problem-syntax')
  await expect(syntax).toContainText(/Line 10, column 3: Extra comma/)
  await syntax.click()
  const offset = broken.indexOf('"rows": 8,') + '"rows": 8,'.length + 3
  expect(await area(page).evaluate(element => element.selectionStart)).toBe(offset)
  await expect(page.locator('.file-item.is-changed')).toHaveText('map.json')
  await expect(page.locator('.editor-changed')).toHaveText('1 file changed')
  await expect(page.locator('.file-item[data-path="wiki/main.wiki"]')).toHaveCount(1)
  await page.locator('.action-publish').click()
  await expect(page.locator('.publish-blocked')).toBeVisible()
  await expect(page.locator('.publish-send')).toBeDisabled()
  await page.locator('.publish-close').click()
  await page.locator('.tab-stars').click()
  await expect(page.locator('.forms-blocked')).toBeVisible()

  const map = JSON.parse(MAP)
  delete map.stars[3].id
  await page.locator('.tab-files').click()
  await area(page).fill(JSON.stringify(map, null, 2))
  const problem = page.locator('.problem', { hasText: 'stars[3]' })
  await expect(problem).toContainText('ERROR')
  await problem.click()
  const selected = await area(page).evaluate(element => element.value.slice(element.selectionStart, element.selectionEnd))
  expect(JSON.parse(selected)).toEqual(map.stars[3])

  await page.reload()
  await expect(page.locator('.file-item.is-changed')).toHaveText('map.json')
  await expect(page.locator('.problem', { hasText: 'stars[3]' })).toHaveCount(1)
  await page.locator('.action-revert').click()
  await expect(page.locator('.no-problems')).toBeVisible()
  await expect(page.locator('.editor-changed')).toHaveText('No changes')
  expect(await area(page).inputValue()).toBe(MAP)
  consoleIsClean()
})

test('stars and factions are edited on the grid, and only their lines change', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openEditor(page)
  await page.locator('.tab-stars').click()

  await page.getByRole('button', { name: 'Sector 0, 0', exact: true }).click()
  await page.locator('.new-star').click()
  await expect(page.locator('.star-name')).toBeFocused()
  await page.locator('.star-name').fill('Lantern')
  await page.locator('.star-name').press('Enter')
  await page.locator('.star-faction').selectOption('combine')
  await page.locator('.star-id').fill('lantern')
  await page.locator('.star-id').press('Enter')
  await expect(page.getByRole('button', { name: 'Sector 0, 0: Lantern' })).toHaveCount(1)
  let text = await mapText(page)
  expect(JSON.parse(text).stars.at(-1)).toEqual({ id: 'lantern', name: 'Lantern', sectorX: 0, sectorY: 0, faction: 'combine' })
  const end = MAP.indexOf('\n  ],\n  "systems"')
  expect(text.startsWith(MAP.slice(0, end))).toBe(true)
  expect(text.endsWith(MAP.slice(end))).toBe(true)

  await page.locator('.tab-stars').click()
  await page.locator('.star-id').fill('asterion')
  await page.locator('.star-id').press('Enter')
  await expect(page.locator('.form-error')).toHaveText('Another star has the id "asterion".')

  await page.locator('.star-move').click()
  await page.getByRole('button', { name: 'Sector 1, 0', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sector 1, 0: Lantern' })).toHaveCount(1)

  const sol = JSON.parse(MAP).stars.find(star => star.id === 'sol')
  await page.getByRole('button', { name: `Sector ${sol.sectorX}, ${sol.sectorY}: Sol` }).click()
  await page.locator('.star-delete').click()
  await expect(page.locator('.editor-confirm')).toContainText('Delete Sol?')
  await expect(page.locator('.editor-confirm')).toContainText(/with \d+ routes/)
  await page.locator('.editor-confirm .confirm-yes').click()
  await expect(page.getByRole('button', { name: `Sector ${sol.sectorX}, ${sol.sectorY}`, exact: true })).toHaveCount(1)

  await page.locator('.new-faction').click()
  await expect(page.locator('.faction-row[data-faction="new-faction"] .faction-name')).toHaveValue('New faction')
  await page.locator('.faction-row[data-faction="tide"] .faction-delete').click()
  await page.locator('.faction-row[data-faction="tide"] .confirm-yes').click()
  await expect(page.locator('.faction-row[data-faction="tide"]')).toHaveCount(0)

  text = await mapText(page)
  const map = JSON.parse(text)
  expect(map.stars.find(star => star.id === 'lantern')).toMatchObject({ sectorX: 1, sectorY: 0 })
  expect(map.stars.some(star => star.id === 'sol')).toBe(false)
  expect(map.systems).not.toHaveProperty('sol')
  expect(map.hyperlines.some(line => [line.from, line.to].some(end => end.sectorX === sol.sectorX && end.sectorY === sol.sectorY))).toBe(false)
  expect(map.factions).not.toHaveProperty('tide')
  expect(map.factions['new-faction']).toMatchObject({ name: 'New faction' })
  expect(map.stars.some(star => star.faction === 'tide')).toBe(false)
  await expect(page.locator('.no-problems')).toBeVisible()
  consoleIsClean()
})

test('the draft is shown on the site, and left again', async ({ page }) => {
  await openEditor(page)
  await area(page).fill(withLantern())
  await page.locator('.file-item[data-path="wiki/main.wiki"]').click()
  await area(page).fill("'''Draft''' of the main page.")

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  await expect(page.locator('.draft-banner')).toContainText('Draft of the editor')
  expect(await withStores(page, ({ map }) => map.stars.find(star => star.id === 'lantern')?.name)).toBe('Lantern')

  await Promise.all([page.waitForEvent('load'), page.locator('.banner-editor').click()])
  await expect(page.locator('.file-item.is-changed')).toHaveText(['map.json', 'wiki/main.wiki'])

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  await Promise.all([page.waitForEvent('load'), page.locator('.banner-leave').click()])
  await waitForView(page, 'galaxy')
  await expect(page.locator('.draft-banner')).toHaveCount(0)
  expect(await withStores(page, ({ map }) => map.stars.some(star => star.id === 'lantern'))).toBe(false)
})

test('the changed files are downloaded: one as it is, several in a ZIP', async ({ page }) => {
  await openEditor(page)
  await expect(page.locator('.action-download')).toBeDisabled()
  const draft = withLantern()
  await area(page).fill(draft)
  let [download] = await Promise.all([page.waitForEvent('download'), page.locator('.action-download').click()])
  expect(download.suggestedFilename()).toBe('map.json')
  expect(readFileSync(await download.path(), 'utf8')).toBe(draft)

  await page.locator('.file-item[data-path="wiki/main.wiki"]').click()
  await area(page).fill('Новая главная.')
  ;[download] = await Promise.all([page.waitForEvent('download'), page.locator('.action-download').click()])
  expect(download.suggestedFilename()).toBe('site-edits.zip')
  const zip = readFileSync(await download.path())
  expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  expect(zip.includes(Buffer.from('wiki/main.wiki'))).toBe(true)
  expect(zip.includes(Buffer.from('Новая главная.'))).toBe(true)
})

test('publishing writes one commit to GitHub, and stops at a conflict', async ({ page }) => {
  const calls = []
  let remoteMap = gitSha(SITE_MAP)
  await page.route('https://api.github.com/**', route => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/repos/owner/site', '')
    calls.push({ method: request.method(), path, body: request.postDataJSON?.() ?? null, auth: request.headers().authorization })
    const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '') return reply({ permissions: { push: true } })
    if (path === '/git/ref/heads/main') return reply({ object: { sha: 'parent' } })
    if (path === '/git/commits/parent') return reply({ tree: { sha: 'tree' } })
    if (path === '/git/trees/tree') return reply({ tree: [{ path: 'public/map.json', type: 'blob', sha: remoteMap }] })
    if (path === '/git/trees') return reply({ sha: 'new-tree' })
    if (path === '/git/commits') return reply({ sha: 'c0ffee1234567' })
    if (path === '/git/refs/heads/main') return reply({ ref: 'refs/heads/main' })
    return route.fulfill({ status: 500, body: '{}' })
  })
  await openEditor(page)
  await area(page).fill(withLantern())
  await page.locator('.action-publish').click()
  const dialog = page.getByRole('dialog', { name: 'Publish to GitHub' })
  await expect(dialog.locator('.publish-files')).toHaveText('map.json')
  await dialog.locator('.publish-repo').fill('owner/site')
  await dialog.locator('.publish-token').fill('secret-token')
  await dialog.locator('.publish-message').fill('Lantern')

  remoteMap = 'someone-else'
  await dialog.locator('.publish-send').click()
  await expect(dialog.locator('.publish-conflict')).toContainText('Changed on GitHub after you began editing: map.json.')
  expect(calls.filter(call => call.method !== 'GET')).toEqual([])

  await dialog.locator('.publish-overwrite').click()
  await expect(dialog.locator('.publish-log')).toContainText('Done: commit c0ffee1.')
  await expect(dialog.getByRole('link', { name: 'The commit' })).toHaveAttribute('href', 'https://github.com/owner/site/commit/c0ffee1234567')
  const tree = calls.find(call => call.method === 'POST' && call.path === '/git/trees')
  expect(tree.body.tree).toEqual([{ path: 'public/map.json', mode: '100644', type: 'blob', content: withLantern() }])
  expect(calls.find(call => call.path === '/git/commits' && call.method === 'POST').body.message).toBe('Lantern')
  expect(calls.at(-1)).toMatchObject({ method: 'PATCH', path: '/git/refs/heads/main', body: { sha: 'c0ffee1234567' } })
  expect(calls.every(call => call.auth === 'Bearer secret-token')).toBe(true)
  await expect(page.locator('.editor-changed')).toHaveText('No changes')
  expect(await page.evaluate(() => localStorage.getItem('spacemap:github-token'))).toBeNull()
  await dialog.locator('.publish-close').click()
  await expect(dialog).toHaveCount(0)
})

const redShare = locator => locator.evaluate(canvas => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
  let red = 0
  let seen = 0
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] < 200) continue
    seen++
    if (data[at] > 180 && data[at + 1] < 90 && data[at + 2] < 90) red++
  }
  return seen ? red / seen : 0
})
const pickColor = (locator, value) => locator.evaluate((input, color) => {
  input.value = color
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}, value)

test('a system: planets drawn as they are edited, moons, stations, lore', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openEditor(page)
  await page.locator('.tab-system').click()
  await page.locator('.system-star-select').selectOption('sol')
  const planets = JSON.parse(MAP).systems.sol.planets

  await page.locator('.add-planet').click()
  await expect(page.locator('.body-name')).toHaveValue('New planet')
  const picture = page.locator('.look-planet canvas')
  await expect(picture).toBeVisible()
  expect(await redShare(picture)).toBeLessThan(0.2)
  await page.locator('.look-amount').evaluate(input => {
    input.value = '1'
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await pickColor(page.locator('.look-water'), '#ff0000')
  await expect.poll(() => redShare(picture)).toBeGreaterThan(0.4)
  await page.locator('.look-ring').selectOption('medium')
  await page.locator('.body-orbit').fill('500')
  await page.locator('.body-orbit').press('Enter')
  let map = JSON.parse(await mapText(page))
  expect(map.systems.sol.planets.at(-1)).toMatchObject({
    name: 'New planet',
    orbitRadius: 500,
    visualization: { seed: 'new-planet', waterAmount: 1, waterColor: '#ff0000', ring: { size: 'medium' } }
  })
  expect(map.systems.sol.planets.slice(0, -1)).toEqual(planets)

  await page.locator('.tab-system').click()
  await page.locator('.body-row').filter({ has: page.locator('.planet-item.is-current') }).locator('.body-up').click()
  await page.locator('.add-station').click()
  await expect(page.locator('.look-station canvas')).toBeVisible()
  await page.locator('.station-type').selectOption('shipyard')
  map = JSON.parse(await mapText(page))
  const moved = map.systems.sol.planets.at(-2)
  expect(moved.name).toBe('New planet')
  expect(moved.satellites).toEqual([{ name: 'New station', kind: 'station', type: 'shipyard' }])

  await page.locator('.tab-system').click()
  await page.locator('.planet-item', { hasText: 'New planet' }).click()
  await page.locator('.lore-text .editor-area').fill("'''Красное море''' у [[Sol]], далеко от [[Нигде]].")
  const preview = page.locator('.editor-lore .editor-preview-page')
  await expect(preview.locator('strong')).toHaveText('Красное море')
  await expect(preview.locator('.rt-link.is-internal')).toHaveText('Sol')
  await expect(preview.locator('.rt-link.is-missing')).toHaveText('Нигде')
  await preview.locator('.rt-link.is-internal').click()
  await expect(page.locator('.editor-system')).toBeVisible()

  await page.locator('.planet-item', { hasText: 'Mercury' }).click()
  await page.locator('.body-delete').click()
  await expect(page.locator('.editor-confirm .delete-files')).toHaveText('Also deleted: lore/solar/mercury.wiki.')
  await page.locator('.editor-confirm .confirm-yes').click()
  await page.locator('.tab-files').click()
  await expect(page.locator('.file-item.is-deleted')).toHaveAttribute('data-path', 'lore/solar/mercury.wiki')
  map = JSON.parse(await area(page).inputValue())
  expect(map.systems.sol.planets.find(planet => planet.name === 'New planet').lore).toBe("'''Красное море''' у [[Sol]], далеко от [[Нигде]].")
  await page.locator('.file-item[data-path="lore/solar/mercury.wiki"]').click()
  await page.locator('.action-keep').click()
  await expect(page.locator('.file-item.is-deleted')).toHaveCount(0)
  consoleIsClean()
})

test('routes are drawn on the grid, from one star to another, in the colour of their type', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openEditor(page)
  await page.locator('.tab-stars').click()
  const before = JSON.parse(MAP).hyperlines.length
  const halcyon = JSON.parse(MAP).stars.find(star => star.id === 'halcyon')
  await page.getByRole('button', { name: 'Sector 1, 1: Sol' }).click()
  await page.locator('.add-route').click()
  await page.getByRole('button', { name: `Sector ${halcyon.sectorX}, ${halcyon.sectorY}: Halcyon` }).click()
  const line = page.locator(`.route-line[data-route="${before}"]`)
  await expect(line).toHaveClass(/is-selected/)
  await expect(page.locator('.route-panel')).toContainText('trade-sol-halcyon')
  const trade = await line.getAttribute('stroke')
  await page.locator('.route-type').selectOption('military')
  await expect(line).not.toHaveAttribute('stroke', trade)

  await page.locator('.new-type').click()
  const own = page.locator('.route-type-row[data-type="new-routes"]')
  await expect(own.locator('.type-name')).toHaveValue('New routes')
  await pickColor(own.locator('.type-color'), '#ff00aa')
  await page.locator('.route-type').selectOption('new-routes')
  await expect(line).toHaveAttribute('stroke', '#ff00aa')
  await page.locator('.route-description').fill('Тайная тропа')
  await page.locator('.route-description').press('Enter')
  await page.locator('.route-pulse-on').uncheck()
  let map = JSON.parse(await mapText(page))
  expect(map.hyperlines.at(-1)).toEqual({ id: 'trade-sol-halcyon', type: 'new-routes', from: 'sol', to: 'halcyon', description: 'Тайная тропа', pulse: false })
  expect(map.hyperlineTypes['new-routes']).toEqual({ name: 'New routes', color: '#ff00aa', width: 2 })

  await page.locator('.tab-stars').click()
  await own.locator('.type-delete').click()
  await own.locator('.confirm-yes').click()
  map = JSON.parse(await mapText(page))
  expect(map.hyperlineTypes).not.toHaveProperty('new-routes')
  expect(map.hyperlines.at(-1)).not.toHaveProperty('type')
  consoleIsClean()
})

test('articles: a new one with its file, its preview, a new title, and one deleted with its file', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  const calls = []
  await page.route('https://api.github.com/**', route => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/repos/owner/site', '')
    calls.push({ method: request.method(), path, body: request.postDataJSON?.() ?? null })
    const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '') return reply({ permissions: { push: true } })
    if (path === '/git/ref/heads/main') return reply({ object: { sha: 'parent' } })
    if (path === '/git/commits/parent') return reply({ tree: { sha: 'tree' } })
    if (path === '/git/trees/tree') {
      const site = ['map.json', 'wiki/free-tide.md'].map(file => ({ path: `public/${file}`, type: 'blob', sha: gitSha(readFileSync(new URL(`../test-world/${file}`, import.meta.url), 'utf8')) }))
      return reply({ tree: site })
    }
    if (path === '/git/trees') return reply({ sha: 'new-tree' })
    if (path === '/git/commits') return reply({ sha: 'c0ffee1234567' })
    return reply({ ref: 'refs/heads/main' })
  })
  await openEditor(page)
  await page.locator('.tab-articles').click()

  await page.locator('.new-article-title').fill('Новая колония')
  await page.locator('.new-article-create').click()
  await expect(page.locator('.article-title')).toHaveValue('Новая колония')
  await expect(page.locator('.article-panel .source-file')).toHaveValue('wiki/новая-колония.wiki')
  const text = page.locator('.article-text .editor-area')
  await expect(text).toHaveValue("'''Новая колония'''\n")
  await text.fill("'''Новая колония''' — у [[Free Tide|Прилива]] и [[Нигде]].\n\n== История ==\nОснована в 2430.")
  const preview = page.locator('.article-preview .editor-preview-page')
  await expect(preview.locator('strong')).toHaveText('Новая колония')
  await expect(preview.locator('.rt-link.is-internal')).toHaveText('Прилива')
  await expect(preview.locator('.rt-link.is-missing')).toHaveText('Нигде')
  await expect(preview.locator('h2, h3').first()).toContainText('История')

  await page.locator('.article-home').check()
  await page.locator('.article-title').fill('Колония Рассвет')
  await page.locator('.article-title').press('Enter')
  let map = JSON.parse(await mapText(page))
  expect(map.wiki.articles.at(-1)).toEqual({ title: 'Колония Рассвет', file: 'wiki/новая-колония.wiki', aliases: ['Новая колония'] })
  expect(map.wiki.home).toBe('Колония Рассвет')
  await expect(page.locator('.file-item[data-path="wiki/новая-колония.wiki"]')).toHaveClass(/is-changed/)

  await page.locator('.tab-articles').click()
  await page.locator('.article-item', { hasText: 'Free Tide' }).click()
  await page.locator('.article-delete').click()
  await expect(page.locator('.editor-confirm .delete-files')).toHaveText('Also deleted: wiki/free-tide.md.')
  await page.locator('.editor-confirm .confirm-yes').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.action-download').click()])
  const zip = readFileSync(await download.path())
  expect(zip.includes(Buffer.from('DELETED.txt'))).toBe(true)
  expect(zip.includes(Buffer.from('wiki/free-tide.md'))).toBe(true)

  await page.locator('.action-publish').click()
  const dialog = page.getByRole('dialog', { name: 'Publish to GitHub' })
  await dialog.locator('.publish-repo').fill('owner/site')
  await dialog.locator('.publish-token').fill('secret-token')
  await dialog.locator('.publish-send').click()
  await expect(dialog.locator('.publish-log')).toContainText('Done: commit c0ffee1.')
  const tree = calls.find(call => call.method === 'POST' && call.path === '/git/trees').body.tree
  expect(tree).toContainEqual({ path: 'public/wiki/free-tide.md', mode: '100644', type: 'blob', sha: null })
  expect(tree.find(entry => entry.path === 'public/wiki/новая-колония.wiki').content).toContain('Основана в 2430.')
  expect(tree.map(entry => entry.path).sort()).toEqual(['public/map.json', 'public/wiki/free-tide.md', 'public/wiki/новая-колония.wiki'])
  await dialog.locator('.publish-close').click()
  await expect(page.locator('.editor-changed')).toHaveText('No changes')
  consoleIsClean()
})

// Was: the forms could only pick a group the map file already had.
test('groups of articles: a new one and one inside it, an icon, the order, and one deleted', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openEditor(page)
  await page.locator('.tab-articles').click()
  await page.locator('.open-groups').click()
  const groups = page.locator('.editor-groups')
  const row = id => groups.locator(`.group-row[data-group="${id}"]`)
  await expect(groups.locator('.group-row')).toHaveCount(6)

  await groups.locator('.new-group-title').fill('Корабли')
  await groups.locator('.new-group-create').click()
  await expect(groups.locator('.new-group-title')).toHaveValue('')
  await groups.locator('.new-group-title').fill('Freighters')
  await groups.locator('.new-group-parent').selectOption('корабли')
  await groups.locator('.new-group-create').click()
  await row('корабли').locator('.group-icon-select').selectOption('rocket')
  await row('корабли').locator('.group-up').click()

  let map = JSON.parse(await mapText(page))
  const ids = map.wiki.groups.map(group => group.id)
  expect(ids).toEqual(['history', 'factions', 'tech', 'корабли', 'examples'])
  expect(map.wiki.groups[3]).toEqual({ id: 'корабли', title: 'Корабли', groups: [{ id: 'freighters', title: 'Freighters' }], icon: 'rocket' })

  await page.locator('.tab-articles').click()
  await page.locator('.open-groups').click()
  await row('freighters').locator('.group-parent').selectOption('history')
  map = JSON.parse(await mapText(page))
  expect(map.wiki.groups[0].groups).toEqual([{ id: 'freighters', title: 'Freighters' }])
  expect(map.wiki.groups[3]).not.toHaveProperty('groups')
  await page.locator('.tab-articles').click()
  await page.locator('.open-groups').click()
  await row('freighters').locator('.group-parent').selectOption('корабли')

  await groups.locator('.new-group-title').fill('Bulk')
  await groups.locator('.new-group-parent').selectOption('freighters')
  await groups.locator('.new-group-create').click()
  await expect(groups.locator('.new-group-parent option[value="bulk"]')).toHaveCount(0)
  await expect(row('history').locator('.group-parent option[value="bulk"]')).toHaveCount(0)
  await expect(row('корабли').locator('.group-parent option')).toHaveText(['— at the top —'])
  map = JSON.parse(await mapText(page))
  expect(map.wiki.groups[3].groups).toEqual([{ id: 'freighters', title: 'Freighters', groups: [{ id: 'bulk', title: 'Bulk' }] }])

  await page.locator('.tab-articles').click()
  await page.locator('.article-item', { hasText: 'Quantum Gates' }).click()
  await page.locator('.article-group-select').selectOption('freighters')
  await expect(page.locator('.article-group', { hasText: 'Freighters' })).toBeVisible()

  await page.locator('.open-groups').click()
  await row('корабли').locator('.group-delete').click()
  await groups.locator('.group-confirm .confirm-yes').click()
  await expect(row('freighters')).toHaveCount(0)
  map = JSON.parse(await mapText(page))
  expect(map.wiki.groups.map(group => group.id)).toEqual(['history', 'factions', 'tech', 'examples'])
  expect(map.wiki.articles.find(article => article.title === 'Quantum Gates')).not.toHaveProperty('group')
  consoleIsClean()
})

// Was: the main page was plain text with templates: style names nobody could see, blocks moved only by cutting text.
test('the main page as blocks: a banner restyled, a box added, moved and deleted', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openEditor(page)
  await page.locator('.tab-main').click()
  const cards = page.locator('.main-card')
  await expect(cards).toHaveCount(7)
  await expect(page.locator('.main-home')).toHaveValue('Main Page')

  const banner = page.locator('.main-card.is-banner')
  await banner.locator('.banner-style[data-style="ice"]').click()
  await banner.locator('.banner-animation').selectOption('bounce')
  await banner.locator('.banner-frame').selectOption('none')
  const preview = page.locator('.main-preview')
  await expect(preview.locator('.pixel-logo.is-bounce .pixel-logo-letter').first()).toBeVisible()
  await expect(preview.locator('.rt-banner')).toHaveClass(/is-frame-none/)

  await page.locator('.main-add-block[data-kind="box"]').click()
  await expect(cards).toHaveCount(8)
  await expect(cards.last()).toHaveAttribute('data-kind', 'box')
  await cards.last().locator('.box-title').fill('Новости')
  await cards.last().locator('.box-title').press('Enter')
  await cards.last().locator('.card-up').click()
  await expect(cards.nth(6).locator('.box-title')).toHaveValue('Новости')
  await expect(cards.last()).toHaveAttribute('data-kind', 'portal')

  const text = await (async () => {
    await page.locator('.tab-files').click()
    await page.locator('.file-item[data-path="wiki/main.wiki"]').click()
    return area(page).inputValue()
  })()
  const lines = text.split(/\r?\n/)
  expect(lines.slice(0, 5)).toEqual(['{{Banner', '|title = GALAXY ARCHIVE', '|style = ice', '|animation = bounce', '|frame = none'])
  expect(lines[5]).toMatch(/^\|caption = /)
  expect(text).toMatch(/\{\{Box\|Новости\|color=blue\|icon=book\|[\s\S]*\}\}\s*\{\{Archive sections\}\}\s*$/)

  await page.locator('.tab-main').click()
  await cards.nth(6).locator('.card-delete').click()
  await cards.nth(6).locator('.confirm-yes').click()
  await expect(cards).toHaveCount(7)
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="wiki/main.wiki"]').click()
  expect(await area(page).inputValue()).not.toContain('Новости')
  consoleIsClean()
})

// Was: the world page could not be written in the forms nor put in a group.
test('the world page: its text in the forms, a group of its own, on the site in the preview', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-articles').click()
  await page.locator('.world-item').click()
  await expect(page.locator('.world-panel .editor-heading')).toHaveText('Galaxy: the world page')
  await page.locator('.world-group').selectOption('history')
  await page.locator('.world-area .editor-area').fill('The galaxy, as the draft tells it.')
  await page.locator('.open-groups').click()
  const map = JSON.parse(await mapText(page))
  expect(map.wiki.worldGroup).toBe('history')
  expect(map.worldLore).toBe('The galaxy, as the draft tells it.')

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  await page.goto('/#/wiki/Galaxy')
  await waitForView(page, 'wiki')
  await expect(page.locator('.wiki-article')).toContainText('as the draft tells it')
  await expect(page.locator('.map-legend .navbox-row[data-group="group:history"] .navbox-list')).toContainText('Galaxy')
  await expect(page.locator('.map-legend .navbox-row[data-group="misc"]')).toHaveCount(0)
})

test('a planet and an article of the draft are on the site in the preview', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-system').click()
  await page.locator('.system-star-select').selectOption('sol')
  await page.locator('.add-planet').click()
  await page.locator('.body-name').fill('Немезида')
  await page.locator('.body-name').press('Enter')
  await page.locator('.tab-articles').click()
  await page.locator('.new-article-title').fill('Черновая статья')
  await page.locator('.new-article-create').click()
  await page.locator('.article-text .editor-area').fill("'''Черновая статья''' есть только в черновике.")

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  expect(await withStores(page, ({ map }) => map.systems.sol.planets.map(planet => planet.name))).toContain('Немезида')
  await page.goto('/#/wiki/Черновая_статья')
  await waitForView(page, 'wiki')
  await expect(page.locator('.wiki-title')).toHaveText('Черновая статья')
  await expect(page.locator('.wiki-article strong')).toHaveText('Черновая статья')
})

test('a renamed planet lands in map.json, and a Markdown article previews with its picture', async ({ page }) => {
  await page.goto('/#/edit')
  await expect(page.locator('.editor-area')).toBeVisible()
  await expect(page.locator('.no-problems')).toBeVisible()
  await page.locator('.tab-system').click()
  await page.locator('.system-star-select').selectOption('asterion')
  await page.locator('.planet-item', { hasText: 'Daybreak' }).click()
  await page.locator('.body-name').fill('New Daybreak')
  await page.locator('.body-name').press('Enter')
  await expect(page.locator('.planet-item', { hasText: 'New Daybreak' })).toBeVisible()
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="map.json"]').click()
  const changed = JSON.parse(await page.locator('.editor-area').inputValue())
  expect(changed.systems.asterion.planets[0].name).toBe('New Daybreak')
  expect(changed.systems.sol.planets).toHaveLength(8)
  await page.locator('.file-item[data-path="wiki/markdown-example.md"]').click()
  await expect(page.locator('.editor-area')).toHaveValue(/Markdown Example/)
  await expect(page.locator('.file-preview')).toBeVisible()
  await page.locator('.action-preview-file').click()
  await expect(page.locator('.file-preview')).toHaveCount(0)
  await page.locator('.action-preview-file').click()
  await expect(page.locator('.file-preview')).toContainText('Paragraphs and emphasis')
  await expect(page.locator('.file-preview .pixel-image-canvas')).toBeVisible()
})

// Was: the System tab had no way to the star itself: its look and lore could only be typed into map.json.
test('the star of a system: chosen first, its look drawn as edited, its lore, and a star with no planets yet', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openEditor(page)
  await page.locator('.tab-system').click()
  await page.locator('.system-star-select').selectOption('sol')
  await expect(page.locator('.star-panel .body-title')).toHaveText('Sol')
  await expect(page.locator('.star-item')).toHaveClass(/is-current/)

  const surface = page.locator('.star-look .star-surface')
  await expect(surface).toBeVisible()
  expect(await redShare(surface)).toBeLessThan(0.2)
  for (const field of ['color1', 'color2', 'color3']) await pickColor(page.locator(`.star-${field}`), '#ff0000')
  await expect.poll(() => redShare(surface)).toBeGreaterThan(0.4)
  await page.locator('.star-size').fill('80')
  await page.locator('.star-size').press('Enter')
  await page.locator('.star-panel .lore-text .editor-area').fill("'''Sol''' burns red now.")
  await page.locator('.star-panel .lore-text .editor-area').blur()

  await page.locator('.planet-item', { hasText: 'Earth' }).click()
  await expect(page.locator('.body-name')).toHaveValue('Earth')
  await expect(page.locator('.star-panel')).toHaveCount(0)
  await page.locator('.orbit-sketch .orbit-star').click()
  await expect(page.locator('.star-panel .body-title')).toHaveText('Sol')

  let map = JSON.parse(await mapText(page))
  const sol = map.stars.find(star => star.id === 'sol')
  expect(sol.starVisualization).toEqual({ size: 80, color1: '0xff0000', color2: '0xff0000', color3: '0xff0000' })
  expect(sol.lore).toBe("'''Sol''' burns red now.")

  await area(page).fill(withLantern())
  await page.locator('.tab-system').click()
  await page.locator('.system-star-select').selectOption('lantern')
  await expect(page.locator('.system-none')).toBeVisible()
  await expect(page.locator('.star-panel .body-title')).toHaveText('Lantern')
  await pickColor(page.locator('.star-color1'), '#00ff00')
  map = JSON.parse(await mapText(page))
  expect(map.stars.find(star => star.id === 'lantern').starVisualization).toEqual({ color1: '#00ff00' })
  consoleIsClean()
})

// Was: the tab read a "title" the map has not, so a new banner always said ARCHIVE.
test('a new banner on the main page is titled with the name of the site', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-main').click()
  await page.locator('.main-add-block[data-kind="banner"]').click()
  await expect(page.locator('.main-card.is-banner').last().locator('.banner-title')).toHaveValue('SPACEMAP')
})

// Was: an article tied to a planet lost it when the planet was renamed, and pointed at nothing when it was deleted.
test('an article tied to a planet follows its new name, and is set free when the planet is deleted', async ({ page }) => {
  await openEditor(page)
  await page.locator('.tab-system').click()
  await page.locator('.system-star-select').selectOption('nacre')
  await page.locator('.planet-item', { hasText: 'Reliquary' }).click()
  await page.locator('.body-name').fill('Reliquary Ruins')
  await page.locator('.body-name').press('Enter')
  let map = JSON.parse(await mapText(page))
  expect(map.wiki.articles.find(article => article.title === 'Nacre Beacon').place).toBe('Reliquary Ruins')
  await page.locator('.tab-articles').click()
  await page.locator('.article-item', { hasText: 'Nacre Beacon' }).click()
  await expect(page.locator('.article-place')).toHaveValue('Reliquary Ruins')

  await page.locator('.tab-system').click()
  await page.locator('.planet-item', { hasText: 'Reliquary Ruins' }).click()
  await page.locator('.body-delete').click()
  await page.locator('.editor-confirm .confirm-yes').click()
  map = JSON.parse(await mapText(page))
  expect(map.wiki.articles.find(article => article.title === 'Nacre Beacon')).not.toHaveProperty('place')
})

// Was: a place the list did not have showed as no place at all, and the next change wrote that over it.
test('a place written by hand that the map has not is shown as it is, not lost', async ({ page }) => {
  await openEditor(page)
  const map = JSON.parse(MAP)
  map.wiki.articles.find(article => article.title === 'Nacre Beacon').place = 'Atlantis'
  await area(page).fill(JSON.stringify(map, null, 2))
  await page.locator('.tab-articles').click()
  await page.locator('.article-item', { hasText: 'Nacre Beacon' }).click()
  await expect(page.locator('.article-place')).toHaveValue('Atlantis')
  await expect(page.locator('.article-place option:checked')).toHaveText('? Atlantis')
})
