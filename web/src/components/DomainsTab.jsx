import { useEffect, useMemo, useState } from 'react'

import GroupCard from './GroupCard.jsx'
import api from '../api.js'

export default function DomainsTab({ setStatus }) {
  const [ui, setUi] = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        setStatus({ msg: 'Loading domains…', ok: null })
        const data = await api.get('/sb/api/domains')
        setUi(data)
        setStatus({ msg: 'Ready', ok: true })
      } catch (e) {
        setStatus({ msg: `Domains load failed: ${e.message}`, ok: false })
      }
    })()
  }, [setStatus])

  const counts = useMemo(() => {
    if (!ui) return { total: 0, enabled: 0 }
    let total = 0,
      enabled = 0
    for (const g of ui.groups || []) {
      const n = (g.domains || []).length
      total += n
      if (g.enabled !== false) enabled += n
    }
    return { total, enabled }
  }, [ui])

  const addGroup = () => {
    setUi((prev) => ({
      ...prev,
      version: 1,
      groups: [...(prev?.groups || []), { id: 'new-group', name: 'New group', enabled: true, domains: [] }],
    }))
  }

  const save = async () => {
    try {
      setStatus({ msg: 'Saving + restarting sing-box…', ok: null })
      const payload = { version: 1, groups: Array.isArray(ui?.groups) ? ui.groups : [] }
      const resp = await api.put('/sb/api/domains', payload)
      setStatus({ msg: `Saved. Flat count: ${resp.flat_count}`, ok: true })
    } catch (e) {
      setStatus({ msg: `Save failed: ${e.message}`, ok: false })
    }
  }

  if (!ui) return null

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={addGroup}>
          + Add group
        </button>
        <button className="btn primary" onClick={save}>
          Save & restart
        </button>
        <span className="muted">
          enabled domains: {counts.enabled} / total: {counts.total}
        </span>
      </div>

      <div className="groupsGrid">
        {(ui.groups || []).map((g, idx) => (
          <GroupCard
            key={g.id + ':' + idx}
            group={g}
            onChange={(next) =>
              setUi((prev) => {
                const groups = [...(prev.groups || [])]
                groups[idx] = next
                return { ...prev, groups }
              })
            }
            onDelete={() =>
              setUi((prev) => {
                const groups = [...(prev.groups || [])]
                groups.splice(idx, 1)
                return { ...prev, groups }
              })
            }
          />
        ))}
      </div>
    </>
  )
}
