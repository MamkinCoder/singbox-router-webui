import { useEffect, useState } from 'react'

import api from '../api.js'

export default function VlessTab({ setStatus }) {
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
