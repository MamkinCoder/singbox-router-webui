'use strict';

const MAC_RE = /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/;

function normalizeMac(mac) {
  return String(mac || '').trim().toLowerCase();
}

function isValidMac(mac) {
  return MAC_RE.test(normalizeMac(mac));
}

function findLease(leases, mac) {
  const target = normalizeMac(mac);
  return (leases || []).find((lease) => normalizeMac(lease?.mac) === target && lease?.ip) || null;
}

function findActiveLease(leases, mac) {
  const target = normalizeMac(mac);
  return (leases || []).find((lease) => normalizeMac(lease?.mac) === target && lease?.active && lease?.ip) || null;
}

function findLeaseByIp(leases, ip) {
  const target = String(ip || '').trim();
  if (!target) return null;
  return (leases || []).find((lease) => String(lease?.ip || '').trim() === target) || null;
}

function findLeaseIpConflict(leases, mac, ip) {
  const owner = normalizeMac(mac);
  const target = String(ip || '').trim();
  if (!target) return null;
  return (leases || []).find(
    (lease) => String(lease?.ip || '').trim() === target && normalizeMac(lease?.mac) !== owner
  ) || null;
}

function findActiveLeaseByIp(leases, ip) {
  const target = String(ip || '').trim();
  if (!target) return null;
  return (leases || []).find((lease) => lease?.active && String(lease?.ip || '').trim() === target) || null;
}

function hasRoutingPolicy(client) {
  return !!(client?.bypass_vpn || client?.force_vpn || client?.force_udp_vpn);
}

function buildEffectivePolicy(policy, leases) {
  const next = {
    ...(policy || {}),
    clients: {},
  };

  for (const [rawMac, rawClient] of Object.entries(policy?.clients || {})) {
    const mac = normalizeMac(rawMac);
    if (!isValidMac(mac)) continue;

    const client = { ...(rawClient || {}) };
    if (client.bypass_vpn) {
      client.force_vpn = false;
      client.force_udp_vpn = false;
    }

    if (hasRoutingPolicy(client)) {
      const lease = findLease(leases, mac);
      const conflict = lease ? findLeaseIpConflict(leases, mac, lease.ip) : null;

      if (lease && !conflict) {
        client.ip = lease.ip;
      } else {
        client.bypass_vpn = false;
        client.force_vpn = false;
        client.force_udp_vpn = false;
        delete client.ip;
      }
    }

    next.clients[mac] = client;
  }

  return next;
}

module.exports = {
  normalizeMac,
  isValidMac,
  findLease,
  findActiveLease,
  findLeaseByIp,
  findLeaseIpConflict,
  findActiveLeaseByIp,
  hasRoutingPolicy,
  buildEffectivePolicy,
};
