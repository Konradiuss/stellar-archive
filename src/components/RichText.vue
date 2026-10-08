<script>
// Built with h(): the markup never reaches innerHTML. `limit` is the typewriter
// budget, with the costs of utils/richText/measure.js.
import { defineComponent, h } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUIStore } from '../stores/uiStore'
import { BREAK_COST, IMAGE_COST, RULE_COST, refLabel } from '../utils/richText/measure'
import { inlineToText } from '../utils/richText/inline'
import { magicValue } from '../utils/richText/magic'
import { iconUri } from '../utils/wikiIcons'
import PixelImage from './PixelImage.vue'
import { t } from '../i18n'
import PixelLogo from './PixelLogo.vue'
import WikiPortal from './WikiPortal.vue'

const inlineText = nodes => nodes.map(node => {
  if (typeof node === 'string') return node
  if (typeof node?.children === 'string') return node.children
  return Array.isArray(node?.children) ? inlineText(node.children) : ''
}).join('')

const NOTICE_SIGNS = { warning: '[!]', notice: '[i]', stub: '[~]' }
// ms
const TARGET_LIGHT = 1600

function notesOf(doc) {
  const notes = new Map()
  for (const block of doc?.blocks ?? []) {
    if (block.type === 'references') for (const note of block.notes) notes.set(note.number, note)
  }
  return notes
}

function jumpTo(from, selector) {
  const target = from.closest('.rich-text')?.querySelector(selector)
  if (!target) return
  target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  target.classList.remove('is-target')
  void target.offsetWidth
  target.classList.add('is-target')
  setTimeout(() => target.classList.remove('is-target'), TARGET_LIGHT)
}

const INLINE_TAGS = {
  strong: 'strong',
  em: 'em',
  strike: 's',
  underline: 'u',
  code: 'code',
  sub: 'sub',
  sup: 'sup',
  small: 'small'
}

