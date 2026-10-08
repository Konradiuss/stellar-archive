import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { waitForView, watchConsole } from './helpers'

const WAV_PATH = fileURLToPath(new URL('../src/assets/sounds/breaker.wav', import.meta.url))
const WAV = readFileSync(WAV_PATH)
const MAP = readFileSync(new URL('../public/map.json', import.meta.url), 'utf8')
const gitSha = text => {
  const body = Buffer.from(text, 'utf8')
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest('hex')
}

const area = page => page.locator('.editor-area')
const row = (page, name) => page.locator(`.sound-row[data-sound="${name}"]`)
const mapJson = async page => {
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="map.json"]').click()
  return JSON.parse(await area(page).inputValue())
}

async function openSounds(page) {
  await page.goto('/#/edit')
  await expect(area(page)).toBeVisible()
  await page.locator('.tab-sounds').click()
  await expect(page.locator('.sounds-panel')).toBeVisible()
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

// Was: the editor had no place to replace sounds and could not take a file that is not text.
test('a recording of the author goes in place of a sound, and out again', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openSounds(page)
  await expect(page.locator('.sound-row')).toHaveCount(28)
  await expect(page.locator('.sound-row .sound-state.is-site')).toHaveCount(28)

  await row(page, 'click').locator('.sound-file').setInputFiles(WAV_PATH)
  await expect(row(page, 'click').locator('.sound-state')).toHaveText('FILE sounds/click.wav')
  expect((await mapJson(page)).sounds).toEqual({ click: 'sounds/click.wav' })

  await page.locator('.file-item[data-path="sounds/click.wav"]').click()
  await expect(page.locator('.file-sound')).toContainText(`A sound file, ${Math.ceil(WAV.length / 1024)} KB.`)
  await expect(area(page)).toHaveCount(0)

  await page.locator('.tab-sounds').click()
  await row(page, 'click').locator('.sound-silence').click()
  await expect(row(page, 'click').locator('.sound-state')).toHaveText('SILENT')
  await row(page, 'click').locator('.sound-reset').click()
  await expect(row(page, 'click').locator('.sound-state')).toHaveText('BUILT-IN')
  expect((await mapJson(page)).sounds).toBeUndefined()
  await expect(page.locator('.file-item[data-path="sounds/click.wav"]')).toHaveCount(0)
  await expect(page.locator('.editor-changed')).toHaveText('No changes')
  consoleIsClean()
})

test('a file that is no sound, too big or unplayable is refused with the reason', async ({ page }) => {
  await openSounds(page)
  const input = row(page, 'hover').locator('.sound-file')
  const error = row(page, 'hover').locator('.sound-error')

  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(error).toHaveText('notes.txt is no WAV, MP3 or OGG file.')
  await input.setInputFiles({ name: 'long.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(310 * 1024) })
  await expect(error).toHaveText('long.wav is 310 KB: 300 KB at most. Shorten it, or save it as MP3.')
  await input.setInputFiles({ name: 'fake.wav', mimeType: 'audio/wav', buffer: Buffer.from('not a sound at all') })
  await expect(error).toHaveText('The browser cannot play this sound.')

  await expect(row(page, 'hover').locator('.sound-state')).toHaveText('BUILT-IN')
  await expect(page.locator('.editor-changed')).toHaveText('No changes')
})

test('the site previewed with the draft plays the recording from the draft', async ({ page }) => {
  const asked = []
  const warnings = []
  page.on('request', request => asked.push(request.url()))
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()) })
  await openSounds(page)
  await row(page, 'click').locator('.sound-file').setInputFiles(WAV_PATH)
  await expect(row(page, 'click').locator('.sound-state')).toHaveText('FILE sounds/click.wav')

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  // The requests so far came from the editor; from here on only the site counts.
  asked.length = 0
  // The page may sound only after a press; the recordings are read then.
  await page.keyboard.press('Shift')
  await page.waitForTimeout(500)
  expect(asked.filter(url => url.endsWith('/sounds/click.wav'))).toEqual([])
  expect(warnings.filter(text => text.includes('cannot be played'))).toEqual([])
})

