import { useEffect, useState } from 'react'

import api from '../api.js'

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

export default function VpnCradles({ setStatus }) {
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
    <div className="vpnControls">
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

      <span className="pill" title="sing-box routing mode">
        {state.mode === 'vpn'
          ? 'vpn'
          : state.mode === 'direct'
            ? 'direct'
            : state.active === false
              ? 'down'
              : '?'}
      </span>
    </div>
  )
}
