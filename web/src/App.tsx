import { useCallback, useEffect, useState } from 'react'

import api from './api'
import RoutingTab from './components/RoutingTab'
import Tabs, { type AppTab } from './components/Tabs'
import TopBar from './components/TopBar'
import VlessTab from './components/VlessTab'
import { StatusDot } from './shadowlos'
import type { StatusState, VpnState } from './types'
import { cleanError } from './utils'

function statusKind(status: StatusState): 'ok' | 'bad' | 'busy' | null {
  if (status.kind) return status.kind
  if (status.ok === true) return 'ok'
  if (status.ok === false) return 'bad'
  return 'busy'
}

export default function App() {
  const [tab, setTab] = useState<AppTab>('routing')
  const [status, setStatus] = useState<StatusState>({ msg: 'Загружаем…', ok: null })
  const [vpn, setVpn] = useState<VpnState>({ enabled: false, policy: 'domains', active: null, status: null })

  const refreshVpn = useCallback(async () => {
    try {
      const r = await api.get<Partial<VpnState> & { policy?: string }>('/sb/api/vpn')
      setVpn({
        enabled: !!r.enabled,
        policy: r.policy === 'all' ? 'all' : 'domains',
        active: typeof r.active === 'boolean' ? r.active : null,
        status: r.status ?? null,
      })
    } catch (e) {
      setStatus({ msg: `Статус VPN не загружен: ${cleanError(e)}`, ok: false })
    }
  }, [])

  useEffect(() => {
    refreshVpn()
    const timer = window.setInterval(refreshVpn, 5000)
    return () => window.clearInterval(timer)
  }, [refreshVpn])

  const updateVpn = async (next: Partial<VpnState>) => {
    const payload = {
      enabled: next.enabled ?? vpn.enabled,
      policy: next.policy ?? vpn.policy,
    }

    try {
      setStatus({ msg: 'Применяем настройки VPN…', ok: null })
      const r = await api.put<Partial<VpnState> & { policy?: string }>('/sb/api/vpn', payload)
      const updated = {
        enabled: !!r.enabled,
        policy: r.policy === 'all' ? 'all' as const : 'domains' as const,
        active: typeof r.active === 'boolean' ? r.active : null,
        status: r.status ?? null,
      }
      setVpn(updated)
      setStatus({
        msg: `VPN ${updated.enabled ? 'включён' : 'выключен'} · ${updated.policy === 'all' ? 'весь трафик' : 'только домены'}`,
        ok: true,
      })
    } catch (e) {
      setStatus({ msg: `VPN не применён: ${cleanError(e)}`, ok: false })
      await refreshVpn()
    }
  }

  return (
    <div className="app">
      <TopBar vpn={vpn} onVpnChange={updateVpn} setStatus={setStatus} />
      <Tabs tab={tab} setTab={setTab} />

      <main className="main">
        <div className="wrap">
          {tab === 'routing' && <RoutingTab vpn={vpn} onVpnChange={updateVpn} setStatus={setStatus} />}
          {tab === 'vless' && <VlessTab setStatus={setStatus} />}
        </div>
      </main>

      <div className="actionbar">
        <div className="wrap actionbar-inner">
          <div className={`status ${statusKind(status) || ''}`}>
            <StatusDot kind={statusKind(status)} />
            {status.msg}
          </div>
        </div>
      </div>
    </div>
  )
}
