import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { DEFAULT_STRINGS } from '../src/i18n/strings.js'
import { openHash, releaseMap, serveMap, watchConsole, withStores } from './helpers'
const BUILT_IN_SCRIPT = readFileSync(new URL('../src/data/terminal.txt', import.meta.url), 'utf8')

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const CYRILLIC = 'абцдефгхийклмнопярстувшжыз'
const pseudoText = text => String(text).split(/(\{\w+\})/).map(part => (/^\{\w+\}$/.test(part) ? part : [...part].map(char => {
  const index = LETTERS.indexOf(char.toLowerCase())
  if (index < 0) return char
  return char === char.toLowerCase() ? CYRILLIC[index] : CYRILLIC[index].toUpperCase()
}).join(''))).join('')
const pseudoTree = value => (typeof value === 'string'
  ? pseudoText(value)
  : Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, pseudoTree(inner)])))

// No article files (their markup stays Latin): any Latin left on screen is an interface text outside src/i18n.
function pseudoMap() {
  const map = releaseMap()
  const named = item => {
    for (const field of ['name', 'lore', 'tabTitle', 'description']) if (typeof item[field] === 'string') item[field] = pseudoText(item[field])
    delete item.loreFile
  }
  map.site.title = pseudoText(map.site.title)
  map.site.language = 'ru'
  map.worldLore = pseudoText(map.worldLore)
  delete map.legend
  map.stars.forEach(named)
  for (const system of Object.values(map.systems)) {
    delete system.legend
    for (const planet of system.planets) {
      named(planet)
      for (const satellite of planet.satellites ?? []) named(satellite)
    }
  }
  Object.values(map.factions).forEach(named)
  // The jump menu shows a line's description.
  for (const line of map.hyperlines) line.description = `${map.hyperlineTypes[line.type].name} ${line.id}`
  map.hyperlines.forEach(named)
  map.hyperlineTypes = Object.fromEntries(Object.entries(map.hyperlineTypes).map(([type, value]) => [type, typeof value === 'string' ? pseudoText(value) : { ...value, name: pseudoText(value.name ?? type) }]))
  for (const track of map.music.tracks) for (const field of ['title', 'author', 'license']) track[field] = pseudoText(track[field])
  map.wiki = { groups: [], articles: [] }
  map.strings = pseudoTree(DEFAULT_STRINGS)
  map.terminal = { script: 'terminal.txt' }
  return map
}

const pseudoScript = () => BUILT_IN_SCRIPT.split(/\r?\n/).map(line => {
  const prompt = line.match(/^([A-Z]:\\)(.*)$/)
  return prompt ? `${prompt[1]}${pseudoText(prompt[2])}` : pseudoText(line)
}).join('\n')

const latinOnPage = (page, ids) => page.evaluate(ids => {
  const latin = /[A-Za-z]/
  // DOS stays DOS: prompt paths, the commands of HELP, file names.
  const dos = /^(?:[A-Z]:\\[\\\w.]*>?|[A-Z]:|TYPE|DIR|FIND|CHKDSK|CD|CLS|ECHO|EXIT|HELP|MEM|NETSTAT|PING|TELNET|VER|READ|[\p{L}\d_*/-]+\.(?:TXT|txt|ICO|JSON|json|wiki|md|BAT|COM|SYS|EXE)\.?|\/[A-Z]:[A-Z]|\/W|\*)$/u
  // Skipped: map ids (SOL.TXT), Roman orbit numbers, the menu [x], glitch and decoding noise, the nuke dump, prompts, typed input, icon names.
  const id = new RegExp(`^(?:${ids.join('|')})(?:[.][^.]*)?$`, 'i')
  const roman = /^[IVXLCDM]+$/
  const skip = node => node.closest?.('.dos-command, .typing-command, .terminal-prompt, .wiki-path, .glitch-text, .decode-text, .special-icon-name, .nuke-dump, .nuke-keys, .file-name, .file-pane-name, .publish-files, .problem-where, .problem-text, .route-id, .editor-color-code, code')
  const words = text => text.replace(/[A-Z]:\\[\\\w.]*>?/g, ' ').split(/[\s"“”«»()[\]{},:;|·>]+/)
    .filter(word => latin.test(word) && !dos.test(word) && !id.test(word) && !roman.test(word) && word !== 'x' && !word.startsWith('#/'))
  const found = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName) || skip(node.parentElement)) continue
    const left = words(node.nodeValue)
    if (left.length) found.push(`${node.parentElement.className || node.parentElement.tagName}: ${node.nodeValue.trim()}`)
  }
  for (const element of document.body.querySelectorAll('[title], [aria-label], [data-hint], [alt], [placeholder]')) {
    if (skip(element)) continue
    for (const name of ['title', 'aria-label', 'data-hint', 'alt', 'placeholder']) {
      const value = element.getAttribute(name)
      if (value && words(value).length) found.push(`${name}="${value}"`)
    }
  }
  if (words(document.title).length) found.push(`<title>${document.title}`)
  return [...new Set(found)]
}, ids)

