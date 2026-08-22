import { useEffect, useMemo, useRef, useState } from 'react'

import api from '../api'
import { Button, Flag, Ic, Logo, type Region } from '../shadowlos'
import type { SetStatus, VlessTemplate, VpnState } from '../types'
import { cleanError, splitFlagEmoji } from '../utils'

type TopBarProps = {
  vpn: VpnState
  onVpnChange: (next: Partial<VpnState>) => Promise<void>
  onRefresh: () => Promise<void> | void
  setStatus: SetStatus
}

function templateRegion(tpl: VlessTemplate): Region {
  const raw = tpl.name || tpl.id
  const { emoji, text } = splitFlagEmoji(raw)
  return {
    id: tpl.id,
    flag: 'auto',
    emoji,
    raw,
    name: text || tpl.id,
    meta: 'Сохранённый VLESS',
    ping: 'saved',
  }
}

export default function TopBar({ vpn, onVpnChange, onRefresh, setStatus }: TopBarProps) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<Region[]>([])
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const loadTemplates = async () => {
    try {
      const data = await api.get<{ templates?: VlessTemplate[] }>('/sb/api/vless/templates')
      setSaved((data.templates || []).map(templateRegion))
    } catch {
      /* picker stays cosmetic when template endpoint is unavailable */
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const current = useMemo<Region>(() => {
    const raw = vpn.outbound?.name?.trim() || ''
    const { emoji, text } = splitFlagEmoji(raw)
    const meta = [vpn.outbound?.protocol, vpn.outbound?.server].filter(Boolean).join(' · ')
    return {
      id: 'current',
      flag: 'auto',
      emoji,
      raw,
      name: text || 'Текущий выход',
      meta: meta || 'outbound tag=vpn',
      ping: vpn.outbound?.source === 'config' ? 'config' : 'active',
    }
  }, [vpn.outbound])

  const regions = useMemo(() => [current, ...saved], [current, saved])
  const matchedSaved = useMemo(
    () => (current.raw ? saved.find((r) => r.raw === current.raw) : undefined),
    [current.raw, saved],
  )

  const powerLabel = vpn.enabled ? 'Подключено' : 'Включить VPN'
  const serviceLabel = useMemo(() => {
    if (vpn.status) return vpn.status
    if (vpn.active === false) return 'service down'
    return vpn.policy === 'all' ? 'весь трафик' : 'только домены'
  }, [vpn.active, vpn.policy, vpn.status])

  const pickRegion = async (next: Region) => {
    setOpen(false)
    if (next.id === 'current') {
      await onRefresh()
      setStatus({ msg: `Активна конфигурация: ${next.raw || next.name}`, ok: true })
      return
    }
    try {
      setStatus({ msg: `Применяем ${next.raw || next.name}…`, ok: null })
      await api.put('/sb/api/vless', { template_id: next.id })
      setStatus({ msg: `Применено: ${next.raw || next.name}`, ok: true })
      await onRefresh()
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
            <Flag code={current.flag} emoji={current.emoji} />
            <span className="stack">
              <span className="region-name" title={current.raw || current.name}>{current.name}</span>
              <span className="region-meta">{serviceLabel}</span>
            </span>
            <Ic name="arrow-right" size={16} className="caret" />
          </button>
          {open && (
            <div className="region-menu" role="listbox">
              <div className="region-menu-label">Конфигурация VPN</div>
              {regions.map((r) => {
                const isActive = matchedSaved ? r.id === matchedSaved.id : r.id === 'current'
                return (
                  <button
                    key={r.id}
                    className={`region-item ${isActive ? 'active' : ''}`}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => pickRegion(r)}
                  >
                    <Flag code={r.flag} emoji={r.emoji} />
                    <span className="stack">
                      <span className="region-item-name" title={r.raw || r.name}>{r.name}</span>
                      <span className="region-item-meta">{r.meta}</span>
                    </span>
                    <span className="ping">{r.ping}</span>
                  </button>
                )
              })}
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
