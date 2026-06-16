import { useEffect, useMemo, useRef, useState } from 'react'

import api from '../api'
import { Button, Flag, Ic, Logo, REGIONS, type Region } from '../shadowlos'
import type { SetStatus, VlessTemplate, VpnState } from '../types'
import { cleanError } from '../utils'

type TopBarProps = {
  vpn: VpnState
  onVpnChange: (next: Partial<VpnState>) => Promise<void>
  setStatus: SetStatus
}

function templateRegion(tpl: VlessTemplate): Region {
  const lower = `${tpl.name} ${tpl.id}`.toLowerCase()
  const flag = lower.includes('fi') || lower.includes('fin') ? 'fi' : lower.includes('de') ? 'de' : lower.includes('nl') ? 'nl' : 'auto'
  return {
    id: tpl.id,
    flag,
    name: tpl.name || tpl.id,
    meta: 'Сохранённый VLESS',
    ping: 'saved',
  }
}

export default function TopBar({ vpn, onVpnChange, setStatus }: TopBarProps) {
  const [open, setOpen] = useState(false)
  const [regions, setRegions] = useState<Region[]>(REGIONS)
  const [region, setRegion] = useState<Region>(REGIONS[0])
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const data = await api.get<{ templates?: VlessTemplate[] }>('/sb/api/vless/templates')
        const saved = (data.templates || []).map(templateRegion)
        if (saved.length) setRegions([REGIONS[0], ...saved])
      } catch {
        /* picker stays cosmetic when template endpoint is unavailable */
      }
    })()
  }, [])

  const powerLabel = vpn.enabled ? 'Подключено' : 'Включить VPN'
  const serviceLabel = useMemo(() => {
    if (vpn.status) return vpn.status
    if (vpn.active === false) return 'service down'
    return vpn.policy === 'all' ? 'весь трафик' : 'только домены'
  }, [vpn.active, vpn.policy, vpn.status])

  const pickRegion = async (next: Region) => {
    setRegion(next)
    setOpen(false)
    if (next.id === 'current') {
      setStatus({ msg: 'Используется текущий outbound tag=vpn', ok: true })
      return
    }
    try {
      setStatus({ msg: `Применяем ${next.name}…`, ok: null })
      await api.put('/sb/api/vless', { template_id: next.id })
      setStatus({ msg: `Применено: ${next.name}`, ok: true })
    } catch (e) {
      setStatus({ msg: `Шаблон не применён: ${cleanError(e)}`, ok: false })
    }
  }

  return (
    <header className="topbar">
      <div className="wrap topbar-inner">
        <Logo />
        <div className="topbar-spacer" />
        <div className={`region ${open ? 'open' : ''}`} ref={ref}>
          <button className="region-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
            <Flag code={region.flag} />
            <span className="stack">
              <span className="region-name">{region.name}</span>
              <span className="region-meta">{serviceLabel}</span>
            </span>
            <Ic name="arrow-right" size={16} className="caret" />
          </button>
          {open && (
            <div className="region-menu" role="listbox">
              <div className="region-menu-label">Конфигурация VPN</div>
              {regions.map((r) => (
                <button
                  key={r.id}
                  className={`region-item ${r.id === region.id ? 'active' : ''}`}
                  role="option"
                  aria-selected={r.id === region.id}
                  onClick={() => pickRegion(r)}
                >
                  <Flag code={r.flag} />
                  <span className="stack">
                    <span className="region-item-name">{r.name}</span>
                    <span className="region-item-meta">{r.meta}</span>
                  </span>
                  <span className="ping">{r.ping}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          className={`power ${vpn.enabled ? 'on' : ''}`}
          tone="ghost"
          aria-pressed={vpn.enabled}
          onClick={() => onVpnChange({ enabled: !vpn.enabled })}
        >
          <span className="power-dot" />
          <span>{powerLabel}</span>
        </Button>
      </div>
    </header>
  )
}
