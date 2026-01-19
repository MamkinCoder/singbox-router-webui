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
      return {
        mac,
        ip: lease?.ip || record.ip || 'unknown',
        name,
        force_vpn: !!record.force_vpn,
        force_udp_vpn: !!record.force_udp_vpn,
      }
    })
  }, [leases, policy])

  const persistClient = async (client, overrides = {}, busyMsg, successMsg) => {
    const payload = {
      name: overrides.name ?? client.name,
      force_vpn: overrides.force_vpn ?? client.force_vpn,
      force_udp_vpn: overrides.force_udp_vpn ?? client.force_udp_vpn,
      ip: client.ip,
    }

    try {
      setStatus({ msg: busyMsg, ok: null })
      await api.put(`/sb/api/clients/${encodeURIComponent(client.mac)}`, payload)
      setPolicy((prev) => ({
        ...prev,
        clients: {
          ...prev.clients,
          [client.mac]: {
            ...(prev.clients?.[client.mac] || {}),
            ...payload,
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
      { force_vpn: enable },
      `${enable ? 'Forcing' : 'Releasing'} ${client.name}…`,
      `${client.name} ${enable ? 'will' : 'will no longer'} force VPN`,
    )

  const updateUdp = (client, enable) =>
    persistClient(
      client,
      { force_udp_vpn: enable },
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
      <div style={{ fontWeight: 700 }}>Clients (DHCP leases)</div>
      {loading ? (
        <div className="muted" style={{ marginTop: 6 }}>Loading clients…</div>
      ) : clients.length ? (
        <div className="clientsList">
          <div className="clientsTableHeader">
            <span>Client</span>
            <span>Actions</span>
            <span>Routing</span>
          </div>
          {clients.map((client) => {
            const editing = editingNames[client.mac]
            return (
              <div key={client.mac} className="clientsListRow">
                <div className="clientsListCell clientsListCellClient">
                  {editing !== undefined ? (
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
                  ) : (
                    <>
                      <div className="legacyClientName">{client.name}</div>
                      <div className="legacyClientMeta">
                        {client.ip} • {client.mac}
                      </div>
                    </>
                  )}
                </div>
                <div className="clientsListCell clientsListCellActions">
                  {editing !== undefined ? (
                    <div className="legacyActionGroup">
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
                  ) : (
                    <div className="legacyActionGroup">
                      <button
                        className="btn"
                        onClick={() =>
                          setEditingNames((prev) => ({
                            ...prev,
                            [client.mac]: client.name,
                          }))
                        }
                      >
                        Edit name
                      </button>
                      <button
                        className={`btn ${client.force_vpn ? 'danger' : 'primary'}`}
                        onClick={() => updateVpn(client, !client.force_vpn)}
                      >
                        {client.force_vpn ? 'Disable force VPN' : 'Force VPN for all traffic'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="clientsListCell clientsListCellRouting">
                  <label className="checkbox legacyCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={client.force_udp_vpn}
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
        <div className="muted" style={{ marginTop: 6 }}>No DHCP leases found.</div>
      )}
    </div>
  )
}
