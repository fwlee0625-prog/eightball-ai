import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestApiHealth } from '../utils/apiHealth'
import { isHealthResponse } from '../../../../packages/contracts/src/health'

const health = { status: 'ok', service: 'eightball-api', version: '0.1.0' }
const signal = new AbortController().signal

afterEach(() => vi.unstubAllGlobals())

describe('API health contract', () => {
  it('fetches the real health route without credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(health)))
    vi.stubGlobal('fetch', fetcher)
    expect(await requestApiHealth('http://localhost:8000', signal)).toEqual(health)
    expect(fetcher).toHaveBeenCalledWith(new URL('http://localhost:8000/health'), {
      signal, credentials: 'omit',
    })
  })

  it.each([null, [], {}, { ...health, status: 'bad' }, { ...health, version: 'unknown' },
    { ...health, extra: true }])('rejects an incompatible response %j', async (value) => {
    expect(isHealthResponse(value)).toBe(false)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value))))
    await expect(requestApiHealth('http://localhost:8000', signal)).rejects.toThrow('契约不兼容')
  })

  it.each(['', 'invalid', 'ftp://localhost', 'http://user:pass@localhost',
    'http://localhost/path', 'http://localhost?x=1'])('rejects invalid API configuration %s', async (url) => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    await expect(requestApiHealth(url, signal)).rejects.toThrow('API 地址配置无效')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports HTTP failures', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })))
    await expect(requestApiHealth('http://localhost:8000', signal)).rejects.toThrow('HTTP 503')
  })

  it('rejects malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('not-json')))
    await expect(requestApiHealth('http://localhost:8000', signal)).rejects.toThrow(SyntaxError)
  })
})
