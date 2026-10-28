import { defineComponent, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import TableStudioView from '../views/TableStudioView.vue'

const PoolTableSceneStub = defineComponent({
  name: 'PoolTableScene',
  props: {
    state: { type: Object, required: true },
    selectedBallId: { type: Number, default: null },
    showIds: { type: Boolean, default: true },
  },
  emits: ['select-ball', 'model-status'],
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
  })
})
