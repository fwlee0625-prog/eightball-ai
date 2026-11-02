import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import TableTopDownEditor from '../components/TableTopDownEditor.vue'
import { createInitialTableState } from '../data/initialTableState'
import type { TableState } from '../types/tableState'

function makeState(): TableState {
  const state = createInitialTableState()
  state.balls = [
    { id: 0, x_mm: 0, y_mm: 0 },
    { id: 1, x_mm: 635, y_mm: 1270 },
  ]
  return state
}

function mountEditor() {
  return mount(TableTopDownEditor, {
    props: { state: makeState(), selectedBallId: null },
  })
}

function setSvgRect(wrapper: ReturnType<typeof mountEditor>) {
  const svg = wrapper.get('svg').element as SVGSVGElement
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 254, bottom: 508,
    width: 254, height: 508, toJSON: () => ({}),
  } as DOMRect)
  return svg
}

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  values: { button?: number; pointerId?: number; clientX: number; clientY: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { configurable: true, value })
  }
  target.dispatchEvent(event)
}

describe('TableTopDownEditor', () => {
  it('maps the origin and table boundaries to the normalized top-down board', () => {
    const wrapper = mountEditor()
    const center = wrapper.get('[data-ball-id="0"] circle')
    const boundary = wrapper.get('[data-ball-id="1"] circle')
    expect(center.attributes('cx')).toBe('127')
    expect(center.attributes('cy')).toBe('254')
    expect(boundary.attributes('cx')).toBe('244')
    expect(boundary.attributes('cy')).toBe('498')
    expect(wrapper.text()).toContain('坐标方向与 GLB 台面尚未完成标定')
  })

  it('selects a ball when a pointer click finishes without dragging', async () => {
    const wrapper = mountEditor()
    setSvgRect(wrapper)
    const ball = wrapper.get('[data-ball-id="0"]')
    dispatchPointer(ball.element, 'pointerdown', {
      button: 0, pointerId: 1, clientX: 127, clientY: 254,
    })
    dispatchPointer(wrapper.get('svg').element, 'pointerup', {
      pointerId: 1, clientX: 127, clientY: 254,
    })
    expect(wrapper.emitted('select-ball')).toEqual([[0]])
    expect(wrapper.emitted('move-ball')).toBeUndefined()
  })

  it('emits one clamped coordinate update after a drag', async () => {
    const wrapper = mountEditor()
    setSvgRect(wrapper)
    dispatchPointer(wrapper.get('[data-ball-id="0"]').element, 'pointerdown', {
      button: 0, pointerId: 1, clientX: 127, clientY: 254,
    })
    dispatchPointer(wrapper.get('svg').element, 'pointermove', {
      pointerId: 1, clientX: 300, clientY: 600,
    })
    dispatchPointer(wrapper.get('svg').element, 'pointerup', {
      pointerId: 1, clientX: 300, clientY: 600,
    })
    expect(wrapper.emitted('select-ball')).toEqual([[0]])
    expect(wrapper.emitted('move-ball')).toEqual([[0, 635, 1270]])
  })

  it('uses arrow keys for 10 mm steps and Shift plus arrows for 1 mm steps', async () => {
    const wrapper = mountEditor()
    const ball = wrapper.get('[data-ball-id="0"]')
    await ball.trigger('keydown', { key: 'ArrowRight' })
    await ball.trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expect(wrapper.emitted('move-ball')).toEqual([[0, 10, 0], [0, 0, -1]])
    expect(wrapper.emitted('select-ball')).toEqual([[0], [0]])
  })

  it('does not move a ball beyond the active table boundary', async () => {
    const wrapper = mountEditor()
    await wrapper.get('[data-ball-id="1"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('select-ball')).toEqual([[1]])
    expect(wrapper.emitted('move-ball')).toBeUndefined()
  })

  it('selects a focused target with Enter or Space', async () => {
    const wrapper = mountEditor()
    const ball = wrapper.get('[data-ball-id="0"]')
    await ball.trigger('keydown', { key: 'Enter' })
    await ball.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('select-ball')).toEqual([[0], [0]])
  })
})
