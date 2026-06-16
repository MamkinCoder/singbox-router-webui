export type ApiErrorBody = {
  error?: string
  details?: string[]
}

function messageFromResponse(data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const body = data as ApiErrorBody
    return `${body.error}${body.details?.length ? `: ${body.details.join('; ')}` : ''}`
  }
  if (typeof data === 'string') return data
  return 'Request failed'
}

async function request<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(url, opts)
  const text = await r.text()
  let data: unknown

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!r.ok) throw new Error(messageFromResponse(data))
  return data as T
}

const api = {
  get<T = unknown>(url: string) {
    return request<T>(url, { method: 'GET' })
  },
  put<T = unknown>(url: string, body: unknown) {
    return request<T>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },
  post<T = unknown>(url: string, body: unknown) {
    return request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },
  delete<T = unknown>(url: string) {
    return request<T>(url, { method: 'DELETE' })
  },
}

export default api
