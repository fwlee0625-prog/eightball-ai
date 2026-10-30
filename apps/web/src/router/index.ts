import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'table-studio',
      component: () => import('@/views/TableStudioView.vue'),
    },
    {
      path: '/roadmap',
      name: 'roadmap',
      component: () => import('@/views/RoadmapView.vue'),
    },
  ],
})

export default router
