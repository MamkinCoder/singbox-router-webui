'use strict';

const { execFile } = require('child_process');
const fs = require('fs');

const { DHCP_NAMES_PATH } = require('../config');

function execFileP(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'utf8', timeout: opts.timeout || 2500 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message || '').trim();
        return reject(new Error(msg || `Failed to run ${cmd}`));
      }
      resolve(stdout);
    });
  });
}

async function execOptional(cmd, args, timeout = 1200) {
  try {
    return await execFileP(cmd, args, { timeout });
  } catch {
    return '';
  }
}

function cleanHostname(value) {
  const raw = String(value || '').trim().replace(/\.$/, '');
  if (!raw) return '';
  const first = raw.split(/\s+/)[0].replace(/\.$/, '');
  if (!first || first === 'localhost' || first === 'unknown') return '';
  if (first === 'pi.hole' || first === 'pi-hole') return '';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(first)) return '';
  return first;
}

function ipToName(ip) {
  const last = String(ip || '').split('.').pop();
  return last ? `Устройство ${last}` : 'Устройство';
}

function vendorName(vendor, ip) {
  const last = String(ip || '').split('.').pop();
  return vendor && last ? `${vendor} ${last}` : vendor;
}

function vendorFromMac(mac) {
  const prefix = String(mac || '').toLowerCase().split(':').slice(0, 3).join(':');
  const vendors = {
    '00:1a:11': 'Google',
    '00:1f:f3': 'Apple',
    '04:52:f3': 'Apple',
    '08:66:98': 'Apple',
    '10:40:f3': 'Apple',
    '18:65:90': 'Apple',
    '28:7e:80': 'Apple',
    '38:1f:8d': 'Apple',
    '3c:0b:4f': 'Apple',
    '40:ed:00': 'TP-Link',
    '44:07:0b': 'Google',
    '5c:e9:1e': 'Apple',
    '64:b0:a6': 'Apple',
    '70:3e:ac': 'Apple',
    '78:4f:43': 'Apple',
    '7c:d1:c3': 'Apple',
    '88:66:5a': 'Apple',
    'a4:83:e7': 'Apple',
    'b8:27:eb': 'Raspberry Pi',
    'bc:52:b7': 'Apple',
    'c0:84:7d': 'Apple',
    'd8:bb:2c': 'Apple',
    'dc:a6:32': 'Raspberry Pi',
    'e4:5f:01': 'Raspberry Pi',
    'f0:18:98': 'Apple',
    'f4:5c:89': 'Apple',
  };
  return vendors[prefix] || '';
}

function isPrivateMac(mac) {
  const first = parseInt(String(mac || '').slice(0, 2), 16);
  return Number.isFinite(first) && (first & 0x02) === 0x02;
}

function inferDeviceType({ hostname = '', vendor = '', mac = '' }) {
  const s = `${hostname} ${vendor}`.toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return 'ios';
  if (/android|galaxy|samsung|pixel|xiaomi|redmi|oneplus|huawei|honor/.test(s)) return 'android';
  if (/macbook|imac|mac mini|macos|apple/.test(s)) return 'macos';
  if (/raspberry|linux|ubuntu|debian/.test(s)) return 'linux';
  if (/playstation|xbox|tv|chromecast|roku|appletv/.test(s)) return 'desktop';
  if (isPrivateMac(mac)) return 'private';
  return 'desktop';
}

async function reverseDnsName(ip) {
  const out = await execOptional('getent', ['hosts', ip], 900);
  const parts = out.trim().split(/\s+/);
  return cleanHostname(parts[1] || '');
}

async function mdnsName(ip) {
  const out = await execOptional('avahi-resolve-address', [ip], 1200);
  const parts = out.trim().split(/\s+/);
  return cleanHostname(parts[1] || '');
}

async function netbiosName(ip) {
  const out = await execOptional('nmblookup', ['-A', ip], 1400);
  for (const line of out.split('\n')) {
    const match = line.match(/^\s*([^\s<]+)\s+<00>\s+-\s+B\s+<ACTIVE>/);
    if (match) return cleanHostname(match[1]);
  }
  return '';
}

