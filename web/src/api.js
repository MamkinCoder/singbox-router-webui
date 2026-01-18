const api = {
  async get(url) {
    const r = await fetch(url)
    const text = await r.text()
    let data
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!r.ok) {
      const msg = (data && typeof data === 'object' && data.error)
        ? `${data.error}${data.details?.length ? `: ${data.details.join('; ')}` : ''}`
        : (typeof data === 'string' ? data : 'Request failed')
      throw new Error(msg)
    }
    return data
  },
  async put(url, body) {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await r.text()
    let data
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!r.ok) {
      const msg = (data && typeof data === 'object' && data.error)
        ? `${data.error}${data.details?.length ? `: ${data.details.join('; ')}` : ''}`
        : (typeof data === 'string' ? data : 'Request failed')
      throw new Error(msg)
    }
    return data
  },
}

export default api
