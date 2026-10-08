// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HackNukeWindow from '../HackNukeWindow.vue'
import HackCrewMonitor from '../HackCrewMonitor.vue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the window breaking the code of the nuke', () => {
  it('locks the digits one by one and gets the code at the end', async () => {
    const wrapper = mount(HackNukeWindow)
    const locked = () => wrapper.findAll('.nuke-digit.is-locked')
    expect(wrapper.find('.hack-panel-heading').text()).toBe('DECRYPTING NUCLEAR CODE')
    expect(wrapper.findAll('.nuke-blocks span')).toHaveLength(60)
    expect(wrapper.findAll('.nuke-blocks .is-cracked')).toHaveLength(0)
    expect(wrapper.findAll('.nuke-digit')).toHaveLength(5)
    expect(locked()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(2600)
    expect(locked()).toHaveLength(1)
    const first = locked()[0].text()
    await vi.advanceTimersByTimeAsync(1500)
    expect(locked()).toHaveLength(2)
    expect(locked()[0].text()).toBe(first)
    expect(wrapper.find('.nuke-status').text()).toBe('BRUTE FORCE...')
    expect(wrapper.findAll('.nuke-keys > div').length).toBeGreaterThan(0)
    expect(Number(wrapper.find('.nuke-counters span').text().replace(/\D/g, ''))).toBeGreaterThan(1_000_000)
    expect(wrapper.findAll('.nuke-blocks .is-cracked')).toHaveLength(24)
    expect(wrapper.find('.nuke-armed').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)
    expect(locked()).toHaveLength(5)
    expect(locked().map(digit => digit.text()).join('')).toMatch(/^\d{5}$/)
    expect(wrapper.find('.nuke-status').text()).toBe('CODE ACQUIRED')
    expect(wrapper.find('.nuke-armed').text()).toBe('DETONATION AUTHORIZED')
    expect(wrapper.findAll('.nuke-blocks .is-cracked')).toHaveLength(60)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('the crew monitor', () => {
  it('loses the crew one by one once the phoron is out: racing heart, flat line, DECEASED', async () => {
    const wrapper = mount(HackCrewMonitor)
    const rows = () => wrapper.findAll('.crew-row')
    const dead = () => wrapper.findAll('.crew-row.is-dead')
    const flatLines = () => wrapper.findAll('.crew-pulse-line').filter(line => line.attributes('points') === '0,6 72,6')
    expect(rows()).toHaveLength(20)
    expect(wrapper.find('.crew-count').text()).toBe('LIFE SIGNS: 20/20')
    expect(wrapper.findAll('.crew-pulse')).toHaveLength(20)
    expect(wrapper.findAll('.crew-bpm').every(bpm => Number(bpm.text()) >= 60)).toBe(true)

    await vi.advanceTimersByTimeAsync(1700)
    expect(wrapper.findAll('.crew-row.is-critical')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(300)
    const racing = wrapper.findAll('.crew-row.is-critical')
    expect(racing).toHaveLength(1)
    expect(Number(racing[0].find('.crew-bpm').text())).toBeGreaterThanOrEqual(150)
    await vi.advanceTimersByTimeAsync(600)
    expect(flatLines()).toHaveLength(1)
    expect(dead()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(600)
    expect(dead()).toHaveLength(1)
    expect(dead()[0].find('.crew-status').text()).toBe('DECEASED')
    expect(dead()[0].find('.crew-bpm').text()).toBe('0')
    expect(wrapper.find('.crew-count').text()).toBe('LIFE SIGNS: 19/20')
    expect(wrapper.findAll('.crew-log > div')).toHaveLength(1)
    expect(wrapper.find('.crew-final').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(7000)
    expect(dead()).toHaveLength(20)
    expect(wrapper.find('.crew-count').text()).toBe('LIFE SIGNS: 0/20')
    expect(wrapper.findAll('.crew-log > div')).toHaveLength(4)
    expect(wrapper.find('.crew-final').text()).toBe('ONLY SYNDICATE AGENTS REMAIN')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
