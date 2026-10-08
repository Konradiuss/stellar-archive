// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import TerminalWindow from '../TerminalWindow.vue'
import DosMenu from '../DosMenu.vue'

const nextTask = () => new Promise(resolve => setTimeout(resolve, 0))
const press = element => element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

// Wired like SystemView: the parent owns the open menu.
function mountWindow() {
  const menuOpen = ref(false)
  const maximized = ref(false)
  const alone = ref(false)
  const events = { maximize: 0, minimize: 0 }
  const Harness = defineComponent({
    setup: () => () => h(TerminalWindow, {
      title: 'PLANET-DATA.EXE',
      maximized: maximized.value,
      alone: alone.value,
      menuOpen: menuOpen.value,
      menuItems: [{ type: 'action', label: 'Reset', onSelect: () => {} }],
      onToggleMenu: () => { menuOpen.value = !menuOpen.value },
      onCloseMenu: () => { menuOpen.value = false },
      onMaximize: () => { events.maximize++ },
      onMinimize: () => { events.minimize++ }
    })
  })
  const wrapper = mount(Harness, { attachTo: document.body })
  return { wrapper, menuOpen, maximized, alone, events }
}

describe('TerminalWindow and its menu', () => {
  let mounted

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })

  afterEach(() => {
    mounted?.wrapper.unmount()
    vi.unstubAllGlobals()
  })

  // Was: pointerdown closed the menu as an "outside" press, then the click on the same button opened it again.
  it('closes the menu with a second press on the menu button', async () => {
    mounted = mountWindow()
    const button = mounted.wrapper.find('.button-menu')

    await button.trigger('click')
    expect(mounted.wrapper.find('.dos-menu').exists()).toBe(true)
    await nextTask()

    press(button.element)
    await button.trigger('click')
    expect(mounted.menuOpen.value).toBe(false)
    expect(mounted.wrapper.find('.dos-menu').exists()).toBe(false)
  })

  it('closes the menu on a press outside of it', async () => {
    mounted = mountWindow()
    await mounted.wrapper.find('.button-menu').trigger('click')
    await nextTask()

    press(document.body)
    await nextTick()
    expect(mounted.menuOpen.value).toBe(false)
  })

  // Was: a double click on the open menu (it lives in the title bar) maximized the window.
  it('maximizes on a double click of the title, not of the menu inside it', async () => {
    mounted = mountWindow()
    await mounted.wrapper.find('.button-menu').trigger('click')

    await mounted.wrapper.find('.dos-menu-title').trigger('dblclick')
    await mounted.wrapper.find('.dos-menu-item').trigger('dblclick')
    await mounted.wrapper.find('.button-minimize').trigger('dblclick')
    expect(mounted.events.maximize).toBe(0)

    await mounted.wrapper.find('.terminal-title').trigger('dblclick')
    expect(mounted.events.maximize).toBe(1)
  })

  // Was: the menu had role="menu" but took no keys: screen readers entered it and the arrows did nothing.
  it('goes through its menu with the keys and gives the focus back on Esc', async () => {
    mounted = mountWindow()
    const button = mounted.wrapper.find('.button-menu')
    button.element.focus()
    await button.trigger('click')
    const menu = mounted.wrapper.find('.dos-menu')
    const item = mounted.wrapper.find('.dos-menu-item').element
    expect(document.activeElement).toBe(item)
    await menu.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(item)

    await menu.trigger('keydown', { key: 'Escape' })
    expect(mounted.menuOpen.value).toBe(false)
    expect(document.activeElement).toBe(button.element)
  })

  it('describes its buttons for the status line', async () => {
    mounted = mountWindow()
    const hint = selector => mounted.wrapper.find(selector).attributes('data-hint')
    expect(hint('.button-minimize')).toMatch(/Minimize/)
    expect(hint('.button-maximize')).toMatch(/Maximize/)
    expect(hint('.terminal-title')).toMatch(/Double-click/)

    mounted.maximized.value = true
    await nextTick()
    expect(hint('.button-maximize')).toMatch(/as they were/)
  })

  it('restores the windows as they were when maximized, all of them when alone', async () => {
    mounted = mountWindow()
    const button = () => mounted.wrapper.find('.button-maximize')
    expect(button().text()).toBe('MAXIMIZE')
    expect(button().find('.icon-maximize').exists()).toBe(true)

    mounted.maximized.value = true
    await nextTick()
    expect(button().text()).toBe('RESTORE')
    expect(button().find('.icon-restore').exists()).toBe(true)
    expect(button().attributes('data-hint')).toBe('Bring the windows back as they were')

    mounted.maximized.value = false
    mounted.alone.value = true
    await nextTick()
    expect(button().text()).toBe('RESTORE WINDOWS')
    expect(button().find('.icon-restore').exists()).toBe(true)
    expect(button().attributes('aria-label')).toBe('Restore windows')
  })
})

describe('DosMenu', () => {
  afterEach(() => vi.restoreAllMocks())

  // Was: a menu closed in the same tick it opened left its document listener behind forever.
  it('does not register its outside-press listener after an early unmount', async () => {
    const addListener = vi.spyOn(document, 'addEventListener')
    const wrapper = mount(DosMenu, { props: { items: [] }, attachTo: document.body })
    wrapper.unmount()
    await nextTask()
    expect(addListener.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(0)
  })

  it('removes its listener when it closes', async () => {
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const wrapper = mount(DosMenu, { props: { items: [] }, attachTo: document.body })
    await nextTask()
    wrapper.unmount()
    expect(removeListener.mock.calls.some(([type]) => type === 'pointerdown')).toBe(true)
  })
})
