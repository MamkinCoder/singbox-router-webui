import { useMemo, useState } from 'react'

export default function GroupCard({ group, onChange, onDelete }) {
  const enabled = group.enabled !== false

  const [addDomain, setAddDomain] = useState('')
  const [editingId, setEditingId] = useState(false)
  const [idDraft, setIdDraft] = useState(group.id || '')

  const domainsSorted = useMemo(() => {
    return [...(group.domains || [])].slice().sort()
  }, [group.domains])

  const toggleEnabled = () => onChange({ ...group, enabled: !enabled })

  const normalizeDomain = (value) => {
    const next = String(value || '').trim().toLowerCase().replace(/^\.+/, '').replace(/\.$/, '')
    return next ? next : null
  }

  const add = () => {
    const values = (addDomain || '')
      .split(/\s+/)
      .map(normalizeDomain)
      .filter(Boolean)
    if (!values.length) return
    const next = new Set([...(group.domains || []), ...values])
    onChange({ ...group, domains: Array.from(next) })
    setAddDomain('')
  }

  const remove = (d) => onChange({ ...group, domains: (group.domains || []).filter((x) => x !== d) })

  const startEditId = (e) => {
    e.stopPropagation()
    setIdDraft(group.id || '')
    setEditingId(true)
  }

  const commitId = () => {
    const v = String(idDraft || '').trim()
    if (v && v !== group.id) onChange({ ...group, id: v })
    setEditingId(false)
  }

  return (
    <div className={`groupCard ${enabled ? '' : 'disabled'}`}>
      {/* Header click toggles enabled/disabled */}
      <div className="groupHeader" onClick={toggleEnabled} title="Click to enable/disable group">
        {!editingId ? (
          <>
            <div className="groupTitle">{group.id}</div>
            <span className="pill">{(group.domains || []).length} domains</span>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                className="iconBtn"
                onClick={startEditId}
                title="Edit group id"
              >
                ✎
              </button>
              <button
                className="btn danger"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                Delete
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              className="input"
              value={idDraft}
              onChange={(e) => setIdDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitId()
                if (e.key === 'Escape') setEditingId(false)
              }}
              autoFocus
            />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                className="btn primary"
                onClick={(e) => {
                  e.stopPropagation()
                  commitId()
                }}
              >
                Save
              </button>
              <button
                className="btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingId(false)
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>


      <div className="groupBody">
        <div className="row">
          <input
            className="input"
            value={addDomain}
            placeholder="add domain_suffix (example: chatgpt.com). space/newline separated values ok"
            onChange={(e) => setAddDomain(e.target.value)}
          />
          <button className="btn primary" onClick={add}>
            Add
          </button>
        </div>

        <div className="domainsList">
          {domainsSorted.map((d) => (
            <div className="chip" key={d}>
              <code>{d}</code>
              <span className="chipX" onClick={() => remove(d)} title="Delete">
                ✕
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
