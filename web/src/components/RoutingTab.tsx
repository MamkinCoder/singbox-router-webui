import { useEffect, useMemo, useState } from 'react'

import api from '../api'
import { Button, Ic, Switch } from '../shadowlos'
import type { ClientPolicy, DomainGroup, DomainsUi, LanClient, Lease, SetStatus, VpnPolicy, VpnState } from '../types'
import { cleanError, pluralRu } from '../utils'

type RoutingTabProps = {
  vpn: VpnState
  onVpnChange: (next: Partial<VpnState>) => Promise<void>
  setStatus: SetStatus
}

type ClientMode = 'auto' | 'vpn' | 'direct'

function normalizeDomain(value: string): string | null {
  const next = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\.+/, '').replace(/\.$/, '')
  return next || null
}

function clientMode(client: LanClient): ClientMode {
  if (client.bypass_vpn) return 'direct'
  if (client.force_vpn) return 'vpn'
  return 'auto'
}

function deviceIcon(client: LanClient): string {
  if (['android', 'ios', 'linux', 'macos', 'desktop'].includes(client.deviceType)) return client.deviceType
  const haystack = `${client.name} ${client.displayName} ${client.vendor} ${client.mac}`.toLowerCase()
  if (haystack.includes('iphone') || haystack.includes('ipad')) return 'ios'
  if (haystack.includes('android')) return 'android'
  if (haystack.includes('mac')) return 'macos'
  if (haystack.includes('apple')) return 'macos'
  if (haystack.includes('linux')) return 'linux'
  if (haystack.includes('raspberry')) return 'linux'
  return 'desktop'
}

function usefulName(value?: string): string {
  const next = String(value || '').trim()
  return next && next.toLowerCase() !== 'unknown' ? next : ''
}

