// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { useMapStore } from '../../stores/mapStore'
import { soundReady } from '../../sound'
import { useSoundStore } from '../../stores/soundStore'
import MusicPlayer from '../MusicPlayer.vue'

// The casing is not under test: the stub renders only its title-bar buttons and the playlist slot.
const RetroPanelStub = defineComponent({
  props: { content: { type: [Object, Array], default: null } },
  setup(props, { slots }) {
    return () => h('div', [
      h('div', { class: 'panel-titlebar' }, slots['title-actions']?.()),
      ...(props.content ? slots.default?.({ content: props.content }) ?? [] : [])
    ])
  }
})

function mountPlayer(props = {}) {
  const mapStore = useMapStore()
  mapStore.music = [{ src: 'a.mp3', title: 'A', author: '', license: '', duration: 60 }]
  mapStore.isLoaded = true
  return mount(MusicPlayer, { props, global: { stubs: { RetroPanel: RetroPanelStub } } })
}

const status = wrapper => wrapper.find('.panel-status-left').text()

describe('music player volume', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('is set in percent from the keys, and the status line tells it', async () => {
    const wrapper = mountPlayer()
    const slider = wrapper.find('.music-control .volume-bar')
    expect(slider.attributes('aria-valuenow')).toBe('60')
    expect(status(wrapper)).toBe('PAUSED')
    const press = async key => {
      await slider.trigger('keydown', { key })
      await nextTick()
      return slider.attributes('aria-valuenow')
    }
    expect(await press('ArrowRight')).toBe('61')
    expect(await press('ArrowDown')).toBe('60')
    expect(await press('PageUp')).toBe('70')
    expect(await press('End')).toBe('100')
    expect(await press('ArrowUp')).toBe('100')
    expect(await press('Home')).toBe('0')
    expect(await press('ArrowLeft')).toBe('0')
    expect(await press('PageUp')).toBe('10')
    expect(status(wrapper)).toBe('MUS 10%')
  })

  // Was: a speaker icon beside a single bar, with no label saying which volume it was.
  it('strikes the label MUS through when muted or at 0%, and keeps the volume', async () => {
    const wrapper = mountPlayer()
    const control = () => wrapper.find('.music-control')
    const label = wrapper.find('.music-control .volume-label')
    expect(label.text()).toBe('MUS')
    expect(control().classes()).not.toContain('is-off')

    await label.trigger('click')
    expect(control().classes()).toContain('is-off')
    expect(label.attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('.music-control .volume-bar').attributes('aria-valuenow')).toBe('60')

    await wrapper.find('.music-control .volume-bar').trigger('keydown', { key: 'PageDown' })
    expect(control().classes()).not.toContain('is-off')

    await wrapper.find('.music-control .volume-bar').trigger('keydown', { key: 'Home' })
    expect(control().classes()).toContain('is-off')
  })
})

// Was: the one-line player of a phone or a tablet came from a media query of its own, not from the site layout.
describe('the compact music player', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  // Was: [≡] stood in the row of buttons and left no room for a second volume bar.
  it('opens its list from the title bar, and puts it away on one line', async () => {
    const wrapper = mountPlayer()
    expect(wrapper.find('.music-player').classes()).not.toContain('is-compact')
    expect(wrapper.find('.player-controls .button-list').exists()).toBe(false)
    const list = wrapper.find('.panel-titlebar .button-list')
    await list.trigger('click')
    expect(wrapper.find('.player-list').exists()).toBe(true)
    expect(list.attributes('aria-pressed')).toBe('true')
    await wrapper.setProps({ compact: true })
    expect(wrapper.find('.music-player').classes()).toContain('is-compact')
    expect(wrapper.find('.player-list').exists()).toBe(false)
    expect(wrapper.find('.button-list').exists()).toBe(false)
  })

  it('stands as a column of its three buttons on a phone on its side', async () => {
    const wrapper = mountPlayer()
    await wrapper.find('.button-list').trigger('click')
    await wrapper.setProps({ vertical: true })
    const classes = wrapper.find('.music-player').classes()
    expect(classes).toContain('is-vertical')
    expect(classes).toContain('is-compact')
    expect(wrapper.find('.player-list').exists()).toBe(false)
    expect(wrapper.findAll('.player-controls .player-btn')).toHaveLength(3)
    expect(wrapper.find('.player-controls > .sfx-control').exists()).toBe(false)
  })
})

