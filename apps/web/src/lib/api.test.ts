import { describe, expect, test, mock } from 'bun:test'
import { createApiClient } from './api'

describe('createApiClient', () => {
  test('GET balikin data kalau sukses', async () => {
    const fakeFetch = mock(async () =>
      new Response(JSON.stringify({ projects: [] }), { status: 200 })
    )
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    const result = await api.get('/projects')
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ projects: [] })
  })

  test('balikin error pesan dari server', async () => {
    const fakeFetch = mock(async () =>
      new Response(JSON.stringify({ error: 'Project nggak ketemu' }), { status: 404 })
    )
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    const result = await api.get('/projects/hantu')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Project nggak ketemu')
    expect(result.status).toBe(404)
  })

  test('nggak error kalau body bukan JSON', async () => {
    const fakeFetch = mock(async () => new Response('', { status: 500 }))
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    const result = await api.get('/apa-saja')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
  })

  test('POST ngirim body JSON', async () => {
    let terkirim = ''
    const fakeFetch = mock(async (_url: string, init?: RequestInit) => {
      terkirim = init?.body as string
      return new Response('{}', { status: 200 })
    })
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    await api.post('/projects', { name: 'Blog' })
    expect(JSON.parse(terkirim)).toEqual({ name: 'Blog' })
  })

  test('selalu pakai credentials include', async () => {
    let init: RequestInit | undefined
    const fakeFetch = mock(async (_url: string, i?: RequestInit) => {
      init = i
      return new Response('{}', { status: 200 })
    })
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    await api.get('/projects')
    expect(init?.credentials).toBe('include')
  })

  test('nangkep error jaringan', async () => {
    const fakeFetch = mock(async () => {
      throw new Error('offline')
    })
    const api = createApiClient(fakeFetch as unknown as typeof fetch)
    const result = await api.get('/projects')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
  })
})
