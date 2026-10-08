import { expect, test } from '@playwright/test'
import { serveMap, waitForView, watchConsole, worldMap } from './helpers'

// A playable WAV of silence, 16-bit mono at 22050 Hz, `seconds` long.
function silentWav(seconds) {
  const bytes = Math.round(seconds * 44100)
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
const row = (page, index) => page.locator(`.track-row[data-index="${index}"]`)
const mapNow = async page => {
  await page.locator('.tab-files').click()
  await page.locator('.file-item[data-path="map.json"]').click()
  const map = JSON.parse(await area(page).inputValue())
  await page.locator('.tab-music').click()
  return map
}
const fill = async (input, value) => {
  await input.fill(value)
  await input.blur()
}

function playlistMap() {
  const map = worldMap()
  // The second written by hand: a length the site cannot read, and a key it does not know.
  map.music.tracks = [map.music.tracks[0], { title: 'Handwritten', file: 'music/gneiss/get-set.wav', duration: '0:13', mood: 'calm' }]
  return map
}

async function openMusic(page) {
  await page.goto('/#/edit')
  await expect(page.locator('.no-problems, .problem').first()).toBeVisible()
  await page.locator('.tab-music').click()
  await expect(page.locator('.music-panel')).toBeVisible()
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

// Was: the playlist was set in map.json by hand only, and its files put in public/ by hand.
test('a track is added, credited, ordered and heard in the editor and on the site', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await serveMap(page, playlistMap())
  await openMusic(page)
  await expect(page.locator('.track-row')).toHaveCount(2)
  await expect(row(page, 1).locator('.track-duration')).toHaveValue('0:13')
  await expect(row(page, 1).locator('.track-bad-value[data-field="duration"]')).toContainText('The map has 0:13 for Length')
  await expect(row(page, 1).locator('.track-length')).toHaveText('The file plays 0:13.')

  await page.locator('.music-files').setInputFiles({ name: 'Night_Owl.wav', mimeType: 'audio/wav', buffer: silentWav(3) })
  const added = row(page, 2)
  await expect(added.locator('.track-title')).toHaveValue('Night Owl')
  await expect(added.locator('.track-duration')).toHaveValue('0:03')
  await expect(added.locator('.track-file')).toHaveValue('music/night-owl.wav')
  await expect(added.locator('.track-file-state')).toHaveText('In the draft, 130 KB.')
  await fill(added.locator('.track-author'), 'Me')
  await fill(added.locator('.track-license'), 'CC BY 4.0')
  // Refused, and the field shows what the map has.
  await fill(added.locator('.track-url'), 'example.org/owl')
  await expect(page.locator('.form-error')).toHaveText('example.org/owl is no address on the web.')
  await expect(added.locator('.track-url')).toHaveValue('')
  await fill(added.locator('.track-url'), 'https://example.org/owl')
  // Cleared: the site reads the length from the file.
  await fill(added.locator('.track-duration'), '')
  await expect(added.locator('.track-length')).toHaveText('The file plays 0:03.')
  await added.locator('.track-up').click()

  let tracks = (await mapNow(page)).music.tracks
  expect(tracks.map(track => track.title)).toEqual(['Codebrain', 'Night Owl', 'Handwritten'])
  expect(tracks[1]).toEqual({ title: 'Night Owl', file: 'music/night-owl.wav', author: 'Me', license: 'CC BY 4.0', url: 'https://example.org/owl' })
  expect(tracks[2]).toEqual({ title: 'Handwritten', file: 'music/gneiss/get-set.wav', duration: '0:13', mood: 'calm' })

  // Heard in the editor, and stopped.
  const play = row(page, 1).locator('.track-play')
  await play.click()
  await expect(play).toHaveClass(/is-playing/)
  await play.click()
  await expect(play).not.toHaveClass(/is-playing/)

  await page.reload()
  await page.locator('.tab-music').click()
  await expect(row(page, 1).locator('.track-author')).toHaveValue('Me')
  // Taken away with its file.
  await row(page, 0).locator('.track-remove').click()
  await expect(page.locator('.track-row')).toHaveCount(2)
  tracks = (await mapNow(page)).music.tracks
  expect(tracks.map(track => track.title)).toEqual(['Night Owl', 'Handwritten'])
  await page.locator('.tab-files').click()
  await expect(page.locator('.file-item[data-path="music/gneiss/codebrain.wav"]')).toHaveClass(/is-deleted/)

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  const player = page.locator('.music-player .player')
  await page.locator('.music-player .panel-titlebar .button-list').click()
  await expect(player.locator('.list-title')).toHaveText(['Night Owl', 'Handwritten'])
  // Neither length is in the map: both from the files, the first from the draft.
  await expect(player.locator('.list-time')).toHaveText(['0:03', '0:13'])
  await player.locator('.list-row').first().click()
  await expect(player).toHaveAttribute('data-state', 'playing')
  await expect(player.locator('.player-credit')).toHaveAttribute('href', 'https://example.org/owl')
  consoleIsClean()
})

test('a file that is no track is refused, and another path moves the file', async ({ page }) => {
  await serveMap(page, playlistMap())
  await openMusic(page)
  const input = page.locator('.music-files')
  const error = page.locator('.music-error')
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(error).toHaveText('notes.txt: only WAV, MP3 and OGG files are added.')
  await input.setInputFiles({ name: 'long.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(Math.round(20.1 * 1024 * 1024)) })
  await expect(error).toHaveText('long.mp3 is 20.1 MB; a track may be 20 MB at most.')
  await input.setInputFiles({ name: 'fake.wav', mimeType: 'audio/wav', buffer: Buffer.from('not a sound at all') })
  await expect(error).toHaveText('fake.wav is no recording this browser can play.')
  await expect(page.locator('.track-row')).toHaveCount(2)

  const file = row(page, 0).locator('.track-file')
  await fill(file, 'music/notes.txt')
  await expect(page.locator('.form-error')).toContainText('music/notes.txt is no recording of the site')
  await expect(file).toHaveValue('music/gneiss/codebrain.wav')
  await fill(file, 'music/moved.wav')
  await expect(row(page, 0).locator('.track-file-state')).toContainText('In the draft')
  expect((await mapNow(page)).music.tracks[0].file).toBe('music/moved.wav')
  await page.locator('.tab-files').click()
  await expect(page.locator('.file-item[data-path="music/moved.wav"]')).toHaveClass(/is-changed/)
  await expect(page.locator('.file-item[data-path="music/gneiss/codebrain.wav"]')).toHaveClass(/is-deleted/)

  await Promise.all([page.waitForEvent('load'), page.locator('.action-preview').click()])
  await waitForView(page, 'galaxy')
  const player = page.locator('.music-player .player')
  await player.locator('.button-play').click()
  await expect(player).toHaveAttribute('data-state', 'playing')
})

// Was: the error of a track was kept by its number, and stayed on the place a moved or removed track left.
test('the error of a track moves with it and goes with it', async ({ page }) => {
  await serveMap(page, playlistMap())
  await openMusic(page)
  await row(page, 0).locator('.track-replace-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(row(page, 0).locator('.track-error')).toHaveText('notes.txt: only WAV, MP3 and OGG files are added.')
  await row(page, 0).locator('.track-down').click()
  await expect(row(page, 0).locator('.track-title')).toHaveValue('Handwritten')
  await expect(row(page, 0).locator('.track-error')).toHaveCount(0)
  await expect(row(page, 1).locator('.track-error')).toBeVisible()
  await row(page, 1).locator('.track-remove').click()
  await expect(page.locator('.track-row')).toHaveCount(1)
  await expect(page.locator('.track-error')).toHaveCount(0)
})
