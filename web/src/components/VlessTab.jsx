import { useEffect, useState } from 'react'

import api from '../api.js'

export default function VlessTab({ setStatus }) {
  const [vless, setVless] = useState('')
  const [current, setCurrent] = useState('')
  const [templates, setTemplates] = useState([])
  const [templateName, setTemplateName] = useState('')
  const [templatesLoading, setTemplatesLoading] = useState(false)

  const refresh = async () => {
    try {
      const cur = await api.get('/sb/api/vless')
      setCurrent(JSON.stringify(cur, null, 2))
    } catch (e) {
      setCurrent(`Error: ${e.message}`)
    }
  }

  const refreshTemplates = async () => {
    setTemplatesLoading(true)
    try {
      const data = await api.get('/sb/api/vless/templates')
      setTemplates(Array.isArray(data.templates) ? data.templates : [])
    } catch (e) {
      setStatus({ msg: `Templates load failed: ${e.message}`, ok: false })
    } finally {
      setTemplatesLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    refreshTemplates()
  }, [])

  const apply = async () => {
    if (!vless.trim()) return setStatus({ msg: 'Paste vless://… first', ok: false })
    try {
      setStatus({ msg: 'Applying VLESS + restarting…', ok: null })
      await api.put('/sb/api/vless', { vless: vless.trim() })
      setStatus({ msg: 'Applied VLESS OK', ok: true })
      await refresh()
      await refreshTemplates()
    } catch (e) {
      setStatus({ msg: `VLESS apply failed: ${e.message}`, ok: false })
    }
  }

  const saveTemplate = async () => {
    if (!vless.trim()) return setStatus({ msg: 'Paste vless://… first', ok: false })
    try {
      setStatus({ msg: 'Saving template…', ok: null })
      await api.post('/sb/api/vless/templates', { name: templateName, vless: vless.trim() })
      setStatus({ msg: 'Template saved', ok: true })
      setTemplateName('')
      await refreshTemplates()
    } catch (e) {
      setStatus({ msg: `Template save failed: ${e.message}`, ok: false })
    }
  }

  const applyTemplate = async (id, name) => {
    try {
      setStatus({ msg: `Applying template “${name}”…`, ok: null })
      await api.put('/sb/api/vless', { template_id: id })
      setStatus({ msg: `Applied ${name}`, ok: true })
      await refresh()
    } catch (e) {
      setStatus({ msg: `Template apply failed: ${e.message}`, ok: false })
    }
  }

  const deleteTemplate = async (id) => {
    try {
      await api.delete(`/sb/api/vless/templates/${encodeURIComponent(id)}`)
      setStatus({ msg: 'Template deleted', ok: true })
      await refreshTemplates()
    } catch (e) {
      setStatus({ msg: `Template delete failed: ${e.message}`, ok: false })
    }
  }

  const loadTemplate = async (id) => {
    try {
      const tpl = await api.get(`/sb/api/vless/templates/${encodeURIComponent(id)}`)
      setVless(tpl.vless || '')
      setTemplateName(tpl.name || '')
      setStatus({ msg: `Loaded ${tpl.name || 'template'}`, ok: true })
    } catch (e) {
      setStatus({ msg: `Template load failed: ${e.message}`, ok: false })
    }
  }

  return (
    <>
      <div className="split">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Paste VLESS</div>
              <div className="muted">Updates outbounds[tag=vpn] in /etc/sing-box/config.json</div>
            </div>
            <button className="btn primary" onClick={apply}>
              Apply & restart
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <textarea className="textarea" value={vless} onChange={(e) => setVless(e.target.value)} placeholder="vless://UUID@host:443?..." />
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <input
              className="input"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="template name (optional)"
            />
            <button className="btn primary" onClick={saveTemplate}>
              Save template
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700 }}>Current VPN outbound (tag=vpn)</div>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '10px 0 0 0', color: '#cfcfd6' }}>{current}</pre>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 700 }}>Saved VLESS templates</div>
        {templatesLoading ? (
          <div className="muted" style={{ marginTop: 10 }}>
            Loading…
          </div>
        ) : templates.length ? (
          <div className="templateList" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="row"
                style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{tpl.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {tpl.id}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn" onClick={() => loadTemplate(tpl.id)}>
                    Load into textarea
                  </button>
                  <button className="btn primary" onClick={() => applyTemplate(tpl.id, tpl.name)}>
                    Apply
                  </button>
                  <button className="btn danger" onClick={() => deleteTemplate(tpl.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 10 }}>
            No saved templates yet.
          </div>
        )}
      </div>
    </>
  )
}
