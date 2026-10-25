import { buildQuery, unwrap, ApiError } from './api'

describe('api client', () => {
  it('drops empty params and joins arrays', () => {
    expect(buildQuery({ season: '2024-25', team_id: null, ids: [1, 2], q: '' })).toBe('?season=2024-25&ids=1%2C2')
    expect(buildQuery()).toBe('')
  })
  it('unwraps the envelope and throws ApiError on failure', async () => {
    const good = new Response(JSON.stringify({ success: true, data: [1], error: null, meta: { n: 1 } }), { status: 200 })
    await expect(unwrap(good)).resolves.toMatchObject({ data: [1], meta: { n: 1 } })
    const bad = () => new Response(JSON.stringify({ success: false, data: null, error: 'nope', meta: {} }), { status: 422 })
    await expect(unwrap(bad())).rejects.toBeInstanceOf(ApiError)
    await expect(unwrap(bad())).rejects.toThrow('nope')
  })
})

describe('apiSend', () => {
  it('sends JSON bodies with the given method and unwraps the envelope', async () => {
    const { apiSend } = await import('./api')
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({ success: true, data: { ok: 1 }, error: null, meta: {} }), { status: 200 })
    }) as typeof fetch
    try {
      const res = await apiSend<{ ok: number }>('PATCH', '/api/analytics/x', { a: 1 })
      expect(res.data.ok).toBe(1)
      expect(calls[0].init?.method).toBe('PATCH')
      expect(calls[0].init?.body).toBe('{"a":1}')
      await apiSend('DELETE', '/api/analytics/x')
      expect(calls[1].init?.body).toBeUndefined()
    } finally {
      globalThis.fetch = original
    }
  })
})