export default defineComponent({
  name: 'RichText',
  props: {
    doc: { type: Object, default: null },
    limit: { type: Number, default: Infinity },
    cursor: { type: Boolean, default: false },
    wiki: { type: Boolean, default: false }
  },
  setup(props) {
    const uiStore = useUIStore()
    const mapStore = useMapStore()

    return () => {
      let budget = props.limit
      let cursorShown = false
      const notes = notesOf(props.doc)

      const take = cost => {
        const taken = Math.max(0, Math.min(cost, budget))
        budget -= taken
        return taken
      }
      const cursorAfter = list => {
        if (props.cursor && !cursorShown && budget <= 0) {
          cursorShown = true
          list.push(h('span', { class: 'rt-cursor', 'aria-hidden': 'true' }, '_'))
        }
        return list
      }

      function renderImage(image, inline) {
        return h(PixelImage, {
          src: image.src,
          alt: image.alt || image.file || '',
          maxWidth: image.width ?? null,
          inline
        })
      }

      function renderFigure(node) {
        take(IMAGE_COST)
        const image = renderImage(node.image, false)
        const children = [node.link ? renderLink(node.link, [image]) : image]
        const caption = inline(node.caption)
        if (caption.length) children.push(h('figcaption', { class: 'rt-caption' }, caption))
        return h('figure', {
          class: ['rt-figure', `align-${node.align ?? 'center'}`],
          style: node.image.width ? { '--figure-width': `${node.image.width}px` } : null
        }, cursorAfter(children))
      }

      function renderLink(node, children) {
        if (node.href) {
          return h('a', {
            class: 'rt-link is-external',
            href: node.href,
            target: '_blank',
            rel: 'noopener noreferrer',
            'data-hint': t('wiki.externalLink')
          }, children)
        }
        if (node.action) {
          return h('button', {
            type: 'button',
            class: 'rt-link is-internal',
            'data-hint': t('wiki.goTo', { label: inlineText(children) }),
            onClick: event => {
              event.stopPropagation()
              uiStore.openLoreLink(node.action)
            }
          }, children)
        }
        if (props.wiki && node.page) {
          return h('button', {
            type: 'button',
            class: 'rt-link is-missing',
            title: t('wiki.missingPage'),
            onClick: event => {
              event.stopPropagation()
              uiStore.openLoreLink({ kind: 'missing', page: node.page })
            }
          }, children)
        }
        return h('span', { class: 'rt-link is-missing', title: t('wiki.missingPlace') }, children)
      }

      function renderRef(node) {
        const label = refLabel(node.number)
        const shown = label.slice(0, take(label.length))
        const note = notes.get(node.number)
        const hint = note ? t('wiki.noteText', { number: node.number, text: inlineToText(note.children) }) : t('wiki.note', { number: node.number })
        const attrs = { class: 'rt-ref-link', 'data-note': node.number, title: hint, 'data-hint': hint }
        const mark = props.wiki
          ? h('button', {
              ...attrs,
              type: 'button',
              onClick: event => {
                event.stopPropagation()
                jumpTo(event.currentTarget, `.rt-note[data-note="${node.number}"]`)
              }
            }, shown)
          : h('span', attrs, shown)
        return h('sup', { class: 'rt-ref' }, [mark])
      }

      function inline(nodes = []) {
        const out = []
        for (const node of nodes) {
          if (budget <= 0) break
          switch (node.type) {
            case 'text':
              out.push(node.value.slice(0, take(node.value.length)))
              break
            case 'break':
              take(BREAK_COST)
              out.push(h('br'))
              break
            case 'image':
              take(IMAGE_COST)
              out.push(node.link ? renderLink(node.link, [renderImage(node.image, true)]) : renderImage(node.image, true))
              break
            case 'magic':
              out.push(magicValue(node.name, mapStore))
              break
            case 'ref':
              out.push(renderRef(node))
              break
            case 'figure':
              out.push(renderFigure(node))
              continue
            default: {
              const children = inline(node.children)
              if (!children.length) continue
              if (node.type === 'link') out.push(renderLink(node, children))
              else if (node.type === 'color') out.push(h('span', { style: { color: node.color } }, children))
              else if (INLINE_TAGS[node.type]) out.push(h(INLINE_TAGS[node.type], { class: `rt-${node.type}` }, children))
              else out.push(h('span', { class: `rt-${node.type}` }, children))
              continue
            }
          }
          cursorAfter(out)
        }
        return out
      }

      function listItem(tag, item, extraClass) {
        const children = [...inline(item.children), ...blocks(item.blocks)]
        return children.length ? h(tag, { class: extraClass }, children) : null
      }

      function renderTable(node) {
        const parts = []
        const caption = inline(node.caption ?? [])
        if (caption.length) parts.push(h('caption', { class: 'rt-caption' }, caption))
        const rows = []
        for (const row of node.rows) {
          if (budget <= 0) break
          const cells = []
          for (const cell of row.cells) {
            if (budget <= 0) break
            cells.push(h(cell.header ? 'th' : 'td', {
              colspan: cell.colspan > 1 ? cell.colspan : null,
              style: cell.align ? { textAlign: cell.align } : null
            }, blocks(cell.blocks)))
          }
          if (cells.length) rows.push(h('tr', cells))
        }
        if (rows.length) parts.push(h('tbody', rows))
        return parts.length ? h('div', { class: 'rt-table-wrap' }, [h('table', { class: 'rt-table' }, parts)]) : null
      }

      function renderInfobox(node) {
        const title = node.name.slice(0, take(node.name.length))
        const rows = []
        for (const param of node.params) {
          if (budget <= 0) break
          const key = param.key ? param.key.slice(0, take(param.key.length)) : null
          const value = inline(param.children)
          rows.push(h('div', { class: 'rt-infobox-row' }, [
            key ? h('span', { class: 'rt-infobox-key' }, key) : null,
            h('span', { class: 'rt-infobox-value' }, value)
          ]))
        }
        return h('aside', { class: 'rt-infobox' }, [
          h('div', { class: 'rt-infobox-title' }, cursorAfter([title])),
          ...rows
        ])
      }

      function renderNotice(node) {
        const title = `${NOTICE_SIGNS[node.kind] ?? '[i]'} ${node.title}`
        const bar = h('div', { class: 'rt-notice-title' }, cursorAfter([title.slice(0, take(title.length))]))
        return h('aside', { class: ['rt-notice', `is-${node.kind}`] }, [bar, ...blocks(node.blocks)])
      }

      function renderReferences(node) {
        const items = []
        for (const note of node.notes) {
          if (budget <= 0) break
          const label = refLabel(note.number)
          const shown = label.slice(0, take(label.length))
          const number = props.wiki
            ? h('button', {
                type: 'button',
                class: 'rt-note-back',
                'data-hint': t('wiki.backToText'),
                title: t('wiki.backToText'),
                onClick: event => {
                  event.stopPropagation()
                  jumpTo(event.currentTarget, `.rt-ref-link[data-note="${note.number}"]`)
                }
              }, shown)
            : h('span', { class: 'rt-note-back' }, shown)
          items.push(h('li', { class: 'rt-note', 'data-note': note.number }, cursorAfter([number, h('span', { class: 'rt-note-text' }, inline(note.children))])))
        }
        return items.length ? h('ol', { class: 'rt-references' }, items) : null
      }

      function renderGallery(node) {
        const tiles = node.mode === 'tiles'
        const items = []
        for (const item of node.items) {
          if (budget <= 0) break
          take(IMAGE_COST)
          const image = renderImage(node.width ? { ...item.image, width: item.image.width ?? node.width } : item.image, false)
          const caption = inline(item.caption)
          let children
          if (tiles && item.link) {
            children = [renderLink(item.link, [image, caption.length ? h('span', { class: 'rt-tile-caption' }, caption) : null].filter(Boolean))]
          } else {
            children = [item.link ? renderLink(item.link, [image]) : image]
            if (caption.length) children.push(h('figcaption', { class: tiles ? 'rt-tile-caption' : 'rt-caption' }, caption))
          }
          items.push(h('figure', { class: tiles ? 'rt-tile' : 'rt-gallery-item' }, cursorAfter(children)))
        }
        if (!items.length) return null
        return h('div', {
          class: tiles ? 'rt-tiles' : 'rt-gallery',
          style: node.width ? { '--tile-width': `${node.width}px` } : null
        }, items)
      }

      function renderBanner(node) {
        const parts = []
        if (node.image) {
          take(IMAGE_COST)
          parts.push(h('div', { class: 'rt-banner-logo' }, [renderImage(node.image, false)]))
        } else if (node.logo) {
          take(node.logo.text.length)
          parts.push(h('div', { class: 'rt-banner-logo' }, [h(PixelLogo, { logo: node.logo })]))
        }
        const caption = inline(node.caption)
        if (caption.length) parts.push(h('div', { class: 'rt-banner-caption' }, caption))
        const text = blocks(node.blocks)
        if (text.length) parts.push(h('div', { class: 'rt-banner-text' }, text))
        return parts.length ? h('header', { class: ['rt-banner', node.frame && node.frame !== 'double' && `is-frame-${node.frame}`] }, cursorAfter(parts)) : null
      }

      function renderBox(node) {
        const title = inline(node.title)
        const bar = h('div', { class: 'rt-box-title' }, [
          node.icon ? h('img', { class: 'rt-box-icon', src: iconUri(node.icon), alt: '', 'aria-hidden': 'true' }) : null,
          h('span', { class: 'rt-box-name' }, title)
        ])
        return h('section', {
          class: ['rt-box', { 'is-wide': node.wide }],
          style: { '--box-color': node.color }
        }, [bar, h('div', { class: 'rt-box-body' }, blocks(node.blocks))])
      }

      function renderLinks(node) {
        const items = []
        for (const item of node.items) {
          if (budget <= 0) break
          const children = inline(item)
          if (!children.length) continue
          if (items.length) items.push(h('span', { class: 'rt-links-dot', 'aria-hidden': 'true' }, ' · '))
          items.push(h('span', { class: 'rt-links-item' }, children))
        }
        return items.length ? h('nav', { class: 'rt-links' }, items) : null
      }

      function block(node) {
        switch (node.type) {
          case 'hatnote': {
            const children = inline(node.children)
            return children.length ? h('div', { class: 'rt-hatnote' }, children) : null
          }
          case 'notice':
            return renderNotice(node)
          case 'references':
            return renderReferences(node)
          case 'gallery':
            return renderGallery(node)
          case 'heading': {
            const children = inline(node.children)
            const level = Math.min(6, Math.max(1, node.level))
            if (!children.length) return null
            const mark = node.marker
              ? h('span', { class: 'rt-heading-mark', style: { background: node.marker }, 'aria-hidden': 'true' })
              : null
            return h(`h${level}`, { class: ['rt-heading', `rt-h${level}`] }, mark ? [mark, ...children] : children)
          }
          case 'paragraph': {
            const children = inline(node.children)
            return children.length ? h('p', { class: 'rt-p' }, children) : null
          }
          case 'rule':
            take(RULE_COST)
            return h('hr', { class: 'rt-rule' })
          case 'pre':
            return h('pre', { class: 'rt-pre' }, cursorAfter([node.text.slice(0, take(node.text.length))]))
          case 'figure':
            return renderFigure(node)
          case 'quote': {
            const children = blocks(node.blocks)
            return children.length ? h('blockquote', { class: 'rt-quote' }, children) : null
          }
          case 'list': {
            const items = []
            for (const item of node.items) {
              if (budget <= 0) break
              const li = listItem('li', item)
              if (li) items.push(li)
            }
            return items.length
              ? h(node.ordered ? 'ol' : 'ul', { class: 'rt-list', start: node.start ?? null }, items)
              : null
          }
          case 'definitions': {
            const items = []
            for (const item of node.items) {
              if (budget <= 0) break
              const entry = listItem(item.kind === 'term' ? 'dt' : 'dd', item)
              if (entry) items.push(entry)
            }
            return items.length ? h('dl', { class: 'rt-definitions' }, items) : null
          }
          case 'table':
            return renderTable(node)
          case 'infobox':
            return renderInfobox(node)
          case 'banner':
            return renderBanner(node)
          case 'box':
            return renderBox(node)
          case 'links':
            return renderLinks(node)
          case 'center': {
            const children = blocks(node.blocks)
            return children.length ? h('div', { class: 'rt-center' }, children) : null
          }
          case 'portal':
            return props.wiki ? h(WikiPortal, { navbox: mapStore.wikiNavbox, pages: mapStore.wikiIndex.pages, welcome: false }) : null
          default:
            return null
        }
      }

      function blocks(nodes = []) {
        const out = []
        let boxes = null
        for (const node of nodes) {
          if (budget <= 0) break
          const rendered = block(node)
          if (!rendered) continue
          if (node.type === 'box') {
            if (!boxes) out.push(boxes = [])
            boxes.push(rendered)
          } else {
            boxes = null
            out.push(rendered)
          }
        }
        return out.map(item => (Array.isArray(item) ? h('div', { class: 'rt-boxes' }, item) : item))
      }

      const content = blocks(props.doc?.blocks)
      if (props.cursor && !cursorShown) content.push(h('span', { class: 'rt-cursor', 'aria-hidden': 'true' }, '_'))
      return h('div', { class: 'rich-text' }, content)
    }
  }
})
</script>

