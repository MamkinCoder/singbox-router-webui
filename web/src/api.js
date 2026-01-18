function messageFromResponse(data) {
  if (data && typeof data === 'object' && data.error) {
    return `${data.error}${data.details?.length ? `: ${data.details.join('; ')}` : ''}`
  }
  if (typeof data === 'string') return data
  return 'Request failed'
}

async function request(url, opts = {}) {
  const r = await fetch(url, opts)
  const text = await r.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!r.ok) throw new Error(messageFromResponse(data))
  return data
}

const api = {
  get(url) {
    return request(url, { method: 'GET' })
  },
  put(url, body) {
    return request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },
  post(url, body) {
    return request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },
  delete(url) {
    return request(url, { method: 'DELETE' })
  },
}

export default api
