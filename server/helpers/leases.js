'use strict';

const fs = require('fs');
const fsp = fs.promises;
const { DHCP_LEASES_PATH } = require('../config');

async function readDhcpLeases() {
  let raw;
  try {
    raw = await fsp.readFile(DHCP_LEASES_PATH, 'utf8');
  } catch (e) {
    throw new Error(`Cannot read leases: ${e.message || e}`);
  }

  const seen = new Map();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [expires, mac, ip, hostname = '', clientId = ''] = line.split(/\s+/);
    if (!mac || !ip) continue;
    seen.set(mac, {
      mac,
      ip,
      hostname: hostname === '*' ? '' : hostname,
      clientId,
      expires: Number(expires),
    });
  }

  return Array.from(seen.values());
}

module.exports = { readDhcpLeases };
