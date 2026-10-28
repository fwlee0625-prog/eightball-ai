import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import ApiHealthBadge from '../components/ApiHealthBadge.vue'

const wrappers: ReturnType<typeof mount>[] = []
function render() {
  const wrapper = mount(ApiHealthBadge)
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('shows loading, then a confirmed API connection', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    status: 'ok', service: 'eightball-api', version: '0.1.0',
  }))))
  const wrapper = render()
  expect(wrapper.get('[role="status"]').text()).toBe('API 连接中')
  await flushPromises()
  expect(wrapper.get('[role="status"]').text()).toBe('API 已连接')
  expect(wrapper.find('button').exists()).toBe(false)
})

it('allows recovery after a network failure', async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      status: 'ok', service: 'eightball-api', version: '0.1.0',
    })))
  vi.stubGlobal('fetch', fetcher)
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('API 未连接')
  expect(wrapper.text()).toContain('请确认服务已启动')
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('API 已连接')
})

it('times out a stalled request and aborts a request on unmount', async () => {
  vi.useFakeTimers()
  let observedSignal: AbortSignal | null | undefined
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation((_input, options) => {
    observedSignal = options?.signal
    return new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })
  }))
  const wrapper = render()
  await vi.advanceTimersByTimeAsync(3000)
  expect(wrapper.text()).toContain('API 连接超时')
  await wrapper.get('button').trigger('click')
  const pendingSignal = observedSignal
  wrapper.unmount()
  wrappers.splice(wrappers.indexOf(wrapper), 1)
  expect(pendingSignal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
