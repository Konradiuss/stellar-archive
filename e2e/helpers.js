import { expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// A fresh copy of the published map, for a test to change before serving it.
export const releaseMap = () => JSON.parse(readFileSync(new URL('../public/map.json', import.meta.url), 'utf8'))

// Serves `map` as map.json. Registered after another route, it takes precedence.
export function serveMap(page, map) {
  return page.route('**/map.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(map) }))
}

// Runs `fn(stores, arg)` in the page with the Pinia stores ({ ui, map, systemSettings, sound }). Dev server only.
export function withStores(page, fn, arg) {
  return page.evaluate(([source, value]) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const stores = { ui: pinia._s.get('ui'), map: pinia._s.get('map'), systemSettings: pinia._s.get('systemSettings'), sound: pinia._s.get('sound') }
    return new Function('stores', 'arg', `return (${source})(stores, arg)`)(stores, value)
  }, [fn.toString(), arg])
}

// Waits until no screen transition runs and the given view is shown.
export async function waitForView(page, view) {
  await page.waitForFunction(expected => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia
    const ui = pinia?._s.get('ui')
    if (!ui || ui.transitionPhase !== 'idle' || ui.currentView !== expected) return false
    return expected !== 'system' || !!document.querySelector('.system-orbit-canvas')
  }, view, { timeout: 30_000 })
}

export async function openHash(page, hash, view = viewOfHash(hash)) {
  await page.goto(`/${hash}`)
  await waitForView(page, view)
}

function viewOfHash(hash) {
  if (hash.startsWith('#/system/')) return 'system'
  return /^#\/wiki(\/|$)/.test(hash) ? 'wiki' : 'galaxy'
}

// Errors and Vue warnings in the console fail the test.
export function watchConsole(page) {
  const problems = []
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`))
  page.on('console', message => {
    if (message.type() === 'error' || (message.type() === 'warning' && message.text().includes('[Vue warn]'))) {
      problems.push(`${message.type()}: ${message.text()}`)
    }
  })
  return () => expect(problems).toEqual([])
}

export async function center(locator) {
  const box = await locator.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
