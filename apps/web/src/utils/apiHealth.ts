import { isHealthResponse, type HealthResponse } from '../../../../packages/contracts/src/health'

export async function requestApiHealth(baseUrl: string, signal: AbortSignal): Promise<HealthResponse> {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    throw new Error('API 地址配置无效，请检查 VITE_API_BASE_URL。')
  }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
    base.search || base.hash || base.pathname !== '/' || base.hostname.includes('*')) {
    throw new Error('API 地址配置无效，请使用不含路径或凭据的 HTTP(S) 地址。')
  }
  const response = await fetch(new URL('/health', base), { signal, credentials: 'omit' })
  if (!response.ok) throw new Error('健康检查失败（HTTP ' + response.status + '）。')
  const payload: unknown = await response.json()
  if (!isHealthResponse(payload)) throw new Error('API 健康响应与当前契约不兼容。')
  return payload
}
