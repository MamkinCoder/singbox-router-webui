'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

const IFACE = process.env.SINGBOX_DEFAULT_INTERFACE || process.env.DHCP_SNIFF_INTERFACE || 'eth0';
const OUTPUT = process.env.DHCP_NAMES_PATH || '/etc/sing-box/client_names.json';
const MAX_AGE_MS = Number(process.env.DHCP_NAMES_MAX_AGE_MS || 1000 * 60 * 60 * 24 * 90);

function nowIso() {
  return new Date().toISOString();
}

function normalizeMac(value) {
  const mac = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/.test(mac) ? mac : '';
}

function cleanHostname(value) {
  const raw = String(value || '').trim().replace(/\.$/, '');
  if (!raw) return '';
  if (raw === 'unknown' || raw === 'localhost' || raw === 'pi.hole' || raw === 'pi-hole') return '';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) return '';
  return raw.slice(0, 80);
}

async function readCache() {
  try {
    const data = JSON.parse(await fsp.readFile(OUTPUT, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return { version: 1, clients: {} };
  }
}

async function writeCache(cache) {
  await fsp.mkdir(path.dirname(OUTPUT), { recursive: true });
  const tmp = `${OUTPUT}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(cache, null, 2) + '\n', { mode: 0o644 });
  await fsp.rename(tmp, OUTPUT);
}

function prune(cache, nowMs) {
  cache.clients = cache.clients || {};
  for (const [mac, entry] of Object.entries(cache.clients)) {
    const seen = Date.parse(entry.lastSeen || entry.firstSeen || 0);
    if (!seen || nowMs - seen > MAX_AGE_MS) delete cache.clients[mac];
  }
}

function parsePacket(packet) {
  const mac =
    normalizeMac(packet.match(/Client-Ethernet-Address\s+([0-9a-f:]{17})/i)?.[1]) ||
    normalizeMac(packet.match(/Client-ID Option \d+,\s+length \d+:\s+ether\s+([0-9a-f:]{17})/i)?.[1]) ||
    normalizeMac(packet.match(/^\S+\s+([0-9a-f:]{17})\s+>\s+/im)?.[1]);

  const hostname = cleanHostname(
    packet.match(/Hostname Option \d+,\s+length \d+:\s+"([^"]+)"/i)?.[1] ||
      packet.match(/Host Name Option \d+,\s+length \d+:\s+"([^"]+)"/i)?.[1] ||
      packet.match(/Hostname[^"\n]*"([^"]+)"/i)?.[1] ||
      ''
  );

  if (!mac || !hostname) return null;
  return { mac, hostname };
}

async function remember(hit) {
  const cache = await readCache();
  const now = nowIso();
  prune(cache, Date.now());
  const prev = cache.clients?.[hit.mac] || {};
  cache.version = 1;
  cache.updatedAt = now;
  cache.interface = IFACE;
  cache.clients = {
    ...(cache.clients || {}),
    [hit.mac]: {
      mac: hit.mac,
      hostname: hit.hostname,
      source: 'dhcp-passive',
      firstSeen: prev.firstSeen || now,
      lastSeen: now,
      count: Number(prev.count || 0) + 1,
    },
  };
  await writeCache(cache);
  console.log(`${now} ${hit.mac} ${hit.hostname}`);
}

function runTcpdump() {
  const args = [
    '-i', IFACE,
    '-l',
    '-n',
    '-e',
    '-vvv',
    '-s', '0',
    'udp and (port 67 or port 68)',
  ];
  const child = spawn('/usr/bin/tcpdump', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let packet = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    for (const line of chunk.split('\n')) {
      if (/^\d{2}:\d{2}:\d{2}\.\d+/.test(line) && packet) {
        const hit = parsePacket(packet);
        if (hit) remember(hit).catch((err) => console.error(err.message || err));
        packet = line + '\n';
      } else {
        packet += line + '\n';
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    const s = chunk.trim();
    if (s) console.error(s);
  });

  child.on('exit', (code, signal) => {
    const hit = parsePacket(packet);
    if (hit) remember(hit).catch((err) => console.error(err.message || err));
    console.error(`tcpdump exited code=${code} signal=${signal}`);
    setTimeout(runTcpdump, 2000);
  });
}

console.log(`Listening for DHCP hostnames on ${IFACE}, writing ${OUTPUT}`);
runTcpdump();