test('every text of the interface comes from the strings of the map', async ({ page }) => {
  test.setTimeout(180_000)
  const map = pseudoMap()
  await serveMap(page, map)
  await page.route('**/terminal.txt', route => route.fulfill({ contentType: 'text/plain', body: pseudoScript() }))
  const sol = map.stars.find(star => star.id === 'sol')
  const starIds = map.stars.map(star => star.id)
  const screens = [
    ['#/', async () => page.locator('.music-player .button-list').click()],
    ['#/system/sol', async () => page.locator('.window-system .button-menu').click()],
    ['#/system/sol/3', async () => page.locator('.window-data .button-menu').click()],
    ['#/system/sol/3/1', async () => page.locator('.window-visual .button-menu').click()],
    ['#/system/sol/3/2', async () => page.locator('.jump-anchor .back-btn').click()],
    ['#/wiki/', async () => page.locator('.wiki-menu-button').click()],
    [`#/wiki/${encodeURIComponent(sol.name)}`, async () => {
      await page.keyboard.press('/')
      await page.keyboard.type(sol.name.slice(0, 2))
      await expect(page.locator('.wiki-view .search-suggestions li').first()).toBeVisible()
    }],
    [`#/wiki/${encodeURIComponent(map.strings.pages.world)}`, async () => {}],
    ['#/wiki/Special:All_pages', async () => {}],
    ['#/wiki/Special:Categories', async () => {}],
    ['#/wiki/Special:Wanted_pages', async () => {}],
    ['#/wiki/Special:Map_check', async () => {}],
    ['#/wiki/Special:Icons', async () => {}],
    [`#/wiki/Special:Search/${encodeURIComponent(sol.name)}`, async () => {}],
    [`#/wiki/${encodeURIComponent('Нигде')}`, async () => {}]
  ]
  for (const [hash, open] of screens) {
    await openHash(page, hash)
    await open()
    expect(await latinOnPage(page, map.stars.map(star => star.id)), hash).toEqual([])
  }
  await openHash(page, '#/wiki/Galaxy')
  await expect(page.locator('.wiki-title')).toHaveText(map.strings.pages.world)

  await page.goto('/#/edit')
  await expect(page.locator('.editor-area')).toBeVisible()
  await page.locator('.problem, .no-problems').first().waitFor()
  expect(await latinOnPage(page, starIds), '#/edit').toEqual([])
  await page.locator('.tab-stars').click()
  await page.getByRole('button', { name: pseudoText(`Sector ${sol.sectorX}, ${sol.sectorY}: `) + sol.name }).click()
  await page.locator('.star-delete').click()
  expect(await latinOnPage(page, starIds), '#/edit stars').toEqual([])
  await page.locator('.new-faction').click()
  await page.locator('.action-publish').click()
  await expect(page.locator('.editor-publish')).toBeVisible()
  expect(await latinOnPage(page, starIds), '#/edit publish').toEqual([])
  await page.locator('.publish-close').click()
  await page.locator('.star-route').first().click()
  await expect(page.locator('.route-panel')).toBeVisible()
  expect(await latinOnPage(page, starIds), '#/edit routes').toEqual([])
  await page.locator('.tab-system').click()
  await page.locator('.system-star-select').selectOption('sol')
  await page.locator('.planet-item', { hasText: pseudoText('Earth') }).click()
  await expect(page.locator('.look-planet canvas')).toBeVisible()
  expect(await latinOnPage(page, starIds), '#/edit planet').toEqual([])
  await page.locator('.satellite-item').last().click()
  await expect(page.locator('.look-station canvas')).toBeVisible()
  expect(await latinOnPage(page, starIds), '#/edit station').toEqual([])
  await page.locator('.tab-articles').click()
  await page.locator('.new-article-title').fill('Колония')
  await page.locator('.new-article-create').click()
  await expect(page.locator('.article-preview strong')).toHaveText('Колония')
  expect(await latinOnPage(page, starIds), '#/edit article').toEqual([])

  await openHash(page, '#/system/sol')
  await expect(page.locator('.ms-dos-background .boot-line').first()).toContainText(pseudoText('EXODUS STATION'))
  await withStores(page, ({ ui }) => ['system', 'data', 'visual'].forEach(id => ui.minimizeWindow(id)))
  await expect(page.locator('.ms-dos-background .dos-input')).toBeFocused()
  for (const command of ['help', 'help dir', 'help формат', 'dir', 'type readme.txt', 'ver', 'echo', 'хм', 'cd нигде', 'z:', 'type', 'type ничего.txt', 'ping земля', 'telnet марс']) {
    await page.keyboard.type(command)
    await page.keyboard.press('Enter')
  }
  await expect(page.locator('.ms-dos-background .boot-line').last()).toContainText('МАРС')
  expect(await latinOnPage(page, map.stars.map(star => star.id)), 'terminal').toEqual([])

  await page.keyboard.type('syndicate.exe')
  await page.keyboard.press('Enter')
  await expect(page.locator('.syndicate-hack .hack-crew .crew-row')).toHaveCount(20)
  await expect(page.locator('.lore-panel .hack-window')).toHaveCount(2, { timeout: 5000 })
  await expect(page.locator('.music-player .hacked-word')).toBeVisible()
  expect(await latinOnPage(page, map.stars.map(star => star.id)), 'SYNDICATE.EXE').toEqual([])
})

