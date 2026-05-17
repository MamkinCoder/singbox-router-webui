import { useEffect, useMemo, useState } from 'react'

import api from '../api.js'

export default function ClientsTab({ setStatus }) {
  const [leases, setLeases] = useState([])
  const [policy, setPolicy] = useState({ clients: {} })
  const [loading, setLoading] = useState(false)
  const [editingNames, setEditingNames] = useState({})

  const refresh = async () => {
    setLoading(true)
    try {
      const [pol, leaseResp] = await Promise.all([
        api.get('/sb/api/clients'),
        api.get('/sb/api/clients/leases'),
      ])
      setPolicy(pol)
      setLeases(Array.isArray(leaseResp.leases) ? leaseResp.leases : [])
      setStatus({ msg: 'Clients refreshed', ok: true })
    } catch (e) {
      setStatus({ msg: `Clients load failed: ${e.message}`, ok: false })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const clients = useMemo(() => {
    const leaseMap = new Map(leases.map((l) => [l.mac, l]))
    const recorded = policy?.clients || {}
    const union = new Set([...leaseMap.keys(), ...Object.keys(recorded)])

    return Array.from(union).map((mac) => {
      const lease = leaseMap.get(mac)
      const record = recorded[mac] || {}
      const name = record.name || lease?.hostname || lease?.clientId || lease?.ip || mac
      const currentIp = lease?.ip || ''
      const lastKnownIp = record.ip || lease?.ip || ''
      return {
        mac,
        ip: currentIp || lastKnownIp || 'unknown',
        currentIp,
        lastKnownIp,
        leaseState: lease?.state || '',
        leaseActive: !!lease?.active,
        name,
        bypass_vpn: !!record.bypass_vpn,
        force_vpn: !!record.force_vpn,
        force_udp_vpn: !!record.force_udp_vpn,
      }
    })
  }, [leases, policy])

  const persistClient = async (client, overrides = {}, busyMsg, successMsg) => {
    const nextBypass = overrides.bypass_vpn ?? client.bypass_vpn
    const nextForceVpn = overrides.force_vpn ?? client.force_vpn
    const nextForceUdpVpn = overrides.force_udp_vpn ?? client.force_udp_vpn
    const routingChanged =
      overrides.bypass_vpn !== undefined ||
      overrides.force_vpn !== undefined ||
      overrides.force_udp_vpn !== undefined
    const needsLiveIp = nextBypass || nextForceVpn || nextForceUdpVpn

    if (routingChanged && needsLiveIp && !client.currentIp) {
      setStatus({
        msg: `${client.name} is not in the LAN neighbor cache. Refresh clients and try again when it is online.`,
        ok: false,
      })
      throw new Error('No LAN neighbor entry for client')
    }

    const payload = {
      ...(overrides.name !== undefined ? { name: overrides.name } : {}),
      ...(overrides.bypass_vpn !== undefined ? { bypass_vpn: overrides.bypass_vpn } : {}),
      ...(overrides.force_vpn !== undefined ? { force_vpn: overrides.force_vpn } : {}),
      ...(overrides.force_udp_vpn !== undefined ? { force_udp_vpn: overrides.force_udp_vpn } : {}),
    }

    try {
      setStatus({ msg: busyMsg, ok: null })
      const result = await api.put(`/sb/api/clients/${encodeURIComponent(client.mac)}`, payload)
      setPolicy((prev) => ({
        ...prev,
        clients: {
          ...prev.clients,
          [client.mac]: {
            ...(prev.clients?.[client.mac] || {}),
            ...(result?.client || payload),
          },
        },
      }))
      setStatus({ msg: successMsg, ok: true })
      return payload
    } catch (e) {
      setStatus({ msg: `Client update failed: ${e.message}`, ok: false })
      throw e
    }
  }

  const updateVpn = (client, enable) =>
    persistClient(
      client,
      {
        force_vpn: enable,
        ...(enable ? { bypass_vpn: false } : {}),
      },
      `${enable ? 'Forcing' : 'Releasing'} ${client.name}…`,
      `${client.name} ${enable ? 'will' : 'will no longer'} force VPN`,
    )

  const updateBypass = (client, enable) =>
    persistClient(
      client,
      {
        bypass_vpn: enable,
        ...(enable ? { force_vpn: false, force_udp_vpn: false } : {}),
      },
      `${enable ? 'Bypassing' : 'Re-enabling VPN rules for'} ${client.name}…`,
      `${client.name} ${enable ? 'will now bypass sing-box entirely' : 'will use the normal VPN routing rules again'}`,
    )

  const updateUdp = (client, enable) =>
    persistClient(
      client,
      {
        force_udp_vpn: enable,
        ...(enable ? { bypass_vpn: false } : {}),
      },
      `${enable ? 'Enabling' : 'Disabling'} non-gaming mode for ${client.name}…`,
      `Non-gaming mode ${enable ? 'enabled' : 'disabled'} for ${client.name}`,
    )

  const saveName = async (client) => {
    const targetName = (editingNames[client.mac] ?? '').trim()
    if (!targetName) {
      setStatus({ msg: 'Name cannot be empty', ok: false })
      return
    }

    try {
      await persistClient(
        client,
        { name: targetName },
        `Saving name for ${client.mac}…`,
        `Name for ${targetName} saved`,
      )
      setEditingNames((prev) => {
        const next = { ...prev }
        delete next[client.mac]
        return next
      })
    } catch {
      /* status already handled */
    }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>Clients (LAN neighbor cache)</div>
      {loading ? (
        <div className="muted" style={{ marginTop: 6 }}>Loading clients…</div>
      ) : clients.length ? (
        <div className="clientsList">
          <div className="clientsTableHeader">
            <span>Client</span>
            <span>Bypass VPN</span>
            <span>Force VPN</span>
            <span>UDP</span>
          </div>
          {clients.map((client) => {
            const editing = editingNames[client.mac]
            return (
              <div key={client.mac} className="clientsListRow">
                <div className="clientsListCell clientsListCellClient">
                  {editing !== undefined ? (
                    <div className="legacyEditRow">
                      <input
                        className="input clientsListEditInput"
                        value={editing}
                        onChange={(e) =>
                          setEditingNames((prev) => ({
                            ...prev,
                            [client.mac]: e.target.value,
                          }))
                        }
                      />
                      <div className="legacyRowBlockActions">
                        <button className="btn primary" onClick={() => saveName(client)}>
                          Save
                        </button>
                        <button
                          className="btn"
                          onClick={() =>
                            setEditingNames((prev) => {
                              const next = { ...prev }
                              delete next[client.mac]
                              return next
                            })
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="legacyClientNameRow">
                        <span className="legacyClientName">{client.name}</span>
                        <button
                          className="iconBtn legacyEditIcon"
                          onClick={() =>
                            setEditingNames((prev) => ({
                              ...prev,
                              [client.mac]: client.name,
                            }))
                          }
                          title="Edit name"
                        >
                          ✎
                        </button>
                      </div>
                      <div className="legacyClientMeta">
                        {client.currentIp || `last known ${client.lastKnownIp || 'unknown'}`} • {client.mac}{client.leaseState ? ` • ${client.leaseState.toLowerCase()}` : ''}
                      </div>
                    </>
                  )}
                </div>
                <div className="clientsListCell clientsListCellRouting">
                  <label className="checkbox legacyCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={client.bypass_vpn}
                      disabled={!client.currentIp && !client.bypass_vpn}
                      onChange={() => updateBypass(client, !client.bypass_vpn)}
                    />
                    {' '}
                    Bypass sing-box
                  </label>
                </div>
                <div className="clientsListCell clientsListCellActions">
                  <button
                    className={`btn ${client.force_vpn ? 'danger' : 'primary'}`}
                    disabled={!client.currentIp && !client.force_vpn}
                    onClick={() => updateVpn(client, !client.force_vpn)}
                  >
                    {client.force_vpn ? 'Disable force VPN' : 'Force VPN for all traffic'}
                  </button>
                </div>
                <div className="clientsListCell clientsListCellRouting">
                  <label className="checkbox legacyCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={client.force_udp_vpn}
                      disabled={!client.currentIp && !client.force_udp_vpn}
                      onChange={() => updateUdp(client, !client.force_udp_vpn)}
                    />
                    {' '}
                    Non-gaming mode
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="muted" style={{ marginTop: 6 }}>No LAN clients found.</div>
      )}
    </div>
  )
}