function readDhcpNameCache() {
  try {
    const data = JSON.parse(fs.readFileSync(DHCP_NAMES_PATH, 'utf8'));
    return data && typeof data === 'object' && data.clients ? data.clients : {};
  } catch {
    return {};
  }
}

async function enrichClient(entry, dhcpNames) {
  const learned = dhcpNames[String(entry.mac || '').toLowerCase()] || {};
  const learnedName = cleanHostname(learned.hostname || learned.name || '');
  const [dnsName, avahiName, nbName] = await Promise.all([
    reverseDnsName(entry.ip),
    mdnsName(entry.ip),
    netbiosName(entry.ip),
  ]);
  const vendor = vendorFromMac(entry.mac);
  const hostname = learnedName || dnsName || avahiName || nbName || '';
  const deviceType = inferDeviceType({ hostname, vendor, mac: entry.mac });
  const nameSource = learnedName ? 'dhcp' : dnsName ? 'rdns' : avahiName ? 'mdns' : nbName ? 'netbios' : vendor ? 'oui' : isPrivateMac(entry.mac) ? 'private-mac' : 'fallback';

  return {
    ...entry,
    hostname: hostname || '',
    vendor,
    deviceType,
    nameSource,
    displayName: hostname || vendorName(vendor, entry.ip) || ipToName(entry.ip),
    privateMac: isPrivateMac(entry.mac),
  };
}

/**
 * Parses lines like:
 * 192.168.0.50 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE
 * 192.168.0.1 dev eth0 lladdr 11:22:33:44:55:66 STALE
 * 192.168.0.123 dev eth0 INCOMPLETE
 */
function parseIpNeigh(output) {
  const rows = [];

  for (const line of output.split('\n')) {
    const s = line.trim();
    if (!s) continue;

    const ipMatch = s.match(/^(\S+)/);
    if (!ipMatch) continue;
    const ip = ipMatch[1];

    // Only keep IPv4 (optional). Remove this if you want IPv6 too.
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;

    const devMatch = s.match(/\bdev\s+(\S+)/);
    const dev = devMatch ? devMatch[1] : '';

    const macMatch = s.match(/\blladdr\s+([0-9a-fA-F:]{17})\b/);
    const mac = macMatch ? macMatch[1].toLowerCase() : '';

    // state is last token usually
    const state = s.split(/\s+/).slice(-1)[0];

    // Drop unusable entries
    if (!mac || mac === '00:00:00:00:00:00') continue;
    if (state === 'INCOMPLETE' || state === 'FAILED') continue;

    rows.push({ ip, mac, dev, state });
  }

  return rows;
}

function stateRank(state) {
  switch (String(state || '').toUpperCase()) {
    case 'REACHABLE':
      return 5;
    case 'DELAY':
      return 4;
    case 'PROBE':
      return 3;
    case 'PERMANENT':
      return 2;
    case 'STALE':
      return 1;
    default:
      return 0;
  }
}

function isActiveState(state) {
  return stateRank(state) >= 2;
}

async function readLanClientsFromNeigh({ iface = 'eth0' } = {}) {
  // "-4" makes it IPv4 only; drop if you want both families.
  const out = await execFileP('ip', ['-4', 'neigh', 'show', 'dev', iface]);
  const entries = parseIpNeigh(out);

  // Prefer an active neighbor entry if multiple rows exist for the same MAC.
  const byMac = new Map();
  for (const e of entries) {
    const current = byMac.get(e.mac);
    if (!current || stateRank(e.state) >= stateRank(current.state)) {
      byMac.set(e.mac, e);
    }
  }

  const rows = [...byMac.values()].map((e) => ({
    mac: e.mac,
    ip: e.ip,
    lease: `neigh:${e.state}`, // e.g. neigh:REACHABLE / neigh:STALE
    state: e.state,
    active: isActiveState(e.state),
  }));

  const dhcpNames = readDhcpNameCache();
  return Promise.all(rows.map((row) => enrichClient(row, dhcpNames)));
}

module.exports = { readLanClientsFromNeigh };
