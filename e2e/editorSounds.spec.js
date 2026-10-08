import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { waitForView, watchConsole } from './helpers'

const WAV_PATH = fileURLToPath(new URL('../src/assets/sounds/breaker.wav', import.meta.url))
const WAV = readFileSync(WAV_PATH)
const MAP = readFileSync(new URL('../test-world/map.json', import.meta.url), 'utf8')
const gitSha = text => {
  const body = Buffer.from(text, 'utf8')
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest('hex')
}

// A playable WAV of silence, 16-bit mono at 22050 Hz, `bytes` of sound.
function silentWav(bytes) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + bytes, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(22050, 24)
  header.writeUInt32LE(44100, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(bytes, 40)
  return Buffer.concat([header, Buffer.alloc(bytes)])
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
  // Was: Silence wrote false over the recording, and its file was gone.
  await row(page, 'click').locator('.sound-silence').click()
  await expect(row(page, 'click').locator('.sound-state')).toHaveText('SILENT · sounds/click.wav KEPT')
  expect((await mapJson(page)).sounds).toEqual({ click: { file: 'sounds/click.wav', off: true } })
  await page.locator('.tab-sounds').click()
  await row(page, 'click').locator('.sound-unsilence').click()
  await expect(row(page, 'click').locator('.sound-state')).toHaveText('FILE sounds/click.wav')
  expect((await mapJson(page)).sounds).toEqual({ click: 'sounds/click.wav' })
  await page.locator('.tab-sounds').click()
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
  await input.setInputFiles({ name: 'long.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(Math.round(2.1 * 1024 * 1024)) })
  await expect(error).toHaveText('long.wav is 2.1 MB: 2 MB at most. Shorten it, or save it as MP3.')
  await input.setInputFiles({ name: 'fake.wav', mimeType: 'audio/wav', buffer: Buffer.from('not a sound at all') })
  await expect(error).toHaveText('The browser cannot play this sound.')

  await expect(row(page, 'hover').locator('.sound-state')).toHaveText('BUILT-IN')
  await expect(page.locator('.editor-changed')).toHaveText('No changes')
})

// Was: 300 KB at most, for the draft held the recording as a data URL in localStorage (~5 MB for all).
test('a recording over a megabyte stays through a reload, only its name in localStorage', async ({ page }) => {
  const big = silentWav(1.2 * 1024 * 1024)
  await openSounds(page)
  await row(page, 'click').locator('.sound-file').setInputFiles({ name: 'click.wav', mimeType: 'audio/wav', buffer: big })
  await expect(row(page, 'click').locator('.sound-state')).toHaveText('FILE sounds/click.wav')

  await page.reload()
  await expect(area(page)).toBeVisible()
  await page.locator('.file-item[data-path="sounds/click.wav"]').click()
  await expect(page.locator('.file-sound')).toContainText('A sound file, 1.2 MB.')
  const kept = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('spacemap:draft:')).map(key => JSON.parse(localStorage.getItem(key)).files['sounds/click.wav']))
  expect(kept).toEqual([expect.stringMatching(new RegExp(`^binary:[0-9a-f]{40}:${big.length}$`))])

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.action-download').click()])
  expect(download.suggestedFilename()).toBe('site-edits.zip')
  const zip = readFileSync(await download.path())
  expect(zip.length).toBeGreaterThan(big.length)
  expect(zip.includes(big.subarray(0, 44))).toBe(true)

  // The browser's storage cleared: the editor says so instead of publishing an empty file.
  await page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.deleteDatabase('spacemap-editor')
    request.onsuccess = request.onblocked = resolve
  }))
  await page.reload()
  await expect(area(page)).toBeVisible()
  await page.locator('.file-item[data-path="sounds/click.wav"]').click()
  await expect(page.locator('.file-lost')).toContainText('no longer has this file')
  await page.locator('.action-download').click()
  await expect(page.locator('.form-error')).toHaveText('The browser no longer has sounds/click.wav of the draft (its storage was cleared): upload it again, or revert it.')
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

// Was: off wrote false over the whole object: the volume and the recordings were gone, the files deleted.
test('off keeps the volume and the recordings, through a reload, for when sounds are on again', async ({ page }) => {
  await openSounds(page)
  await row(page, 'click').locator('.sound-file').setInputFiles(WAV_PATH)
  await page.locator('.sounds-volume').fill('20')
  await page.locator('.sounds-volume').press('Enter')
  await page.locator('.sounds-on').uncheck()
  expect((await mapJson(page)).sounds).toEqual({ click: 'sounds/click.wav', volume: 0.2, off: true })
  await expect(page.locator('.file-item[data-path="sounds/click.wav"]')).not.toHaveClass(/is-deleted/)
  await page.reload()
  await page.locator('.tab-sounds').click()
  await expect(page.locator('.sounds-on')).not.toBeChecked()
  await expect(page.locator('.sounds-volume')).toHaveValue('20')
  await page.locator('.sounds-on').check()
  await expect(row(page, 'click').locator('.sound-state')).toHaveText('FILE sounds/click.wav')
  expect((await mapJson(page)).sounds).toEqual({ click: 'sounds/click.wav', volume: 0.2 })
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
