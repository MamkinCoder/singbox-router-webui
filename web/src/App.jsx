import { useEffect, useMemo, useState } from 'react'

import GroupCard from './components/GroupCard.jsx'

const api = {
  async get(url) {
    const r = await fetch(url)
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  },
  async put(url, body) {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  },
}

function Status({ status }) {
  const cls = status?.ok === true ? 'status ok' : status?.ok === false ? 'status bad' : 'status'
  return <div className={cls}>{status?.msg ?? '…'}</div>
}

function Tabs({ tab, setTab }) {
  const mk = (id, label) => (
    <button className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
      {label}
    </button>
  )
  return (
    <div className="tabs">
      {mk('domains', 'Domains')}
      {mk('vless', 'VLESS')}
      {mk('clients', 'Clients (TODO)')}
    </div>
  )
}

function DomainsTab({ setStatus }) {
  const [ui, setUi] = useState(null)

  useEffect(() => {
    ; (async () => {
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


function VlessTab({ setStatus }) {
  const [vless, setVless] = useState('')
  const [current, setCurrent] = useState('')

  const refresh = async () => {
    try {
      const cur = await api.get('/sb/api/vless')
      setCurrent(JSON.stringify(cur, null, 2))
    } catch (e) {
      setCurrent(`Error: ${e.message}`)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const apply = async () => {
    if (!vless.trim()) return setStatus({ msg: 'Paste vless://… first', ok: false })
    try {
      setStatus({ msg: 'Applying VLESS + restarting…', ok: null })
      await api.put('/sb/api/vless', { vless: vless.trim() })
      setStatus({ msg: 'Applied VLESS OK', ok: true })
      await refresh()
    } catch (e) {
      setStatus({ msg: `VLESS apply failed: ${e.message}`, ok: false })
    }
  }

  return (
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
      </div>

      <div className="card">
        <div style={{ fontWeight: 700 }}>Current VPN outbound (tag=vpn)</div>
        <pre style={{ whiteSpace: 'pre-wrap', margin: '10px 0 0 0', color: '#cfcfd6' }}>{current}</pre>
      </div>
    </div>
  )
}

function ClientsTab() {
  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>Clients (TODO)</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Still TODO: detect DHCP clients + enforce “force all traffic through VPN”.
      </div>
    </div>
  )
}

function Cradle({ on, setOn, label, disabled = false, title }) {
  return (
    <div className="switchRow" title={title}>
      <div
        className={`switch ${on ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => { if (!disabled) setOn(!on) }}
        role="switch"
        aria-checked={on}
      >
        <div className="knob" />
      </div>
      <div className="switchLabel">{label}</div>
    </div>
  )
}

function VpnCradles({ setStatus }) {
  const [state, setState] = useState({ enabled: false, policy: 'domains', active: null, status: null })

  const refresh = async () => {
    try {
      const r = await api.get('/sb/api/vpn')
      setState({
        enabled: !!r.enabled,
        policy: r.policy === 'all' ? 'all' : 'domains',
        active: !!r.active,
        status: r.status ?? null,
      })
    } catch (e) {
      // keep current UI but show error
      setStatus({ msg: `VPN status fetch failed: ${e.message}`, ok: false })
    }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [])

  const push = async (next) => {
    try {
      setStatus({ msg: 'Applying VPN settings…', ok: null })
      const r = await api.put('/sb/api/vpn', next)
      setState({
        enabled: !!r.enabled,
        policy: r.policy === 'all' ? 'all' : 'domains',
        active: !!r.active,
        status: r.status ?? null,
      })
      setStatus({
        msg: `VPN ${r.enabled ? 'ON' : 'OFF'} • policy=${r.policy} • service=${r.status || (r.active ? 'active' : 'inactive')}`,
        ok: true,
      })
    } catch (e) {
      setStatus({ msg: `VPN apply failed: ${e.message}`, ok: false })
      await refresh()
    }
  }

  const vpnEnabled = state.enabled
  const allTraffic = state.policy === 'all'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <Cradle
        on={vpnEnabled}
        setOn={(v) => push({ enabled: v, policy: state.policy })}
        label={vpnEnabled ? 'VPN enabled' : 'VPN disabled'}
        title="OFF = direct mode (safe). ON = VPN routing active."
      />

      <Cradle
        on={allTraffic}
        setOn={(v) => push({ enabled: true, policy: v ? 'all' : 'domains' })}
        label={allTraffic ? 'All traffic' : 'Domains only'}
        disabled={!vpnEnabled}
        title="When ON, everything goes through VPN (LAN still stays direct)."
      />

      <span className="pill" title="sing-box service">
        {state.status || (state.active ? 'active' : 'inactive')}
      </span>
    </div>
  )
}



export default function App() {
  const [tab, setTab] = useState('domains')
  const [status, setStatus] = useState({ msg: '…', ok: null })

  return (
    <>
      <header className="header">
        <h1 className="title">Sing-box WebUI</h1>
        <Tabs tab={tab} setTab={setTab} />
        <VpnCradles setStatus={setStatus} />
        <Status status={status} />
      </header>

      <main className="main">
        {tab === 'domains' && <DomainsTab setStatus={setStatus} />}
        {tab === 'vless' && <VlessTab setStatus={setStatus} />}
        {tab === 'clients' && <ClientsTab />}
      </main>
    </>
  )
}
