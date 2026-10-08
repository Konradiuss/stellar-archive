// A value is a text with {placeholders}, or for a number its Intl.PluralRules forms: { one: '{count} MOON', other: '{count} MOONS' }.

import { shallowRef } from 'vue'
import { DEFAULT_STRINGS } from './strings'
import { isObject } from '../utils/guards'
import { LOADER_LINE_KEYS } from '../utils/loaderLines'

export const DEFAULT_LANGUAGE = 'en'
export const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other']

export const isPluralValue = value => isObject(value) && Object.keys(value).length > 0 && Object.keys(value).every(form => PLURAL_FORMS.includes(form))

// 'group.key' → text or plural forms; dotted keys stay as they are.
export function flattenStrings(tree, prefix = '', into = new Map()) {
  if (!isObject(tree)) return into
  for (const [name, value] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (isObject(value) && !isPluralValue(value)) flattenStrings(value, key, into)
    else into.set(key, value)
  }
  return into
}

const DEFAULTS = flattenStrings(DEFAULT_STRINGS)
export const STRING_KEYS = [...DEFAULTS.keys()]

// A shallow ref, so every template showing a text redraws when the map brings its own.
const state = shallowRef(makeState(new Map(), DEFAULT_LANGUAGE))

function makeState(overrides, language) {
  let rules
  try {
    rules = new Intl.PluralRules(language)
  } catch {
    rules = new Intl.PluralRules(DEFAULT_LANGUAGE)
  }
  return { overrides, language, rules }
}

// overrides: checked and flat, a Map or an object of key → value.
export function setStrings(overrides = new Map(), language = DEFAULT_LANGUAGE) {
  state.value = makeState(overrides instanceof Map ? overrides : new Map(Object.entries(overrides)), language || DEFAULT_LANGUAGE)
}

export const language = () => state.value.language

export function t(key, params = {}) {
  const { overrides, rules } = state.value
  let value = overrides.get(key) ?? DEFAULTS.get(key)
  if (value === undefined) return key
  if (isPluralValue(value)) {
    const form = rules.select(Number(params.count ?? 0))
    value = value[form] ?? value.other ?? Object.values(value)[0]
  }
  return String(value).replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined || params[name] === null ? match : String(params[name])))
}

export const compareText = (a, b) => String(a).localeCompare(String(b), language(), { sensitivity: 'base' })

const placeholders = text => new Set([...String(text).matchAll(/\{(\w+)\}/g)].map(match => match[1]))

// note(level, where, message) hears what is wrong: an unknown key, a missing plural form, a lost placeholder.
export function checkStrings(raw, note) {
  const checked = new Map()
  if (raw == null) return checked
  if (!isObject(raw)) {
    note('error', 'strings', 'Must be an object { "group": { "key": "text" } }: the texts are left out.')
    return checked
  }
  for (const [key, value] of flattenStrings(raw)) {
    const where = `strings.${key}`
    const fallback = DEFAULTS.get(key)
    if (fallback === undefined) {
      note('warning', where, 'Is not a text of the interface: left out. The list of texts is docs/strings.en.json.')
      continue
    }
    if (isPluralValue(fallback)) {
      if (typeof value === 'string') {
        checked.set(key, { other: value })
      } else if (isPluralValue(value) && Object.values(value).every(text => typeof text === 'string')) {
        checked.set(key, value)
      } else {
        note('error', where, `Must be a text, or its forms by number { ${PLURAL_FORMS.map(form => `"${form}"`).join(', ')} }: the English text is used.`)
        continue
      }
    } else if (typeof value === 'string') {
      checked.set(key, value)
    } else {
      note('error', where, 'Must be a text in "double quotes": the English text is used.')
      continue
    }
    const needed = placeholders(isPluralValue(fallback) ? Object.values(fallback).join(' ') : fallback)
    const given = placeholders(isPluralValue(checked.get(key)) ? Object.values(checked.get(key)).join(' ') : checked.get(key))
    const lost = [...needed].filter(name => !given.has(name))
    // A line of the loader in the author's own words may leave out the numbers and names.
    if (lost.length && !LOADER_LINE_KEYS.includes(key)) note('warning', where, `Leaves out ${lost.map(name => `{${name}}`).join(', ')}: that part is not shown.`)
  }
  return checked
}

export function checkLanguage(raw, note) {
  if (raw == null || raw === '') return DEFAULT_LANGUAGE
  try {
    const [tag] = Intl.getCanonicalLocales(String(raw))
    if (tag) return tag
  } catch {
    // Not a language tag: said below.
  }
  note('warning', 'site.language', `${JSON.stringify(raw)} is not a language tag such as "en" or "ru": English is used.`)
  return DEFAULT_LANGUAGE
}
