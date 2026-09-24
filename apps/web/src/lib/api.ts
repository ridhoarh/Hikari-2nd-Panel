export type ApiResult<T> = {
  ok: boolean
  status: number
  data: T | null
  error: string | null
}

export type ApiClient = {
  get: <T>(path: string) => Promise<ApiResult<T>>
  post: <T>(path: string, body?: unknown) => Promise<ApiResult<T>>
  patch: <T>(path: string, body?: unknown) => Promise<ApiResult<T>>
  del: <T>(path: string) => Promise<ApiResult<T>>
}

export function createApiClient(fetchImpl: typeof fetch = fetch): ApiClient {
  async function request<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
    const url = path.startsWith('/api') ? path : `/api${path}`
    try {
      const res = await fetchImpl(url, {
        ...init,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      })

      const text = await res.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }

      if (!res.ok) {
        const message =
          data && typeof data === 'object' && 'error' in data
            ? String((data as { error: unknown }).error)
            : `Server bales ${res.status}`
        return { ok: false, status: res.status, data: null, error: message }
      }

      return { ok: true, status: res.status, data: data as T, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nggak bisa nyambung ke server'
      return { ok: false, status: 0, data: null, error: message }
    }
  }

  return {
    get: (path) => request(path, { method: 'GET' }),
    post: (path, body) =>
      request(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
    patch: (path, body) =>
      request(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
    del: (path) => request(path, { method: 'DELETE' }),
  }
}

export const api = createApiClient()