<style scoped>
/* The window sets the colours: --rt-text, --rt-bright, --rt-dim, --rt-accent */
.rich-text {
  container-type: inline-size;
  color: var(--rt-text, inherit);
  overflow-wrap: break-word;
}

.rich-text::after {
  content: '';
  display: block;
  clear: both;
}

.rich-text > :first-child {
  margin-top: 0;
}

.rt-p {
  margin: 0 0 1em;
}

.rt-heading {
  clear: both;
  margin: 1.4em 0 0.8em;
  color: var(--rt-bright, var(--ui-text));
  font-family: inherit;
  font-weight: normal;
  line-height: 1.5;
}

.rt-h1 { font-size: 1.5em; }
.rt-h2 { font-size: 1.3em; }
.rt-h3 { font-size: 1.15em; }
.rt-h4,
.rt-h5,
.rt-h6 { font-size: 1em; }

.rt-h1,
.rt-h2 {
  padding-bottom: 0.4em;
  background: repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 8px) left bottom / 100% 2px no-repeat;
}

.rt-heading-mark {
  display: inline-block;
  width: 0.6em;
  height: 0.6em;
  margin-right: 0.4em;
}

.rt-h3::before,
.rt-h4::before,
.rt-h5::before,
.rt-h6::before {
  content: '> ';
  color: var(--rt-dim, var(--ui-dim));
}