test('a map in Russian with an amber theme', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  const map = releaseMap()
  map.site.language = 'ru'
  map.strings = {
    breaker: { plate: 'Режим', map: 'Карта', wiki: 'Вики', ariaOnMap: 'Режим: карта. Включить вики' },
    legend: { factions: 'ФРАКЦИИ', statusGalaxy: 'ФРАКЦИЙ {factions} · ЛИНИЙ {lines}' },
    files: { planetData: 'ДАННЫЕ.EXE' },
    system: { moonCount: { one: '{count} СПУТНИК', few: '{count} СПУТНИКА', many: '{count} СПУТНИКОВ' } },
    wiki: { search: '[ ПОИСК ]' },
    special: { mapCheck: 'Проверка карты', mapClean: 'В {file} всё в порядке.' }
  }
  map.theme = { preset: 'amber', casings: ['gunmetal'], crt: { scanlines: 0 } }
  // More than three satellites fold into a count.
  const crown = map.systems.asterion.planets.find(planet => planet.name === 'Crown')
  crown.satellites.push(...['Glint', 'Shard', 'Flicker'].map((name, index) => ({ name, kind: 'moon', distance: 4.6 + index * 0.8, size: 0.15 })))
  await serveMap(page, map)

  await openHash(page, '#/')
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('ru')
  await expect(page.locator('.legend-dock .mode-breaker')).toHaveAttribute('aria-label', 'Режим: карта. Включить вики')
  await expect(page.locator('.map-legend')).toContainText('ФРАКЦИИ')
  await expect(page.locator('.map-legend')).toContainText('ФРАКЦИЙ 4 · ЛИНИЙ 5')
  const looks = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return {
      text: style.getPropertyValue('--ui-text').trim(),
      scanlines: style.getPropertyValue('--crt-scanline-alpha').trim(),
      legend: getComputedStyle(document.querySelector('.map-legend .legend-name') ?? document.body).color
    }
  })
  expect(looks).toEqual({ text: '#ffc46b', scanlines: '0', legend: 'rgb(255, 196, 107)' })

  await openHash(page, '#/system/asterion')
  await expect(page.locator('.window-data .terminal-title')).toHaveText('ДАННЫЕ.EXE')
  await expect(page.locator('.planet-list')).toContainText(/\d+ СПУТНИК(А|ОВ)?/)

  await openHash(page, '#/wiki/Special:Map_check')
  await expect(page.locator('.wiki-title')).toHaveText('Проверка карты')
  await expect(page.locator('.wiki-view .special-note')).toHaveText('В map.json всё в порядке.')
  await expect(page.locator('.wiki-view .wiki-action', { hasText: 'ПОИСК' })).toHaveCount(1)
  consoleIsClean()
})

test('a text the map gets wrong is named on Special:Map check', async ({ page }) => {
  const map = releaseMap()
  map.strings = { wiki: { serach: '[ НАЙТИ ]' }, breaker: { map: '地图' } }
  map.theme = { colors: { text: 'orange' } }
  await serveMap(page, map)
  await openHash(page, '#/wiki/Special:Map_check')
  const issues = page.locator('.wiki-view .map-issue')
  await expect(issues.filter({ hasText: 'strings.wiki.serach' })).toContainText('Is not a text of the interface')
  await expect(issues.filter({ hasText: 'strings.breaker.map' })).toContainText('has letters the breaker cannot draw (地 图)')
  await expect(issues.filter({ hasText: 'theme.colors.text' })).toContainText('"orange" is not a colour')
  // The breaker keeps its English label.
  await expect(page.locator('.legend-dock .mode-breaker')).toHaveAttribute('aria-label', 'Mode: wiki. Switch to the map')
})
