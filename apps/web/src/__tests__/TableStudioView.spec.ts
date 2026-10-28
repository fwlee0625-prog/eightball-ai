import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import TableStudioView from '../views/TableStudioView.vue'
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