function ModeSeg({ value, onChange, disabled = false }: { value: ClientMode; onChange: (mode: ClientMode) => void; disabled?: boolean }) {
  const modes: Array<{ value: ClientMode; label: string }> = [
    { value: 'auto', label: 'Авто' },
    { value: 'vpn', label: 'Через VPN' },
    { value: 'direct', label: 'Напрямую' },
  ]

  return (
    <div className="seg" role="radiogroup">
      {modes.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={value === m.value}
          disabled={disabled}
          className={`seg-opt ${value === m.value ? 'active' : ''} ${value === m.value ? m.value : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onChange(m.value)
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

function GroupCard({ group, onChange, onDelete }: { group: DomainGroup; onChange: (group: DomainGroup) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [nameDraft, setNameDraft] = useState(group.name || group.id || '')
  const enabled = group.enabled !== false
  const domains = useMemo(() => [...(group.domains || [])].sort(), [group.domains])

  useEffect(() => setNameDraft(group.name || group.id || ''), [group.id, group.name])

  const addDomain = () => {
    const values = draft.split(/\s+/).map(normalizeDomain).filter(Boolean) as string[]
    if (!values.length) return
    onChange({ ...group, domains: Array.from(new Set([...(group.domains || []), ...values])) })
    setDraft('')
  }

  const commitName = () => {
    const next = nameDraft.trim()
    if (!next) return
    const id = group.id || next.toLowerCase().replace(/\s+/g, '-')
    onChange({ ...group, id, name: next })
  }

  return (
    <div className={`group ${enabled ? '' : 'off'}`}>
      <div className="group-head">
        <div className="group-title-wrap">
          <input className="title-input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && commitName()} />
          <div className="muted">{domains.length} {pluralRu(domains.length, ['домен', 'домена', 'доменов'])}</div>
        </div>
        <Switch checked={enabled} onChange={(checked) => onChange({ ...group, enabled: checked })} label="Включить группу" />
      </div>
      {open && (
        <div className="group-body">
          <div className="chips">
            {domains.map((d) => (
              <span className="chip" key={d}>
                <code>{d}</code>
                <button type="button" className="chip-x" onClick={() => onChange({ ...group, domains: (group.domains || []).filter((x) => x !== d) })} aria-label={`Удалить ${d}`}>
                  <Ic name="copy" size={12} />
                </button>
              </span>
            ))}
            {!domains.length && <div className="muted empty">Список пуст</div>}
          </div>
          <div className="addrow">
            <input className="input mono" value={draft} placeholder="example.com" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDomain()} />
            <Button tone="secondary" size="s" onClick={addDomain}>Добавить</Button>
          </div>
          <div className="delete-row">
            <Button tone="ghost" size="s" onClick={onDelete}>Удалить группу</Button>
          </div>
        </div>
      )}
      <button className="expander" onClick={() => setOpen((v) => !v)}>
        {open ? 'Свернуть' : 'Показать домены'}
        <Ic name="arrow-right" size={16} className={open ? 'rotate' : ''} />
      </button>
    </div>
  )
}

function DeviceRow({ client, onMode, onUdp, onRename }: { client: LanClient; onMode: (mode: ClientMode) => void; onUdp: (enabled: boolean) => void; onRename: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(client.name)
  const mode = clientMode(client)

  useEffect(() => setName(client.name), [client.name])

  return (
    <div className="device">
      <div className="device-main" onClick={() => setOpen((v) => !v)}>
        <span className="device-ic"><Ic name={deviceIcon(client)} size={22} color="var(--text-secondary)" /></span>
        <div className="device-copy">
          <div className="device-name-row">
            <span className={client.currentIp ? 'dot-online' : 'dot-offline'} />
            <span className="device-name">{client.name}</span>
          </div>
          <div className="device-meta">
            {client.currentIp || `last ${client.lastKnownIp || 'unknown'}`} · {client.mac.toLowerCase()}
            {client.vendor ? ` · ${client.vendor}` : ''}
            {client.privateMac ? ' · private MAC' : ''}
          </div>
        </div>
        <ModeSeg value={mode} onChange={onMode} />
        <Ic name="arrow-right" size={18} className={open ? 'rotate' : ''} />
      </div>
      {open && (
        <div className="device-adv">
          <div className="adv-row">
            <div>
              <div className="adv-label">Имя устройства</div>
              <div className="adv-help">Отображается в списках и правилах</div>
            </div>
            {editing ? (
              <div className="inline-edit">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <Button tone="primary" size="s" onClick={() => { onRename(name.trim() || client.name); setEditing(false) }}>Сохранить</Button>
              </div>
            ) : (
              <Button tone="secondary" size="s" onClick={() => setEditing(true)}>Изменить</Button>
            )}
          </div>
          <hr className="hairline" />
          <div className="adv-row">
            <div>
              <div className="adv-label">Весь UDP через VPN</div>
              <div className="adv-help">Строгий режим. Для игр и звонков обычно лучше выключить.</div>
            </div>
            <Switch checked={client.force_udp_vpn} disabled={mode !== 'vpn'} onChange={onUdp} label="Весь UDP через VPN" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function RoutingTab({ vpn, onVpnChange, setStatus }: RoutingTabProps) {
  const [ui, setUi] = useState<DomainsUi | null>(null)
  const [leases, setLeases] = useState<Lease[]>([])
  const [clientPolicy, setClientPolicy] = useState<ClientPolicy>({ clients: {} })
  const [loadingClients, setLoadingClients] = useState(false)
  const [savingDomains, setSavingDomains] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        setStatus({ msg: 'Загружаем домены…', ok: null })
        setUi(await api.get<DomainsUi>('/sb/api/domains'))
        setStatus({ msg: 'Готово', ok: true })
      } catch (e) {
        setStatus({ msg: `Домены не загружены: ${cleanError(e)}`, ok: false })
      }
    })()
  }, [setStatus])

  const refreshClients = async () => {
    setLoadingClients(true)
    try {
      const [policy, leaseResp] = await Promise.all([
        api.get<ClientPolicy>('/sb/api/clients'),
        api.get<{ leases?: Lease[] }>('/sb/api/clients/leases'),
      ])
      setClientPolicy(policy)
      setLeases(Array.isArray(leaseResp.leases) ? leaseResp.leases : [])
    } catch (e) {
      setStatus({ msg: `Устройства не загружены: ${cleanError(e)}`, ok: false })
    } finally {
      setLoadingClients(false)
    }
  }

  useEffect(() => {
    refreshClients()
  }, [])

  const counts = useMemo(() => {
    let total = 0
    let enabled = 0
    for (const g of ui?.groups || []) {
      const n = (g.domains || []).length
      total += n
      if (g.enabled !== false) enabled += n
    }
    return { total, enabled }
  }, [ui])

  const clients = useMemo<LanClient[]>(() => {
    const leaseMap = new Map(leases.map((l) => [l.mac, l]))
    const recorded = clientPolicy.clients || {}
    const union = new Set([...leaseMap.keys(), ...Object.keys(recorded)])
    return Array.from(union).map((mac) => {
      const lease = leaseMap.get(mac)
      const record = recorded[mac] || {}
      const currentIp = lease?.ip || ''
      return {
        mac,
        ip: currentIp || record.ip || 'unknown',
        currentIp,
        lastKnownIp: record.ip || lease?.ip || '',
        leaseState: lease?.state || '',
        leaseActive: !!lease?.active,
        displayName: usefulName(lease?.displayName) || usefulName(lease?.hostname) || usefulName(lease?.clientId) || (lease?.ip ? `Устройство ${lease.ip.split('.').pop()}` : mac),
        vendor: lease?.vendor || '',
        deviceType: lease?.deviceType || '',
        nameSource: lease?.nameSource || '',
        privateMac: !!lease?.privateMac,
        name: usefulName(record.name) || usefulName(lease?.displayName) || usefulName(lease?.hostname) || usefulName(lease?.clientId) || (lease?.ip ? `Устройство ${lease.ip.split('.').pop()}` : mac),
        bypass_vpn: !!record.bypass_vpn,
        force_vpn: !!record.force_vpn,
        force_udp_vpn: !!record.force_udp_vpn,
      }
    })
  }, [clientPolicy.clients, leases])

  const saveDomains = async () => {
    try {
      setSavingDomains(true)
      setStatus({ msg: 'Сохраняем и перезапускаем sing-box…', ok: null })
      const payload = { version: 1, groups: Array.isArray(ui?.groups) ? ui.groups : [] }
      const resp = await api.put<{ flat_count?: number }>('/sb/api/domains', payload)
      setStatus({ msg: `Сохранено. В плоском списке: ${resp.flat_count ?? counts.enabled}`, ok: true })
    } catch (e) {
      setStatus({ msg: `Не сохранено: ${cleanError(e)}`, ok: false })
    } finally {
      setSavingDomains(false)
    }
  }

  const updateGroup = (idx: number, next: DomainGroup) => {
    setUi((prev) => {
      const groups = [...(prev?.groups || [])]
      groups[idx] = next
      return { ...(prev || { version: 1 }), groups }
    })
  }

  const updateClient = async (client: LanClient, overrides: Partial<LanClient>) => {
    const nextBypass = overrides.bypass_vpn ?? client.bypass_vpn
    const nextForceVpn = overrides.force_vpn ?? client.force_vpn
    const nextForceUdpVpn = overrides.force_udp_vpn ?? client.force_udp_vpn
    const needsLiveIp = nextBypass || nextForceVpn || nextForceUdpVpn
    if (needsLiveIp && !client.currentIp) {
      setStatus({ msg: `${client.name} не найден в LAN neighbor cache. Обновите, когда устройство онлайн.`, ok: false })
      return
    }

    const payload = {
      ...(overrides.name !== undefined ? { name: overrides.name } : {}),
      ...(overrides.bypass_vpn !== undefined ? { bypass_vpn: overrides.bypass_vpn } : {}),
      ...(overrides.force_vpn !== undefined ? { force_vpn: overrides.force_vpn } : {}),
      ...(overrides.force_udp_vpn !== undefined ? { force_udp_vpn: overrides.force_udp_vpn } : {}),
    }

    try {
      setStatus({ msg: `Сохраняем ${client.name}…`, ok: null })
      const result = await api.put<{ client?: Partial<LanClient> }>(`/sb/api/clients/${encodeURIComponent(client.mac)}`, payload)
      setClientPolicy((prev) => ({
        ...prev,
        clients: {
          ...prev.clients,
          [client.mac]: {
            ...(prev.clients?.[client.mac] || {}),
            ...(result.client || payload),
          },
        },
      }))
      setStatus({ msg: `${client.name}: правило обновлено`, ok: true })
    } catch (e) {
      setStatus({ msg: `Устройство не обновлено: ${cleanError(e)}`, ok: false })
    }
  }

  const setClientMode = (client: LanClient, mode: ClientMode) => {
    if (mode === 'auto') return updateClient(client, { force_vpn: false, bypass_vpn: false, force_udp_vpn: false })
    if (mode === 'vpn') return updateClient(client, { force_vpn: true, bypass_vpn: false })
    return updateClient(client, { bypass_vpn: true, force_vpn: false, force_udp_vpn: false })
  }

  const setPolicy = (policy: VpnPolicy) => onVpnChange({ enabled: true, policy })
  const onlineCount = clients.filter((d) => d.currentIp).length

  return (
    <>
      <section className="section">
        <div className="panel policy-panel">
          <div>
            <h3 className="panel-title">Что отправлять в VPN</h3>
            <p className="panel-sub">
              {vpn.policy === 'all' ? 'Весь трафик идёт через VPN. Локальная сеть остаётся напрямую.' : 'Через VPN идут только домены из списков ниже. Остальное идёт напрямую.'}
            </p>
          </div>
          <div className="seg policy-seg" role="radiogroup">
            <button type="button" className={`seg-opt ${vpn.policy === 'domains' ? 'active' : ''}`} onClick={() => setPolicy('domains')}>Только домены</button>
            <button type="button" className={`seg-opt ${vpn.policy === 'all' ? 'active vpn' : ''}`} onClick={() => setPolicy('all')}>Весь трафик</button>
          </div>
        </div>
      </section>

      <section className={`section ${vpn.policy === 'all' ? 'dimmed' : ''}`}>
        <div className="section-head">
          <div>
            <h2 className="section-title">Домены через VPN</h2>
            <p className="section-sub">Включено {counts.enabled} из {counts.total} {pluralRu(counts.total, ['домена', 'доменов', 'доменов'])}</p>
          </div>
          <Button tone="secondary" size="s" iconLeft={<Ic name="globe" size={18} />} onClick={() => setUi((prev) => ({ ...(prev || { version: 1 }), groups: [...(prev?.groups || []), { id: `group-${Date.now()}`, name: 'Новая группа', enabled: true, domains: [] }] }))}>
            Новая группа
          </Button>
        </div>
        <div className="grid-cards">
          {(ui?.groups || []).map((g, idx) => (
            <GroupCard key={`${g.id}:${idx}`} group={g} onChange={(next) => updateGroup(idx, next)} onDelete={() => setUi((prev) => ({ ...(prev || { version: 1 }), groups: (prev?.groups || []).filter((_, i) => i !== idx) }))} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2 className="section-title">Устройства в сети</h2>
            <p className="section-sub">{loadingClients ? 'Загружаем…' : `${onlineCount} в сети · всего ${clients.length}`}</p>
          </div>
          <Button tone="ghost" size="s" onClick={refreshClients}>Обновить</Button>
        </div>
        <div className="panel devices-panel">
          {clients.length ? clients.map((client) => (
            <DeviceRow
              key={client.mac}
              client={client}
              onMode={(mode) => setClientMode(client, mode)}
              onUdp={(enabled) => updateClient(client, { force_udp_vpn: enabled })}
              onRename={(name) => updateClient(client, { name })}
            />
          )) : <div className="muted empty">LAN-устройства не найдены.</div>}
        </div>
      </section>

      <div className="route-actions">
        <Button tone="primary" onClick={saveDomains} disabled={savingDomains}>{savingDomains ? 'Сохраняем…' : 'Сохранить и перезапустить'}</Button>
      </div>
    </>
  )
}
