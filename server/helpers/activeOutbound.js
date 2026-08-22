'use strict';

const fsp = require('fs').promises;

const { ACTIVE_OUTBOUND_PATH } = require('../config');
const { getVpnTarget } = require('./vpnTarget');
const { listTemplates, readTemplate } = require('../templates');
const { parseOutboundLink, extractLinkName } = require('../vless');

const PROTOCOL_LABELS = {
  vless: 'VLESS',
  vmess: 'VMess',
  trojan: 'Trojan',
  shadowsocks: 'Shadowsocks',
  tuic: 'TUIC',
  hysteria: 'Hysteria',
  hysteria2: 'Hysteria2',
  anytls: 'AnyTLS',
  socks: 'SOCKS5',
  awg: 'AmneziaWG',
  wireguard: 'WireGuard',
};

// Identity of an outbound, so a remembered name can be matched against the
// outbound that is actually in /etc/sing-box/config.json right now.
function outboundKey(outbound) {
  if (!outbound || typeof outbound !== 'object') return '';
  const peer = Array.isArray(outbound.peers) ? outbound.peers[0] : null;
  return [
    outbound.type || '',
    outbound.server || peer?.address || '',
    outbound.server_port || peer?.port || '',
    outbound.uuid || outbound.password || outbound.private_key || '',
  ].join('|');
}

function protocolLabel(outbound) {
  const type = String(outbound?.type || '').toLowerCase();
  return PROTOCOL_LABELS[type] || (type ? type.toUpperCase() : 'outbound');
}

function serverLabel(outbound) {
  const peer = Array.isArray(outbound?.peers) ? outbound.peers[0] : null;
  const host = outbound?.server || peer?.address || '';
  const port = outbound?.server_port || peer?.port || '';
  return port ? `${host}:${port}` : String(host || '');
}

async function readActiveMeta() {
  try {
    const raw = await fsp.readFile(ACTIVE_OUTBOUND_PATH, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

async function saveActiveOutbound({ name, link, outbound, templateId }) {
  const payload = {
    name: String(name || '').trim() || null,
    key: outboundKey(outbound),
    type: outbound?.type || null,
    server: serverLabel(outbound) || null,
    template_id: templateId || null,
    link_name: extractLinkName(link) || null,
    updated_at: Date.now(),
  };
  try {
    await fsp.writeFile(ACTIVE_OUTBOUND_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  } catch {
    // A missing name only degrades the header label; never fail the apply.
  }
  return payload;
}

// Last resort: a saved template whose link resolves to the live outbound.
async function nameFromTemplates(key) {
  let templates;
  try {
    templates = await listTemplates();
  } catch {
    return null;
  }

  for (const entry of templates) {
    try {
      const tpl = await readTemplate(entry.id);
      if (outboundKey(parseOutboundLink(tpl.link)) === key) {
        return tpl.name || extractLinkName(tpl.link) || entry.name;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function describeActiveOutbound(cfg) {
  const target = getVpnTarget(cfg);
  if (!target) return null;

  const outbound = target.value || {};
  const key = outboundKey(outbound);
  const base = {
    type: outbound.type || null,
    protocol: protocolLabel(outbound),
    server: serverLabel(outbound),
  };

  const meta = await readActiveMeta();
  if (meta && meta.key === key && meta.name) {
    return { ...base, name: meta.name, source: 'applied' };
  }

  const templateName = await nameFromTemplates(key);
  if (templateName) return { ...base, name: templateName, source: 'template' };

  const sni = outbound?.tls?.server_name;
  return {
    ...base,
    name: sni || outbound.server || base.server || base.protocol,
    source: 'config',
  };
}

module.exports = {
  outboundKey,
  saveActiveOutbound,
  describeActiveOutbound,
};
