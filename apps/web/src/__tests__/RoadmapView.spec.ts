import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import roadmapSource from '@/data/roadmap.json'
import RoadmapView from '../views/RoadmapView.vue'

interface TestTask {
  status: string
}

interface TestMilestone {
  id: string
  tasks: TestTask[]
}

interface TestRoadmap {
  milestones: TestMilestone[]
}

const roadmap = roadmapSource as unknown as TestRoadmap

describe('RoadmapView', () => {
  it('renders all planned milestones and derives progress from task statuses', () => {
    const wrapper = mount(RoadmapView)
    const tasks = roadmap.milestones.flatMap((milestone) => milestone.tasks)
    const completed = tasks.filter((task) => task.status === 'done').length
    const expectedProgress = Math.round((completed / tasks.length) * 100)

    expect(wrapper.findAll('[data-test="milestone-card"]')).toHaveLength(9)
    expect(wrapper.get('[data-test="overall-progress"]').text()).toContain(expectedProgress + '%')
    expect(wrapper.get('[data-test="completed-count"]').text()).toContain(String(completed))
    expect(wrapper.text()).toContain('M1.9')
    expect(wrapper.text()).toContain('真实数据与几何标定验收')
  })

  it('expands a future milestone without changing its task status', async () => {
    const wrapper = mount(RoadmapView)
    const toggle = wrapper.get('[data-test="milestone-toggle-M2"]')

    expect(wrapper.text()).not.toContain('Pooltool 兼容性与 Python 版本')
    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain('Pooltool 兼容性与 Python 版本')
    expect(wrapper.text()).toContain('待开始')
  })


  it('keeps the header fixed and gives milestones and current focus separate scroll regions', () => {
    const wrapper = mount(RoadmapView)

    expect(wrapper.find('[data-layout-region="fixed-header"]').exists()).toBe(true)
    expect(wrapper.find('[data-layout-region="scroll-content"]').exists()).toBe(true)
    expect(wrapper.find('[data-scroll-region="milestones"]').exists()).toBe(true)
    expect(wrapper.find('[data-scroll-region="focus"]').exists()).toBe(true)
  })

  it('shows the M1 real-world acceptance gate separately from completed synthetic tasks', () => {
    const wrapper = mount(RoadmapView)
    const m1 = wrapper.get('#milestone-M1')

    expect(m1.text()).toContain('9 / 10')
    expect(m1.text()).toContain('待实测')
    expect(m1.text()).toContain('physical_calibration_verified 仍为 false')
  })
})
