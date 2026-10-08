import { expect, test } from '@playwright/test'
import { openHash, watchConsole } from './helpers'

let checkConsole
test.beforeEach(({ page }) => { checkConsole = watchConsole(page) })
test.afterEach(() => checkConsole())

const russianOnPage = page => page.evaluate(() => {
  const cyrillic = /[Ѐ-ӿ]/
  const found = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) continue
    if (cyrillic.test(node.nodeValue)) found.push(node.nodeValue.trim())
  }
  for (const element of document.body.querySelectorAll('[title], [aria-label], [data-hint], [alt], [placeholder]')) {
    for (const name of ['title', 'aria-label', 'data-hint', 'alt', 'placeholder']) {
      const value = element.getAttribute(name)
      if (value && cyrillic.test(value)) found.push(`${name}="${value}"`)
    }
  }
  if (cyrillic.test(document.title)) found.push(`<title>${document.title}`)
  return found
})

test('the map, a system, the wiki and its service pages have no Russian left', async ({ page }) => {
  for (const hash of ['#/', '#/system/sol/3', '#/system/sol/3/2', '#/wiki/', '#/wiki/Solar_Concord', '#/wiki/Earth', '#/wiki/Special:All_pages', '#/wiki/Special:Wanted_pages']) {
    await openHash(page, hash)
    expect(await russianOnPage(page), hash).toEqual([])
  }
})
