import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import App from '../App.vue'

describe('App', () => {
  it('provides the application router outlet', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: {
            template: '<main data-test="router-outlet" />',
          },
        },
      },
    })

    expect(wrapper.find('[data-test="router-outlet"]').exists()).toBe(true)
  })
})
