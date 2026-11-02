<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { requestApiHealth } from '@/utils/apiHealth'

const status = ref<'loading' | 'connected' | 'error'>('loading')
const message = ref('正在检查 API 连接。')
let active: AbortController | null = null
let timeout: ReturnType<typeof setTimeout> | undefined
let disposed = false

async function checkConnection() {
  active?.abort()
  clearTimeout(timeout)
  const controller = new AbortController()
  active = controller
  status.value = 'loading'
  message.value = '正在检查 API 连接。'
  timeout = setTimeout(() => controller.abort(), 3000)
  try {
    const health = await requestApiHealth(
      import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000', controller.signal,
    )
    if (disposed || active !== controller) return
    status.value = 'connected'
    message.value = 'API v' + health.version + ' 已连接；物理与规划功能尚未接入。'
  } catch (error) {
    if (disposed || active !== controller) return
    status.value = 'error'
    message.value = controller.signal.aborted
      ? 'API 连接超时，请确认服务已启动后重试。'
      : error instanceof TypeError
        ? '无法连接 API，请确认服务已启动并检查网络与跨域配置。'
        : error instanceof Error ? error.message : 'API 无法连接，请确认服务已启动。'
  } finally {
    if (active === controller) clearTimeout(timeout)
  }
}

onMounted(checkConnection)
onBeforeUnmount(() => {
  disposed = true
  active?.abort()
  clearTimeout(timeout)
})
</script>

<template>
  <div class="api-health" :class="'api-health--' + status">
    <span role="status" aria-live="polite" :title="message">
      {{ status === 'loading' ? 'API 连接中' : status === 'connected' ? 'API 已连接' : 'API 未连接' }}
    </span>
    <button v-if="status === 'error'" type="button" @click="checkConnection">重试连接</button>
    <small v-if="status === 'error'">{{ message }}</small>
  </div>
</template>

<style scoped>
.api-health { max-width: 300px; color: #a7f0c6; font-size: 12px; }
.api-health--loading { color: #b0bcb5; }
.api-health--error { color: #ffb4a8; }
.api-health button { margin-left: 8px; padding: 4px 8px; border: 1px solid currentColor; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
.api-health small { display: block; margin-top: 4px; line-height: 1.5; }
</style>
