// Every text of the interface, as the tab Texts lists it: by section, with what the map writes for it.

import { DEFAULT_STRINGS } from '../i18n/strings'
import { PLURAL_FORMS, STRING_KEYS, flattenStrings, isPluralValue } from '../i18n'
import { DEFAULT_WORDS, breakerWordProblem } from '../utils/breakerSprites'
import { stringValue } from './stringEdits'
import { isObject } from '../utils/guards'

// The loader has its own cards above; the editor's own texts come last.
const OWN_CARDS = new Set(['loader'])
const LAST = 'editor'

export const TEXT_SECTIONS = Object.freeze([
  ...Object.keys(DEFAULT_STRINGS).filter(section => !OWN_CARDS.has(section) && section !== LAST),
  LAST
])

const DEFAULTS = flattenStrings(DEFAULT_STRINGS)
const sectionOf = key => key.split('.')[0]

const placeholders = value => new Set([...String(isPluralValue(value) ? Object.values(value).join(' ') : value ?? '').matchAll(/\{(\w+)\}/g)].map(match => match[1]))

/** The plural forms a language tells apart, and any the map writes besides, in their usual order. */
export function pluralForms(language, value = null) {
  let wanted = ['one', 'other']
  try {
    wanted = new Intl.PluralRules(language).resolvedOptions().pluralCategories
  } catch {
    // Not a language: English forms.
  }
  const own = isObject(value) ? Object.keys(value) : []
  return PLURAL_FORMS.filter(form => wanted.includes(form) || own.includes(form))
}

/**
 * → [{ key, problem: 'type' | 'placeholders' | 'breaker', form?, names? }] for what the map writes for `key`,
 * as the site says it (i18n checkStrings, mapCheck checkBreakerWords); placeholders form by form, though:
 * "one" is also 21 in Russian, and without {count} it says no number.
 */
export function stringProblems(key, value, language) {
  const fallback = DEFAULTS.get(key)
  if (value === undefined || fallback === undefined) return []
  const plural = isPluralValue(fallback)
  const fits = typeof value === 'string' || (plural && isPluralValue(value) && Object.values(value).every(text => typeof text === 'string'))
  if (!fits) return [{ key, problem: 'type' }]
  const problems = []
  const forms = typeof value === 'string' ? [[null, value]] : Object.entries(value)
  for (const [form, text] of forms) {
    const given = placeholders(text)
    const needed = placeholders(plural ? fallback[form] ?? fallback.other : fallback)
    const lost = [...needed].filter(name => !given.has(name))
    if (lost.length) problems.push({ key, problem: 'placeholders', ...(form ? { form } : {}), names: lost.map(name => `{${name}}`).join(' ') })
  }
  const word = key.startsWith('breaker.') ? key.slice('breaker.'.length) : null
  if (word && Object.hasOwn(DEFAULT_WORDS, word) && typeof value === 'string' && breakerWordProblem(word, value.toLocaleUpperCase(language))) {
    problems.push({ key, problem: 'breaker' })
  }
  return problems
}

/** → [{ key, section, fallback, plural, value }]: value is what the map writes (undefined when nothing). */
export function stringRows(map) {
  return STRING_KEYS.filter(key => !OWN_CARDS.has(sectionOf(key))).map(key => {
    const fallback = DEFAULTS.get(key)
    return { key, section: sectionOf(key), fallback, plural: isPluralValue(fallback), value: stringValue(map, key) }
  })
}

/** Keys the map writes under "strings" that are no texts of the interface: a typo, a text gone. */
export function foreignStrings(map) {
  if (!isObject(map?.strings)) return []
  return [...flattenStrings(map.strings).keys()].filter(key => !DEFAULTS.has(key))
}

const textsOf = value => (isObject(value) ? Object.values(value) : [value]).filter(text => typeof text === 'string')

/** The key, the English text or the map's own, whatever the case. */
export function rowMatches(row, query) {
  const wanted = String(query ?? '').trim().toLocaleLowerCase()
  if (!wanted) return true
  return [row.key, ...textsOf(row.fallback), ...textsOf(row.value)].some(text => text.toLocaleLowerCase().includes(wanted))
}
