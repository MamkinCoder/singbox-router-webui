import { useEffect, useMemo, useState } from 'react'

import api from '../api.js'

export default function ClientsTab({ setStatus }) {
  const [leases, setLeases] = useState([])
  const [policy, setPolicy] = useState({ clients: {} })
  const [loading, setLoading] = useState(false)

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
      }
    })
  }, [leases, policy])

  const updateClient = async (client, forceVpn) => {
    try {
      setStatus({ msg: `${forceVpn ? 'Forcing' : 'Releasing'} ${client.name}…`, ok: null })
      await api.put(`/sb/api/clients/${encodeURIComponent(client.mac)}`, {
        name: client.name,
        force_vpn: forceVpn,
      })
      setPolicy((prev) => ({
        ...prev,
        clients: {
          ...prev.clients,
          [client.mac]: {
            ...(prev.clients?.[client.mac] || {}),
            name: client.name,
            force_vpn: forceVpn,
          },
        },
      }))
      setStatus({ msg: `${client.name} ${forceVpn ? 'will' : 'will no longer'} force VPN`, ok: true })
    } catch (e) {
      setStatus({ msg: `Client update failed: ${e.message}`, ok: false })
    }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>Clients (DHCP leases)</div>
      {loading ? (
        <div className="muted" style={{ marginTop: 6 }}>Loading clients…</div>
      ) : clients.length ? (
        <div className="clientsList" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clients.map((client) => (
            <div key={client.mac} className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{client.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {client.ip} • {client.mac}
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button
                  className={`btn ${client.force_vpn ? 'danger' : 'primary'}`}
                  onClick={() => updateClient(client, !client.force_vpn)}
                >
                  {client.force_vpn ? 'Disable force VPN' : 'Force VPN for all traffic'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted" style={{ marginTop: 6 }}>No DHCP leases found.</div>
      )}
    </div>
  )
}