/* Pixel bold: a copy of the glyph shifted by a pixel, and letter spacing wider by
   a font dot (0.1em in Ark Pixel), or the copy eats the gap between letters */
.rt-strong {
  color: var(--rt-bright, var(--ui-text));
  font-weight: normal;
  text-shadow: 1px 0 currentColor;
  letter-spacing: max(1px, 0.1em);
}

.rt-em {
  color: var(--rt-accent, var(--ui-accent));
  font-style: italic;
}

.rt-underline {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.rt-strike {
  text-decoration: line-through;
  opacity: 0.75;
}

.rt-code {
  padding: 1px 4px;
  border: 1px solid var(--rt-dim, var(--ui-line));
  background: rgb(var(--ui-text-rgb) / 0.06);
  color: var(--rt-bright, var(--ui-text));
  font-family: inherit;
}

.rt-small {
  font-size: 0.8em;
}

.rt-big {
  font-size: 1.25em;
}

.rt-nowrap {
  white-space: nowrap;
}

.rt-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--rt-bright, var(--ui-text));
  font: inherit;
  /* A button centres its lines: a link wrapped in a narrow cell stood in the middle */
  text-align: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: none;
}

.rt-link.is-internal {
  text-decoration-style: dotted;
}

.rt-link.is-external::after {
  content: '';
  display: inline-block;
  width: 0.45em;
  height: 0.45em;
  margin-left: 0.3em;
  border-top: 2px solid currentColor;
  border-right: 2px solid currentColor;
  vertical-align: 0.35em;
}

