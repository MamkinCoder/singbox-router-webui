'use strict';

const { execFile } = require('child_process');

function execFileP(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message || '').trim();
        return reject(new Error(msg || `Failed to run ${cmd}`));
      }
      resolve(stdout);
    });
  });
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

async function readLanClientsFromNeigh({ iface = 'eth0' } = {}) {
  // "-4" makes it IPv4 only; drop if you want both families.
  const out = await execFileP('ip', ['-4', 'neigh', 'show', 'dev', iface]);
  const entries = parseIpNeigh(out);

  // You can optionally de-dup by MAC (some devices can appear multiple times)
  const byMac = new Map();
  for (const e of entries) byMac.set(e.mac, e);

  return [...byMac.values()].map((e) => ({
    mac: e.mac,
    ip: e.ip,
    hostname: 'unknown',      // neigh table doesn’t know hostnames
    lease: `neigh:${e.state}`, // e.g. neigh:REACHABLE / neigh:STALE
  }));
}

module.exports = { readLanClientsFromNeigh };
