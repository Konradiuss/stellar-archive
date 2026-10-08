import { expect, test } from '@playwright/test'
import { openHash, worldMap, waitForView, watchConsole, withStores } from './helpers.js'

const dosInput = page => page.locator('.ms-dos-background .dos-input')
const lines = page => page.locator('.ms-dos-background .boot-line')
const commandLine = page => page.locator('.ms-dos-background .command-line')

const minimize = (page, ids) => withStores(page, ({ ui }, list) => list.forEach(id => ui.minimizeWindow(id)), ids)

async function run(page, command) {
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
}

// The fake clock moves by hand in 50 ms steps, so the time of the hack is known to 50 ms on any machine.
async function runUntilHacked(page) {
  for (let step = 0; step < 200; step++) {
    await page.clock.runFor(50)
    if (await withStores(page, ({ ui }) => ui.syndicateHack)) return
  }
  throw new Error('SYNDICATE.EXE did not begin within 10 s')
}

test('the terminal behind a window left open takes no clicks and no keys', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/system/sol')
  await expect(dosInput(page)).toBeDisabled()
  await minimize(page, ['system', 'data'])
  await expect(dosInput(page)).toBeDisabled()
  const terminal = await page.locator('.ms-dos-background').boundingBox()
  await page.mouse.click(terminal.x + terminal.width / 2, terminal.y + terminal.height / 2)
  await page.keyboard.type('help')
  await page.keyboard.press('Enter')
  await expect(lines(page).filter({ hasText: 'Type HELP' })).toHaveCount(0)
  await expect(lines(page).filter({ hasText: 'For more information on a specific command' })).toHaveCount(0)
  consoleIsClean()
})

test('with every window minimized the visitor types: HELP, DIR and the answers of the script', async ({ page }) => {
  const consoleIsClean = watchConsole(page)
  await openHash(page, '#/system/sol')
  await minimize(page, ['system', 'data', 'visual'])
  await expect(dosInput(page)).toBeFocused()
  await expect(lines(page).filter({ hasText: 'Type HELP for a list of commands.' })).toHaveCount(1)
  await expect(page.locator('.taskbar-hint')).toContainText('HELP:COMMANDS')

  await page.keyboard.type('help')
  await expect(commandLine(page)).toContainText('C:\\>help')
  await page.keyboard.press('Enter')
  await expect(lines(page).filter({ hasText: 'Programs: type the name of any .EXE or .COM file that DIR shows.' })).toHaveCount(1)
  await expect(lines(page).filter({ hasText: /^\s*C:\\>help\s*$/ })).toHaveCount(1)

  await run(page, 'dir')
  await expect(lines(page).filter({ hasText: 'SYNDICATE.EXE' })).toHaveCount(1)
  await run(page, 'type readme.txt')
  await expect(lines(page).filter({ hasText: 'When you are ready, run SYNDICATE.EXE.' })).toHaveCount(1)
  await run(page, 'cd system')
  await expect(commandLine(page)).toContainText('C:\\SYSTEM>')
  await run(page, 'mem')
  await expect(lines(page).filter({ hasText: /^\s*C:\\SYSTEM>mem\s*$/ })).toHaveCount(1)

  await page.keyboard.type('3')
  expect(await withStores(page, ({ ui }) => ui.selectedPlanetIndex)).toBeNull()
  await page.keyboard.press('Escape')
  await expect(commandLine(page)).not.toContainText('3')
  await page.keyboard.press('ArrowUp')
  await expect(commandLine(page)).toContainText('C:\\SYSTEM>mem')
  await page.keyboard.press('Escape')

  await page.evaluate(() => document.activeElement.blur())
  await page.keyboard.type('v')
  await expect(dosInput(page)).toBeFocused()
  consoleIsClean()
})