.rt-link.is-external:hover,
.rt-link.is-internal:hover,
button.rt-link.is-missing:hover,
.rt-link:focus-visible {
  background: var(--rt-bright, var(--ui-text));
  color: var(--ui-screen);
  outline: none;
}

.rt-link.is-missing {
  color: var(--rt-dim, var(--ui-dim));
  text-decoration-style: dashed;
}

.rt-list,
.rt-definitions {
  margin: 0 0 1em;
  padding-left: 2.5em;
}

.rt-list .rt-list,
.rt-definitions .rt-definitions,
.rt-list .rt-definitions {
  margin-bottom: 0;
}

ul.rt-list {
  list-style: none;
}

ul.rt-list > li {
  position: relative;
}

ul.rt-list > li::before {
  content: '>';
  position: absolute;
  left: -1.6em;
  color: var(--rt-dim, var(--ui-dim));
}

ul.rt-list ul.rt-list > li::before {
  content: '-';
}

ol.rt-list > li::marker {
  color: var(--rt-dim, var(--ui-dim));
}

.rt-list li + li,
.rt-definitions > * + * {
  margin-top: 0.4em;
}

.rt-definitions dt {
  margin-left: -2.5em;
  color: var(--rt-bright, var(--ui-text));
}

.rt-definitions dd {
  margin: 0;
}

.rt-list .rt-p,
.rt-definitions .rt-p,
.rt-table .rt-p,
.rt-quote .rt-p:last-child,
.rt-infobox .rt-p {
  margin: 0;
}

.rt-quote {
  margin: 0 0 1em;
  padding: 0.2em 0 0.2em 1.2em;
  border-left: 2px solid var(--rt-dim, color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line)));
  color: var(--rt-accent, var(--ui-accent));
}

.rt-rule {
  clear: both;
  height: 2px;
  margin: 1.2em 0;
  border: 0;
  background: repeating-linear-gradient(90deg, var(--rt-dim, color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line))) 0 4px, transparent 4px 8px);
}