test('publishing sends the recording to GitHub as a blob of its bytes', async ({ page }) => {
  const calls = []
  await page.route('https://api.github.com/**', route => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/repos/owner/site', '')
    calls.push({ method: request.method(), path, body: request.postDataJSON?.() ?? null })
    const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '') return reply({ permissions: { push: true } })
    if (path === '/git/ref/heads/main') return reply({ object: { sha: 'parent' } })
    if (path === '/git/commits/parent') return reply({ tree: { sha: 'tree' } })
    if (path === '/git/trees/tree') return reply({ tree: [{ path: 'public/map.json', type: 'blob', sha: gitSha(MAP) }] })
    if (path === '/git/blobs') return reply({ sha: 'blob-of-click' })
    if (path === '/git/trees') return reply({ sha: 'new-tree' })
    if (path === '/git/commits') return reply({ sha: 'c0ffee1234567' })
    if (path === '/git/refs/heads/main') return reply({ ref: 'refs/heads/main' })
    return route.fulfill({ status: 500, body: '{}' })
  })
  await openSounds(page)
  await row(page, 'click').locator('.sound-file').setInputFiles(WAV_PATH)
  await expect(row(page, 'click').locator('.sound-state')).toHaveText('FILE sounds/click.wav')

  await page.locator('.action-publish').click()
  const dialog = page.getByRole('dialog', { name: 'Publish to GitHub' })
  await dialog.locator('.publish-repo').fill('owner/site')
  await dialog.locator('.publish-token').fill('secret-token')
  await dialog.locator('.publish-send').click()
  await expect(dialog.locator('.publish-log')).toContainText('Done: commit c0ffee1.')

  const blob = calls.find(call => call.method === 'POST' && call.path === '/git/blobs')
  expect(blob.body).toEqual({ content: WAV.toString('base64'), encoding: 'base64' })
  const tree = calls.find(call => call.method === 'POST' && call.path === '/git/trees').body.tree
  expect(tree).toContainEqual({ path: 'public/sounds/click.wav', mode: '100644', type: 'blob', sha: 'blob-of-click' })
  expect(tree.find(entry => entry.path === 'public/map.json').content).toContain('"click": "sounds/click.wav"')
})

test('the sound effects of the site are turned off and on from the tab', async ({ page }) => {
  await openSounds(page)
  await page.locator('.sounds-on').uncheck()
  await expect(page.locator('.sounds-off')).toBeVisible()
  await expect(page.locator('.sound-row')).toHaveCount(0)
  expect((await mapJson(page)).sounds).toBe(false)
  await page.locator('.tab-sounds').click()
  await page.locator('.sounds-on').check()
  await expect(page.locator('.sound-row')).toHaveCount(28)
  await page.locator('.sounds-volume').fill('20')
  await page.locator('.sounds-volume').press('Enter')
  expect((await mapJson(page)).sounds).toEqual({ volume: 0.2 })
})

// Was: the tab had no scroll of its own, so the wheel could not reach the sounds below the fold.
test('the tab scrolls with the wheel down to its last sound', async ({ page }) => {
  await openSounds(page)
  const last = page.locator('.sound-row').last()
  await expect(last).not.toBeInViewport()
  const box = await page.locator('.sounds-panel').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 20000)
  await expect(last).toBeInViewport()
})

// Was: a .m4a recording the map names opened as garbled text, and an edit would publish that text over it.
test('a recording of another kind the map names is a sound in the files, not a text', async ({ page }) => {
  await page.route('**/sounds/click.m4a', route => route.fulfill({ status: 200, contentType: 'audio/mp4', body: WAV }))
  await page.goto('/#/edit')
  await expect(area(page)).toBeVisible()
  const map = JSON.parse(await area(page).inputValue())
  await area(page).fill(JSON.stringify({ ...map, sounds: { click: 'sounds/click.m4a' } }, null, 2))
  await page.locator('.file-item[data-path="sounds/click.m4a"]').click()
  await expect(page.locator('.file-sound')).toContainText(`A sound file, ${Math.ceil(WAV.length / 1024)} KB.`)
  await expect(area(page)).toHaveCount(0)
  await expect(page.locator('.action-create')).toHaveCount(0)
})

test('the tab Sounds uploads only what every browser plays', async ({ page }) => {
  await openSounds(page)
  await row(page, 'click').locator('.sound-file').setInputFiles({ name: 'click.m4a', mimeType: 'audio/mp4', buffer: WAV })
  await expect(row(page, 'click').locator('.sound-error')).toHaveText('click.m4a is no WAV, MP3 or OGG file.')
  await expect(page.locator('.editor-changed')).toHaveText('No changes')
})