test('a window brought back gives the terminal back to its script', async ({ page }) => {
  await openHash(page, '#/system/sol')
  await minimize(page, ['system', 'data', 'visual'])
  await expect(dosInput(page)).toBeFocused()
  await page.locator('.taskbar-item', { hasText: 'PLANET-DATA.EXE' }).click()
  await expect(page.locator('.window-data')).toBeVisible()
  await expect(dosInput(page)).toBeDisabled()
  await expect.poll(() => page.locator('.ms-dos-background .typing-command').textContent(), { timeout: 20_000 }).not.toBe('')

  await minimize(page, ['system', 'data', 'visual'])
  await expect(dosInput(page)).toBeFocused()
  await run(page, 'exit')
  await expect(page.locator('.window-system')).toBeVisible()
  await expect(dosInput(page)).toBeDisabled()
})

test('SYNDICATE.EXE turns the screens red, silences the player and reboots the page', async ({ page }) => {
  await page.addInitScript(() => {
    window.__sounds = []
    HTMLMediaElement.prototype.play = function () {
      window.__sounds.push(`play ${this.src}`)
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function () {
      window.__sounds.push(`pause ${this.src}`)
    }
  })
  await page.clock.install()
  await openHash(page, '#/system/sol')
  await page.locator('.player-btn[aria-label="Play"]').click()
  await minimize(page, ['system', 'data', 'visual'])
  await expect(dosInput(page)).toBeFocused()
  // Paused: left running, the fake clock falls behind on a busy screen and the hack windows open whenever it catches up.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 10))
  await run(page, 'syndicate.exe')
  await runUntilHacked(page)
  await expect(lines(page).filter({ hasText: 'Bypassing terminal security...' })).toHaveCount(1)
  await expect(lines(page).filter({ hasText: 'ACCESS GRANTED' })).toHaveCount(1)

  const hack = page.locator('.syndicate-hack')
  await expect(hack).toBeVisible()
  await page.clock.fastForward(1000)
  await expect(hack.locator('.hack-snake')).toBeVisible()
  await expect(hack.locator('.hack-title')).toHaveAttribute('alt', 'SYNDICATE')
  await expect(hack.locator('.hack-caption')).toHaveText('ALL YOUR STATIONS BELONG TO US')
  await expect(hack.locator('.hack-nuke')).toBeVisible()
  await expect(hack.locator('.hack-crew .crew-row')).toHaveCount(20)
  await expect(hack.locator('.hack-rain')).toBeVisible()
  await expect(hack.locator('.crew-pulse-line').first()).toHaveCSS('stroke', 'rgb(157, 230, 78)')
  for (const panel of ['.lore-panel', '.legend', '.music-player']) {
    await expect(page.locator(`${panel} .retro-hack`)).toBeVisible()
    const layers = await page.locator(`${panel} .retro-screen`).evaluate(screen => {
      const children = [...screen.children]
      const at = name => children.findIndex(child => child.classList.contains(name))
      const z = name => Number(getComputedStyle(children[at(name)]).zIndex)
      return { hack: at('retro-hack'), glass: at('crt-glass'), hackZ: z('retro-hack'), glassZ: z('crt-glass') }
    })
    expect(layers.hack).toBeLessThan(layers.glass)
    expect(layers.hackZ).toBeLessThanOrEqual(layers.glassZ)
    await expect(page.locator(`${panel} .hacked-flicker`)).toHaveCount(0)
  }
  await expect(page.locator('.lore-panel .hacked-word')).toHaveText(['ACCESS GRANTED', 'USER COMPROMISED'])
  await expect(page.locator('.lore-panel .hack-window-title').first()).toHaveText('USERS.SYS')
  await page.clock.fastForward(1400)
  await expect(page.locator('.lore-panel .hack-window')).toHaveCount(2)
  await expect(page.locator('.lore-panel .hack-window-title').nth(1)).toHaveText('ATMOS.EXE')
  await expect(page.locator('.music-player .hacked-word')).toHaveText('GETTING YOUR LOCATION')
  await expect(page.locator('.music-player .hacked-loading span')).toHaveCount(16)
  await expect(page.locator('.legend .retro-hack .hacked-code')).toBeVisible()
  await expect(page.locator('.legend .hacked-word')).toHaveCount(0)
  await expect(page.locator('.syndicate-blocker')).toBeVisible()
  const sounds = await page.evaluate(() => window.__sounds)
  expect(sounds.some(sound => sound.startsWith('pause ') && sound.includes('/music/'))).toBe(true)
  expect(sounds.at(-1)).toMatch(/^play .*\/audio\/syndicate\.mp3$/)

  await page.clock.fastForward(7600)
  await expect(hack.locator('.nuke-status')).toHaveText('CODE ACQUIRED')
  await expect(hack.locator('.crew-status')).toHaveText(Array(20).fill('DECEASED'))
  await expect(hack.locator('.crew-count')).toHaveText('LIFE SIGNS: 0/20')
  await expect(hack.locator('.crew-final')).toHaveText('ONLY SYNDICATE AGENTS REMAIN')
  await expect(hack.locator('.nuke-armed')).toHaveText('DETONATION AUTHORIZED')
  await expect(hack.locator('.hack-nuke .hack-panel-progress span')).toHaveCSS('background-color', 'rgb(157, 230, 78)')
  await expect(hack.locator('.nuke-blocks span').first()).toHaveCSS('background-color', 'rgb(38, 133, 76)')

  // The hack ends at 11.2 s and the page reloads 0.7 s later, with its time running again.
  const reloaded = page.waitForEvent('load')
  await page.clock.fastForward(1300)
  await page.clock.runFor(1000)
  await reloaded
  await page.clock.resume()
  await waitForView(page, 'system')
  await expect(page.locator('.window-data')).toBeVisible()
  await expect(page.locator('.syndicate-hack')).toHaveCount(0)
  await expect(dosInput(page)).toBeDisabled()
})

test('a map brings its own script, its own files and no SYNDICATE.EXE', async ({ page }) => {
  const map = worldMap()
  map.terminal = { script: 'orion.txt', files: { 'CAPTAIN.LOG': 'logs/captain.txt', 'LOST.TXT': 'lost.txt' }, syndicate: false }
  const files = {
    'map.json': JSON.stringify(map),
    'orion.txt': ['ORION NAVAL OS 3.1', '', 'C:\\>cd BRIDGE', 'C:\\BRIDGE>status', '~Polling the reactor', 'Reactor: STABLE'].join('\r\n'),
    'captain.txt': 'Day 41. The signal again.\nNobody else hears it.\n'
  }
  await page.route(/\/(map\.json|orion\.txt|logs\/captain\.txt|lost\.txt)$/, route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    return files[name] ? route.fulfill({ body: files[name] }) : route.fulfill({ status: 404, body: '' })
  })
  await openHash(page, '#/system/sol')
  const osName = lines(page).filter({ hasText: 'ORION NAVAL OS 3.1' })
  await expect(osName.first()).toBeVisible()
  await expect(lines(page).filter({ hasText: 'EXODUS STATION' })).toHaveCount(0)

  await minimize(page, ['system', 'data', 'visual'])
  await expect(dosInput(page)).toBeFocused()
  const shown = await osName.count()
  await run(page, 'ver')
  await expect(osName).toHaveCount(shown + 1)
  await run(page, 'dir')
  await expect(lines(page).filter({ hasText: 'CAPTAIN.LOG' })).toHaveCount(1)
  await expect(lines(page).filter({ hasText: /SYNDICATE|README|LOST/ })).toHaveCount(0)
  await run(page, 'type captain.log')
  await expect(lines(page).filter({ hasText: 'Nobody else hears it.' })).toHaveCount(1)
  const typed = ['cd bridge', 'status', 'ver', 'mem', 'syndicate.exe']
  for (const command of typed) await run(page, command)
  await expect(lines(page).filter({ hasText: 'Bad command or file name' })).toHaveCount(2)
  const commands = await page.locator('.ms-dos-background .dos-command').allTextContents()
  expect(commands.slice(-typed.length)).toEqual(typed)
  await expect(page.locator('.syndicate-hack')).toHaveCount(0)

  await openHash(page, '#/wiki/Special:Map_check')
  await expect(page.locator('.wiki-view .map-issue').filter({ hasText: 'file "lost.txt"' })).toContainText('LOST.TXT is left out of the terminal.')
})