.rt-pre {
  margin: 0 0 1em;
  padding: 0.8em;
  overflow-x: auto;
  border: 1px solid var(--rt-dim, var(--ui-line));
  background: rgb(var(--ui-text-rgb) / 0.04);
  color: var(--rt-bright, var(--ui-text));
  font-family: inherit;
  line-height: 1.8;
  white-space: pre;
}

/* A table wider than the window scrolls itself instead of stretching the window */
.rt-table-wrap {
  clear: both;
  max-width: 100%;
  margin: 0 0 1em;
  overflow-x: auto;
}

.rt-table {
  border-collapse: collapse;
  font-size: inherit;
}

.rt-table th,
.rt-table td {
  padding: 0.35em 0.7em;
  border: 1px solid var(--rt-dim, var(--ui-line));
  text-align: left;
  vertical-align: top;
}

.rt-table th {
  background: var(--rt-bright, var(--ui-text));
  color: var(--ui-screen);
  font-weight: normal;
}

.rt-table th .rt-strong,
.rt-table th .rt-link {
  color: inherit;
}

.rt-caption {
  padding: 0.4em 0;
  color: var(--rt-dim, var(--ui-dim));
  text-align: left;
}

.rt-infobox {
  margin: 0 0 1em;
  padding: 0.6em;
  border: 4px double var(--rt-dim, color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line)));
}

.rt-infobox-title {
  margin-bottom: 0.5em;
  padding-bottom: 0.4em;
  border-bottom: 1px dashed var(--rt-dim, var(--ui-line));
  color: var(--rt-bright, var(--ui-text));
  text-transform: uppercase;
}

.rt-infobox-row {
  display: flex;
  gap: 1em;
  padding: 0.2em 0;
}

.rt-infobox-key {
  flex: 0 0 40%;
  color: var(--rt-dim, var(--ui-dim));
}

.rt-infobox-value {
  flex: 1;
  min-width: 0;
}

.rt-hatnote {
  margin: 0 0 1em;
  padding-left: 1.6em;
  color: var(--rt-dim, var(--ui-dim));
}

.rt-hatnote::before {
  content: '»';
  display: inline-block;
  width: 1.6em;
  margin-left: -1.6em;
}

.rt-notice {
  clear: both;
  margin: 0 0 1em;
  border: 2px solid var(--rt-dim, color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line)));
}

.rt-notice-title {
  padding: 0.2em 0.6em;
  background: var(--rt-dim, color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line)));
  color: var(--ui-screen);
}

.rt-notice > :not(.rt-notice-title) {
  margin: 0;
  padding: 0.5em 0.6em 0;
}

.rt-notice > :last-child:not(.rt-notice-title) {
  padding-bottom: 0.5em;
}

.rt-notice.is-warning {
  border-color: var(--rt-warn, var(--ui-warn));
}

.rt-notice.is-warning .rt-notice-title {
  background: var(--rt-warn, var(--ui-warn));
}

.rt-notice.is-stub {
  border-style: dashed;
}

/* Raised by an offset, not vertical-align, so the line does not grow taller */
.rt-ref {
  position: relative;
  top: -0.45em;
  vertical-align: baseline;
  line-height: 0;
  font-size: 0.75em;
}

/* Its own line height (beats font: inherit below), or the mark is hard to hit with the mouse */
.rt-ref .rt-ref-link {
  display: inline-block;
  line-height: 1;
}

.rt-ref-link,
.rt-note-back {
  padding: 0;
  border: 0;
  background: none;
  color: var(--rt-accent, var(--ui-accent));
  font: inherit;
  cursor: none;
}

.rt-references {
  margin: 0 0 1em;
  padding: 0;
  list-style: none;
}

.rt-note {
  display: flex;
  gap: 0.6em;
}

.rt-note + .rt-note {
  margin-top: 0.4em;
}

.rt-note-back {
  flex-shrink: 0;
}

.rt-note-text {
  min-width: 0;
}

