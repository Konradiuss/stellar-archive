// Builds the public folder of the e2e tests: public/ with the test world in place of the site's content.
// The entries the test world has (map.json, wiki, lore, music…) come from it alone; the rest (fonts, audio) from public/.
import { cpSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TEST_PUBLIC = fileURLToPath(new URL('../node_modules/.test-public/', import.meta.url))
const PUBLIC = new URL('../public/', import.meta.url)
const WORLD = new URL('../test-world/', import.meta.url)

const world = new Set(readdirSync(WORLD))
rmSync(TEST_PUBLIC, { recursive: true, force: true })
for (const entry of readdirSync(PUBLIC).filter(entry => !world.has(entry))) {
  cpSync(new URL(entry, PUBLIC), `${TEST_PUBLIC}${entry}`, { recursive: true })
}
for (const entry of [...world].filter(entry => entry !== 'README.md')) {
  cpSync(new URL(entry, WORLD), `${TEST_PUBLIC}${entry}`, { recursive: true })
}
console.log(`Test world copied to ${TEST_PUBLIC}`)