describe('the sound effects in the player', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    // As if a press had already let the page sound.
    soundReady.value = true
  })

  it('have a second bar, quiet for a new visitor and apart from the music', async () => {
    const wrapper = mountPlayer()
    const sfx = wrapper.find('.player-volume .sfx-control')
    expect(sfx.find('.volume-label').text()).toBe('SFX')
    const bar = sfx.find('.volume-bar')
    expect(bar.attributes('aria-valuenow')).toBe('35')
    await bar.trigger('keydown', { key: 'PageUp' })
    expect(bar.attributes('aria-valuenow')).toBe('45')
    expect(status(wrapper)).toBe('SFX 45%')
    expect(wrapper.find('.music-control .volume-bar').attributes('aria-valuenow')).toBe('60')
  })

  it('are turned off by their label, and the browser remembers it', async () => {
    const wrapper = mountPlayer()
    const label = wrapper.find('.player-volume .sfx-control .volume-label')
    expect(label.attributes('aria-pressed')).toBe('true')
    await label.trigger('click')
    expect(wrapper.find('.player-volume .sfx-control').classes()).toContain('is-off')
    expect(label.attributes('aria-label')).toBe('Turn the sound effects on')

    setActivePinia(createPinia())
    const again = mountPlayer()
    expect(again.find('.player-volume .sfx-control').classes()).toContain('is-off')
    await again.find('.player-volume .sfx-control .volume-bar').trigger('keydown', { key: 'ArrowRight' })
    expect(again.find('.player-volume .sfx-control').classes()).not.toContain('is-off')
  })

  it('are a label alone on one line, which turns them on and off', async () => {
    const wrapper = mountPlayer({ compact: true })
    const control = wrapper.find('.player-controls > .sfx-control')
    expect(control.find('.volume-bar').exists()).toBe(false)
    await control.find('.volume-label').trigger('click')
    expect(wrapper.find('.player-controls > .sfx-control').classes()).toContain('is-off')
  })

  it('stay to be set in a player without music, and are gone when the map turns them off', async () => {
    const mapStore = useMapStore()
    mapStore.music = []
    mapStore.isLoaded = true
    const wrapper = mount(MusicPlayer, { global: { stubs: { RetroPanel: RetroPanelStub } } })
    expect(wrapper.find('.player-empty .sfx-control .volume-bar').exists()).toBe(true)
    expect(wrapper.find('.button-list').exists()).toBe(false)
    mapStore.sounds = { enabled: false, volume: null, sounds: {} }
    await nextTick()
    expect(wrapper.find('.sfx-control').exists()).toBe(false)
    mapStore.music = [{ src: 'a.mp3', title: 'A', author: '', license: '', duration: 60 }]
    await nextTick()
    expect(wrapper.find('.sfx-control').exists()).toBe(false)
    expect(wrapper.find('.music-control').exists()).toBe(true)
  })
})

describe('the sound effects before the first press', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    soundReady.value = false
  })

  // Was: the label looked on while the browser kept the page silent, and nothing said a press would bring the sound.
  it('blink in the player until the page may sound, and say why', async () => {
    const wrapper = mountPlayer()
    const control = () => wrapper.find('.player-volume .sfx-control')
    expect(control().classes()).toContain('is-waiting')
    expect(control().find('.volume-label').attributes('aria-label')).toBe('Sound effects: press anywhere on the page to hear them')
    soundReady.value = true
    await nextTick()
    expect(control().classes()).not.toContain('is-waiting')
    expect(control().find('.volume-label').attributes('aria-label')).toBe('Turn the sound effects off')
  })

  it('are let in, not turned off, by a press of the blinking label', async () => {
    const wrapper = mountPlayer()
    const label = wrapper.find('.player-volume .sfx-control .volume-label')
    await label.trigger('pointerdown')
    // pointerdown itself lets the page sound before the click comes.
    soundReady.value = true
    await label.trigger('click')
    expect(wrapper.find('.player-volume .sfx-control').classes()).not.toContain('is-off')
    expect(status(wrapper)).toBe('SFX 35%')
    await label.trigger('pointerdown')
    await label.trigger('click')
    expect(wrapper.find('.player-volume .sfx-control').classes()).toContain('is-off')
  })

  it('do not blink when the visitor turned them off', async () => {
    const wrapper = mountPlayer()
    useSoundStore().toggle()
    await nextTick()
    const control = wrapper.find('.player-volume .sfx-control')
    expect(control.classes()).toContain('is-off')
    expect(control.classes()).not.toContain('is-waiting')
  })
})
