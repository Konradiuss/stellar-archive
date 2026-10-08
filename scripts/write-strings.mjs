// Writes docs/strings.en.json from src/i18n/strings.js (`npm run strings`); a test checks it is in step.
import { writeFileSync } from 'node:fs'
import { DEFAULT_STRINGS } from '../src/i18n/strings.js'

const file = new URL('../docs/strings.en.json', import.meta.url)
writeFileSync(file, `${JSON.stringify(DEFAULT_STRINGS, null, 2)}\n`)
console.log('Written docs/strings.en.json')
