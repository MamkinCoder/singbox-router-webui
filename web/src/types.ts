export type StatusKind = 'ok' | 'bad' | 'busy' | null

export type StatusState = {
  msg: string
  ok?: boolean | null
  kind?: StatusKind
}

export type SetStatus = (status: StatusState) => void

export type DomainGroup = {
  id: string
  name?: string
  enabled?: boolean
  domains?: string[]
}

export type DomainsUi = {
  version?: number
  groups?: DomainGroup[]
}

export type VpnPolicy = 'domains' | 'all'

export type VpnState = {
  enabled: boolean
  policy: VpnPolicy
  active: boolean | null
  status: string | null
}

export type ClientRecord = {
  name?: string
  ip?: string
  bypass_vpn?: boolean
  force_vpn?: boolean
  force_udp_vpn?: boolean
}

export type ClientPolicy = {
  clients?: Record<string, ClientRecord>
}

export type Lease = {
  mac: string
  ip?: string
  hostname?: string
  clientId?: string
  state?: string
  active?: boolean
}

export type LanClient = {
  mac: string
  ip: string
  currentIp: string
  lastKnownIp: string
  leaseState: string
  leaseActive: boolean
  name: string
  bypass_vpn: boolean
  force_vpn: boolean
  force_udp_vpn: boolean
}

export type VlessTemplate = {
  id: string
  name: string
  link?: string
  vless?: string
}
