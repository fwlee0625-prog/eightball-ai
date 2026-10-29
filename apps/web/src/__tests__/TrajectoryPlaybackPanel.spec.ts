import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import trajectoryFixture from '../../../../data/samples/trajectory-001.json'
import TrajectoryPlaybackPanel from '../components/TrajectoryPlaybackPanel.vue'
import { createInitialTableState } from '../data/initialTableState'

function mountPanel(overrides: { stateVersion?: number; tableId?: string } = {}) {
  const state = createInitialTableState()
  return mount(TrajectoryPlaybackPanel, {
    props: {
      expectedTableId: overrides.tableId ?? state.table_id,
      expectedStateVersion: overrides.stateVersion ?? state.state_version,
      expectedGeometry: state.table_geometry,
      resetToken: 0,
    },
  })
}

function installAnimationFrameQueue() {
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextId = 1
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextId++
    callbacks.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
  return {
    advance(nowMs: number) {
      const next = callbacks.entries().next()
      if (next.done) throw new Error('No animation frame was scheduled.')
      const [id, callback] = next.value
      callbacks.delete(id)
      callback(nowMs)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TrajectoryPlaybackPanel', () => {
  it('loads the synthetic sample and emits the first recorded frame', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.trajectory-sample-button').trigger('click')
    expect(wrapper.text()).toContain('synthetic-shot-001')
    expect(wrapper.text()).toContain('原始索引 0')
    expect(wrapper.emitted('trajectory-change')?.[0]?.[0]).toMatchObject({
      trajectory_id: 'synthetic-trajectory-001',
      state_version: 1,
    })
    expect(wrapper.emitted('frame-change')?.[0]?.[0]).toMatchObject({
      frame_index: 0,
      timestamp_ns: 0,
    })
  })

  it('steps through recorded frames without inventing skipped source indexes', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.trajectory-sample-button').trigger('click')
    await wrapper.get('[aria-label="下一帧"]').trigger('click')
    expect(wrapper.get('[data-testid="trajectory-frame-indicator"]').text()).toContain('原始索引 1')
    await wrapper.get('[aria-label="下一帧"]').trigger('click')
    await wrapper.get('[aria-label="下一帧"]').trigger('click')
    expect(wrapper.get('[data-testid="trajectory-frame-indicator"]').text()).toContain('原始索引 4')
    expect(wrapper.emitted('frame-change')?.[3]?.[0]).toMatchObject({ frame_index: 4 })
  })

  it('seeks by actual timestamp rather than frame count or nominal FPS', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.trajectory-sample-button').trigger('click')
    await wrapper.get('input[type="range"]').setValue('15')
    expect(wrapper.get('[data-testid="trajectory-frame-indicator"]').text()).toContain('原始索引 2')
    expect(wrapper.get('[data-testid="trajectory-playhead"]').text()).toBe('15.000 ms')
  })

  it('advances using recorded timestamp gaps at the selected playback rate', async () => {
    const raf = installAnimationFrameQueue()
    const wrapper = mountPanel()
    await wrapper.get('.trajectory-sample-button').trigger('click')
    await wrapper.get('.trajectory-control-button--play').trigger('click')
    raf.advance(1000)
    raf.advance(1016)
    expect(wrapper.get('[data-testid="trajectory-frame-indicator"]').text()).toContain('原始索引 2')
    raf.advance(1021)
    expect(wrapper.get('[data-testid="trajectory-frame-indicator"]').text()).toContain('原始索引 4')
    await wrapper.get('.trajectory-control-button--play').trigger('click')
    expect(wrapper.text()).toContain('播放')
    wrapper.unmount()
  })

  it('rejects a trajectory from a different state version', async () => {
    const wrapper = mountPanel({ stateVersion: 2 })
    await wrapper.get('.trajectory-sample-button').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('state_version 与当前球局不一致')
    expect(wrapper.emitted('trajectory-change')).toBeUndefined()
  })

  it('rejects a trajectory from a different table', async () => {
    const wrapper = mountPanel({ tableId: 'another-table' })
    await wrapper.get('.trajectory-sample-button').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('table_id 与当前球桌不一致')
  })

  it('stops playback when the underlying state version changes', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.trajectory-sample-button').trigger('click')
    await wrapper.setProps({ expectedStateVersion: 2 })
    await nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain('已停止过期轨迹回放')
    expect(wrapper.emitted('trajectory-change')?.[1]).toEqual([null])
    expect(wrapper.emitted('frame-change')?.[1]).toEqual([null])
  })

  it('clears the playback and emits null events when exiting', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.trajectory-sample-button').trigger('click')
    await wrapper.get('.trajectory-clear-button').trigger('click')
    expect(wrapper.text()).toContain('载入合成样例或导入轨迹文件后')
    expect(wrapper.emitted('trajectory-change')?.at(-1)).toEqual([null])
    expect(wrapper.emitted('frame-change')?.at(-1)).toEqual([null])
  })

  it('imports a local JSON file through the file input', async () => {
    const wrapper = mountPanel()
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [{
        name: 'trajectory.json',
        size: 2048,
        text: () => Promise.resolve(JSON.stringify(trajectoryFixture)),
      }],
    })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.text()).toContain('synthetic-shot-001')
    expect(wrapper.text()).not.toContain('无法读取轨迹文件')
  })

  it('reset token clears the loaded trajectory', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.trajectory-sample-button').trigger('click')
    await wrapper.setProps({ resetToken: 1 })
    await nextTick()
    expect(wrapper.text()).toContain('载入合成样例或导入轨迹文件后')
    expect(wrapper.emitted('trajectory-change')?.at(-1)).toEqual([null])
  })
})
