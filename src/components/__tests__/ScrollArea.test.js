// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import ScrollArea from '../ScrollArea.vue'

// happy-dom lays nothing out: the box is given its sizes by hand.
function sized(element, { scrollHeight, clientHeight, scrollTop = 0 }) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight })
  element.scrollTop = scrollTop
  element.scrollTo = ({ top }) => { element.scrollTop = top }
}

function mountArea(props = {}) {
  return mount(ScrollArea, { props, slots: { default: () => h('p', 'text') } })
}

describe('scroll area', () => {
  it('moves the thumb with the scroll and sizes it by the share on screen', async () => {
    const wrapper = mountArea()
    const body = wrapper.find('.scroll-area-body').element
    sized(body, { scrollHeight: 400, clientHeight: 100, scrollTop: 150 })
    await wrapper.find('.scroll-area-body').trigger('scroll')
    const thumb = wrapper.find('.scrollbar-thumb').attributes('style')
    // A quarter on screen; half-way down the 300px it can move.
    expect(thumb).toContain('height: 25%')
    expect(thumb).toContain('top: 37.5%')
    expect(wrapper.vm.progress).toBe(0.5)
    expect(wrapper.find('.scroll-area-bar').classes()).not.toContain('is-idle')
  })

  it('pages with its arrows and dims when there is nothing to scroll', async () => {
    const wrapper = mountArea()
    const body = wrapper.find('.scroll-area-body').element
    sized(body, { scrollHeight: 400, clientHeight: 100 })
    wrapper.vm.update()
    await nextTick()
    const [up, down] = wrapper.findAll('.scrollbar-button')
    expect(up.attributes('disabled')).toBeDefined()
    await down.trigger('click')
    expect(body.scrollTop).toBe(90)

    sized(body, { scrollHeight: 100, clientHeight: 100 })
    wrapper.vm.update()
    await nextTick()
    expect(wrapper.find('.scroll-area-bar').classes()).toContain('is-idle')
  })

  it('has no bar when the content is laid out to fit', () => {
    const wrapper = mountArea({ bar: false })
    expect(wrapper.find('.scroll-area-bar').exists()).toBe(false)
    expect(wrapper.find('.scroll-area').classes()).not.toContain('has-bar')
  })
})
