import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'table-studio',
      component: () => import('@/views/TableStudioView.vue'),
    },
  ],
})

export default router
