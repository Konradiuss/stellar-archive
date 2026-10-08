import { describe, expect, it } from 'vitest'
import { parseWikitext } from '../wikitextParser'
import { parseMarkdown } from '../markdownParser'
import { inlineToText } from '../inline'

const mercury = 'https://en.wikipedia.org/wiki/Mercury_(planet)'
const europa = 'https://en.wikipedia.org/wiki/Europa_(moon)'
const history = 'https://en.wikipedia.org/w/index.php?title=Mercury_(planet)&action=history#History'
const nested = 'https://example.org/a_(b_(c))'

for (const [name, parse, labelled, unlabelled, note] of [
  ['Wikitext', parseWikitext, (url, label) => `[${url} ${label}]`, url => `[${url}]`, url => `<ref>[${url} source]</ref>`],
  ['Markdown', parseMarkdown, (url, label) => `[${label}](${url})`, url => `<${url}>`, url => `text[^1]\n\n[^1]: [source](${url})`]
]) {
  describe(`${name} external addresses`, () => {
    it.each([mercury, europa, history, nested])('preserves the complete labelled and unlabelled address %s', url => {
      const [link] = parse(labelled(url, 'source')).blocks[0].children
      expect(link).toMatchObject({ type: 'link', href: url })
      expect(inlineToText(link.children)).toBe('source')
      expect(parse(unlabelled(url)).blocks[0].children[0]).toMatchObject({ type: 'link', href: url })
    })

    it.each([mercury, europa, nested])('keeps URL parentheses and leaves surrounding punctuation in the sentence %s', url => {
      const children = parse(`See (${url}).`).blocks[0].children
      expect(children).toEqual([
        { type: 'text', value: 'See (' },
        { type: 'link', href: url, children: [{ type: 'text', value: url }] },
        { type: 'text', value: ').' }
      ])
    })

    it('preserves addresses inside reference notes', () => {
      const references = parse(note(history)).blocks.find(block => block.type === 'references')
      expect(references.notes[0].children.find(node => node.type === 'link')).toMatchObject({ href: history })
    })
  })
}

it('preserves punctuation explicitly included in a Wikitext destination', () => {
  const link = parseWikitext('[https://example.org/alert! alert]').blocks[0].children[0]
  expect(link).toMatchObject({ href: 'https://example.org/alert!' })
  expect(inlineToText(link.children)).toBe('alert')
})
