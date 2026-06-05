import { useEffect, useState } from 'react'

import api from '../api.js'
import { cleanError } from '../utils.js'

export default function VlessTab({ setStatus }) {
  const [link, setLink] = useState('')
  const [current, setCurrent] = useState('')
  const [templates, setTemplates] = useState([])
  const [templateName, setTemplateName] = useState('')
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const refresh = async () => {
    try {
      const cur = await api.get('/sb/api/vless')
      setCurrent(JSON.stringify(cur, null, 2))
    } catch (e) {
      const message = cleanError(e)
      setCurrent(`Error: ${message}`)
      setStatus({ msg: `Current VPN outbound load failed: ${message}`, ok: false })
    }
  }

  const refreshTemplates = async () => {
    setTemplatesLoading(true)
    try {
      const data = await api.get('/sb/api/vless/templates')
      setTemplates(Array.isArray(data.templates) ? data.templates : [])
    } catch (e) {
      setStatus({ msg: `Templates load failed: ${cleanError(e)}`, ok: false })
    } finally {
      setTemplatesLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    refreshTemplates()
  }, [])

  const loadFile = async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      setLink(text)
      setStatus({ msg: `Loaded ${file.name}`, ok: true })
    } catch (e) {
      setStatus({ msg: `File load failed: ${cleanError(e)}`, ok: false })
    }
  }

  const apply = async () => {
    if (!link.trim()) return setStatus({ msg: 'Paste VPN link or outbound JSON first', ok: false })
    try {
      setStatus({ msg: 'Applying VPN link + restarting…', ok: null })
      await api.put('/sb/api/vless', { link: link.trim() })
      setStatus({ msg: 'Applied VPN link OK', ok: true })
      await refresh()
      await refreshTemplates()
    } catch (e) {
      setStatus({ msg: `VPN apply failed: ${cleanError(e)}`, ok: false })
    }
  }

  const saveTemplate = async () => {
    if (!link.trim()) return setStatus({ msg: 'Paste VPN link or outbound JSON first', ok: false })
    try {
      setStatus({ msg: 'Saving template…', ok: null })
      await api.post('/sb/api/vless/templates', { name: templateName, link: link.trim() })
      setStatus({ msg: 'Template saved', ok: true })
      setTemplateName('')
      await refreshTemplates()
    } catch (e) {
      setStatus({ msg: `Template save failed: ${cleanError(e)}`, ok: false })
    }
  }

  const applyTemplate = async (id, name) => {
    try {
      setStatus({ msg: `Applying template “${name}”…`, ok: null })
      await api.put('/sb/api/vless', { template_id: id })
      setStatus({ msg: `Applied ${name}`, ok: true })
      await refresh()
    } catch (e) {
      setStatus({ msg: `Template apply failed: ${cleanError(e)}`, ok: false })
    }
  }

  const deleteTemplate = async (id) => {
    try {
      await api.delete(`/sb/api/vless/templates/${encodeURIComponent(id)}`)
      setStatus({ msg: 'Template deleted', ok: true })
      await refreshTemplates()
    } catch (e) {
      setStatus({ msg: `Template delete failed: ${cleanError(e)}`, ok: false })
    }
  }

  const loadTemplate = async (id) => {
    try {
      const tpl = await api.get(`/sb/api/vless/templates/${encodeURIComponent(id)}`)
      setLink(tpl.link || tpl.vless || '')
      setTemplateName(tpl.name || '')
      setStatus({ msg: `Loaded ${tpl.name || 'template'}`, ok: true })
    } catch (e) {
      setStatus({ msg: `Template load failed: ${cleanError(e)}`, ok: false })
    }
  }

  return (
    <>
      <div className="split">
        <div className="card">
          <div className="legacyRowBlock">
            <div>
              <div className="legacyRowBlockTitle">Paste VPN Link Or JSON</div>
              <div className="legacyRowBlockSubtitle">Updates outbounds[tag=vpn] in /etc/sing-box/config.json</div>
            </div>
            <button className="btn primary" onClick={apply}>
              Apply & restart
            </button>
        </div>
        <div className="legacyRowBlock legacyRowBlockColumn">
          <label
            className="legacyRowBlockSubtitle"
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer?.files?.[0]
              if (file) loadFile(file)
            }}
            style={{
              display: 'block',
              marginBottom: 8,
              padding: '10px 12px',
              border: `1px dashed ${dragOver ? '#8fd3ff' : '#4b5563'}`,
              borderRadius: 10,
            }}
          >
            Drop `.conf` / `.json` file here or{' '}
            <input
              type="file"
              accept=".conf,.json,.txt"
              onChange={(e) => loadFile(e.target.files?.[0])}
              style={{ display: 'inline-block' }}
            />
          </label>
          <textarea
            className="textarea legacyRowBlockInputs"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={'vless://..., tuic://..., AmneziaWG .conf, or {"type":"hysteria2",...}'}
          />
        </div>
        <div className="legacyRowBlock">
          <input
              className="input legacyRowBlockInputs"
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
        <div className="legacyRowBlockTitle" style={{ marginBottom: 6 }}>Saved VPN templates</div>
        {templatesLoading ? (
          <div className="muted" style={{ marginTop: 10 }}>
            Loading…
          </div>
        ) : templates.length ? (
          <div className="templateList" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="legacyRowBlock"
              >
                <div>
                  <div className="legacyRowBlockTitle">{tpl.name}</div>
                  <div className="legacyRowBlockSubtitle">
                    {tpl.id}
                  </div>
                </div>
                <div className="legacyRowBlockActions">
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