button.rt-ref-link:hover,
button.rt-ref-link:focus-visible,
button.rt-note-back:hover,
button.rt-note-back:focus-visible,
.rt-ref-link.is-target,
.rt-note.is-target .rt-note-back {
  background: var(--rt-bright, var(--ui-text));
  color: var(--ui-screen);
  outline: none;
}

.rt-note.is-target .rt-note-text {
  color: var(--rt-bright, var(--ui-text));
}

.rt-gallery {
  clear: both;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin: 0 0 1em;
}

.rt-gallery-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  padding: 6px;
  border: 1px solid var(--rt-dim, var(--ui-line));
}

.rt-gallery-item .rt-caption {
  padding: 0.6em 0 0;
  font-size: 0.85em;
  line-height: 1.6;
  text-align: center;
}

.rt-figure {
  width: min(var(--figure-width, 100%), 100%);
  margin: 0 auto 1em;
  padding: 6px;
  box-sizing: border-box;
  border: 1px solid var(--rt-dim, var(--ui-line));
}

.rt-figure.align-left,
.rt-figure.align-right {
  width: min(var(--figure-width, 220px), 100%);
}

@container (min-width: 380px) {
  .rt-figure.align-left {
    float: left;
    max-width: 50%;
    margin: 0 1.2em 1em 0;
  }

  .rt-figure.align-right {
    float: right;
    max-width: 50%;
    margin: 0 0 1em 1.2em;
  }
}

.rt-figure .rt-caption {
  padding: 0.6em 0 0;
  font-size: 0.85em;
  line-height: 1.6;
  text-align: center;
}

.rt-banner {
  clear: both;
  margin: 0 0 1.2em;
  padding: 18px 14px 14px;
  border: 4px double var(--rt-dim, color-mix(in srgb, var(--ui-dim) 49%, var(--ui-line)));
  text-align: center;
}

.rt-banner.is-frame-single {
  border-style: solid;
  border-width: 2px;
}

.rt-banner.is-frame-none {
  padding-top: 8px;
  border: 0;
}

.rt-banner-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.rt-banner-caption {
  display: inline-block;
  margin-bottom: 8px;
  padding: 2px 12px;
  background: var(--rt-bright, var(--ui-text));
  color: var(--ui-screen);
}

.rt-banner-caption .rt-link {
  color: inherit;
}

.rt-banner-text .rt-p {
  margin: 0.3em 0;
}

.rt-links,
.rt-center {
  clear: both;
  margin: 0 0 1em;
  text-align: center;
}

.rt-links-dot {
  color: var(--rt-dim, var(--ui-dim));
}

.rt-boxes {
  clear: both;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
  gap: 16px;
  margin: 0 0 1.2em;
}

.rt-box {
  min-width: 0;
  border: 2px solid var(--box-color, color-mix(in srgb, var(--ui-dim) 7%, var(--ui-line)));
  background: color-mix(in srgb, var(--box-color, color-mix(in srgb, var(--ui-dim) 7%, var(--ui-line))) 10%, transparent);
  text-align: left;
}

.rt-box.is-wide {
  grid-column: 1 / -1;
}

.rt-box-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 6px 10px;
  background: var(--box-color, color-mix(in srgb, var(--ui-dim) 7%, var(--ui-line)));
  color: var(--ui-text);
  font-family: var(--font-pixel);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  text-transform: uppercase;
  text-shadow: 1px 1px 0 rgb(var(--ui-screen-rgb) / 0.6);
}

.rt-box-title .rt-link {
  color: inherit;
  text-transform: inherit;
}

.rt-box-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
}

.rt-box-body {
  padding: 10px 12px;
}

.rt-box-body > :last-child {
  margin-bottom: 0;
}

.rt-tiles {
  clear: both;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px 18px;
  margin: 0 0 1em;
}

.rt-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: calc(var(--tile-width, 64px) + 40px);
  margin: 0;
  text-align: center;
}

.rt-tile > .rt-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.rt-tile-caption {
  line-height: 1.3;
}

.rt-cursor {
  color: var(--rt-bright, var(--ui-text));
  animation: crt-blink 1s steps(1, end) infinite;
}
</style>
