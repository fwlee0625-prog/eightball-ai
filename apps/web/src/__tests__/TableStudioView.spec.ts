import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import TableStudioView from '../views/TableStudioView.vue'
import TableTopDownEditor from '../components/TableTopDownEditor.vue'
import TrajectoryPlaybackPanel from '../components/TrajectoryPlaybackPanel.vue'
import type { TableState } from '../types/tableState'

const resetSceneView = vi.fn<() => void>()
const setTopDownView = vi.fn<(enabled: boolean) => void>()

const PoolTableSceneStub = defineComponent({
  name: 'PoolTableScene',
  props: {
    state: { type: Object, required: true },
    selectedBallId: { type: Number, default: null },
    showIds: { type: Boolean, default: true },
  },
  emits: ['select-ball', 'model-status'],
  setup(_props, { expose }) {
    expose({ resetView: resetSceneView, setTopDownView })
  },
  template: '<div data-test="pool-table-scene-stub" />',
})

function mountStudio() {
  return mount(TableStudioView, {
    global: {
      stubs: {
        PoolTableScene: PoolTableSceneStub,
        ApiHealthBadge: true,
      },
    },
  })
}

describe('TableStudioView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('renders the table workspace and all 16 detections', () => {
    const wrapper = mountStudio()
    expect(wrapper.text()).toContain('球局工作台')
    expect(wrapper.text()).toContain('16')
    expect(wrapper.text()).toContain('2540')
    expect(wrapper.find('[data-test="pool-table-scene-stub"]').exists()).toBe(true)
  })

  it('applies valid coordinate edits to the selected ball', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    scene.vm.$emit('select-ball', 0)
    await nextTick()

    await wrapper.find('input[name="x"]').setValue('10')
    await wrapper.find('input[name="y"]').setValue('20')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('本地修改 · 未保存')
    expect((wrapper.find('input[name="x"]').element as HTMLInputElement).value).toBe('10')
    expect((wrapper.find('input[name="y"]').element as HTMLInputElement).value).toBe('20')
    expect(wrapper.text()).toContain('STATE v2')
  })

  it('allows editing only X while preserving the original Y precision', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    scene.vm.$emit('select-ball', 0)
    await nextTick()

    const initialState = scene.props('state') as TableState
    const originalY = initialState.balls.find((ball) => ball.id === 0)?.y_mm
    expect(originalY).toBeDefined()
    expect(wrapper.find('input[name="x"]').attributes('step')).toBe('any')
    expect(wrapper.find('input[name="y"]').attributes('step')).toBe('any')

    await wrapper.find('input[name="x"]').setValue('10')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    const updatedState = scene.props('state') as TableState
    const updatedBall = updatedState.balls.find((ball) => ball.id === 0)
    expect(updatedBall?.x_mm).toBe(10)
    expect(updatedBall?.y_mm).toBe(originalY)
    expect(wrapper.text()).toContain('STATE v2')
  })

  it('allows editing only Y while preserving the original X precision', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    scene.vm.$emit('select-ball', 0)
    await nextTick()

    const initialState = scene.props('state') as TableState
    const originalX = initialState.balls.find((ball) => ball.id === 0)?.x_mm
    expect(originalX).toBeDefined()

    await wrapper.find('input[name="y"]').setValue('20')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    const updatedState = scene.props('state') as TableState
    const updatedBall = updatedState.balls.find((ball) => ball.id === 0)
    expect(updatedBall?.x_mm).toBe(originalX)
    expect(updatedBall?.y_mm).toBe(20)
    expect(wrapper.text()).toContain('STATE v2')
  })

  it('rejects coordinates outside the active table rectangle', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    scene.vm.$emit('select-ball', 0)
    await nextTick()

    await wrapper.find('input[name="x"]').setValue('700')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('X 坐标必须在 -635 到 635 mm 范围内')
    expect(wrapper.text()).toContain('原始样例 · 只读来源')
  })

  it.each([
    ['x', '-635'], ['x', '635'], ['y', '-1270'], ['y', '1270'],
  ])('accepts the %s boundary %s without changing the other axis', async (axis, value) => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    scene.vm.$emit('select-ball', 0)
    await nextTick()
    const initialState = scene.props('state') as TableState
    const originalBall = initialState.balls.find((ball) => ball.id === 0)!

    await wrapper.find('input[name="' + axis + '"]').setValue(value)
    await wrapper.find('form').trigger('submit')

    const updatedState = scene.props('state') as TableState
    expect(updatedState.state_version).toBe(initialState.state_version + 1)
    expect(updatedState.balls.find((ball) => ball.id === 0)).toEqual({
      ...originalBall,
      [axis + '_mm']: Number(value),
    })
  })

  it.each([
    ['x', '-636', 'X 坐标必须在'], ['x', '636', 'X 坐标必须在'],
    ['y', '-1271', 'Y 坐标必须在'], ['y', '1271', 'Y 坐标必须在'],
    ['x', '', '请输入 X 和 Y 坐标'], ['y', '', '请输入 X 和 Y 坐标'],
    ['x', 'abc', '请输入 X 和 Y 坐标'], ['y', 'abc', '请输入 X 和 Y 坐标'],
  ])('rejects invalid %s input %s without changing state', async (axis, value, error) => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    scene.vm.$emit('select-ball', 0)
    await nextTick()
    const initialState = scene.props('state') as TableState

    await wrapper.find('input[name="' + axis + '"]').setValue(value)
    await wrapper.find('form').trigger('submit')

    expect(wrapper.get('[role="alert"]').text()).toContain(error)
    expect(scene.props('state')).toBe(initialState)
    expect(wrapper.text()).toContain('原始样例 · 只读来源')
  })

  it('commits a top-down drag as one versioned coordinate update', async () => {
    const wrapper = mountStudio()
    const editor = wrapper.findComponent(TableTopDownEditor)
    const scene = wrapper.findComponent(PoolTableSceneStub)
    const initial = scene.props('state') as TableState
    const original = initial.balls.find((ball) => ball.id === 0)!

    editor.vm.$emit('move-ball', 0, 12.5, -20.25)
    await nextTick()

    const updated = scene.props('state') as TableState
    expect(updated.state_version).toBe(initial.state_version + 1)
    expect(updated.balls.find((ball) => ball.id === 0)).toEqual({
      ...original, x_mm: 12.5, y_mm: -20.25,
    })
    expect(scene.props('selectedBallId')).toBe(0)
    expect(wrapper.text()).toContain('当前 ID 0')
    expect(wrapper.text()).toContain('本地修改 · 未保存')
  })

  it('plays a compatible trajectory in 2D and 3D without mutating the live session', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    const topdown = wrapper.findComponent(TableTopDownEditor)
    const playback = wrapper.findComponent(TrajectoryPlaybackPanel)
    const initialState = scene.props('state') as TableState
    const originalBall = initialState.balls.find((ball) => ball.id === 0)!

    expect(playback.exists()).toBe(true)
    await wrapper.get('.trajectory-sample-button').trigger('click')
    await nextTick()
    expect(scene.props('state')).toMatchObject({
      source: 'synthetic-demo',
      state_version: 1,
    })
    expect(topdown.props('readOnly')).toBe(true)
    expect(wrapper.find('input[name="x"]').exists()).toBe(false)

    await wrapper.get('[aria-label="下一帧"]').trigger('click')
    await nextTick()
    const replayState = scene.props('state') as TableState
    expect(replayState.balls.find((ball) => ball.id === 0)?.x_mm).toBe(originalBall.x_mm + 8)
    expect(replayState.state_version).toBe(initialState.state_version)
    expect(wrapper.text()).toContain('REPLAY · v1')

    await wrapper.get('.trajectory-clear-button').trigger('click')
    await nextTick()
    expect(scene.props('state')).toBe(initialState)
    expect(topdown.props('readOnly')).toBe(false)
  })

  it('imports valid standard JSON, replaces the scene state, and increments the session version', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    scene.vm.$emit('select-ball', 0)
    await nextTick()

    await wrapper.find('input[name="x"]').setValue('10')
    await wrapper.find('form').trigger('submit')
    await nextTick()
    expect(wrapper.text()).toContain('STATE v2')

    const fixture = JSON.parse(JSON.stringify(scene.props('state'))) as TableState
    fixture.state_version = 1
    fixture.balls = [{ id: 7, x_mm: 10.125, y_mm: -20.25, confidence: 0.5 }]
    const file = {
      name: 'import.json',
      size: 500,
      text: vi.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(fixture)),
    }
    const input = wrapper.get('input[name="state-import"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await nextTick()
    await vi.waitFor(() => expect(wrapper.text()).toContain('已导入 import.json'))

    const imported = scene.props('state') as TableState
    expect(imported.state_version).toBe(3)
    expect(imported.balls).toEqual(fixture.balls)
    expect(scene.props('selectedBallId')).toBeNull()
    expect(wrapper.text()).toContain('检测球数')
    expect(wrapper.text()).toContain('本地修改 · 未保存')
    expect(wrapper.text()).toContain('STATE v3')
    expect(file.text).toHaveBeenCalledOnce()
  })

  it('preserves state when a near-maximum imported version cannot be incremented', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    const initial = scene.props('state') as TableState
    const nearLimit = JSON.parse(JSON.stringify(initial)) as TableState
    nearLimit.state_version = Number.MAX_SAFE_INTEGER - 1
    nearLimit.balls = [{ id: 0, x_mm: 0, y_mm: 0 }]
    const input = wrapper.get('input[name="state-import"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [{
        name: 'near-max-version.json',
        size: 500,
        text: () => Promise.resolve(JSON.stringify(nearLimit)),
      }],
    })

    await input.trigger('change')
    await vi.waitFor(() => expect(wrapper.text()).toContain('已导入 near-max-version.json'))
    expect((scene.props('state') as TableState).state_version).toBe(Number.MAX_SAFE_INTEGER)
    expect(scene.props('state')).not.toBe(initial)

    scene.vm.$emit('select-ball', 0)
    await nextTick()
    const importedState = scene.props('state') as TableState

    await wrapper.find('input[name="x"]').setValue('10')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('安全整数上限')
    expect(scene.props('state')).toBe(importedState)
    expect((scene.props('state') as TableState).balls[0]).toEqual({ id: 0, x_mm: 0, y_mm: 0 })
    expect(wrapper.text()).toContain('STATE v' + Number.MAX_SAFE_INTEGER)

    await wrapper.find('input[name="y"]').setValue('20')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('安全整数上限')
    expect(scene.props('state')).toBe(importedState)
    expect((scene.props('state') as TableState).state_version).toBe(Number.MAX_SAFE_INTEGER)
    expect((scene.props('state') as TableState).balls[0]).toEqual({ id: 0, x_mm: 0, y_mm: 0 })
  })

  it('preserves prior state and selection on invalid imported coordinates', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    scene.vm.$emit('select-ball', 0)
    await nextTick()
    const initial = scene.props('state') as TableState
    const bad = JSON.parse(JSON.stringify(initial)) as TableState
    bad.balls[0]!.x_mm = 700
    const input = wrapper.get('input[name="state-import"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [{
        name: 'bad.json',
        size: 100,
        text: () => Promise.resolve(JSON.stringify(bad)),
      }],
    })
    await input.trigger('change')
    await vi.waitFor(() => expect(wrapper.text()).toContain('坐标超出活动台面矩形'))
    expect(scene.props('state')).toBe(initial)
    expect(scene.props('selectedBallId')).toBe(0)
    expect(wrapper.text()).toContain('STATE v1')
  })

  it('rejects mismatched table geometry and oversized input without changing state', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    const initial = scene.props('state') as TableState
    const importInput = wrapper.get('input[name="state-import"]')
    const altered = JSON.parse(JSON.stringify(initial)) as TableState
    altered.table_geometry.active_width_mm = 1000
    // Keep positions valid under the imported geometry, so this tests the
    // workspace/table mismatch rather than the parser's bounds guard.
    altered.balls = [{ id: 7, x_mm: 0, y_mm: 0 }]
    Object.defineProperty(importInput.element, 'files', {
      configurable: true,
      value: [{
        name: 'other-table.json',
        size: 512,
        text: () => Promise.resolve(JSON.stringify(altered)),
      }],
    })
    await importInput.trigger('change')
    await vi.waitFor(() => expect(wrapper.text()).toContain('当前工作台仅支持活动区域'))
    expect(scene.props('state')).toBe(initial)

    const readLarge = vi.fn<() => Promise<string>>()
    Object.defineProperty(importInput.element, 'files', {
      configurable: true,
      value: [{ name: 'large.json', size: 1024 * 1024 + 1, text: readLarge }],
    })
    await importInput.trigger('change')
    expect(wrapper.text()).toContain('文件超过 1 MiB')
    expect(readLarge).not.toHaveBeenCalled()
    expect(scene.props('state')).toBe(initial)
  })

  it('ignores an import that resolves after the user resets the session', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    const initial = scene.props('state') as TableState
    let resolveRead: (value: string) => void = () => {}
    const pending = new Promise<string>((resolve) => { resolveRead = resolve })
    const importInput = wrapper.get('input[name="state-import"]')
    Object.defineProperty(importInput.element, 'files', {
      configurable: true,
      value: [{ name: 'delayed.json', size: 80, text: () => pending }],
    })
    await importInput.trigger('change')
    await wrapper.get('.reset-state-button').trigger('click')
    resolveRead(JSON.stringify({ ...initial, balls: [{ id: 2, x_mm: 1, y_mm: 1 }] }))
    await nextTick()
    await Promise.resolve()
    expect(scene.props('state')).toEqual(initial)
    expect(wrapper.text()).toContain('STATE v1')
    expect(wrapper.text()).not.toContain('已导入 delayed.json')
  })

  it('shows file read errors and allows retrying an unchanged file', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    const initial = scene.props('state') as TableState
    const importInput = wrapper.get('input[name="state-import"]')
    Object.defineProperty(importInput.element, 'files', {
      configurable: true,
      value: [{ name: 'broken.json', size: 5, text: () => Promise.reject(new Error('读取失败')) }],
    })
    await importInput.trigger('change')
    await vi.waitFor(() => expect(wrapper.text()).toContain('读取失败'))
    expect(scene.props('state')).toBe(initial)
    expect((importInput.element as HTMLInputElement).value).toBe('')
  })

  it('restores the original sample after local edits', async () => {
    const wrapper = mountStudio()
    const scene = wrapper.findComponent(PoolTableSceneStub)
    scene.vm.$emit('select-ball', 0)
    await nextTick()

    await wrapper.find('input[name="x"]').setValue('10')
    await wrapper.find('input[name="y"]').setValue('20')
    await wrapper.find('form').trigger('submit')
    await wrapper.find('.reset-state-button').trigger('click')

    expect(wrapper.text()).toContain('原始样例 · 只读来源')
    expect(wrapper.text()).toContain('STATE v1')
    expect(resetSceneView).toHaveBeenCalledOnce()
    expect(scene.props('selectedBallId')).toBeNull()
  })

  it('forwards view controls to the scene', async () => {
    const wrapper = mountStudio()
    const buttons = wrapper.findAll('.tool-button')
    await buttons[0]!.trigger('click')
    expect(setTopDownView).toHaveBeenLastCalledWith(true)
    await buttons[0]!.trigger('click')
    expect(setTopDownView).toHaveBeenLastCalledWith(false)
    await buttons[1]!.trigger('click')
    expect(resetSceneView).toHaveBeenCalledOnce()
  })
})
